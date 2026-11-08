/* ================================================================
   HOJAS — las hojas importantes, todas en un sitio y listas para
   imprimir. Cada archivo (PDF o foto) se guarda en el repositorio
   privado de datos; aquí solo va la ficha: título, carpeta, palabras
   para encontrarla y cómo se imprime (A4 por defecto).
   ================================================================ */
(function(){
"use strict";

var LS = "hojas.libro.v1";
var PAPEL = {A4:[210,297], A5:[148,210], A3:[297,420], Carta:[216,279], Legal:[216,356]};
var CARPETAS_INICIO = ["Restaurante","Personal","Piso","Impuestos","Plantillas"];
var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";

/* ── datos ─────────────────────────────────────────────────────── */
function nuevo(){ return {hojas:[], carpetas:CARPETAS_INICIO.slice(), ajustes:{papel:"A4", orient:"auto", margen:8, ajustar:true}}; }
var state;
try{ state = JSON.parse(localStorage.getItem(LS) || "null"); }catch(e){ state = null; }
if(!state || !Array.isArray(state.hojas)) state = nuevo();
state.carpetas = Array.isArray(state.carpetas) ? state.carpetas : CARPETAS_INICIO.slice();
state.ajustes = Object.assign({papel:"A4", orient:"auto", margen:8, ajustar:true}, state.ajustes || {});
function guardar(){ try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){ aviso("No se ha podido guardar en este aparato.", true); } }

var ui = {carpeta:"__todas", q:"", orden:"uso"};

/* ── utilidades ────────────────────────────────────────────────── */
function $(s, r){ return (r||document).querySelector(s); }
function esc(t){ return String(t==null?"":t).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function dmy(iso){ if(!iso) return ""; var a=iso.slice(0,10).split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }
function norm(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); }
function tam(b){ return b>1048576 ? (b/1048576).toFixed(1).replace(".",",")+" MB" : Math.max(1,Math.round(b/1024))+" KB"; }
function extDe(nombre){ var m=/\.([a-z0-9]+)$/i.exec(nombre||""); return m ? m[1].toUpperCase() : "?"; }
function esPdf(h){ return h.tipo==="application/pdf" || /\.pdf$/i.test(h.nombre); }
function esImg(h){ return /^image\//.test(h.tipo||""); }
function esGoogle(h){ return h.tipo==="gsheet" || h.tipo==="gdoc"; }
function imprimible(h){ return esGoogle(h) || esPdf(h) || esImg(h); }

/* ── Google Sheets / Docs ──────────────────────────────────────── */
/* De un enlace de Google se saca el documento y la pestaña. Para
   imprimir se le pide a Google el PDF ya en el papel elegido: lo baja
   el navegador con tu sesión de Google, así que sale siempre con los
   datos de hoy. */
function leerEnlaceGoogle(url){
  url=String(url||"").trim();
  var m=/docs\.google\.com\/(spreadsheets|document)\/d\/([A-Za-z0-9_-]{20,})/.exec(url);
  if(!m) return null;
  var g=/[#?&]gid=(\d+)/.exec(url);
  return {tipo:m[1]==="spreadsheets"?"gsheet":"gdoc", docId:m[2], gid:g?g[1]:""};
}
function urlAbrirGoogle(h){
  if(h.tipo==="gdoc") return "https://docs.google.com/document/d/"+h.docId+"/edit";
  return "https://docs.google.com/spreadsheets/d/"+h.docId+"/edit"+(h.gid?"#gid="+h.gid:"");
}
var TAM_GOOGLE={A4:"A4", A5:"A5", A3:"A3", Carta:"letter", Legal:"legal"};
function urlPdfGoogle(h){
  if(h.tipo==="gdoc") return "https://docs.google.com/document/d/"+h.docId+"/export?format=pdf";
  var a=state.ajustes, papel=h.papel||a.papel||"A4", orient=h.orient||a.orient||"auto";
  var enc=h.encaje||"hoja", mm=+a.margen; if(!(mm>=0)) mm=8;
  var pulg=(mm/25.4).toFixed(2);
  var q={format:"pdf", size:TAM_GOOGLE[papel]||"A4", portrait:orient==="h"?"false":"true",
         scale:enc==="hoja"?"4":enc==="ancho"?"2":"1", fitw:enc==="real"?"false":"true",
         gridlines:h.cuadricula?"true":"false", printtitle:"false", sheetnames:"false", pagenum:"UNDEFINED",
         horizontal_alignment:"CENTER", top_margin:pulg, bottom_margin:pulg, left_margin:pulg, right_margin:pulg};
  if(h.gid && !h.todas) q.gid=h.gid;
  return "https://docs.google.com/spreadsheets/d/"+h.docId+"/export?"+Object.keys(q).map(function(k){ return k+"="+encodeURIComponent(q[k]); }).join("&");
}
function tituloDeNombre(n){
  return String(n||"").replace(/\.[^.]+$/,"").replace(/[_]+/g," ").replace(/\s+/g," ").trim() || "Sin título";
}
var avisoT=null;
function aviso(msg, malo){
  var v=$(".aviso-flotante"); if(v) v.remove();
  var d=document.createElement("div"); d.className="aviso-flotante"+(malo?" malo":""); d.textContent=msg;
  document.body.appendChild(d); clearTimeout(avisoT); avisoT=setTimeout(function(){ d.remove(); }, malo?5000:2600);
}
function bytesAB64(u8){
  var s="", n=0x8000;
  for(var i=0;i<u8.length;i+=n) s+=String.fromCharCode.apply(null, u8.subarray(i,i+n));
  return btoa(s);
}
function b64ABytes(b64){
  var s=atob(b64), u=new Uint8Array(s.length);
  for(var i=0;i<s.length;i++) u[i]=s.charCodeAt(i);
  return u;
}

/* ── archivos en el aparato (IndexedDB) ────────────────────────── */
var dbP=null;
function db(){
  if(dbP) return dbP;
  dbP=new Promise(function(ok, mal){
    var r=indexedDB.open("hojas-archivos", 1);
    r.onupgradeneeded=function(){ var d=r.result; if(!d.objectStoreNames.contains("f")) d.createObjectStore("f"); if(!d.objectStoreNames.contains("m")) d.createObjectStore("m"); };
    r.onsuccess=function(){ ok(r.result); }; r.onerror=function(){ mal(r.error); };
  });
  return dbP;
}
function idb(store, modo, fn){
  return db().then(function(d){ return new Promise(function(ok, mal){
    var t=d.transaction(store, modo), s=t.objectStore(store), r=fn(s);
    t.oncomplete=function(){ ok(r && r.result); }; t.onerror=function(){ mal(t.error); };
  }); }).catch(function(){ return null; });
}
function idbGet(st,k){ return idb(st,"readonly",function(s){ return s.get(k); }); }
function idbPut(st,k,v){ return idb(st,"readwrite",function(s){ return s.put(v,k); }); }
function idbDel(st,k){ return idb(st,"readwrite",function(s){ return s.delete(k); }); }

var conSync = function(){ return !!(window.Sync && Sync.conectado && Sync.conectado()); };

/* El archivo de una hoja: del aparato, o del repositorio si se subió desde otro */
var blobs={};
function blobDe(h){
  if(blobs[h.id]) return Promise.resolve(blobs[h.id]);
  return idbGet("f", h.id).then(function(b){
    if(b) return (blobs[h.id]=b);
    if(!h.subida || !conSync() || !Sync.leerArchivo) throw new Error("El archivo aún no ha llegado a este aparato. Ábrelo en el aparato donde lo añadiste para que se suba.");
    return Sync.leerArchivo(h.ruta).then(function(b64){
      var blob=new Blob([b64ABytes(b64)], {type:h.tipo||"application/octet-stream"});
      idbPut("f", h.id, blob);
      return (blobs[h.id]=blob);
    });
  });
}

/* Sube lo que aún está solo aquí */
var subiendo=false;
async function subirPendientes(){
  if(subiendo || !conSync() || !Sync.subirArchivo) return;
  subiendo=true; var fallo=false;
  try{
    var cola=state.hojas.filter(function(h){ return !h.subida && !esGoogle(h); });
    for(var i=0;i<cola.length;i++){
      var h=cola[i], b=await idbGet("f", h.id);
      if(!b) continue;
      try{
        var u8=new Uint8Array(await b.arrayBuffer());
        await Sync.subirArchivo(h.ruta, bytesAB64(u8), "hoja: "+h.titulo);
        var viva=porId(h.id); if(viva){ viva.subida=true; guardar(); }
      }catch(e){ fallo=true; break; }
    }
  } finally { subiendo=false; }
  if(fallo) aviso("Hay hojas que aún no se han podido subir. Se quedan en este aparato y se vuelve a intentar sola.", true);
  pintarLista();
}
window.addEventListener("online", subirPendientes);

/* ── PDF (pdf.js, se carga solo cuando hace falta) ─────────────── */
var pdfjsP=null;
function pdfjs(){
  if(pdfjsP) return pdfjsP;
  pdfjsP=new Promise(function(ok, mal){
    var s=document.createElement("script"); s.src=PDFJS+"pdf.min.js";
    s.onload=function(){ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js"; ok(window.pdfjsLib); }catch(e){ mal(e); } };
    s.onerror=function(){ pdfjsP=null; mal(new Error("No se pudo cargar el lector de PDF")); };
    document.head.appendChild(s);
  });
  return pdfjsP;
}
/* Cada página como imagen: para ver, para la miniatura y para imprimir
   en el papel que se elija. */
async function paginasPdf(blob, ancho, maxPag){
  var lib=await pdfjs();
  var doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  var out=[], n=Math.min(doc.numPages, maxPag||doc.numPages);
  for(var i=1;i<=n;i++){
    var pg=await doc.getPage(i), v1=pg.getViewport({scale:1});
    var esc2=ancho/v1.width, v=pg.getViewport({scale:esc2});
    var c=document.createElement("canvas"); c.width=Math.round(v.width); c.height=Math.round(v.height);
    var cx=c.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,c.width,c.height);
    await pg.render({canvasContext:cx, viewport:v}).promise;
    out.push(c);
  }
  out.total=doc.numPages;
  return out;
}
function imagenDe(blob){
  return new Promise(function(ok, mal){
    var u=URL.createObjectURL(blob), im=new Image();
    im.onload=function(){ ok({img:im, url:u}); }; im.onerror=function(){ URL.revokeObjectURL(u); mal(new Error("No se pudo leer la imagen")); };
    im.src=u;
  });
}

/* ── miniaturas ────────────────────────────────────────────────── */
var minis={};
async function miniDe(h){
  if(minis[h.id]) return minis[h.id];
  var m=await idbGet("m", h.id);
  if(m) return (minis[h.id]=m);
  if(!imprimible(h) || esGoogle(h)) return null;
  var blob=await blobDe(h), url;
  if(esPdf(h)){
    var c=(await paginasPdf(blob, 360, 1))[0];
    url=c.toDataURL("image/jpeg", .82);
    if(!h.paginas){ /* se apunta cuántas tiene, para enseñarlo */ }
  } else {
    var r=await imagenDe(blob), k=Math.min(1, 360/Math.max(r.img.width, r.img.height));
    var c2=document.createElement("canvas"); c2.width=Math.round(r.img.width*k); c2.height=Math.round(r.img.height*k);
    c2.getContext("2d").drawImage(r.img,0,0,c2.width,c2.height); URL.revokeObjectURL(r.url);
    url=c2.toDataURL("image/jpeg", .82);
  }
  idbPut("m", h.id, url);
  return (minis[h.id]=url);
}
function pintarMinis(){
  document.querySelectorAll("[data-mini]").forEach(function(box){
    var h=porId(box.getAttribute("data-mini")); if(!h || !imprimible(h) || esGoogle(h)) return;
    miniDe(h).then(function(u){ if(u && box.isConnected){ var e=box.querySelector(".ext"); if(e) e.remove(); var im=document.createElement("img"); im.alt=""; im.src=u; box.insertBefore(im, box.firstChild); } }).catch(function(){});
  });
}

/* ── buscar ────────────────────────────────────────────────────── */
function porId(id){ return state.hojas.filter(function(h){ return h.id===id; })[0]; }
function textoDe(h){ return norm([h.titulo,h.carpeta,(h.etiquetas||[]).join(" "),h.notas,h.nombre].join(" ")); }
function filtradas(){
  var palabras=norm(ui.q).split(/\s+/).filter(Boolean);
  var l=state.hojas.filter(function(h){
    if(ui.carpeta==="__fav" && !h.fav) return false;
    if(ui.carpeta!=="__todas" && ui.carpeta!=="__fav" && ui.carpeta!=="__rec" && h.carpeta!==ui.carpeta) return false;
    if(!palabras.length) return true;
    var t=textoDe(h);
    return palabras.every(function(p){ return t.indexOf(p)>=0; });
  });
  var tit=function(a,b){ return norm(a.titulo)<norm(b.titulo)?-1:1; };
  if(ui.orden==="az") l.sort(tit);
  else l.sort(function(a,b){
    if(!!b.fav!==!!a.fav && ui.carpeta!=="__rec") return b.fav?1:-1;
    var ua=a.usada||a.creada||"", ub=b.usada||b.creada||"";
    return ua===ub ? tit(a,b) : (ua<ub?1:-1);
  });
  if(ui.carpeta==="__rec") l=l.slice(0,12);
  return l;
}

/* ── pintar ────────────────────────────────────────────────────── */
function cuenta(c){ return state.hojas.filter(function(h){ return h.carpeta===c; }).length; }
function render(){
  var root=$("#root");
  var navs=[["__todas","Todas",state.hojas.length],["__fav","★ Favoritas",state.hojas.filter(function(h){return h.fav;}).length],["__rec","Usadas hace poco",""]]
    .concat(state.carpetas.map(function(c){ return [c,c,cuenta(c)]; }));
  var sinCarpeta=state.hojas.filter(function(h){ return state.carpetas.indexOf(h.carpeta)<0; }).length;
  if(sinCarpeta) navs.push(["","Sin carpeta",sinCarpeta]);
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Hojas</span><span class="sub">Para imprimir</span></div>'+
      navs.map(function(n){
        return '<button class="nav" data-carpeta="'+esc(n[0])+'" aria-current="'+(ui.carpeta===n[0])+'"><span>'+esc(n[1])+'</span><span class="cuenta">'+n[2]+'</span></button>';
      }).join("")+
      '<button class="nav" data-ajustes><span>Ajustes y carpetas</span><span class="cuenta"></span></button>'+
      '<div class="pie-rail"><span id="sync-estado" style="font-size:12px;color:var(--muted)"></span><a href="index.html">&#8592; Escritorio</a></div>'+
    '</nav>'+
    '<main>'+
      '<div class="cabecera"><div><h1>'+esc(tituloVista())+'</h1>'+
        '<p>Tus hojas de Google Sheets (y PDF o fotos) en un sitio. Escribe una palabra y sale; dale a Imprimir y sale en '+esc(state.ajustes.papel)+'. Para añadir una de Sheets, pega su enlace aquí con Cmd + V.</p></div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<div class="seg" role="group" aria-label="Orden"><button data-orden="uso" aria-pressed="'+(ui.orden==="uso")+'">Más usadas</button><button data-orden="az" aria-pressed="'+(ui.orden==="az")+'">A–Z</button></div>'+
          '<button class="btn fuerte" data-google>+ Hoja de Google Sheets</button>'+
          '<button class="btn" data-anadir>+ PDF o foto</button>'+
        '</div></div>'+
      '<div class="busca-grande"><span class="lupa">&#128269;</span>'+
        '<input id="q" type="search" placeholder="Buscar: nómina, contrato, menú, seguro…" value="'+esc(ui.q)+'" autocomplete="off" aria-label="Buscar hojas"><kbd>/</kbd></div>'+
      '<div id="lista"></div>'+
    '</main>';
  root.querySelectorAll("[data-carpeta]").forEach(function(b){ b.addEventListener("click", function(){ ui.carpeta=b.getAttribute("data-carpeta"); render(); }); });
  root.querySelector("[data-ajustes]").addEventListener("click", abrirAjustes);
  root.querySelectorAll("[data-orden]").forEach(function(b){ b.addEventListener("click", function(){ ui.orden=b.getAttribute("data-orden"); render(); }); });
  root.querySelector("[data-anadir]").addEventListener("click", function(){ $("#elegir").click(); });
  root.querySelector("[data-google]").addEventListener("click", function(){ anadirGoogle(""); });
  var q=$("#q");
  q.addEventListener("input", function(){ ui.q=q.value; pintarLista(); });
  q.addEventListener("keydown", function(e){
    if(e.key==="Enter"){ var l=filtradas(); if(l.length===1) abrirHoja(l[0].id); }
    if(e.key==="Escape"){ q.value=""; ui.q=""; pintarLista(); }
  });
  if(window.Sync && Sync.mostrarEstadoEn) Sync.mostrarEstadoEn($("#sync-estado"));
  pintarLista();
  if(!matchMedia("(pointer:coarse)").matches) q.focus();
}
function tituloVista(){
  return ui.carpeta==="__todas" ? "Hojas para imprimir" : ui.carpeta==="__fav" ? "Favoritas" : ui.carpeta==="__rec" ? "Usadas hace poco" : (ui.carpeta||"Sin carpeta");
}
function pintarLista(){
  var box=$("#lista"); if(!box) return;
  var l=filtradas();
  var zona='<div class="zona" data-zona>Arrastra aquí tus PDF o fotos, o pulsa para elegirlos'+
    '<small>Se guardan en tu repositorio privado y salen en todos tus aparatos'+(ui.carpeta && ui.carpeta.indexOf("__")!==0?' · irán a «'+esc(ui.carpeta)+'»':'')+'</small></div>';
  if(!state.hojas.length){
    box.innerHTML='<div class="vacio" style="margin-bottom:16px"><strong>Aún no hay hojas</strong>'+
      'Abre en Google Sheets la hoja que imprimes, copia el enlace de arriba y pégalo aquí con <b>Cmd + V</b> (o pulsa «+ Hoja de Google Sheets»). '+
      'Una vez puesta, ya no la tienes que buscar más.</div>'+zona;
  } else if(!l.length){
    box.innerHTML='<div class="vacio"><strong>No hay nada con «'+esc(ui.q)+'»</strong>Prueba con otra palabra, o mira en «Todas».</div>'+zona;
  } else {
    box.innerHTML=(ui.q?'<p class="nota">'+l.length+(l.length===1?" hoja":" hojas")+(l.length===1?' · pulsa Intro para abrirla':'')+'</p>':'')+
      '<div class="hojas">'+l.map(fichaHTML).join("")+'</div><div style="margin-top:18px">'+zona+'</div>';
  }
  box.querySelectorAll("[data-zona]").forEach(function(z){ z.addEventListener("click", function(){ $("#elegir").click(); }); });
  box.querySelectorAll("[data-abrir]").forEach(function(b){ b.addEventListener("click", function(){ abrirHoja(b.getAttribute("data-abrir")); }); });
  box.querySelectorAll("[data-imp]").forEach(function(b){ b.addEventListener("click", function(){ var h=porId(b.getAttribute("data-imp")); if(h) imprimir(h); }); });
  box.querySelectorAll("[data-usada]").forEach(function(b){ b.addEventListener("click", function(){ var h=porId(b.getAttribute("data-usada")); if(h){ h.usada=hoyISO(); guardar(); } }); });
  pintarMinis();
}
function fichaHTML(h){
  var papel=h.papel||state.ajustes.papel;
  return '<div class="hoja">'+
    '<button class="mini" data-mini="'+h.id+'" data-abrir="'+h.id+'" aria-label="Ver '+esc(h.titulo)+'">'+
      (esGoogle(h)
        ? '<span class="ext" style="flex-direction:column;gap:6px;color:'+(h.tipo==="gsheet"?"#188038":"#1a73e8")+'"><span style="font-size:34px">'+(h.tipo==="gsheet"?"&#9638;":"&#9636;")+'</span><span style="font-size:12px">'+(h.tipo==="gsheet"?"GOOGLE SHEETS":"GOOGLE DOCS")+'</span></span>'
        : '<span class="ext">'+esc(extDe(h.nombre))+'</span>')+
      (h.fav?'<span class="fav" aria-label="Favorita">★</span>':'')+'</button>'+
    '<div class="info"><div class="tit">'+esc(h.titulo)+'</div>'+
      '<div class="meta">'+(h.carpeta?'<span class="chapa acento">'+esc(h.carpeta)+'</span>':'')+
        (h.tipo==="gdoc"?'':imprimible(h)?'<span class="chapa neutra">'+esc(papel)+'</span>':'<span class="chapa aviso">'+esc(extDe(h.nombre))+'</span>')+
        (h.impresa?'<span>'+h.impresa+(h.impresa===1?' vez':' veces')+'</span>':'')+
        (!h.subida && !esGoogle(h)?'<span class="subiendo" title="Aún solo está en este aparato">subiendo…</span>':'')+
      '</div></div>'+
    '<div class="acc">'+(imprimible(h)
      ? '<button class="btn fuerte sm" data-imp="'+h.id+'">&#128424; Imprimir</button>'
      : '<button class="btn sm" data-abrir="'+h.id+'">Abrir</button>')+
      (esGoogle(h)
        ? '<a class="btn sm" href="'+esc(urlAbrirGoogle(h))+'" target="_blank" rel="noopener" data-usada="'+h.id+'">Abrir</a><button class="btn suave sm" data-abrir="'+h.id+'" title="Datos de la hoja">⋯</button>'
        : '<button class="btn sm" data-abrir="'+h.id+'">Ver</button>')+'</div>'+
  '</div>';
}

/* ── añadir ────────────────────────────────────────────────────── */
async function anadir(files){
  files=Array.prototype.slice.call(files||[]);
  if(!files.length) return;
  var carpeta=(ui.carpeta && ui.carpeta.indexOf("__")!==0) ? ui.carpeta : "";
  var grandes=files.filter(function(f){ return f.size>40*1048576; });
  if(grandes.length){ aviso(grandes[0].name+" pasa de 40 MB y no se puede guardar.", true); files=files.filter(function(f){ return f.size<=40*1048576; }); }
  var nuevas=[];
  for(var i=0;i<files.length;i++){
    var f=files[i], id=uid();
    var limpio=f.name.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"-").slice(-80);
    var h={id:id, titulo:tituloDeNombre(f.name), nombre:f.name, tipo:f.type||"", tam:f.size, carpeta:carpeta,
           etiquetas:[], notas:"", fav:false, creada:new Date().toISOString(), ruta:"hojas/"+id+"-"+limpio, subida:false, impresa:0};
    await idbPut("f", id, f);
    blobs[id]=f;
    state.hojas.push(h); nuevas.push(h);
  }
  if(!nuevas.length) return;
  guardar(); render();
  aviso(nuevas.length===1 ? "Añadida: "+nuevas[0].titulo : nuevas.length+" hojas añadidas");
  subirPendientes();
  if(nuevas.length===1) abrirHoja(nuevas[0].id, true);
}
$("#elegir").addEventListener("change", function(e){ anadir(e.target.files); e.target.value=""; });
var arrastre=0;
document.addEventListener("dragenter", function(e){ if(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types,"Files")>=0){ arrastre++; document.body.classList.add("arrastrando"); } });
document.addEventListener("dragleave", function(){ arrastre=Math.max(0,arrastre-1); if(!arrastre) document.body.classList.remove("arrastrando"); });
document.addEventListener("dragover", function(e){ e.preventDefault(); });
document.addEventListener("drop", function(e){
  e.preventDefault(); arrastre=0; document.body.classList.remove("arrastrando");
  if(document.querySelector("dialog[open]")) return;
  if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) anadir(e.dataTransfer.files);
});
document.addEventListener("keydown", function(e){
  if(e.key==="/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||"") && !document.querySelector("dialog[open]")){
    e.preventDefault(); var q=$("#q"); if(q){ q.focus(); q.select(); }
  }
});

