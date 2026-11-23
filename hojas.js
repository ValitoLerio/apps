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
function esEtiq(h){ return h.tipo==="etiquetas"; }
function esHor(h){ return h.tipo==="horario"; }
function esPropia(h){ return esEtiq(h) || esHor(h); }
function imprimible(h){ return esGoogle(h) || esPdf(h) || esImg(h) || esPropia(h); }

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
    var h=porId(box.getAttribute("data-mini")); if(!h || !imprimible(h) || esGoogle(h) || esPropia(h)) return;
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
          '<button class="btn" data-etiq>+ Etiquetas</button>'+
          '<button class="btn" data-hor>+ Hoja de horarios</button>'+
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
  root.querySelector("[data-hor]").addEventListener("click", function(){
    var h={id:uid(), titulo:"Hoja de horarios", nombre:"", tipo:"horario", carpeta:(ui.carpeta.indexOf("__")===0?"Restaurante":ui.carpeta),
           etiquetas:["horario","personal"], notas:"", fav:false, creada:new Date().toISOString(), subida:true, impresa:0, hor:horNuevo()};
    state.hojas.push(h); guardar(); pintarLista(); abrirHorario(h);
  });
  root.querySelector("[data-etiq]").addEventListener("click", function(){
    var h={id:uid(), titulo:"Etiquetas de precios", nombre:"", tipo:"etiquetas", carpeta:(ui.carpeta.indexOf("__")===0?"Restaurante":ui.carpeta),
           etiquetas:["etiquetas","precios"], notas:"", fav:false, creada:new Date().toISOString(), subida:true, impresa:0,
           etiq:{cols:8, hojas:[{nombre:"Hoja 1", items:[{nombre:"", precio:"", cant:8}]}]}};
    state.hojas.push(h); guardar(); pintarLista(); abrirEtiquetas(h);
  });
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
      (esHor(h)
        ? '<span class="ext" style="flex-direction:column;gap:6px;color:var(--acento)"><span style="font-size:34px">&#128197;</span><span style="font-size:12px">'+((h.hor||{}).personal||[]).length+' PERSONAS · EDITABLE</span></span>'
        : esEtiq(h)
        ? '<span class="ext" style="flex-direction:column;gap:6px;color:var(--acento)"><span style="font-size:34px">&#127991;&#65039;</span><span style="font-size:12px">'+etTotal(h)+' ETIQUETAS · EDITABLE</span></span>'
        : esGoogle(h)
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
        : '<button class="btn sm" data-abrir="'+h.id+'">'+(esPropia(h)?'Editar':'Ver')+'</button>')+'</div>'+
  '</div>';
}

/* ══════════════════════════════════════════════════════════════
   ETIQUETAS DE PRECIOS (editables)
   ══════════════════════════════════════════════════════════════
   Una hoja de etiquetas para recortar: cada una en su cuadradito con
   línea de puntos. Se apunta cada etiqueta (nombre si lleva, precio y
   cuántas), y al imprimir se reparten solas en folios A4, ordenadas.
   Se cambia el precio o la cantidad y se vuelve a imprimir: no hay que
   pasar por Canva. Datos en la propia ficha: h.etiq = {items, cols}. */
function etNorm(e){
  e=e||{cols:8};
  if(!e.hojas){ e.hojas=[{nombre:"Hoja 1", items:e.items||[]}]; }
  delete e.items;
  if(!e.hojas.length) e.hojas.push({nombre:"Hoja 1", items:[]});
  return e;
}
function etItems(h, solo){
  var e=etNorm(h.etiq); h.etiq=e;
  var hs = solo==null ? e.hojas : [e.hojas[solo]].filter(Boolean);
  return hs.reduce(function(a,x){ return a.concat(x.items||[]); },[]);
}
function etTotal(h, solo){ return etItems(h, solo).reduce(function(a,x){ return a+Math.max(0, parseInt(x.cant,10)||0); },0); }
function etFolios(h, solo){
  var e=etNorm(h.etiq), g=etRejilla(e.cols);
  return (solo==null?e.hojas:[e.hojas[solo]].filter(Boolean)).reduce(function(a,x){ return a+Math.ceil(etTotal({etiq:{cols:e.cols,hojas:[x]}})/g.porHoja); },0);
}
function etTxtPrecio(p){
  var n=parseFloat(String(p).replace(",","."));
  return isNaN(n) ? String(p||"") : n.toFixed(2).replace(".",",")+" €";
}
/* Cuántas caben: columnas elegidas; el alto, proporcional al ancho */
function etRejilla(cols){
  cols=Math.max(3, Math.min(12, parseInt(cols,10)||8));
  var M=7, W=210-2*M, H=297-2*M, cw=W/cols, ch=cw*0.42, filas=Math.floor(H/ch);
  ch=H/filas;
  return {cols:cols, filas:filas, cw:cw, ch:ch, M:M, porHoja:cols*filas};
}
/* Cada hoja = un folio. Lo que no cabe pasa a una hoja nueva justo detrás
   (se parte la cantidad si hace falta). Devuelve {creadas, mapa: índice viejo → nuevo} */