/* ── diálogos ──────────────────────────────────────────────────── */
function dialogo(titulo, cuerpo, botones, ancho){
  var v=$("#dlg"); if(v){ v.close(); v.remove(); }
  var d=document.createElement("dialog"); d.id="dlg"; if(ancho) d.className="ancho";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3><button class="btn suave" data-x>Cerrar</button></div>'+
    '<div class="dlg-cuerpo">'+cuerpo+'</div><div class="dlg-pie">'+(botones||"")+'</div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){ b.addEventListener("click", function(){ d.close(); }); });
  d.addEventListener("close", function(){ d.remove(); });
  d.showModal();
  return d;
}
function confirmar(titulo, texto, si, etiqueta){
  var d=dialogo(titulo, '<p style="margin:0">'+texto+'</p>', '<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-si style="background:var(--malo);border-color:var(--malo)">'+esc(etiqueta||"Sí")+'</button>');
  d.querySelector("[data-si]").addEventListener("click", function(){ d.close(); si(); });
}

/* ── hojas de Google ───────────────────────────────────────────── */
function anadirGoogle(enlace){
  var d=dialogo("Añadir una hoja de Google Sheets",
    '<ol class="nota" style="margin:0 0 12px;padding-left:18px;line-height:1.7">'+
      '<li>Abre la hoja en Google Sheets, en la <b>pestaña</b> que imprimes.</li>'+
      '<li>Copia el enlace de la barra de arriba (Cmd + C).</li>'+
      '<li>Pégalo aquí (Cmd + V).</li></ol>'+
    '<div class="campo"><label class="lbl" for="g_url">Enlace</label><input id="g_url" placeholder="https://docs.google.com/spreadsheets/d/…" value="'+esc(enlace)+'"></div>'+
    '<div class="campo" style="margin-top:10px"><label class="lbl" for="g_tit">Título (cómo la vas a buscar)</label><input id="g_tit" placeholder="Hoja de pedidos, cuadrante, inventario…"></div>'+
    '<p class="nota" id="g_info" style="margin:8px 0 0"></p>',
    '<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-ok>Añadir</button>');
  var u=d.querySelector("#g_url"), t=d.querySelector("#g_tit"), info=d.querySelector("#g_info");
  function mirar(){
    var g=leerEnlaceGoogle(u.value);
    info.textContent = !u.value.trim() ? "" : !g ? "Ese enlace no parece de Google Sheets ni de Docs." :
      g.tipo==="gdoc" ? "Documento de Google Docs." : (g.gid ? "Google Sheets · pestaña "+g.gid+" (se imprimirá esa pestaña)" : "Google Sheets · se imprimirá la primera pestaña");
    info.style.color = (u.value.trim() && !g) ? "var(--malo)" : "";
  }
  u.addEventListener("input", mirar); mirar();
  (enlace ? t : u).focus();
  d.querySelector("[data-ok]").addEventListener("click", function(){
    var g=leerEnlaceGoogle(u.value);
    if(!g){ info.textContent="Pega el enlace de la hoja (empieza por https://docs.google.com/…)."; info.style.color="var(--malo)"; u.focus(); return; }
    var tit=t.value.trim();
    if(!tit){ info.textContent="Ponle un título para encontrarla."; info.style.color="var(--malo)"; t.focus(); return; }
    var carpeta=(ui.carpeta && ui.carpeta.indexOf("__")!==0) ? ui.carpeta : "";
    var h={id:uid(), titulo:tit, tipo:g.tipo, docId:g.docId, gid:g.gid, url:u.value.trim(), nombre:"",
           carpeta:carpeta, etiquetas:[], notas:"", fav:false, creada:new Date().toISOString(), subida:true, impresa:0, encaje:"hoja"};
    state.hojas.push(h); guardar(); d.close(); render();
    aviso("Añadida: "+tit);
    abrirHoja(h.id, true);
  });
  d.addEventListener("keydown", function(e){ if(e.key==="Enter" && e.target.tagName==="INPUT"){ e.preventDefault(); d.querySelector("[data-ok]").click(); } });
}
function abrirGoogle(h, nueva){
  var carps=state.carpetas.slice(); if(h.carpeta && carps.indexOf(h.carpeta)<0) carps.push(h.carpeta);
  var sheet=h.tipo==="gsheet";
  var d=dialogo(nueva?"Hoja añadida":h.titulo,
    '<div style="display:flex;flex-direction:column;gap:11px">'+
      '<div class="campo"><label class="lbl" for="h_tit">Título</label><input id="h_tit" value="'+esc(h.titulo)+'"></div>'+
      '<div class="campo"><label class="lbl" for="h_url">Enlace de Google</label><input id="h_url" value="'+esc(h.url||urlAbrirGoogle(h))+'"></div>'+
      '<div class="dos">'+
        '<div class="campo"><label class="lbl" for="h_car">Carpeta</label><select id="h_car"><option value="">Sin carpeta</option>'+
          carps.map(function(c){ return '<option'+(c===h.carpeta?" selected":"")+'>'+esc(c)+'</option>'; }).join("")+
          '<option value="__nueva">+ Carpeta nueva…</option></select></div>'+
        '<div class="campo"><label class="lbl" for="h_eti">Palabras para encontrarla</label><input id="h_eti" placeholder="pedidos, proveedor, semana" value="'+esc((h.etiquetas||[]).join(", "))+'"></div>'+
      '</div>'+
      '<div class="campo"><label class="lbl" for="h_not">Notas</label><textarea id="h_not" rows="2" placeholder="Para qué es, cuándo se imprime…">'+esc(h.notas||"")+'</textarea></div>'+
      (sheet?
      '<div class="tres">'+
        '<div class="campo"><label class="lbl" for="h_pap">Papel</label><select id="h_pap">'+opcionesPapel(h.papel||"", true)+'</select></div>'+
        '<div class="campo"><label class="lbl" for="h_ori">Orientación</label><select id="h_ori">'+
          '<option value=""'+(!h.orient?" selected":"")+'>Por defecto (vertical)</option><option value="v"'+(h.orient==="v"?" selected":"")+'>Vertical</option><option value="h"'+(h.orient==="h"?" selected":"")+'>Horizontal</option></select></div>'+
        '<div class="campo"><label class="lbl" for="h_enc">Encajar</label><select id="h_enc">'+
          '<option value="hoja"'+((h.encaje||"hoja")==="hoja"?" selected":"")+'>Todo en una hoja</option>'+
          '<option value="ancho"'+(h.encaje==="ancho"?" selected":"")+'>Al ancho</option>'+
          '<option value="real"'+(h.encaje==="real"?" selected":"")+'>Tamaño real</option></select></div>'+
      '</div>'+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="h_todas" style="width:auto"'+(h.todas?" checked":"")+'> Imprimir todas las pestañas (si no, solo la del enlace)</label>'+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="h_cua" style="width:auto"'+(h.cuadricula?" checked":"")+'> Con las líneas de la cuadrícula</label>'
      : '<p class="nota" style="margin:0">Los documentos de Google Docs se imprimen con el tamaño de papel que tengan puesto en Docs (Archivo → Configuración de página).</p>')+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="h_fav" style="width:auto"'+(h.fav?" checked":"")+'> ★ Favorita (sale la primera)</label>'+
      '<p class="nota" style="margin:0">Añadida el '+dmy(h.creada)+(h.impresa?' · impresa '+h.impresa+(h.impresa===1?' vez':' veces')+(h.usada?', la última el '+dmy(h.usada):''):'')+'</p>'+
    '</div>',
    '<button class="btn malo" data-borrar style="margin-right:auto">Quitar</button>'+
    '<a class="btn" data-abrirg href="'+esc(urlAbrirGoogle(h))+'" target="_blank" rel="noopener">Abrir en '+(sheet?"Sheets":"Docs")+'</a>'+
    '<button class="btn" data-guardar>Guardar</button>'+
    '<button class="btn fuerte" data-imp>&#128424; Imprimir</button>', true);
  var carSel=d.querySelector("#h_car");
  carSel.addEventListener("change", function(){
    if(carSel.value!=="__nueva") return;
    var n=(prompt("Nombre de la carpeta nueva:")||"").trim();
    if(!n){ carSel.value=h.carpeta||""; return; }
    if(state.carpetas.indexOf(n)<0) state.carpetas.push(n);
    var o=document.createElement("option"); o.textContent=n; o.selected=true; carSel.insertBefore(o, carSel.lastChild);
  });
  function leer(){
    h.titulo=d.querySelector("#h_tit").value.trim()||h.titulo;
    var g=leerEnlaceGoogle(d.querySelector("#h_url").value);
    if(g){ h.tipo=g.tipo; h.docId=g.docId; h.gid=g.gid; h.url=d.querySelector("#h_url").value.trim(); }
    h.carpeta=carSel.value==="__nueva"?"":carSel.value;
    h.etiquetas=d.querySelector("#h_eti").value.split(/[,;]+/).map(function(x){ return x.trim(); }).filter(Boolean);
    h.notas=d.querySelector("#h_not").value.trim();
    if(d.querySelector("#h_pap")){
      h.papel=d.querySelector("#h_pap").value; h.orient=d.querySelector("#h_ori").value; h.encaje=d.querySelector("#h_enc").value;
      h.todas=d.querySelector("#h_todas").checked; h.cuadricula=d.querySelector("#h_cua").checked;
    }
    h.fav=d.querySelector("#h_fav").checked;
    guardar();
  }
  d.addEventListener("close", function(){ leer(); render(); });
  d.querySelector("[data-guardar]").addEventListener("click", function(){ d.close(); aviso("Guardada"); });
  d.querySelector("[data-abrirg]").addEventListener("click", function(){ leer(); h.usada=hoyISO(); guardar(); this.href=urlAbrirGoogle(h); });
  d.querySelector("[data-imp]").addEventListener("click", function(){ leer(); d.close(); imprimir(h); });
  d.querySelector("[data-borrar]").addEventListener("click", function(){
    confirmar("Quitar hoja", "Vas a quitar <strong>"+esc(h.titulo)+"</strong> de aquí. La hoja de Google no se toca.", function(){
      d.close(); state.hojas=state.hojas.filter(function(x){ return x.id!==h.id; }); guardar(); render(); aviso("Quitada");
    }, "Quitar");
  });
}
/* Pegar un enlace de Google en cualquier sitio de la página lo añade */
document.addEventListener("paste", function(e){
  if(document.querySelector("dialog[open]")) return;
  var t=(e.clipboardData && e.clipboardData.getData("text")) || "";
  if(leerEnlaceGoogle(t)){ e.preventDefault(); anadirGoogle(t.trim()); }
});

/* ── ver y editar una hoja ─────────────────────────────────────── */
function opcionesPapel(sel, conDefecto){
  return (conDefecto?'<option value="">Por defecto ('+esc(state.ajustes.papel)+')</option>':'')+
    Object.keys(PAPEL).map(function(k){ return '<option value="'+k+'"'+(sel===k?" selected":"")+'>'+k+' · '+PAPEL[k][0]+'×'+PAPEL[k][1]+' mm</option>'; }).join("");
}
function opcionesOrient(sel, conDefecto){
  var o={auto:"Automática (según la hoja)", v:"Vertical", h:"Horizontal"};
  return (conDefecto?'<option value="">Por defecto ('+esc(o[state.ajustes.orient])+')</option>':'')+
    Object.keys(o).map(function(k){ return '<option value="'+k+'"'+(sel===k?" selected":"")+'>'+o[k]+'</option>'; }).join("");
}
function abrirHoja(id, nueva){
  var h=porId(id); if(!h) return;
  if(esGoogle(h)) return abrirGoogle(h, nueva);
  var carps=state.carpetas.slice(); if(h.carpeta && carps.indexOf(h.carpeta)<0) carps.push(h.carpeta);
  var d=dialogo(nueva?"Hoja añadida":h.titulo,
    '<div class="vista" id="vista"><p class="nota" style="margin:20px">Cargando…</p></div>'+
    '<div style="display:flex;flex-direction:column;gap:11px;margin-top:14px">'+
      '<div class="campo"><label class="lbl" for="h_tit">Título</label><input id="h_tit" value="'+esc(h.titulo)+'"></div>'+
      '<div class="dos">'+
        '<div class="campo"><label class="lbl" for="h_car">Carpeta</label><select id="h_car"><option value="">Sin carpeta</option>'+
          carps.map(function(c){ return '<option'+(c===h.carpeta?" selected":"")+'>'+esc(c)+'</option>'; }).join("")+
          '<option value="__nueva">+ Carpeta nueva…</option></select></div>'+
        '<div class="campo"><label class="lbl" for="h_eti">Palabras para encontrarla</label><input id="h_eti" placeholder="seguro, coche, póliza" value="'+esc((h.etiquetas||[]).join(", "))+'"></div>'+
      '</div>'+
      '<div class="campo"><label class="lbl" for="h_not">Notas</label><textarea id="h_not" rows="2" placeholder="Para qué es, cuándo se imprime…">'+esc(h.notas||"")+'</textarea></div>'+
      (imprimible(h)?
      '<div class="dos">'+
        '<div class="campo"><label class="lbl" for="h_pap">Papel al imprimir</label><select id="h_pap">'+opcionesPapel(h.papel||"", true)+'</select></div>'+
        '<div class="campo"><label class="lbl" for="h_ori">Orientación</label><select id="h_ori">'+opcionesOrient(h.orient||"", true)+'</select></div>'+
      '</div>':'<p class="nota" style="margin:0">Los archivos '+esc(extDe(h.nombre))+' no se pueden imprimir desde aquí: ábrelo y se imprime con su programa (Word, Excel…). Si lo guardas como PDF, se imprime directo.</p>')+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="h_fav" style="width:auto"'+(h.fav?" checked":"")+'> ★ Favorita (sale la primera)</label>'+
      '<p class="nota" style="margin:0">'+esc(h.nombre)+' · '+tam(h.tam||0)+' · añadida el '+dmy(h.creada)+(h.impresa?' · impresa '+h.impresa+(h.impresa===1?' vez':' veces')+(h.usada?', la última el '+dmy(h.usada):''):'')+
        (h.subida?'':' · <span class="subiendo">aún solo en este aparato</span>')+'</p>'+
    '</div>',
    '<button class="btn malo" data-borrar style="margin-right:auto">Borrar</button>'+
    '<button class="btn" data-sust>Cambiar archivo</button>'+
    '<button class="btn" data-desc>Descargar</button>'+
    '<button class="btn" data-guardar>Guardar</button>'+
    (imprimible(h)?'<button class="btn fuerte" data-imp>&#128424; Imprimir</button>':'<button class="btn fuerte" data-desc2>Abrir</button>'), true);

  var carSel=d.querySelector("#h_car");
  carSel.addEventListener("change", function(){
    if(carSel.value!=="__nueva") return;
    var n=(prompt("Nombre de la carpeta nueva:")||"").trim();
    if(!n){ carSel.value=h.carpeta||""; return; }
    if(state.carpetas.indexOf(n)<0) state.carpetas.push(n);
    var o=document.createElement("option"); o.textContent=n; o.selected=true; carSel.insertBefore(o, carSel.lastChild);
  });
  function leer(){
    h.titulo=d.querySelector("#h_tit").value.trim()||h.titulo;
    h.carpeta=carSel.value==="__nueva"?"":carSel.value;
    h.etiquetas=d.querySelector("#h_eti").value.split(/[,;]+/).map(function(x){ return x.trim(); }).filter(Boolean);
    h.notas=d.querySelector("#h_not").value.trim();
    if(d.querySelector("#h_pap")){ h.papel=d.querySelector("#h_pap").value; h.orient=d.querySelector("#h_ori").value; }
    h.fav=d.querySelector("#h_fav").checked;
    guardar();
  }
  d.addEventListener("close", function(){ leer(); render(); });
  d.querySelector("[data-guardar]").addEventListener("click", function(){ d.close(); aviso("Guardada"); });
  d.querySelector("[data-desc]").addEventListener("click", function(){ descargar(h); });
  var d2=d.querySelector("[data-desc2]"); if(d2) d2.addEventListener("click", function(){ abrirFuera(h); });
  var bi=d.querySelector("[data-imp]"); if(bi) bi.addEventListener("click", function(){ leer(); imprimir(h); });
  d.querySelector("[data-sust]").addEventListener("click", function(){
    var inp=$("#sustituir");
    inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if(f){ leer(); sustituir(h, f); d.close(); } };
    inp.click();
  });
  d.querySelector("[data-borrar]").addEventListener("click", function(){
    confirmar("Borrar hoja", "Vas a borrar <strong>"+esc(h.titulo)+"</strong> de todos tus aparatos. No se puede deshacer.", function(){
      d.close(); borrar(h);
    }, "Borrar");
  });
  pintarVista(h, d.querySelector("#vista"));
}
async function pintarVista(h, box){
  try{
    var blob=await blobDe(h);
    if(!box.isConnected) return;
    if(esPdf(h)){
      var pags=await paginasPdf(blob, 900, 6);
      box.innerHTML="";
      pags.forEach(function(c){ box.appendChild(c); });
      if(pags.total>pags.length){ var p=document.createElement("p"); p.className="nota"; p.style.margin="0"; p.textContent="… y "+(pags.total-pags.length)+" páginas más (se imprimen todas)"; box.appendChild(p); }
      if(h.paginas!==pags.total){ h.paginas=pags.total; guardar(); }
    } else if(esImg(h)){
      var r=await imagenDe(blob); box.innerHTML=""; box.appendChild(r.img);
    } else {
      box.innerHTML='<p class="nota" style="margin:20px;text-align:center">No hay vista previa de los '+esc(extDe(h.nombre))+'. Pulsa <b>Abrir</b>.</p>';
    }
  }catch(e){ box.innerHTML='<p class="nota" style="margin:20px;color:var(--malo)">'+esc(e.message||"No se pudo abrir")+'</p>'; }
}