function etRepartir(e){
  var cap=etRejilla(e.cols).porHoja, out=[], mapa=[], creadas=[];
  e.hojas.forEach(function(hj, idx){
    var cur={nombre:hj.nombre, items:[]}, n=0; out.push(cur); mapa[idx]=out.length-1;
    (hj.items||[]).forEach(function(x){
      var c=Math.max(0, parseInt(x.cant,10)||0);
      if(!c){ cur.items.push(x); return; }
      while(c>0){
        if(n>=cap){ cur={nombre:null, items:[]}; out.push(cur); creadas.push(cur); n=0; }
        var t=Math.min(c, cap-n), y=JSON.parse(JSON.stringify(x)); y.cant=t;
        cur.items.push(y); n+=t; c-=t;
      }
    });
  });
  var usados={}; out.forEach(function(h){ if(h.nombre) usados[h.nombre]=1; });
  var k=1; out.forEach(function(h){ if(!h.nombre){ while(usados["Hoja "+k]) k++; h.nombre="Hoja "+k; usados[h.nombre]=1; } });
  e.hojas=out;
  return {creadas:creadas.map(function(h){ return h.nombre; }), mapa:mapa};
}
function etLista(items){
  var l=[];
  items.forEach(function(x){
    var n=Math.max(0, parseInt(x.cant,10)||0);
    for(var i=0;i<n;i++) l.push(x);
  });
  return l;
}
/* Cada hoja empieza en un folio nuevo. solo = índice de hoja (o null = todas) */
function etHTMLHojas(h, soloPrimera, solo){
  var e=etNorm(h.etiq), g=etRejilla(e.cols), paginas=[];
  (solo==null?e.hojas:[e.hojas[solo]].filter(Boolean)).forEach(function(hj){
    var l=etLista(hj.items||[]);
    for(var i=0;i<l.length;i+=g.porHoja) paginas.push(l.slice(i, i+g.porHoja));
  });
  if(soloPrimera) paginas=paginas.slice(0,1);
  var fsP=Math.max(7, Math.min(22, g.cw*0.55)), fsN=Math.max(5, Math.min(11, g.cw*0.24));
  return paginas.map(function(pg){
    return '<div class="et-pag" style="width:210mm;height:297mm;padding:'+g.M+'mm;box-sizing:border-box;display:grid;'+
      'grid-template-columns:repeat('+g.cols+','+g.cw.toFixed(3)+'mm);grid-auto-rows:'+g.ch.toFixed(3)+'mm;align-content:start;background:#fff;color:#000">'+
      pg.map(function(x){
        var lineas=String(x.nombre||"").split("/").map(function(t){ return t.trim(); }).filter(Boolean);
        return '<div style="border:.25mm dashed #999;margin:0 -.125mm -.125mm 0;display:flex;flex-direction:column;align-items:center;justify-content:center;'+
          'font-family:Helvetica,Arial,sans-serif;font-weight:700;line-height:1.05;overflow:hidden;text-align:center">'+
          lineas.map(function(t){ return '<div style="font-size:'+fsN.toFixed(1)+'pt">'+esc(t)+'</div>'; }).join("")+
          '<div style="font-size:'+(lineas.length?fsP*0.75:fsP).toFixed(1)+'pt;white-space:nowrap">'+esc(etTxtPrecio(x.precio))+'</div></div>';
      }).join("")+'</div>';
  }).join("");
}
function abrirEtiquetas(h){
  h.etiq=etNorm(h.etiq);
  var copia=JSON.parse(JSON.stringify(h.etiq)), cur=0;
  etRepartir(copia);
  function repartir(){
    var r=etRepartir(copia); cur=r.mapa[cur]||0;
    if(r.creadas.length) aviso("No cabían todas en un folio: lo que sobra pasa a "+r.creadas.join(", "));
    return r;
  }
  function libres(){ return etRejilla(copia.cols).porHoja - etTotal({etiq:copia}, cur); }
  function it(){ return copia.hojas[cur].items; }
  var d=dialogo(h.titulo,
    '<div id="et_tabs" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--linea)"></div>'+
    '<div class="et-cab" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px">'+
      '<label style="display:flex;gap:6px;align-items:center;font-size:13.5px">Por fila <select id="et_cols"></select></label>'+
      '<span class="nota" id="et_cuenta" style="margin:0"></span>'+
      '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" id="et_ordenar">Ordenar por precio</button><button class="btn sm" id="et_pegar">&#128203; Pegar precios</button><button class="btn sm fuerte" id="et_mas">+ Etiqueta</button></span>'+
    '</div>'+
    '<div id="et_pegado" style="display:none;margin:0 0 12px;padding:12px;border:1px solid var(--acento-linea);border-radius:8px;background:var(--acento-suave)">'+
      '<div style="font-size:14px;line-height:1.6;margin-bottom:8px"><b>1.</b> Copia los precios de donde los tengas (WhatsApp, Excel, una nota). '+
        '<b>2.</b> Pégalos en el recuadro blanco, <b>un precio por línea</b>. <b>3.</b> Pulsa <b>Añadir</b>.</div>'+
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 14px;font-size:13px;margin:0 0 8px;padding:8px 10px;background:var(--sup);border-radius:6px">'+
        '<span style="color:var(--muted);grid-column:1/-1;margin-bottom:2px">Ejemplos de lo que puedes escribir en cada línea:</span>'+
        '<code>9,50</code><span>→ 8 etiquetas de 9,50 € (las que pongas abajo)</span>'+
        '<code>12,50 x 24</code><span>→ 24 etiquetas de 12,50 €</span>'+
        '<code>MANCHEGO 12,00 x 24</code><span>→ 24 etiquetas con el nombre MANCHEGO y 12,00 €</span></div>'+
      '<textarea id="et_txt" rows="6" style="width:100%;padding:8px;border:1px solid var(--linea);border-radius:6px;font:15px var(--mono);background:#fff;color:var(--tinta)" placeholder="Pega o escribe aquí…"></textarea>'+
      '<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap">'+
        '<label style="font-size:13px;display:flex;gap:6px;align-items:center">Si no pones cuántas, salen <input id="et_def" type="number" min="1" value="8" style="width:64px;padding:5px;border:1px solid var(--linea);border-radius:6px"> de cada precio</label>'+
        '<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input id="et_reempl" type="checkbox" style="width:auto"> Quitar las que hay y dejar solo estas</label>'+
        '<span id="et_pinfo" class="nota" style="margin:0"></span>'+
        '<button class="btn fuerte sm" id="et_pok" style="margin-left:auto">Añadir</button></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px" class="et-dos">'+
      '<div><table class="et-tabla" style="width:100%;border-collapse:collapse;font-size:14px">'+
        '<thead><tr style="text-align:left;color:var(--muted);font-size:12px"><th style="padding:4px">Nombre (si lleva)</th><th style="padding:4px;width:90px">Precio €</th><th style="padding:4px;width:76px">Cuántas</th><th></th></tr></thead>'+
        '<tbody id="et_filas"></tbody></table>'+
        '<p class="nota" style="margin:8px 0 0">Para dos líneas de nombre, sepáralas con «/»: <i>GALL DINDI BRASAT / PAVO BRASEADO</i>.</p></div>'+
      '<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div class="lbl" id="et_vlbl" style="margin:0">Así sale</div><button class="btn sm" id="et_zoom" style="margin-left:auto">&#128269; Ampliar</button></div>'+
        '<div id="et_vista" style="border:1px solid var(--linea);border-radius:8px;overflow:hidden;background:#fff;height:430px;position:relative"></div></div>'+
    '</div>',
    '<button class="btn" data-x>Cerrar sin guardar</button><button class="btn" id="et_guardar">Guardar</button><button class="btn" id="et_imp1">&#128424; Imprimir esta hoja</button><button class="btn fuerte" id="et_imp">&#128424; Imprimir todas</button>', true);
  var sel=d.querySelector("#et_cols");
  for(var c=4;c<=12;c++) sel.insertAdjacentHTML("beforeend", '<option value="'+c+'"'+(c===(copia.cols||8)?" selected":"")+'>'+c+'</option>');
  function filas(){
    var tb=d.querySelector("#et_filas");
    var inp='style="width:100%;padding:6px 8px;border:1px solid var(--linea);border-radius:6px;background:var(--sup);color:var(--tinta);font:inherit"';
    tb.innerHTML=it().map(function(x,i){
      return '<tr data-i="'+i+'"><td style="padding:3px"><input data-k="nombre" value="'+esc(x.nombre||"")+'" placeholder="—" '+inp+'></td>'+
        '<td style="padding:3px"><input data-k="precio" type="text" inputmode="decimal" value="'+esc(String(x.precio).replace(".",","))+'" '+inp.replace('style="','style="text-align:right;')+'></td>'+
        '<td style="padding:3px"><input data-k="cant" type="number" min="0" step="1" value="'+esc(x.cant)+'" '+inp.replace('style="','style="text-align:right;')+'></td>'+
        '<td style="padding:3px"><button class="btn suave sm" data-quitar title="Quitar">✕</button></td></tr>';
    }).join("");
    tb.querySelectorAll("input").forEach(function(e){
      e.addEventListener("input", function(){
        var i=+e.closest("tr").getAttribute("data-i"), k=e.getAttribute("data-k");
        it()[i][k]= k==="cant" ? Math.max(0, parseInt(e.value,10)||0) : k==="precio" ? e.value.replace(",",".").replace(/[^\d.]/g,"") : e.value;
        vista();
      });
      if(e.getAttribute("data-k")==="cant") e.addEventListener("change", function(){ if(repartir().creadas.length){ filas(); vista(); } });
    });
    tb.querySelectorAll("[data-quitar]").forEach(function(b){
      b.addEventListener("click", function(){ it().splice(+b.closest("tr").getAttribute("data-i"),1); filas(); vista(); });
    });
  }
  function vista(){
    var tmp={etiq:copia}, g=etRejilla(copia.cols), tot=etTotal(tmp, cur), fol=etFolios(tmp, cur);
    var cu=d.querySelector("#et_cuenta");
    cu.textContent="Esta hoja: "+tot+" de "+g.porHoja+(tot>=g.porHoja?" · llena":" · quedan "+(g.porHoja-tot));
    cu.style.color = tot>g.porHoja ? "#b3261e" : tot===g.porHoja ? "var(--acento)" : "";
    d.querySelector("#et_vlbl").textContent="Así sale «"+copia.hojas[cur].nombre+"»"+(fol>1?" (primer folio de "+fol+")":"");
    var box=d.querySelector("#et_vista"), k=box.clientWidth/(210*96/25.4);
    box.innerHTML='<div style="transform:scale('+k+');transform-origin:0 0;position:absolute;left:0;top:0">'+etHTMLHojas(tmp, true, cur)+'</div>';
    pestanas();
  }
  /* Pestañas: varias hojas dentro de las mismas etiquetas */
  function pestanas(){
    var t=d.querySelector("#et_tabs"), tmp={etiq:copia};
    t.innerHTML=copia.hojas.map(function(hj,i){
      var cap=etRejilla(copia.cols).porHoja, n=etTotal(tmp,i);
      return '<button class="btn sm'+(i===cur?' fuerte':'')+'" data-hj="'+i+'">'+esc(hj.nombre)+' <span style="opacity:.7">· '+n+(n>=cap?' llena':'/'+cap)+'</span></button>';
    }).join("")+
      '<button class="btn sm" id="et_hnueva">+ Hoja</button>'+
      '<span style="margin-left:auto;display:flex;gap:6px">'+
      '<button class="btn sm suave" id="et_hren">&#9998; Nombre</button>'+
      '<button class="btn sm suave" id="et_hdup">Duplicar</button>'+
      (copia.hojas.length>1?'<button class="btn sm suave" id="et_hdel">&#128465; Borrar hoja</button>':'')+'</span>';
    t.querySelectorAll("[data-hj]").forEach(function(b){ b.addEventListener("click", function(){ cur=+b.getAttribute("data-hj"); filas(); vista(); }); });
    t.querySelector("#et_hnueva").addEventListener("click", function(){
      copia.hojas.push({nombre:"Hoja "+(copia.hojas.length+1), items:[{nombre:"", precio:"", cant:8}]});
      cur=copia.hojas.length-1; filas(); vista();
      var u=d.querySelector('#et_filas [data-k="precio"]'); if(u) u.focus();
    });
    t.querySelector("#et_hren").addEventListener("click", function(){
      var n=prompt("Nombre de la hoja", copia.hojas[cur].nombre); if(n&&n.trim()){ copia.hojas[cur].nombre=n.trim(); vista(); }
    });
    t.querySelector("#et_hdup").addEventListener("click", function(){
      var c=JSON.parse(JSON.stringify(copia.hojas[cur])); c.nombre=c.nombre+" (copia)";
      copia.hojas.splice(cur+1,0,c); cur++; filas(); vista();
    });
    var del=t.querySelector("#et_hdel");
    if(del) del.addEventListener("click", function(){
      if(!confirm("¿Borrar la hoja «"+copia.hojas[cur].nombre+"» con sus "+etTotal(tmp,cur)+" etiquetas?")) return;
      copia.hojas.splice(cur,1); cur=Math.max(0,cur-1); filas(); vista();
    });
  }
  sel.addEventListener("change", function(){ copia.cols=+sel.value; repartir(); filas(); vista(); });
  /* Ampliar: todos los folios de la hoja, grandes, con + y − */
  function ampliar(){
    var tmp={etiq:copia}, z=1, ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:50;background:#2a2a2a;display:flex;flex-direction:column";
    ov.innerHTML='<div style="display:flex;gap:8px;align-items:center;padding:10px 14px;background:var(--sup);border-bottom:1px solid var(--linea)">'+
      '<b style="font-size:15px">'+esc(copia.hojas[cur].nombre)+'</b><span class="nota" style="margin:0">'+etFolios(tmp,cur)+' folio(s)</span>'+
      '<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-z="-1" style="min-width:42px;font-size:18px">−</button><button class="btn sm" data-z="0">Ajustar</button><button class="btn sm" data-z="1" style="min-width:42px;font-size:18px">+</button>'+
      '<button class="btn sm fuerte" data-cz>Cerrar</button></span></div>'+
      '<div data-sc style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px"><div data-in style="transform-origin:0 0"></div></div>';
    d.appendChild(ov);
    var sc=ov.querySelector("[data-sc]"), inn=ov.querySelector("[data-in]"), px=210*96/25.4;
    inn.innerHTML=etHTMLHojas(tmp, false, cur).replace(/class="et-pag" style="/g,'class="et-pag" style="margin:0 auto 16px;box-shadow:0 2px 12px rgba(0,0,0,.4);');
    var base=Math.min(1,(sc.clientWidth-32)/px);
    function pon(){ var k=base*z; inn.style.transform="scale("+k+")"; inn.style.width=px+"px"; inn.style.height=(inn.scrollHeight)+"px";
      inn.style.marginBottom=(inn.scrollHeight*(k-1))+"px"; inn.style.marginRight=(px*(k-1))+"px";
      inn.style.marginLeft=Math.max(0,(sc.clientWidth-32-px*k)/2)+"px"; }
    pon();
    ov.querySelectorAll("[data-z]").forEach(function(b){ b.addEventListener("click", function(){
      var v=+b.getAttribute("data-z"); z = v===0 ? 1 : Math.max(.5, Math.min(5, z*(v>0?1.4:1/1.4))); pon(); }); });
    ov.querySelector("[data-cz]").addEventListener("click", function(){ ov.remove(); });
  }
  d.querySelector("#et_zoom").addEventListener("click", ampliar);
  d.querySelector("#et_vista").addEventListener("click", ampliar);
  d.querySelector("#et_vista").style.cursor="zoom-in";
  d.querySelector("#et_mas").addEventListener("click", function(){
    if(libres()<=0){
      var n=1, us={}; copia.hojas.forEach(function(x){ us[x.nombre]=1; }); while(us["Hoja "+n]) n++;
      copia.hojas.splice(cur+1,0,{nombre:"Hoja "+n, items:[]}); cur++;
      aviso("Esta hoja está llena: sigues en «Hoja "+n+"»");
    }
    it().push({nombre:"", precio:"", cant:Math.min(8, libres())}); filas(); vista();
    var u=d.querySelectorAll('#et_filas tr'); if(u.length) u[u.length-1].querySelector('[data-k="precio"]').focus();
  });
  /* Pegar muchos de golpe */
  function leerPegado(txt, porDefecto){
    var out=[];
    function num(t){ return String(+String(t).replace(",", ".")); }
    String(txt||"").split(/\r?\n/).forEach(function(lin){
      if(!lin.trim()) return;
      /* De Excel: columnas separadas por tabulador → texto = nombre, 1er número = precio, 2º = cuántas */
      if(lin.indexOf("\t")>=0){
        var cel=lin.split("\t").map(function(c){ return c.trim(); }).filter(Boolean), nom=[], ns=[];
        cel.forEach(function(c){ var m=/^(?:€\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?)?$/i.exec(c); if(m) ns.push(m[1]); else nom.push(c); });
        if(ns.length){ out.push({nombre:nom.join(" ").toUpperCase(), precio:num(ns[0]), cant: ns[1]&&/^\d+$/.test(ns[1]) ? +ns[1] : porDefecto}); }
        return;
      }
      lin=lin.trim();
      var cant=null, m;
      /* cuántas: "x 24", "× 24", "* 24", "24 uds", "24 unidades", "24 etiquetas", "24 x 3,50" */
      if((m=/(?:\bx|×|\*|\bpor)\s*(\d{1,4})\s*(?:uds?|unidades|etiquetas)?\s*$/i.exec(lin))){ cant=+m[1]; lin=lin.slice(0,m.index).trim(); }
      else if((m=/\b(\d{1,4})\s*(?:uds?|unidades|etiquetas)\b\.?/i.exec(lin))){ cant=+m[1]; lin=(lin.slice(0,m.index)+" "+lin.slice(m.index+m[0].length)).trim(); }
      else if((m=/^(\d{1,4})\s*(?:x|×|\*)\s*/i.exec(lin))){ cant=+m[1]; lin=lin.slice(m[0].length).trim(); }
      /* precios: con decimales, o con €, o un número solo */
      var re=/(?:€\s*)?(\d{1,4}(?:\s?[.,]\s?\d{1,2})?)(?!\d)\s*(€|eur(?:os?)?)?/gi, ps=[];
      while((m=re.exec(lin))){
        var v=m[1].replace(/\s/g,""), fuerte=/[.,]/.test(v) || !!m[2] || /€\s*$/.test(lin.slice(0,m.index+1));
        ps.push({v:v, fuerte:fuerte, i:m.index, f:m.index+m[0].length});
      }
      if(!ps.length) return;
      var buenos=ps.filter(function(x){ return x.fuerte; });
      if(buenos.length>1 && cant==null){ buenos.forEach(function(x){ out.push({nombre:"", precio:num(x.v), cant:1}); }); return; }
      var x=buenos[0] || ps[ps.length-1];
      var nombre=(lin.slice(0,x.i)+" "+lin.slice(x.f)).replace(/[-–:=€]+/g," ").replace(/\s+/g," ").trim();
      if(/^\d+([.,]\d+)?$/.test(nombre)) nombre="";
      out.push({nombre:nombre.toUpperCase(), precio:num(x.v), cant: cant==null ? porDefecto : cant});
    });
    /* los iguales se juntan */
    var junt={}, orden=[];
    out.forEach(function(e){ var k=e.nombre+"|"+(+e.precio); if(!junt[k]){ junt[k]={nombre:e.nombre, precio:String(+e.precio), cant:0}; orden.push(k); } junt[k].cant+=e.cant; });
    return orden.map(function(k){ return junt[k]; });
  }
  var pegado=d.querySelector("#et_pegado"), txt=d.querySelector("#et_txt"), pinfo=d.querySelector("#et_pinfo");
  function infoPegado(){
    var l=leerPegado(txt.value, parseInt(d.querySelector("#et_def").value,10)||1);
    pinfo.textContent = l.length ? l.length+" precios distintos, "+l.reduce(function(a,x){ return a+x.cant; },0)+" etiquetas" : "";
  }
  d.querySelector("#et_pegar").addEventListener("click", function(){
    pegado.style.display = pegado.style.display==="none" ? "block" : "none";
    if(pegado.style.display==="block") txt.focus();
  });
  txt.addEventListener("input", infoPegado); d.querySelector("#et_def").addEventListener("input", infoPegado);
  d.querySelector("#et_pok").addEventListener("click", function(){
    var l=leerPegado(txt.value, parseInt(d.querySelector("#et_def").value,10)||1);
    if(!txt.value.trim()){ aviso("El recuadro está vacío: pega o escribe ahí los precios", true); txt.focus(); return; }
    if(!l.length){ aviso("No veo ningún número que sea un precio. Escribe por ejemplo: 9,50", true); txt.focus(); return; }
    if(d.querySelector("#et_reempl").checked) copia.hojas[cur].items=[];
    l.forEach(function(e){
      var ya=it().filter(function(x){ return String(x.nombre||"").toUpperCase()===e.nombre && +x.precio===+e.precio; })[0];
      if(ya) ya.cant=(parseInt(ya.cant,10)||0)+e.cant; else it().push(e);
    });
    txt.value=""; pinfo.textContent=""; pegado.style.display="none";
    var r=repartir(); filas(); vista();
    if(!r.creadas.length) aviso(l.length+" precios añadidos");
  });
  d.querySelector("#et_ordenar").addEventListener("click", function(){
    it().sort(function(a,b){
      if(!!a.nombre!==!!b.nombre) return a.nombre?-1:1;
      return (parseFloat(a.precio)||0)-(parseFloat(b.precio)||0) || String(a.nombre).localeCompare(String(b.nombre));
    });
    filas(); vista();
  });
  function guardarYa(){
    copia.hojas.forEach(function(hj){ hj.items=hj.items.filter(function(x){ return String(x.precio).trim()!=="" || String(x.nombre||"").trim(); }); });
    h.etiq=copia; h.paginas=Math.max(1,etFolios(h)); guardar(); pintarLista();
  }
  d.querySelector("#et_guardar").addEventListener("click", function(){ guardarYa(); d.close(); aviso("Etiquetas guardadas"); });
  d.querySelector("#et_imp").addEventListener("click", function(){ guardarYa(); d.close(); imprimirEtiquetas(h); });
  d.querySelector("#et_imp1").addEventListener("click", function(){ guardarYa(); d.close(); imprimirEtiquetas(h, cur); });
  filas(); setTimeout(vista, 30);
}
function imprimirEtiquetas(h, solo){
  if(!etTotal(h, solo)){ aviso("No hay ninguna etiqueta que imprimir", true); return; }
  imprimirPaginas(h, etHTMLHojas(h, false, solo));
}
function imprimirPaginas(h, html){
  var caja=document.getElementById("et-imprimir");
  if(!caja){ caja=document.createElement("div"); caja.id="et-imprimir"; document.body.appendChild(caja); }
  caja.innerHTML=html;
  var st=document.getElementById("et-imp-css");
  if(!st){
    st=document.createElement("style"); st.id="et-imp-css";
    st.textContent="#et-imprimir{display:none}"+
      "@media print{@page{size:A4 portrait;margin:0}body.et-imprimiendo>*:not(#et-imprimir){display:none!important}"+
      "body.et-imprimiendo{background:#fff!important;margin:0}body.et-imprimiendo #et-imprimir{display:block!important}"+
      "#et-imprimir .et-pag{page-break-after:always;break-after:page}#et-imprimir .et-pag:last-child{page-break-after:auto;break-after:auto}"+
      "#et-imprimir *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
    document.head.appendChild(st);
  }
  document.body.classList.add("et-imprimiendo");
  var fin=function(){ document.body.classList.remove("et-imprimiendo"); caja.innerHTML=""; window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  h.impresa=(h.impresa||0)+1; h.usada=hoyISO(); guardar();
  setTimeout(function(){ window.print(); setTimeout(function(){ document.addEventListener("pointerdown", fin, {once:true}); }, 500); }, 60);
}

/* ══════════════════════════════════════════════════════════════
   HOJA DE HORARIOS (para rellenar a mano)
   ══════════════════════════════════════════════════════════════
   Como la de Excel: «Semana del … al …», LUNES a DOMINGO y una fila por
   persona; dos semanas por folio. Se edita el personal (añadir, quitar,
   mover) y, si se quiere, la fecha del primer lunes para que salgan las
   fechas puestas. h.hor = {personal:[…], desde:"AAAA-MM-DD"|"", semanas:n} */
var HOR_DIAS=["LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO","DOMINGO"];
var HOR_MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
/* F (fiesta) sale en color, también al imprimir */
/* Marcas con su inicial y su color. El horario nunca las pisa al repetir, arrastrar o pegar */
var HOR_MARCAS={F:{n:"Fiesta",col:"#ffd8a8",borde:"#f0b070"}, V:{n:"Vacaciones",col:"#cfe3ff",borde:"#8fb8ec"}, B:{n:"Baja",col:"#f8c4c4",borde:"#e08a8a"}, A:{n:"Ausencia",col:"#e6d9f7",borde:"#b9a0de"}};
function horMarca(v){
  v=String(v||"").trim().toLowerCase(); if(!v) return null;
  if(/^(f|fiesta|festa|libre)$/.test(v)) return "F";
  if(/^(v|vac|vacaciones|vacances)$/.test(v)) return "V";
  if(/^(b|baja|baixa)$/.test(v)) return "B";
  if(/^(a|ausencia|absencia|absència)$/.test(v)) return "A";
  return null;
}
/* Personas que salen en la hoja: con nombre y sin ocultar (las ocultas guardan sus datos) */
function horVisibles(hor){ var oc=hor.ocultos||[]; return (hor.personal||[]).filter(function(x){ return String(x).trim() && oc.indexOf(x)<0; }); }
function horEsFiesta(v){ return !!horMarca(v); }
function horFondo(v, edit){
  var m=horMarca(v), col = m ? HOR_MARCAS[m].col : (edit ? "#fffef5" : "#fff");
  return col;
}
function horNuevo(){ return {personal:["VALERIANO","LUIS","MARTIN","J.ANTONIO","SERGIO","MELO","CRIS","TONI","TAMARA"], desde:"", semanas:2, dias:false}; }
function horLunes(iso){ if(!iso) return null; var d=new Date(iso+"T12:00:00"); if(isNaN(d)) return null; d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
function horHTML(hor, soloPrimera, edit){
  var cel=hor.celdas||{}, tits=hor.titulos||{};
  var per=horVisibles(hor), n=Math.max(1, Math.min(52, parseInt(hor.semanas,10)||2));
  var lun=horLunes(hor.desde), sem=[];
  for(var i=0;i<n;i++){
    var tit, fechas=null;
    if(lun){
      var a=new Date(lun); a.setDate(a.getDate()+7*i); var b=new Date(a); b.setDate(b.getDate()+6);
      tit="Semana del "+a.getDate()+" de "+HOR_MESES[a.getMonth()]+(a.getFullYear()!==b.getFullYear()?" de "+a.getFullYear():"")+" al "+b.getDate()+" de "+HOR_MESES[b.getMonth()]+" de "+b.getFullYear();
      if(hor.dias){ fechas=[]; for(var k=0;k<7;k++){ var c=new Date(a); c.setDate(c.getDate()+k); fechas.push(c.getDate()); } }
    } else {
      var t=(tits[i] && typeof tits[i]==="object") ? tits[i] : {}, an=[18,32,18,32];
      var hueco=function(n){ return edit
        ? '<input data-t="'+i+'" data-n="'+n+'" value="'+esc(t[n]||"")+'" style="width:'+an[n]+'mm;font:inherit;text-align:center;border:0;border-bottom:.3mm solid #000;background:#fffef5;padding:0;outline:none">'
        : (t[n] ? '<span style="display:inline-block;min-width:'+an[n]+'mm;border-bottom:.3mm solid #000">'+esc(t[n])+'</span>' : '<span class="hl" style="width:'+an[n]+'mm"></span>'); };
      tit='Semana del '+hueco(0)+' de '+hueco(1)+' al '+hueco(2)+' de '+hueco(3)+
        (edit?' <label title="Elegir la semana en el calendario" style="display:inline-flex;align-items:center;gap:1mm;font:9pt Helvetica,Arial,sans-serif;border:.3mm solid #1a73e8;border-radius:1.5mm;padding:.5mm 2mm;color:#1a73e8;cursor:pointer;vertical-align:middle">&#128197; <input type="date" data-tcal="'+i+'" style="font:inherit;border:0;background:transparent;color:#1a73e8;width:30mm;cursor:pointer"></label>':'');
    }
    sem.push({tit:tit, fechas:fechas, i:i});
  }
  /* alto de fila: que quepan dos semanas en el folio */
  var alto=(297-20-12)/2 - 12, fila=Math.max(7, Math.min(16, alto/(per.length+1)));
  function bloque(s){
    return '<div style="margin-bottom:12mm">'+
      '<div style="font:700 12pt Helvetica,Arial,sans-serif;margin:0 0 3mm;text-align:center">'+s.tit+'</div>'+
      (edit?'<div style="display:flex;gap:2mm;justify-content:flex-end;margin:-1mm 0 2mm;font:9pt Helvetica,Arial,sans-serif">'+
        '<button data-csem="'+s.i+'" style="font:inherit;padding:1mm 3mm;border:.3mm solid #999;border-radius:1.5mm;background:#fff;cursor:pointer">&#128203; Copiar esta semana</button>'+
        '<button data-psem="'+s.i+'" style="font:inherit;padding:1mm 3mm;border:.3mm solid #999;border-radius:1.5mm;background:#fff;cursor:pointer">&#128229; Pegar aquí</button>'+
        '<button data-vsem="'+s.i+'" style="font:inherit;padding:1mm 3mm;border:.3mm solid #c99;border-radius:1.5mm;background:#fff;color:#a22;cursor:pointer">Vaciar</button></div>':'')+
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Helvetica,Arial,sans-serif">'+
      '<tr style="height:'+fila.toFixed(2)+'mm"><th style="width:30mm;border:.3mm solid #000;padding:0"></th>'+HOR_DIAS.map(function(d,k){
        return '<th style="border:.3mm solid #000;font:700 9pt Helvetica,Arial,sans-serif;color:#000;letter-spacing:0;text-transform:none;text-align:center;padding:0;background:#eee">'+d+(s.fechas?' '+s.fechas[k]:'')+'</th>'; }).join("")+'</tr>'+
      per.map(function(p){ return '<tr style="height:'+fila.toFixed(2)+'mm"><td style="border:.3mm solid #000;font-weight:700;font-size:'+(fila<9?8:10)+'pt;padding:0 2mm;white-space:nowrap;overflow:hidden">'+esc(p)+'</td>'+
        HOR_DIAS.map(function(_,k){ var key=s.i+"|"+p+"|"+k, v=cel[key]||"";
          return '<td'+(edit?' contenteditable="true" inputmode="none" data-c="'+esc(key)+'"':'')+' style="border:.3mm solid #000;text-align:center;vertical-align:middle;font:700 '+(fila<9?8:10)+'pt Helvetica,Arial,sans-serif;white-space:pre-wrap;line-height:1.1;padding:0 1mm;overflow:hidden;outline:none'+';background:'+horFondo(v, edit)+'">'+esc(v)+'</td>'; }).join("")+'</tr>'; }).join("")+
      '</table></div>';
  }
  var pags=[]; for(var j=0;j<sem.length;j+=2) pags.push(sem.slice(j,j+2));
  if(soloPrimera) pags=pags.slice(0,1);
  return '<style>.hl{display:inline-block;border-bottom:.3mm solid #000;height:4mm;vertical-align:baseline}</style>'+pags.map(function(pg){
    return '<div class="et-pag" style="width:210mm;height:297mm;padding:10mm;box-sizing:border-box;background:#fff;color:#000;position:relative">'+pg.map(bloque).join("")+
      '<div style="position:absolute;left:10mm;right:10mm;bottom:7mm;display:flex;gap:6mm;justify-content:center;font:700 9pt Helvetica,Arial,sans-serif">'+
        Object.keys(HOR_MARCAS).map(function(k){ return '<span style="display:inline-flex;align-items:center;gap:1.5mm"><span style="display:inline-block;width:6mm;height:4.5mm;background:'+HOR_MARCAS[k].col+';border:.3mm solid #000;text-align:center;line-height:4.5mm">'+k+'</span>'+HOR_MARCAS[k].n+'</span>'; }).join("")+
      '</div></div>';
  }).join("");
}
function verGrande(dlg, titulo, html){
  var z=1, ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:50;background:#2a2a2a;display:flex;flex-direction:column";
  ov.innerHTML='<div style="display:flex;gap:8px;align-items:center;padding:10px 14px;background:var(--sup);border-bottom:1px solid var(--linea)">'+
    '<b style="font-size:15px">'+esc(titulo)+'</b>'+
    '<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-z="-1" style="min-width:42px;font-size:18px">−</button><button class="btn sm" data-z="0">Ajustar</button><button class="btn sm" data-z="1" style="min-width:42px;font-size:18px">+</button>'+
    '<button class="btn sm fuerte" data-cz>Cerrar</button></span></div>'+
    '<div data-sc style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px"><div data-in style="transform-origin:0 0"></div></div>';
  dlg.appendChild(ov);
  var sc=ov.querySelector("[data-sc]"), inn=ov.querySelector("[data-in]"), px=210*96/25.4;
  inn.innerHTML=html.replace(/class="et-pag" style="/g,'class="et-pag" style="margin:0 auto 16px;box-shadow:0 2px 12px rgba(0,0,0,.4);');
  var base=Math.min(1,(sc.clientWidth-32)/px);
  function pon(){ var k=base*z; inn.style.transform="scale("+k+")"; inn.style.width=px+"px";
    inn.style.marginBottom=(inn.scrollHeight*(k-1))+"px"; inn.style.marginRight=(px*(k-1))+"px";
    inn.style.marginLeft=Math.max(0,(sc.clientWidth-32-px*k)/2)+"px"; }
  pon();
  ov.querySelectorAll("[data-z]").forEach(function(b){ b.addEventListener("click", function(){
    var v=+b.getAttribute("data-z"); z = v===0 ? 1 : Math.max(.5, Math.min(5, z*(v>0?1.4:1/1.4))); pon(); }); });
  ov.querySelector("[data-cz]").addEventListener("click", function(){ ov.remove(); });
}
var copiaSemana=null;
function abrirHorario(h){
  h.hor=h.hor||horNuevo();
  var c=JSON.parse(JSON.stringify(h.hor));
  var inp='style="padding:7px 9px;border:1px solid var(--linea);border-radius:6px;background:var(--sup);color:var(--tinta);font:inherit"';
  var d=dialogo(h.titulo,
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:18px" class="et-dos">'+
      '<div>'+
        '<div class="lbl" style="margin-bottom:6px">Personal</div>'+
        '<div id="ho_per"></div>'+
        '<div style="display:flex;gap:6px;margin-top:8px"><input id="ho_nuevo" placeholder="Nombre nuevo" '+inp+' style="flex:1"><button class="btn fuerte sm" id="ho_mas">+ Añadir</button></div>'+
        '<div class="lbl" style="margin:18px 0 6px">Fechas</div>'+
        '<label style="display:flex;gap:8px;align-items:center;font-size:14px;flex-wrap:wrap">Primer lunes <input type="date" id="ho_desde" value="'+esc(c.desde||"")+'" '+inp+'>'+
          '<button class="btn sm suave" id="ho_sinf">En blanco</button></label>'+
        '<p class="nota" style="margin:4px 0 8px">Déjalo en blanco para escribir las fechas a mano, como en tu hoja.</p>'+
        '<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:8px"><input type="checkbox" id="ho_dias" style="width:auto"'+(c.dias?" checked":"")+'> Poner el número del día junto a LUNES, MARTES…</label>'+
        '<label style="display:flex;gap:8px;align-items:center;font-size:14px">Semanas <select id="ho_sem" '+inp+'></select> <span class="nota" style="margin:0">(2 por folio)</span></label>'+
        '<div class="lbl" style="margin:18px 0 6px">Horarios guardados</div>'+
        '<p class="nota" style="margin:0 0 6px">Lo que escribes se guarda solo. Cuando acabes unas semanas, pulsa «Guardar en el archivo» y quedan guardadas para verlas o imprimirlas cuando quieras.</p>'+
        '<button class="btn sm fuerte" id="ho_arch">&#128190; Guardar en el archivo</button>'+
        '<div id="ho_lista_arch" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>'+
      '</div>'+
      '<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div class="lbl" style="margin:0">Así sale</div><button class="btn sm" id="ho_verarch" style="margin-left:auto">&#128450;&#65039; Guardados</button><button class="btn sm fuerte" id="ho_rell">&#9998;&#65039; Rellenar</button><button class="btn sm" id="ho_zoom">&#128269; Ampliar</button></div>'+
        '<div id="ho_vista" style="border:1px solid var(--linea);border-radius:8px;overflow:hidden;background:#fff;height:520px;position:relative;cursor:zoom-in"></div></div>'+
    '</div>',
    '<button class="btn malo" id="ho_borrar">&#128465;&#65039; Borrar horario entero</button><span class="nota" id="ho_estado" style="margin:0 auto 0 0"></span><button class="btn" id="ho_guardar">Cerrar</button><button class="btn" id="ho_wa" style="background:#25d366;border-color:#25d366;color:#fff">&#128172; WhatsApp</button><button class="btn fuerte" id="ho_imp">&#128424; Imprimir</button>', true);
  var sel=d.querySelector("#ho_sem");
  for(var k=1;k<=12;k++) sel.insertAdjacentHTML("beforeend",'<option value="'+k+'"'+(k===(+c.semanas||2)?" selected":"")+'>'+k+'</option>');
  function lista(){
    var box=d.querySelector("#ho_per");
    c.ocultos=c.ocultos||[];
    box.innerHTML=c.personal.map(function(p,i){
      var oc=c.ocultos.indexOf(p)>=0;
      return '<div style="display:flex;gap:6px;margin-bottom:6px;'+(oc?'opacity:.5':'')+'" data-i="'+i+'"><input value="'+esc(p)+'" '+inp+' style="flex:1'+(oc?';text-decoration:line-through':'')+'">'+
        '<button class="btn sm '+(oc?'':'suave')+'" data-o title="'+(oc?'Oculto: pulsa para que vuelva a salir':'Ocultar en la hoja (no se borra)')+'">'+(oc?'&#128584; Oculto':'&#128065;&#65039;')+'</button>'+
        '<button class="btn sm suave" data-m="-1" title="Subir"'+(i===0?' disabled':'')+'>&#9650;</button>'+
        '<button class="btn sm suave" data-m="1" title="Bajar"'+(i===c.personal.length-1?' disabled':'')+'>&#9660;</button>'+
        '<button class="btn sm suave" data-q title="Quitar">✕</button></div>';
    }).join("");
    box.querySelectorAll("input").forEach(function(e){ e.addEventListener("input", function(){
      var i=+e.parentNode.getAttribute("data-i"), viejo=c.personal[i], o=c.ocultos.indexOf(viejo);
      c.personal[i]=e.value.toUpperCase(); if(o>=0) c.ocultos[o]=c.personal[i]; vista(); }); });
    box.querySelectorAll("[data-o]").forEach(function(b){ b.addEventListener("click", function(){
      var p=c.personal[+b.parentNode.getAttribute("data-i")], o=c.ocultos.indexOf(p);
      if(o>=0) c.ocultos.splice(o,1); else c.ocultos.push(p);
      lista(); vista(); aviso(o>=0 ? p+" vuelve a salir en la hoja" : p+" oculto: no sale en la hoja, pero no se borra nada");
    }); });
    box.querySelectorAll("[data-m]").forEach(function(b){ b.addEventListener("click", function(){
      var i=+b.parentNode.getAttribute("data-i"), j=i+(+b.getAttribute("data-m")); var t=c.personal[i]; c.personal[i]=c.personal[j]; c.personal[j]=t; lista(); vista(); }); });
    box.querySelectorAll("[data-q]").forEach(function(b){ b.addEventListener("click", function(){ c.personal.splice(+b.parentNode.getAttribute("data-i"),1); lista(); vista(); }); });
  }
  function vista(){
    var box=d.querySelector("#ho_vista"), k=box.clientWidth/(210*96/25.4);
    box.innerHTML='<div style="transform:scale('+k+');transform-origin:0 0;position:absolute;left:0;top:0">'+horHTML(c, true)+'</div>';
    if(typeof auto==="function") auto();
  }
  function mas(){ var e=d.querySelector("#ho_nuevo"), v=e.value.trim().toUpperCase(); if(!v){ e.focus(); return; } c.personal.push(v); e.value=""; lista(); vista(); e.focus(); }
  d.querySelector("#ho_mas").addEventListener("click", mas);
  d.querySelector("#ho_nuevo").addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); mas(); } });
  d.querySelector("#ho_desde").addEventListener("change", function(e){ c.desde=e.target.value; vista(); });
  d.querySelector("#ho_sinf").addEventListener("click", function(){ c.desde=""; d.querySelector("#ho_desde").value=""; vista(); });
  d.querySelector("#ho_dias").addEventListener("change", function(e){ c.dias=e.target.checked; vista(); });
  sel.addEventListener("change", function(){ c.semanas=+sel.value; vista(); });
  function grande(){ verGrande(d, h.titulo, horHTML(c, false)); }
  /* Rellenar: la hoja en grande y se escribe en cada casilla */
  d.querySelector("#ho_rell").addEventListener("click", function(){
    c.celdas=c.celdas||{}; c.titulos=c.titulos||{};
    var ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:50;background:#2a2a2a;display:flex;flex-direction:column";
    ov.innerHTML='<div style="display:flex;gap:8px;align-items:center;padding:10px 14px;background:var(--sup);border-bottom:1px solid var(--linea);flex-wrap:wrap">'+
      '<b style="font-size:15px">Rellenar</b><span class="nota" style="margin:0">Toca una casilla y elige las horas abajo</span>'+
      '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">'+
      '<button class="btn sm" data-rz="-1" style="min-width:42px;font-size:18px" title="Más pequeño">−</button>'+
      '<button class="btn sm" data-rz="toda">Ver hoja entera</button>'+
      '<button class="btn sm" data-rz="ancho">Ancho</button>'+
      '<button class="btn sm" data-rz="1" style="min-width:42px;font-size:18px" title="Más grande">+</button>'+
      '<button class="btn sm fuerte" data-rep="sem" disabled title="Repite lo de la casilla en los 7 días">&#10145;&#65039; Toda la semana</button>'+
      '<button class="btn sm fuerte" data-rep="todos" disabled title="Repite lo de la casilla a todas las personas ese día">&#11015;&#65039; A todos</button>'+
      '<button class="btn sm" data-wa style="background:#25d366;border-color:#25d366;color:#fff">&#128172; WhatsApp</button>'+
      '<button class="btn sm malo" data-vac>&#128465;&#65039; Borrar horario entero</button>'+
      '<button class="btn sm fuerte" data-ok>Hecho</button></span></div>'+
      '<div data-sc style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px"></div>'+
      /* Rueda de horas: se elige entrada y salida sin escribir */
      '<div data-rueda style="background:var(--sup);border-top:1px solid var(--linea);padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
        '<b data-rlbl style="font-size:14px;min-width:150px">Toca una casilla</b>'+
        '<label class="rl">Entra <select data-r="e1"></select></label>'+
        '<label class="rl">Sale <select data-r="s1"></select></label>'+
        '<label class="rl" style="gap:4px"><input type="checkbox" data-r="partido" style="width:auto"> Partido</label>'+
        '<span data-r2 style="display:none;gap:10px"><label class="rl">Entra <select data-r="e2"></select></label><label class="rl">Sale <select data-r="s2"></select></label></span>'+
        '<button class="btn fuerte" data-rponer>Poner ➜</button>'+
        '<span data-rchips style="display:flex;gap:6px;flex-wrap:wrap"></span>'+
        '<button class="btn suave sm" data-rborrar>Borrar</button>'+
        '<button class="btn suave sm" data-rteclado title="Escribir con el teclado">&#9000;&#65039; Escribir</button>'+
      '</div>'+
      '<style>.rl{display:inline-flex;align-items:center;gap:6px;font-size:14px}.rl select{font-size:17px;padding:6px 8px;border:1px solid var(--linea);border-radius:8px;background:#fff;color:#000;min-width:84px}'+
      '[data-c].sel{box-shadow:inset 0 0 0 3px #1a73e8}</style>'+
      /* el cuadradito azul para arrastrar sale solo en la casilla que estás escribiendo */
      '<style>[data-c]:focus{box-shadow:inset 0 0 0 2px #1a73e8;background-image:linear-gradient(#1a73e8,#1a73e8)!important;background-repeat:no-repeat!important;background-position:right 0 bottom 0!important;background-size:2.6mm 2.6mm!important}</style>';
    d.appendChild(ov);
    var sc=ov.querySelector("[data-sc]"), zr=1;
    /* ── rueda ── */
    var horas=['<option value="">—</option>'];
    for(var hh=0;hh<24;hh++){ horas.push('<option>'+hh+'</option>'); horas.push('<option>'+hh+':30</option>'); }
    ov.querySelectorAll("[data-rueda] select").forEach(function(se){ se.innerHTML=horas.join(""); });
    function rs(n){ return ov.querySelector('[data-r="'+n+'"]'); }
    rs("partido").addEventListener("change", function(){ ov.querySelector("[data-r2]").style.display=rs("partido").checked?"inline-flex":"none"; });
    function tdDe(key){ return key ? sc.querySelector('[data-c="'+(window.CSS&&CSS.escape?CSS.escape(key):key)+'"]') : null; }
    function selecciona(key){
      sc.querySelectorAll("[data-c].sel").forEach(function(e){ e.classList.remove("sel"); });
      ultCelda=key; var td=tdDe(key); if(td) td.classList.add("sel");
      var p=(key||"").split("|");
      ov.querySelector("[data-rlbl]").textContent = key ? p[1]+" · "+HOR_DIAS[+p[2]] : "Toca una casilla";
      /* la rueda se pone en lo que ya tenga la casilla */
      var v=(c.celdas||{})[key]||"", m=/^\s*(\d{1,2}(?::\d\d)?)\s*-\s*(\d{1,2}(?::\d\d)?)(?:\s*\/\s*(\d{1,2}(?::\d\d)?)\s*-\s*(\d{1,2}(?::\d\d)?))?/.exec(v);
      if(m){ rs("e1").value=m[1]; rs("s1").value=m[2]; rs("partido").checked=!!m[3]; if(m[3]){ rs("e2").value=m[3]; rs("s2").value=m[4]; } }
      rs("partido").dispatchEvent(new Event("change"));
      marcaBotones(); chips();
    }
    function prot(key){ return !!horMarca((c.celdas||{})[key]); }
    function ponValor(v){
      if(!ultCelda){ aviso("Toca primero una casilla", true); return; }
      var key=ultCelda, td=tdDe(key);
      if(v) c.celdas[key]=v; else delete c.celdas[key];
      if(td){ td.textContent=v||""; td.style.background=horFondo(v, true); }
      auto();
      /* pasa solo al día siguiente */
      var p=key.split("|"), k=+p[2];
      var sig=k+1; while(sig<7 && prot(p[0]+"|"+p[1]+"|"+sig)) sig++;   /* se salta fiestas, vacaciones, bajas y ausencias */
      if(v && sig<7) selecciona(p[0]+"|"+p[1]+"|"+sig); else { marcaBotones(); chips(); }
    }
    function valorRueda(){
      var e1=rs("e1").value, s1=rs("s1").value; if(!e1||!s1) return "";
      var v=e1+"-"+s1;
      if(rs("partido").checked && rs("e2").value && rs("s2").value) v+=" / "+rs("e2").value+"-"+rs("s2").value;
      return v;
    }
    ov.querySelector("[data-rponer]").addEventListener("click", function(){
      var v=valorRueda(); if(!v){ aviso("Elige a qué hora entra y a qué hora sale", true); return; } ponValor(v);
    });
    ov.querySelector("[data-rborrar]").addEventListener("click", function(){ ponValor(""); });
    ov.querySelector("[data-rteclado]").addEventListener("click", function(){
      var td=tdDe(ultCelda); if(!td){ aviso("Toca primero una casilla", true); return; }
      td.setAttribute("inputmode","text"); td.blur(); td.focus();
    });
    /* botones rápidos: F y los horarios que más se usan */
    function chips(){
      var cuenta={}; Object.keys(c.celdas||{}).forEach(function(k){ var v=c.celdas[k]; if(!horMarca(v)) cuenta[v]=(cuenta[v]||0)+1; });
      var top=Object.keys(cuenta).sort(function(a,b){ return cuenta[b]-cuenta[a]; }).slice(0,6);
      var box=ov.querySelector("[data-rchips]");
      box.innerHTML=Object.keys(HOR_MARCAS).map(function(m){ var x=HOR_MARCAS[m];
          return '<button class="btn sm" data-chip="'+m+'" title="'+x.n+'" style="background:'+x.col+';border-color:'+x.borde+';color:#000;font-weight:700;min-width:44px">'+m+'</button>'; }).join("")+
        '<span style="width:1px;align-self:stretch;background:var(--linea)"></span>'+
        top.map(function(v){ return '<button class="btn sm" data-chip="'+esc(v)+'" style="font-weight:700">'+esc(v)+'</button>'; }).join("");
      box.querySelectorAll("[data-chip]").forEach(function(b){ b.addEventListener("click", function(){ ponValor(b.getAttribute("data-chip")); }); });
    }
    ov.querySelectorAll("[data-rueda] button, [data-rueda] select").forEach(function(e){ e.addEventListener("mousedown", function(){ /* deja marcada la casilla */ }); });
    function pinta(){
      var px=210*96/25.4, k=zr;
      sc.innerHTML='<div style="zoom:'+k+'">'+horHTML(c, false, true).replace(/class="et-pag" style="/g,'class="et-pag" style="margin:0 auto 16px;box-shadow:0 2px 12px rgba(0,0,0,.4);')+'</div>';
      sc.querySelectorAll("[data-c]").forEach(function(td){ td.addEventListener("input", function(){
        var v=td.innerText.replace(/\n+$/,""); if(v.trim()) c.celdas[td.getAttribute("data-c")]=v; else delete c.celdas[td.getAttribute("data-c")];
        ultCelda=td.getAttribute("data-c"); marcaBotones(); auto();
        td.style.background=horFondo(v, true); }); });
      /* Correr el valor como en Excel: el cuadradito azul de la esquina se arrastra a los lados o hacia abajo */
      sc.querySelectorAll("[data-c]").forEach(function(td){
        function enEsquina(x,y){ var r=td.getBoundingClientRect(); return document.activeElement===td && td.innerText.trim() && x>r.right-24 && y>r.bottom-24; }
        function empieza(x,y){
          var src=td.getAttribute("data-c").split("|"), val=td.innerText.replace(/\n+$/,""), per=personas(), pi=per.indexOf(src[1]), k0=+src[2], marcadas=[];
          td.blur();
          function rango(x2,y2){
            marcadas.forEach(function(e){ e.style.outline=""; }); marcadas=[];
            var el=document.elementFromPoint(x2,y2), t=el&&el.closest&&el.closest("[data-c]"); if(!t) return null;
            var p=t.getAttribute("data-c").split("|"); if(p[0]!==src[0]) return null;
            var pj=per.indexOf(p[1]), k1=+p[2], keys=[];
            for(var a=Math.min(pi,pj); a<=Math.max(pi,pj); a++) for(var k=Math.min(k0,k1); k<=Math.max(k0,k1); k++) keys.push(src[0]+"|"+per[a]+"|"+k);
            keys.forEach(function(key){ var e=sc.querySelector('[data-c="'+key.replace(/"/g,'\\"')+'"]'); if(e){ e.style.outline="2px solid #1a73e8"; e.style.outlineOffset="-2px"; marcadas.push(e); } });
            return keys;
          }
          var ult=rango(x,y);
          function mueve(e){ var p=e.touches?e.touches[0]:e; e.preventDefault(); ult=rango(p.clientX,p.clientY)||ult; }
          function suelta(){
            document.removeEventListener("pointermove", mueve); document.removeEventListener("pointerup", suelta);
            document.removeEventListener("touchmove", mueve); document.removeEventListener("touchend", suelta);
            var origen=src.join("|");
            (ult||[]).forEach(function(key){ if(key===origen || !prot(key)) c.celdas[key]=val; });
            repinta();
          }
          document.addEventListener("pointermove", mueve); document.addEventListener("pointerup", suelta);
          document.addEventListener("touchmove", mueve, {passive:false}); document.addEventListener("touchend", suelta);
        }
        td.addEventListener("touchstart", function(e){ var p=e.touches[0]; if(enEsquina(p.clientX,p.clientY)){ e.preventDefault(); empieza(p.clientX,p.clientY); } }, {passive:false});
        td.addEventListener("pointerdown", function(e){
          if(e.pointerType==="touch") return;
          if(enEsquina(e.clientX,e.clientY)){ e.preventDefault(); empieza(e.clientX,e.clientY); return; }
          /* con ratón también vale arrastrar desde la propia casilla hasta otra */
          if(!td.innerText.trim()) return;
          function mov(ev){ var el=document.elementFromPoint(ev.clientX,ev.clientY), t=el&&el.closest&&el.closest("[data-c]");
            if(t && t!==td){ fin(); try{ window.getSelection().removeAllRanges(); }catch(_){} empieza(ev.clientX,ev.clientY); } }
          function fin(){ document.removeEventListener("pointermove", mov); document.removeEventListener("pointerup", fin); }
          document.addEventListener("pointermove", mov); document.addEventListener("pointerup", fin);
        });
        td.addEventListener("focus", function(){ selecciona(td.getAttribute("data-c")); });
        td.addEventListener("blur", function(){ td.setAttribute("inputmode","none"); });
        td.addEventListener("pointermove", function(e){ td.style.cursor = enEsquina(e.clientX,e.clientY) ? "crosshair" : ""; });
      });
      /* Pegar en una casilla: si trae varias (de Excel o de otra semana), se reparten hacia la derecha y hacia abajo */
      sc.querySelectorAll("[data-c]").forEach(function(td){ td.addEventListener("paste", function(e){
        var t=(e.clipboardData||window.clipboardData).getData("text")||""; e.preventDefault();
        t=t.replace(/\r/g,"").replace(/\n+$/,"");
        var p=td.getAttribute("data-c").split("|"), wi=p[0], k=+p[2], per=personas(), pi=per.indexOf(p[1]);
        if(t.indexOf("\t")<0 && t.indexOf("\n")<0){ document.execCommand("insertText", false, t); return; }
        t.split("\n").forEach(function(lin, r){
          var q=per[pi+r]; if(!q) return;
          lin.split("\t").forEach(function(v, col){ if(k+col>6) return; var key=wi+"|"+q+"|"+(k+col); if(prot(key)) return; v=v.trim(); if(v) c.celdas[key]=v; else delete c.celdas[key]; });
        });
        repinta();
      }); });
      sc.querySelectorAll("[data-csem]").forEach(function(b){ b.addEventListener("click", function(){
        var wi=b.getAttribute("data-csem"), per=personas(), m={};
        per.forEach(function(q){ m[q]=[0,1,2,3,4,5,6].map(function(k){ return c.celdas[wi+"|"+q+"|"+k]||""; }); });
        copiaSemana=m;
        var tsv=per.map(function(q){ return m[q].join("\t"); }).join("\n");
        try{ navigator.clipboard.writeText(tsv); }catch(_){}
        aviso("Semana copiada: pulsa «Pegar aquí» en otra semana");
      }); });
      sc.querySelectorAll("[data-psem]").forEach(function(b){ b.addEventListener("click", function(){
        if(!copiaSemana){ aviso("Primero pulsa «Copiar esta semana» en la que quieras copiar", true); return; }
        var wi=b.getAttribute("data-psem");
        Object.keys(copiaSemana).forEach(function(q){ copiaSemana[q].forEach(function(v,k){ var key=wi+"|"+q+"|"+k; if(prot(key) || horMarca(v)) return; if(v) c.celdas[key]=v; else delete c.celdas[key]; }); });
        repinta(); aviso("Semana pegada");
      }); });
      sc.querySelectorAll("[data-vsem]").forEach(function(b){ b.addEventListener("click", function(){
        var wi=b.getAttribute("data-vsem");
        Object.keys(c.celdas).forEach(function(key){ if(key.split("|")[0]===wi) delete c.celdas[key]; });
        repinta();
      }); });
      /* Calendario: se elige un día y se ponen solas las fechas de esa semana (y las siguientes que estén vacías) */
      sc.querySelectorAll("[data-tcal]").forEach(function(inp){ inp.addEventListener("change", function(){
        var lun=horLunes(inp.value); if(!lun) return;
        var i0=+inp.getAttribute("data-tcal"), n=Math.max(1, Math.min(52, parseInt(c.semanas,10)||2));
        for(var i=i0;i<n;i++){
          var t=c.titulos[i];
          if(i>i0 && t && typeof t==="object" && (t[0]||t[1]||t[2]||t[3])) break;
          var a=new Date(lun); a.setDate(a.getDate()+7*(i-i0)); var b=new Date(a); b.setDate(b.getDate()+6);
          c.titulos[i]={0:String(a.getDate()),1:HOR_MESES[a.getMonth()],2:String(b.getDate()),3:HOR_MESES[b.getMonth()]};
        }
        repinta();
      }); });
      sc.querySelectorAll("[data-t]").forEach(function(t){ t.addEventListener("input", function(){
        var i=t.getAttribute("data-t"); if(!c.titulos[i] || typeof c.titulos[i]!=="object") c.titulos[i]={};
        c.titulos[i][t.getAttribute("data-n")]=t.value.trim(); auto(); }); });
    }
    function ajusta(modo){
      var px=210*96/25.4, py=297*96/25.4;
      zr = modo==="toda" ? Math.min((sc.clientHeight-32)/py, (sc.clientWidth-32)/px) : Math.min(1.6, (sc.clientWidth-32)/px);
    }
    ov.querySelectorAll("[data-rz]").forEach(function(b){ b.addEventListener("click", function(){
      var v=b.getAttribute("data-rz");
      if(v==="toda"||v==="ancho") ajusta(v); else zr=Math.max(.2, Math.min(3, zr*(v==="1"?1.25:0.8)));
      repinta();
    }); });
    var ultCelda=null;
    function marcaBotones(){ ov.querySelectorAll("[data-rep]").forEach(function(b){ b.disabled=!(ultCelda && c.celdas[ultCelda]); }); }
    ov.querySelectorAll("[data-rep]").forEach(function(b){
      b.addEventListener("pointerdown", function(e){ e.preventDefault(); }); /* que no se pierda la casilla */
      b.addEventListener("click", function(){
        if(!ultCelda || !c.celdas[ultCelda]){ aviso("Primero toca una casilla con algo escrito", true); return; }
        var p=ultCelda.split("|"), v=c.celdas[ultCelda];
        function pon(key){ if(key===ultCelda || !prot(key)) c.celdas[key]=v; }
        if(b.getAttribute("data-rep")==="sem") for(var k=0;k<7;k++) pon(p[0]+"|"+p[1]+"|"+k);
        else personas().forEach(function(q){ pon(p[0]+"|"+q+"|"+p[2]); });
        repinta(); marcaBotones();
      });
    });
    function personas(){ return horVisibles(c); }
    function repinta(){ var y=sc.scrollTop; pinta(); sc.scrollTop=y; auto(); if(ultCelda){ var t=tdDe(ultCelda); if(t) t.classList.add("sel"); } chips(); }
    ajusta("ancho"); pinta(); chips();
    ov.querySelector("[data-vac]").addEventListener("click", function(){
      if(!confirm("¿Borrar el horario entero? Se quedan solo los nombres.")) return;
      borrarTodo(); repinta(); aviso("Horario borrado (si lo necesitas, está en «Guardados»)");
    });
    ov.querySelector("[data-ok]").addEventListener("click", function(){ ov.remove(); vista(); });
    ov.querySelector("[data-wa]").addEventListener("click", function(){ guardarYa(); horWhatsApp(c, horTitulos(c)[0]); });
  });
  d.querySelector("#ho_zoom").addEventListener("click", grande);
  d.querySelector("#ho_vista").addEventListener("click", grande);
  function guardarYa(){
    clearTimeout(tAuto);
    var g=JSON.parse(JSON.stringify(c)); g.personal=g.personal.filter(function(x){ return String(x).trim(); });
    h.hor=g; h.paginas=Math.ceil((+g.semanas||2)/2); guardar();
    var e=d.querySelector("#ho_estado"); if(e){ var t=new Date(); e.textContent="✓ Guardado "+String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0"); }
  }
  /* Se guarda solo, medio segundo después de cada cambio */
  var tAuto;
  function auto(){ clearTimeout(tAuto); tAuto=setTimeout(guardarYa, 500); }
  d.addEventListener("close", function(){ guardarYa(); pintarLista(); });
  d.querySelector("#ho_guardar").addEventListener("click", function(){ guardarYa(); d.close(); });
  /* Archivo de horarios ya hechos */
  function nombreArch(){
    var n=Math.max(1,+c.semanas||2), t0=(c.titulos||{})[0], tn=(c.titulos||{})[n-1]||t0;
    var lun=horLunes(c.desde);
    if(lun){ var f=new Date(lun); f.setDate(f.getDate()+7*n-1); return "Del "+lun.getDate()+" "+HOR_MESES[lun.getMonth()]+" al "+f.getDate()+" "+HOR_MESES[f.getMonth()]+" "+f.getFullYear(); }
    if(t0 && typeof t0==="object" && t0[0]) return "Del "+t0[0]+" "+(t0[1]||"")+" al "+((tn&&tn[2])||"")+" "+((tn&&tn[3])||"");
    return "Guardado el "+dmy(new Date().toISOString());
  }
  function pintaArch(){
    var box=d.querySelector("#ho_lista_arch"), a=c.archivo||[];
    var vb=d.querySelector("#ho_verarch"); if(vb) vb.innerHTML="&#128450;&#65039; Guardados ("+a.length+")";
    box.innerHTML = a.length ? a.slice().reverse().map(function(x){
      return '<div style="display:flex;gap:6px;align-items:center;padding:6px 8px;border:1px solid var(--linea);border-radius:6px;background:var(--sup)">'+
        '<span style="flex:1;font-size:13.5px"><b>'+esc(x.nombre)+'</b><br><span class="nota" style="margin:0">'+Object.keys(x.celdas||{}).length+' casillas · guardado el '+dmy(x.fecha)+'</span></span>'+
        '<button class="btn sm" data-av="'+x.id+'" title="Verlo en grande">&#128269;</button>'+
        '<button class="btn sm" data-ai="'+x.id+'" title="Imprimir">&#128424;</button>'+
        '<button class="btn sm" data-aw="'+x.id+'" title="Mandar por WhatsApp">&#128172;</button>'+
        '<button class="btn sm" data-ac="'+x.id+'" title="Pasarlo a la hoja para cambiarlo">Abrir</button>'+
        '<button class="btn sm suave" data-ab="'+x.id+'" title="Borrar">✕</button></div>';
    }).join("") : '<p class="nota" style="margin:0">Aún no hay ninguno.</p>';
    function de(id){ return (c.archivo||[]).filter(function(x){ return x.id===id; })[0]; }
    function comoHor(x){ return {personal:x.personal, ocultos:x.ocultos||[], desde:x.desde, semanas:x.semanas, dias:x.dias, celdas:x.celdas, titulos:x.titulos}; }
    box.querySelectorAll("[data-av]").forEach(function(b){ b.addEventListener("click", function(){ var x=de(b.getAttribute("data-av")); verGrande(d, x.nombre, horHTML(comoHor(x), false)); }); });
    box.querySelectorAll("[data-aw]").forEach(function(b){ b.addEventListener("click", function(){ var x=de(b.getAttribute("data-aw")); horWhatsApp(comoHor(x), x.nombre); }); });
    box.querySelectorAll("[data-ai]").forEach(function(b){ b.addEventListener("click", function(){ var x=de(b.getAttribute("data-ai")); guardarYa(); d.close(); imprimirPaginas(h, horHTML(comoHor(x), false)); }); });
    box.querySelectorAll("[data-ac]").forEach(function(b){ b.addEventListener("click", function(){
      var x=de(b.getAttribute("data-ac"));
      if(Object.keys(c.celdas||{}).length && !confirm("Lo que hay ahora en la hoja se cambia por «"+x.nombre+"». Si quieres conservarlo, antes pulsa «Guardar en el archivo». ¿Seguir?")) return;
      var y=JSON.parse(JSON.stringify(comoHor(x))); c.personal=y.personal; c.desde=y.desde; c.semanas=y.semanas; c.dias=y.dias; c.celdas=y.celdas||{}; c.titulos=y.titulos||{};
      sel.value=String(c.semanas||2); d.querySelector("#ho_desde").value=c.desde||""; d.querySelector("#ho_dias").checked=!!c.dias;
      lista(); vista(); aviso("Abierto: "+x.nombre);
    }); });
    box.querySelectorAll("[data-ab]").forEach(function(b){ b.addEventListener("click", function(){
      var x=de(b.getAttribute("data-ab")); if(!confirm("¿Borrar «"+x.nombre+"» del archivo?")) return;
      c.archivo=c.archivo.filter(function(y){ return y.id!==x.id; }); pintaArch(); auto();
    }); });
  }
  function archivar(silencio){
    if(!Object.keys(c.celdas||{}).length){ if(!silencio) aviso("No hay nada escrito que guardar", true); return false; }
    c.archivo=c.archivo||[];
    c.archivo.push({id:uid(), nombre:nombreArch(), fecha:new Date().toISOString(), personal:c.personal.filter(function(x){ return String(x).trim(); }), ocultos:(c.ocultos||[]).slice(),
      desde:c.desde, semanas:c.semanas, dias:c.dias, celdas:JSON.parse(JSON.stringify(c.celdas)), titulos:JSON.parse(JSON.stringify(c.titulos||{}))});
    pintaArch(); guardarYa(); if(!silencio) aviso("Guardado en el archivo: "+c.archivo[c.archivo.length-1].nombre);
    return true;
  }
  d.querySelector("#ho_arch").addEventListener("click", function(){ archivar(false); });
  /* Borrar el horario entero: casillas y fechas; antes se guarda una copia en «Guardados» por si acaso */
  function borrarTodo(){ archivar(true); c.celdas={}; c.titulos={}; c.desde=""; d.querySelector("#ho_desde").value=""; guardarYa(); }
  d.querySelector("#ho_borrar").addEventListener("click", function(){
    if(!Object.keys(c.celdas||{}).length && !Object.keys(c.titulos||{}).length){ aviso("El horario ya está en blanco"); return; }
    if(!confirm("¿Borrar el horario entero? Se quedan solo los nombres.")) return;
    borrarTodo(); vista(); aviso("Horario borrado (si lo necesitas, está en «Guardados»)");
  });
  d.querySelector("#ho_verarch").addEventListener("click", function(){ d.querySelector("#ho_arch").scrollIntoView({behavior:"smooth", block:"start"}); });
  pintaArch();
  d.querySelector("#ho_imp").addEventListener("click", function(){ guardarYa(); d.close(); imprimirHorario(h); });
  d.querySelector("#ho_wa").addEventListener("click", function(){ guardarYa(); horWhatsApp(c, horTitulos(c)[0]); });
  lista(); setTimeout(vista, 30);
}
function imprimirHorario(h){ imprimirPaginas(h, horHTML(h.hor||horNuevo(), false)); }

/* ── Mandar la hoja de horarios por WhatsApp: se dibuja como foto ── */
function horTitulos(hor){
  var n=Math.max(1, Math.min(52, parseInt(hor.semanas,10)||2)), lun=horLunes(hor.desde), tits=hor.titulos||{}, out=[];
  for(var i=0;i<n;i++){
    if(lun){ var a=new Date(lun); a.setDate(a.getDate()+7*i); var b=new Date(a); b.setDate(b.getDate()+6);
      out.push("Semana del "+a.getDate()+" de "+HOR_MESES[a.getMonth()]+" al "+b.getDate()+" de "+HOR_MESES[b.getMonth()]+" de "+b.getFullYear()); }
    else { var t=(tits[i]&&typeof tits[i]==="object")?tits[i]:{};
      out.push((t[0]||t[2]) ? "Semana del "+(t[0]||"__")+" de "+(t[1]||"____")+" al "+(t[2]||"__")+" de "+(t[3]||"____") : "Semana "+(i+1)); }
  }
  return out;
}
function horImagen(hor){
  var per=horVisibles(hor), cel=hor.celdas||{}, tits=horTitulos(hor);
  /* solo las semanas que tienen algo escrito (si no hay nada, todas) */
  var sems=tits.map(function(t,i){ return i; }).filter(function(i){ return Object.keys(cel).some(function(k){ return k.split("|")[0]===String(i); }); });
  if(!sems.length) sems=tits.map(function(t,i){ return i; });
  var W=1500, M=40, cn=240, cd=(W-2*M-cn)/7, fh=54, th=70, gap=40;
  var H=M+sems.length*(th+fh*(per.length+1)+gap)-gap+M;
  var cv=document.createElement("canvas"); cv.width=W; cv.height=H; var x=cv.getContext("2d");
  x.fillStyle="#fff"; x.fillRect(0,0,W,H);
  var y=M;
  sems.forEach(function(i){
    x.fillStyle="#000"; x.font="bold 30px Helvetica, Arial, sans-serif"; x.textAlign="center"; x.textBaseline="middle";
    x.fillText(tits[i], W/2, y+th/2-6); y+=th;
    x.lineWidth=2; x.strokeStyle="#000";
    x.fillStyle="#eee"; x.fillRect(M+cn, y, cd*7, fh);
    x.fillStyle="#000"; x.font="bold 21px Helvetica, Arial, sans-serif";
    HOR_DIAS.forEach(function(d,k){ x.fillText(d, M+cn+cd*k+cd/2, y+fh/2); });
    per.forEach(function(p,r){
      var yy=y+fh*(r+1);
      x.textAlign="left"; x.font="bold 23px Helvetica, Arial, sans-serif"; x.fillStyle="#000"; x.fillText(p, M+12, yy+fh/2);
      x.textAlign="center";
      for(var k=0;k<7;k++){
        var v=cel[i+"|"+p+"|"+k]||"", cx=M+cn+cd*k;
        if(horMarca(v)){ x.fillStyle=HOR_MARCAS[horMarca(v)].col; x.fillRect(cx, yy, cd, fh); }
        if(v){ x.fillStyle="#000"; var lin=String(v).split("\n"), fs=lin.length>1?18:24; x.font="bold "+fs+"px Helvetica, Arial, sans-serif";
          lin.forEach(function(l,j){ x.fillText(l, cx+cd/2, yy+fh/2+(j-(lin.length-1)/2)*(fs+2), cd-8); }); }
      }
    });
    for(var r=0;r<=per.length+1;r++){ x.beginPath(); x.moveTo(r===0?M+cn:M, y+fh*r); x.lineTo(W-M, y+fh*r); x.stroke(); }
    x.beginPath(); x.moveTo(M, y+fh); x.lineTo(M, y+fh*(per.length+1)); x.stroke();
    for(var k=0;k<=7;k++){ x.beginPath(); x.moveTo(M+cn+cd*k, y); x.lineTo(M+cn+cd*k, y+fh*(per.length+1)); x.stroke(); }
    y+=fh*(per.length+1)+gap;
  });
  /* sin esperas: compartir tiene que salir en el mismo toque, si no Safari lo bloquea */
  var b64=cv.toDataURL("image/png").split(",")[1], bin=atob(b64), u=new Uint8Array(bin.length);
  for(var q=0;q<bin.length;q++) u[q]=bin.charCodeAt(q);
  return new Blob([u], {type:"image/png"});
}
function horWhatsApp(hor, nombre){
  var blob=horImagen(hor);
  var fich=new File([blob], (nombre||"horario").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-")+".png", {type:"image/png"});
  function plan_b(){
    /* Directo: se copia la foto y se abre la app de WhatsApp; allí solo hay que elegir el chat y pegar */
    var ok=true;
    try{ navigator.clipboard.write([new ClipboardItem({"image/png":blob})]).then(function(){
        aviso("Foto copiada: elige el chat en WhatsApp y pulsa Cmd + V", false);
      }, function(){ bajar(); aviso("Foto en Descargas: en WhatsApp pulsa el clip 📎 y adjúntala", true); }); }
    catch(_){ ok=false; }
    if(!ok){ bajar(); aviso("Foto en Descargas: en WhatsApp pulsa el clip 📎 y adjúntala", true); }
    var a=document.createElement("a"); a.href="whatsapp://send"; document.body.appendChild(a); a.click(); a.remove();
  }
  function bajar(){ var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=fich.name; document.body.appendChild(a); a.click(); a.remove(); }
  /* En el Mac el menú de compartir no trae WhatsApp: allí se copia la foto y se abre WhatsApp para pegarla */
  var esMac=/Mac/.test(navigator.platform||navigator.userAgent) && !(navigator.maxTouchPoints>1);
  var puede=false; if(!esMac) try{ puede=!!(navigator.canShare && navigator.canShare({files:[fich]})); }catch(_){}
  if(puede){
    navigator.share({files:[fich]}).catch(function(e){ if(!e || e.name!=="AbortError") plan_b(); });
    return;
  }
  plan_b();
}
/* Ventanita con la foto y los pasos, por si no hay «compartir» (encima de lo que esté abierto, sin cerrarlo) */
function mostrarPlanB(blob, nombre){
  var url=URL.createObjectURL(blob), padre=document.querySelector("dialog[open]")||document.body;
  var ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
  ov.innerHTML='<div style="background:var(--sup);color:var(--tinta);border-radius:12px;max-width:620px;width:100%;max-height:92vh;overflow:auto;padding:18px">'+
    '<h3 style="margin:0 0 10px">Mandar por WhatsApp</h3>'+
    '<p style="margin:0 0 10px;font-size:14.5px;line-height:1.55">La foto del horario se ha guardado en <b>Descargas</b>.<br>'+
    '<b>1.</b> Abre WhatsApp. <b>2.</b> Entra en el chat o grupo. <b>3.</b> Pulsa <b>Cmd + V</b> para pegar la foto, o el clip 📎 y elige la foto de Descargas.</p>'+
    '<img src="'+url+'" style="width:100%;border:1px solid var(--linea);border-radius:6px">'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px">'+
      '<button class="btn" data-pb="copiar">Copiar foto</button><button class="btn" data-pb="bajar">Descargar otra vez</button>'+
      '<a class="btn" style="background:#25d366;border-color:#25d366;color:#fff;text-decoration:none" href="https://web.whatsapp.com/" target="_blank" rel="noopener">WhatsApp Web</a>'+
      '<a class="btn" style="background:#25d366;border-color:#25d366;color:#fff;text-decoration:none" href="whatsapp://send">App WhatsApp</a>'+
      '<button class="btn fuerte" data-pb="cerrar">Cerrar</button></div></div>';
  padre.appendChild(ov);
  ov.addEventListener("click", function(e){ if(e.target===ov) ov.remove(); });
  ov.querySelector('[data-pb="cerrar"]').addEventListener("click", function(){ ov.remove(); });
  ov.querySelector('[data-pb="bajar"]').addEventListener("click", function(){ var a=document.createElement("a"); a.href=url; a.download=nombre; document.body.appendChild(a); a.click(); a.remove(); });
  ov.querySelector('[data-pb="copiar"]').addEventListener("click", function(){
    try{ navigator.clipboard.write([new ClipboardItem({"image/png":blob})]).then(function(){ aviso("Foto copiada: en WhatsApp pulsa Cmd + V"); }, function(){ aviso("No se ha podido copiar: usa el clip 📎 y la foto de Descargas", true); }); }
    catch(_){ aviso("No se ha podido copiar: usa el clip 📎 y la foto de Descargas", true); }
  });
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
  if(esEtiq(h)) return abrirEtiquetas(h);
  if(esHor(h)) return abrirHorario(h);
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
  if(esEtiq(h)) return imprimirEtiquetas(h);
  if(esHor(h)) return imprimirHorario(h);
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