async function descargar(h){
  try{
    var b=await blobDe(h), u=URL.createObjectURL(b), a=document.createElement("a");
    a.href=u; a.download=h.nombre||("hoja."+extDe(h.nombre).toLowerCase()); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
  }catch(e){ aviso(e.message, true); }
}
async function abrirFuera(h){
  try{
    var b=await blobDe(h), u=URL.createObjectURL(b);
    var w=window.open(u, "_blank");
    if(!w) descargar(h);
    setTimeout(function(){ URL.revokeObjectURL(u); }, 60000);
  }catch(e){ aviso(e.message, true); }
}
async function sustituir(h, f){
  var vieja=h.ruta, estaba=h.subida, id=h.id;
  var limpio=f.name.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"-").slice(-80);
  await idbPut("f", id, f); await idbDel("m", id);
  blobs[id]=f; delete minis[id];
  h.nombre=f.name; h.tipo=f.type||""; h.tam=f.size; h.ruta="hojas/"+id+"-"+Date.now().toString(36)+"-"+limpio; h.subida=false; h.paginas=null;
  guardar(); render(); aviso("Archivo cambiado");
  if(estaba && conSync() && Sync.borrarArchivo) Sync.borrarArchivo(vieja).catch(function(){});
  subirPendientes();
}
function borrar(h){
  state.hojas=state.hojas.filter(function(x){ return x.id!==h.id; });
  guardar();
  idbDel("f", h.id); idbDel("m", h.id); delete blobs[h.id]; delete minis[h.id];
  if(h.subida && conSync() && Sync.borrarArchivo) Sync.borrarArchivo(h.ruta).catch(function(){});
  render(); aviso("Hoja borrada");
}

/* ── imprimir ──────────────────────────────────────────────────── */
/* Cada página va como imagen dentro de una hoja del tamaño elegido (A4
   por defecto), centrada y entera: así sale igual en cualquier
   impresora, la HP también, sin depender de cómo venga hecho el PDF.
   El diálogo de imprimir es el del sistema: ahí se elige la impresora,
   las copias y el color. */
var imprimiendo=false;
async function imprimir(h){
  if(esGoogle(h)){
    h.impresa=(h.impresa||0)+1; h.usada=hoyISO(); guardar(); pintarLista();
    var w=window.open(urlPdfGoogle(h), "_blank");
    dialogo("Imprimir «"+h.titulo+"»",
      '<ol style="margin:0;padding-left:20px;line-height:1.75">'+
        '<li>Google prepara el PDF en <b>'+esc(h.tipo==="gdoc"?"el tamaño del documento":(h.papel||state.ajustes.papel))+'</b> con los datos de ahora y se descarga (flecha ⬇ arriba a la derecha de Chrome).</li>'+
        '<li>Pulsa ese PDF para abrirlo.</li>'+
        '<li>Pulsa <b>Cmd + P</b>, elige tu impresora <b>HP</b> y dale a <b>Imprimir</b>.</li>'+
      '</ol>'+
      (w?'':'<p class="nota" style="margin:12px 0 0;color:var(--malo)">El navegador ha bloqueado la ventana. Pulsa «Bajar el PDF otra vez».</p>')+
      '<p class="nota" style="margin:12px 0 0">Si sale una página de Google pidiendo entrar, entra con la cuenta donde tienes la hoja y vuelve a darle.</p>',
      '<a class="btn" href="'+esc(urlAbrirGoogle(h))+'" target="_blank" rel="noopener">Abrir en Sheets</a>'+
      '<a class="btn fuerte" href="'+esc(urlPdfGoogle(h))+'" target="_blank" rel="noopener">Bajar el PDF otra vez</a>');
    return;
  }
  if(imprimiendo) return;
  imprimiendo=true;
  aviso("Preparando para imprimir…");
  var urls=[];
  try{
    var blob=await blobDe(h);
    var papel=PAPEL[h.papel||state.ajustes.papel]||PAPEL.A4;
    var orient=h.orient||state.ajustes.orient||"auto";
    var m=+state.ajustes.margen; if(!(m>=0)) m=8;
    var pags=[];
    if(esPdf(h)){
      var cs=await paginasPdf(blob, 2000);
      for(var i=0;i<cs.length;i++){
        var b=await new Promise(function(ok){ cs[i].toBlob(ok, "image/jpeg", .92); });
        var u=URL.createObjectURL(b); urls.push(u);
        pags.push({u:u, w:cs[i].width, h:cs[i].height});
      }
    } else {
      var r=await imagenDe(blob); urls.push(r.url);
      pags.push({u:r.url, w:r.img.naturalWidth, h:r.img.naturalHeight});
    }
    var W=papel[0], H=papel[1];
    var hojas=pags.map(function(p){
      var tumbada = orient==="h" || (orient==="auto" && p.w>p.h*1.05);
      return {p:p, t:tumbada};
    });
    var css='@page{size:'+W+'mm '+H+'mm;margin:0}@page tumbada{size:'+H+'mm '+W+'mm;margin:0}'+
      'html,body{margin:0;padding:0;background:#fff}'+
      '.pg{width:'+W+'mm;height:'+H+'mm;box-sizing:border-box;padding:'+m+'mm;display:flex;align-items:center;justify-content:center;overflow:hidden;break-after:page;page-break-after:always}'+
      '.pg.t{page:tumbada;width:'+H+'mm;height:'+W+'mm}'+
      '.pg:last-child{break-after:auto;page-break-after:auto}'+
      'img{max-width:100%;max-height:100%;object-fit:contain;display:block}';
    var cuerpo=hojas.map(function(x){ return '<div class="pg'+(x.t?' t':'')+'"><img src="'+x.p.u+'"></div>'; }).join("");
    var fr=document.createElement("iframe");
    fr.setAttribute("aria-hidden","true");
    fr.style.cssText="position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
    document.body.appendChild(fr);
    var doc=fr.contentDocument;
    doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(h.titulo)+'</title><style>'+css+'</style></head><body>'+cuerpo+'</body></html>'); doc.close();
    var ims=Array.prototype.slice.call(doc.images);
    await Promise.all(ims.map(function(im){ return im.decode ? im.decode().catch(function(){}) : Promise.resolve(); }));
    h.impresa=(h.impresa||0)+1; h.usada=hoyISO(); guardar();
    fr.contentWindow.focus();
    fr.contentWindow.print();
    setTimeout(function(){ fr.remove(); urls.forEach(function(u){ URL.revokeObjectURL(u); }); pintarLista(); }, 60000);
  }catch(e){
    urls.forEach(function(u){ URL.revokeObjectURL(u); });
    aviso((e && e.message) || "No se pudo preparar la impresión", true);
  }finally{ imprimiendo=false; }
}

/* ── ajustes y carpetas ────────────────────────────────────────── */
function abrirAjustes(){
  var a=state.ajustes;
  var d=dialogo("Ajustes y carpetas",
    '<div class="lbl" style="margin-bottom:6px">Al imprimir, por defecto</div>'+
    '<div class="tres">'+
      '<div class="campo"><label class="lbl" for="a_pap">Papel</label><select id="a_pap">'+opcionesPapel(a.papel,false)+'</select></div>'+
      '<div class="campo"><label class="lbl" for="a_ori">Orientación</label><select id="a_ori">'+opcionesOrient(a.orient,false)+'</select></div>'+
      '<div class="campo"><label class="lbl" for="a_mar">Margen (mm)</label><input id="a_mar" type="number" min="0" max="30" value="'+esc(a.margen)+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:8px 0 18px">Cada hoja puede llevar su propio papel y orientación (al abrirla). La hoja se encaja entera en el papel, sin cortarse. La impresora, las copias y el color se eligen en la ventana de imprimir del Mac.</p>'+
    '<div class="lbl" style="margin-bottom:6px">Carpetas</div>'+
    '<div id="a_carps" style="display:flex;flex-direction:column;gap:6px"></div>'+
    '<div style="display:flex;gap:6px;margin-top:8px"><input id="a_nueva" placeholder="Carpeta nueva"><button class="btn" data-nueva>Añadir</button></div>',
    '<button class="btn fuerte" data-ok>Guardar</button>');
  function pintarCarps(){
    var box=d.querySelector("#a_carps");
    box.innerHTML=state.carpetas.map(function(c,i){
      return '<div style="display:flex;gap:6px;align-items:center"><input data-c="'+i+'" value="'+esc(c)+'">'+
        '<span class="nota" style="margin:0;white-space:nowrap;min-width:60px">'+cuenta(c)+' hojas</span>'+
        '<button class="btn suave malo" data-quitar="'+i+'" title="Quitar carpeta">✕</button></div>';
    }).join("") || '<p class="nota" style="margin:0">Sin carpetas.</p>';
    box.querySelectorAll("[data-quitar]").forEach(function(b){ b.addEventListener("click", function(){
      var i=+b.getAttribute("data-quitar"), c=state.carpetas[i];
      state.carpetas.splice(i,1);
      state.hojas.forEach(function(h){ if(h.carpeta===c) h.carpeta=""; });
      pintarCarps();
    }); });
  }
  pintarCarps();
  d.querySelector("[data-nueva]").addEventListener("click", function(){
    var n=d.querySelector("#a_nueva").value.trim(); if(!n) return;
    if(state.carpetas.indexOf(n)<0) state.carpetas.push(n);
    d.querySelector("#a_nueva").value=""; pintarCarps();
  });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    a.papel=d.querySelector("#a_pap").value; a.orient=d.querySelector("#a_ori").value;
    var mm=parseFloat(d.querySelector("#a_mar").value); a.margen=(mm>=0&&mm<=30)?mm:8;
    d.querySelectorAll("[data-c]").forEach(function(inp){
      var i=+inp.getAttribute("data-c"), viejo=state.carpetas[i], nuevoN=inp.value.trim();
      if(nuevoN && nuevoN!==viejo){
        state.carpetas[i]=nuevoN;
        state.hojas.forEach(function(h){ if(h.carpeta===viejo) h.carpeta=nuevoN; });
        if(ui.carpeta===viejo) ui.carpeta=nuevoN;
      }
    });
    guardar(); d.close(); render(); aviso("Ajustes guardados");
  });
  d.addEventListener("close", function(){ guardar(); render(); });
}

/* ── hojas que llegan de otras apps (Control sanitario…) ───────── */
/* La otra app deja la hoja en el navegador con la clave
   «hojas.entrada»; aquí se recoge al abrir. Si ya hay una con el mismo
   título, se le cambia el archivo para no tener repetidas. */
async function recogerEntrada(){
  var raw=null;
  try{ raw=localStorage.getItem("hojas.entrada"); }catch(e){}
  if(!raw) return;
  try{ localStorage.removeItem("hojas.entrada"); }catch(e){}
  var e; try{ e=JSON.parse(raw); }catch(x){ return; }
  if(!e || !e.url) return;
  var blob=await (await fetch(e.url)).blob();
  var f=new File([blob], e.nombre||"hoja.png", {type:blob.type||"image/png"});
  var hay=state.hojas.filter(function(h){ return h.titulo===e.titulo && !esGoogle(h); })[0];
  if(hay){ hay.usada=hoyISO(); await sustituir(hay, f); aviso("Actualizada: "+e.titulo); return; }
  if(e.carpeta && state.carpetas.indexOf(e.carpeta)<0) state.carpetas.push(e.carpeta);
  var id=uid(), limpio=f.name.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"-").slice(-80);
  var h={id:id, titulo:e.titulo||tituloDeNombre(f.name), nombre:f.name, tipo:f.type, tam:f.size, carpeta:e.carpeta||"",
         etiquetas:e.etiquetas||[], notas:e.notas||"", fav:false, creada:new Date().toISOString(), ruta:"hojas/"+id+"-"+limpio, subida:false, impresa:0};
  await idbPut("f", id, f); blobs[id]=f;
  state.hojas.push(h); guardar(); render();
  aviso("Añadida: "+h.titulo);
  subirPendientes();
}

/* ── arranque ──────────────────────────────────────────────────── */
render();
subirPendientes();
recogerEntrada().catch(function(){ aviso("No se ha podido recoger la hoja que llegaba", true); });
window.addEventListener("focus", function(){ recogerEntrada().catch(function(){}); });
})();
