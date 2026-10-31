(function(){
"use strict";

/* ============================ state ============================ */
var LS_KEY = "comanda.ledger.v1";
var DATA_PATH = "data/ledger.json";

function todayISO(){ var d=new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function p2(n){ return (n<10?"0":"")+n; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function blankState(){
  return {
    v:1, updatedAt:new Date().toISOString(),
    settings:{
      name:"", nrt:"", address:"", city:"", phone:"", email:"",
      igi:4.5, iban:"", dueDays:30, terms:"Transferencia bancaria",
      /* Lo que se lee al pie de la factura. {IBAN} se cambia por el del
         perfil que la emite, para no tener el número escrito en dos
         sitios y que un día dejen de coincidir. */
      cierre:"Os adjunto la factura de las comidas del periodo indicado, junto con el detalle "+
             "de albaranes.\nNuestro IBAN es el siguiente: {IBAN}\n\n"+
             "Sin otro particular y esperando vuestro pago, os mandamos un cordial saludo.\n\n"+
             "Cristina\nLa palmera de Soldeu",
      prefix:"F", nextNumber:1, perfilActivo:"",
      paperCopy:true, pricesIncludeIgi:true, countryCode:"376",
      defaultPrice:13.5, defaultDesc:"Menú del día",
      mailIntro:"Buenos días:\n\nOs adjunto la factura de las comidas del periodo indicado, junto con el detalle de albaranes.\n\nUn saludo,"
    },
    profiles:[], companies:[], services:[], invoices:[], fotos:[]
  };
}

/* ── Perfiles de emisor ──────────────────────────────────────────────
   Cada factura se emite desde un perfil: sus datos fiscales, su correo
   y su propia numeracion. Asi puedes facturar como una cosa u otra sin
   mezclar series. */
function perfiles(){ return state.profiles || (state.profiles = []); }
function perfil(id){
  var l = perfiles();
  for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
  return null;
}
function perfilActivo(){
  return perfil(ui.perfil) || perfil(state.settings.perfilActivo) || perfiles()[0] || null;
}
function nombrePerfil(id){ var p = perfil(id); return p ? p.name : "(sin perfil)"; }

/* Al abrir por primera vez, los datos sueltos de Ajustes pasan a ser el
   primer perfil. Nada se pierde y a partir de ahi se gestionan en lista. */
function asegurarPerfiles(){
  if (perfiles().length) {
    // Si el perfil en uso ya no existe, apuntamos al primero
    if (!perfil(state.settings.perfilActivo)) {
      state.settings.perfilActivo = perfiles()[0].id;
      touch();
    }
    return;
  }
  var s = state.settings;
  perfiles().push({
    id: uid(), name: s.name || "", nrt: s.nrt || "", address: s.address || "",
    city: s.city || "", phone: s.phone || "", email: s.email || "",
    iban: s.iban || "", terms: s.terms || "Transferencia bancaria",
    cierre: (s.cierre!==undefined ? s.cierre : blankState().settings.cierre),
    prefix: s.prefix || "F", nextNumber: +s.nextNumber || 1
  });
  state.settings.perfilActivo = perfiles()[0].id;
  /* Hay que guardarlo: si no, en cada carga se crearia otro perfil con
     otro id y las facturas ya emitidas apuntarian a uno inexistente. */
  touch();
}

/* Los correos con los que puedes enviar: los del perfil, tantos como
   quieras. El primero es el de siempre; el resto salen a elegir en el
   momento de mandar la factura, que hay días que conviene uno y días
   que conviene el otro. Los perfiles de antes traen uno solo. */
function remitentesDe(p){
  if(!p) return [];
  var lista = Array.isArray(p.emails) ? p.emails.slice() : (p.email ? [p.email] : []);
  return lista.map(function(x){ return String(x||"").trim(); })
              .filter(function(x, i, a){ return x && a.indexOf(x)===i; });
}
/* Hotmail y Gmail se abren en el navegador con la cuenta que tengas
   puesta, y ahi el remitente sale de verdad. Un mailto: abre tu programa
   de correo, que manda con la cuenta que el tenga: por eso salia tu
   nombre y no el del restaurante. */
function comoSeAbre(dir){
  var d=String(dir||"").toLowerCase();
  if(/@(hotmail|outlook|live|msn)\./.test(d)) return "outlook";
  if(/@(gmail|googlemail)\./.test(d))         return "gmail";
  return "mailto";
}
/* Con dos cuentas abiertas en el mismo navegador, Outlook y Gmail las
   numeran por el orden en que entraste: la primera es la 0. Se usa el
   sitio que ocupa el correo en la lista del perfil, que es lo mas
   parecido que hay; si abre la que no es, se cambia arriba a la derecha
   y ya se queda. */
function urlDelCorreo(dir, para, asunto, cuerpo, cuenta){
  var modo=dir?comoSeAbre(dir):"mailto";
  var n=Math.max(0, +cuenta||0);
  if(modo==="outlook"){
    return "https://outlook.live.com/mail/"+n+"/deeplink/compose?to="+encodeURIComponent(para.join(";"))+
           "&subject="+encodeURIComponent(asunto)+"&body="+encodeURIComponent(cuerpo);
  }
  if(modo==="gmail"){
    return "https://mail.google.com/mail/u/"+n+"/?view=cm&fs=1&to="+encodeURIComponent(para.join(","))+
           "&su="+encodeURIComponent(asunto)+"&body="+encodeURIComponent(cuerpo);
  }
  /* mailto separa los destinatarios por comas, sin codificarlas */
  return "mailto:"+para.map(function(d){ return encodeURIComponent(d); }).join(",")+
         "?subject="+encodeURIComponent(asunto)+"&body="+encodeURIComponent(cuerpo);
}

/* Los correos de una empresa: admite el campo antiguo y la lista nueva. */
function correosDe(c){
  if (!c) return [];
  var lista = [];
  if (Array.isArray(c.emails)) lista = c.emails.slice();
  else if (c.email) lista = String(c.email).split(/[;,\s]+/);
  return lista.map(function(x){ return String(x).trim(); }).filter(Boolean);
}
/* Al enviar una factura se ofrecen los correos que tenía cuando se emitió
   y también los que la empresa tenga ahora: si has añadido una dirección
   nueva, no tiene sentido que no aparezca al reenviar una factura vieja.
   Los datos fiscales de la factura sí se quedan como estaban. */
function correosDeFactura(inv){
  var guardados = (inv.client && inv.client.emails) || [];
  var ahora = correosDe(company(inv.companyId));
  var todos = guardados.concat(ahora);
  return todos.map(function(x){ return String(x).trim(); })
              .filter(function(x, i, lista){ return x && lista.indexOf(x)===i; });
}
var state = blankState();
var ui = { view:"servicios", month:todayISO().slice(0,7), fCompany:"", fStatus:"",
           invCompany:"", perfil:"", saving:"idle", remote:false,
           remitente:"" };   /* con que correo se manda la factura que estas viendo */

/* ============================ money & format ============================ */
function r2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function eur(n){ return (n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
function num(n,d){ d=d||0; return (n||0).toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function pct(n){ return num(n,n%1?1:0)+" %"; }
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function monthLabel(ym){ if(!ym) return ""; var a=ym.split("-"); return MESES[+a[1]-1]+" "+a[0]; }
function dmy(iso){ if(!iso) return ""; var a=iso.split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }
function addDays(iso,d){ var t=new Date(iso+"T12:00:00"); t.setDate(t.getDate()+d); return t.getFullYear()+"-"+p2(t.getMonth()+1)+"-"+p2(t.getDate()); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

/* ============================ derived ============================ */
function company(id){ for(var i=0;i<state.companies.length;i++) if(state.companies[i].id===id) return state.companies[i]; return null; }
function companyName(id){ var c=company(id); return c?c.name:"(sin empresa)"; }
/* Cada servicio recuerda cómo se tecleó su precio: con el IGI dentro (gross)
   o sin él. Así cambiar el ajuste no altera lo ya anotado. */
function isGross(s){ return s.gross===undefined ? false : !!s.gross; }
function extraDe(s){ return +s.extra||0; }
function svcAmounts(s){
  var rate=(s.igi==null? state.settings.igi : s.igi);
  /* Los extras se cobran como el menu: si el precio lleva el IGI dentro,
     el extra tambien, para que el total impreso cuadre al centimo. */
  var importe=r2((+s.diners||0)*(+s.price||0) + extraDe(s));
  if(isGross(s)){
    var base=r2(importe/(1+rate/100));
    return {base:base, rate:rate, igi:r2(importe-base), total:importe, gross:true};
  }
  var igi=r2(importe*rate/100);
  return {base:importe, rate:rate, igi:igi, total:r2(importe+igi), gross:false};
}
/* Valores con los que llega relleno el formulario. El precio pactado con una
   empresa manda sobre el precio general; ambos se pueden pisar en cada línea. */
function defaultDesc(){ return state.settings.defaultDesc || "Menú del día"; }
/* Tipos de servicio que se eligen al anotar. Cada línea lleva el suyo, así que en
   una misma factura pueden ir menús del día, bocadillos, etc. mezclados. */
var TIPOS_SERVICIO=["Menú del día","Menú bocadillo","Medio menú","Menú cena","Desayuno completo"];
/* Precio de partida de un tipo mientras no se ponga otro en Ajustes. */
var PRECIO_TIPO_INICIAL={"Desayuno completo":7.5};
function precioTipoAjustes(t){
  var tp=state.settings.tipoPrices||{};
  return tp[t]!=null ? tp[t] : PRECIO_TIPO_INICIAL[t];
}
function tiposServicio(){
  var l=TIPOS_SERVICIO.slice(), d=defaultDesc();
  if(l.indexOf(d)<0) l.unshift(d);
  return l;
}
/* Último precio usado para ese tipo en esa empresa (o en cualquiera); si no hay, el de la empresa */
function precioTipo(companyId, desc){
  if(desc===defaultDesc()) return precioPara(companyId);
  var tp=precioTipoAjustes(desc);
  if(tp) return (+tp).toFixed(2);
  var best=null, any=null;
  state.services.forEach(function(s){
    if(s.desc!==desc || !s.price) return;
    if(s.companyId===companyId && (!best || s.date>=best.date)) best=s;
    if(!any || s.date>=any.date) any=s;
  });
  var s=best||any;
  if(s) return (+s.price).toFixed(2);
  return precioPara(companyId);
}
function precioPara(companyId){
  var c=company(companyId);
  var p=(c && c.price) ? c.price : state.settings.defaultPrice;
  return p ? (+p).toFixed(2) : "";       /* con céntimos: 13,50 se lee mejor que 13,5 */
}
function sortedServices(list){
  return list.slice().sort(function(a,b){
    if(a.date!==b.date) return a.date<b.date?-1:1;
    return (a.albaran||"")<(b.albaran||"")?-1:1;
  });
}
function servicesOf(ym, companyId, status){
  return sortedServices(state.services.filter(function(s){
    if(ym && s.date.slice(0,7)!==ym) return false;
    if(companyId && s.companyId!==companyId) return false;
    if(status && (s.status||"pendiente")!==status) return false;
    return true;
  }));
}
/* El IGI se liquida sobre la base de cada tipo, no sumando los redondeos de cada línea:
   así la factura cuadra si alguien recalcula el porcentaje sobre la base impresa. */
/* Albaranes distintos: varias líneas (menú del día, bocadillo…) pueden ir en el mismo albarán firmado */
function nAlb(list){
  var seen={}, n=0;
  (list||[]).forEach(function(s){
    var k=(s.albaran||"").trim();
    if(!k){ n++; return; }
    k=(s.date||"")+"|"+k;
    if(!seen[k]){ seen[k]=1; n++; }
  });
  return n;
}
/* ¿Esta línea sigue el mismo albarán que la anterior (misma fecha, mismo nº, misma empresa)?
   Entonces la fecha y el albarán solo se ponen una vez y debajo van sus líneas. */
function sigueAlb(prev, cur){
  return !!(prev && cur && cur.albaran && prev.date===cur.date && prev.albaran===cur.albaran &&
    (prev.companyId||"")===(cur.companyId||""));
}
function grpCls(list, ix){
  var c=[];
  if(sigueAlb(list[ix-1], list[ix])) c.push("grp-cont");
  if(sigueAlb(list[ix], list[ix+1])) c.push("grp-open");
  return c.length?' class="'+c.join(" ")+'"':"";
}
function totalsOf(list){
  var t={diners:0,base:0,igi:0,total:0,extras:0,count:list.length,taxes:[],gross:false}, byRate={};
  list.forEach(function(s){
    var a=svcAmounts(s);
    t.diners+=+s.diners||0;
    t.extras=r2(t.extras+extraDe(s));
    var g=byRate[a.rate]||(byRate[a.rate]={grossTotal:0, netBase:0});
    if(a.gross){ g.grossTotal=r2(g.grossTotal+a.total); t.gross=true; }
    else g.netBase=r2(g.netBase+a.base);
  });
  /* En las líneas con IGI incluido el importe cobrado manda: la base sale de
     dividir ese total, nunca al revés, para que el total impreso cuadre al céntimo. */
  Object.keys(byRate).map(Number).sort(function(a,b){return a-b;}).forEach(function(rate){
    var g=byRate[rate];
    var baseFromGross=g.grossTotal?r2(g.grossTotal/(1+rate/100)):0;
    var base=r2(baseFromGross+g.netBase);
    var amount=r2(r2(g.grossTotal-baseFromGross)+r2(g.netBase*rate/100));
    t.taxes.push({rate:rate, base:base, amount:amount});
    t.base=r2(t.base+base); t.igi=r2(t.igi+amount);
  });
  t.total=r2(t.base+t.igi);
  return t;
}

/* ============================ persistence ============================ */
/* Los datos se guardan en localStorage; sync.js los sube al repositorio
   privado unos segundos despues del ultimo cambio y pinta el estado. */
function setSave(k,msg){ ui.saving=k; ui.savingMsg=msg||""; paintSave(); }
function paintSave(){
  var el=document.getElementById("saveChip"); if(!el) return;
  if(window.Sync && Sync.mostrarEstadoEn){
    if(!el.querySelector("[data-sync]")) el.innerHTML='<span data-sync></span>';
    Sync.mostrarEstadoEn(el.querySelector("[data-sync]"));
    return;
  }
  el.innerHTML='<span class="dot local"></span><span>Guardado en este navegador</span>';
}
function touch(){
  state.updatedAt=new Date().toISOString();
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
}
function boot(){
  var local=null;
  try{ var raw=localStorage.getItem(LS_KEY); if(raw) local=JSON.parse(raw); }catch(e){}
  if(local && local.settings){
    state=local;
    var d=blankState().settings;
    for(var k in d) if(state.settings[k]===undefined) state.settings[k]=d[k];
    state.companies=state.companies||[]; state.services=state.services||[]; state.invoices=state.invoices||[];
    state.profiles=state.profiles||[];
    state.fotos=state.fotos||[];
    /* Las empresas que ya tenían fotos quedan marcadas como que las piden */
    var marcada=false;
    state.fotos.forEach(function(f){ var c=company(f.companyId); if(c && c.fotos===undefined){ c.fotos=true; marcada=true; } });
    if(marcada) touch();
  }
  asegurarPerfiles();
  ui.perfil = state.settings.perfilActivo || (perfiles()[0] && perfiles()[0].id) || "";
  render();
  paintSave();
  setTimeout(subirPendientes, 1500);

  /* Si algo se coló antes (o desde otro dispositivo), que se vea al entrar. */
  var repes=numerosRepetidos();
  if(repes.length){
    toast("Cuidado: "+(repes.length>1?"hay números de factura repetidos":"hay un número de factura repetido")+
          " ("+repes.join(", ")+"). Míralo en Facturas.", true);
  }
}

/* Descarga un archivo generado por la pagina. */
function descargarArchivo(nombre, datos, mime){
  var blob = (datos instanceof Blob) ? datos : new Blob([datos], {type: mime || "application/octet-stream"});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================ toast ============================ */
var toastTimer=null;
function toast(msg,bad){
  var old=document.querySelector(".toast"); if(old) old.remove();
  var t=document.createElement("div"); t.className="toast"+(bad?" bad":""); t.textContent=msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.remove(); }, bad?5200:2600);
}

/* ============================ render shell ============================ */
var NAV=[
  {id:"servicios", label:"Servicios"},
  {id:"empresas",  label:"Empresas"},
  {id:"facturar",  label:"Facturar"},
  {id:"facturas",  label:"Facturas"},
  {id:"ajustes",   label:"Ajustes"}
];
function counts(){
  return {
    servicios: servicesOf(ui.month,"","").length,
    empresas: state.companies.length,
    facturar: state.services.filter(function(s){ return (s.status||"pendiente")==="pendiente"; }).length,
    facturas: state.invoices.length,
    ajustes: ""
  };
}
function render(){
  var c=counts();
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="brand"><span class="mark">'+esc((perfilActivo()&&perfilActivo().name)||"Comanda")+'</span><span class="sub">Comidas de empresa</span></div>'+
      NAV.map(function(n){
        return '<button class="nav-btn" data-nav="'+n.id+'" aria-label="'+n.label+'" aria-current="'+(ui.view===n.id)+'">'+
               '<span>'+n.label+'</span><span class="count">'+(c[n.id]===""?"":c[n.id])+'</span></button>';
      }).join("")+
      '<div class="rail-foot"><div class="save-chip" id="saveChip"></div>'+
      '<a class="volver" href="index.html">&#8592; Escritorio</a></div>'+
    '</nav>'+
    '<main id="main"></main>';
  root.querySelectorAll("[data-nav]").forEach(function(b){
    b.addEventListener("click", function(){ ui.view=b.getAttribute("data-nav"); render(); });
  });
  paintSave();
  var main=document.getElementById("main");
  ({servicios:viewServicios, empresas:viewEmpresas, facturar:viewFacturar, facturas:viewFacturas, ajustes:viewAjustes})[ui.view](main);
  var pAct = perfilActivo();
  if((!pAct || !pAct.name) && ui.view!=="ajustes"){
    var w=document.createElement("div"); w.className="warn-banner";
    w.innerHTML='Aún no has puesto los datos de quien emite la factura, y sin ellos sale incompleta. <button class="inline-link" data-goto="ajustes">Rellenarlos ahora</button>';
    main.insertBefore(w, main.firstChild);
    w.querySelector("[data-goto]").addEventListener("click", function(){ ui.view="ajustes"; render(); });
  }
}
function head(title, sub, right){
  return '<div class="page-head"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+sub+'</p>':"")+'</div><div class="toolbar" style="margin:0">'+(right||"")+'</div></div>';
}
/* Orden de empresas: primero las fijadas (★), luego las más usadas, luego por nombre */
function companyUses(id){ var n=0; state.services.forEach(function(s){ if(s.companyId===id) n++; }); return n; }
function companiesByUse(){
  var uso={};
  state.services.forEach(function(s){ if(s.companyId) uso[s.companyId]=(uso[s.companyId]||0)+1; });
  return state.companies.slice().sort(function(a,b){
    var pa=a.pinned?1:0, pb=b.pinned?1:0;
    if(pa!==pb) return pb-pa;
    var ua=uso[a.id]||0, ub=uso[b.id]||0;
    if(ua!==ub) return ub-ua;
    return a.name.localeCompare(b.name,"es");
  });
}
function companyOptions(sel, placeholder){
  var o='<option value="">'+esc(placeholder||"Todas las empresas")+'</option>';
  companiesByUse().forEach(function(c){
    o+='<option value="'+c.id+'"'+(sel===c.id?" selected":"")+">"+esc(c.name)+"</option>";
  });
  return o;
}
function statusPill(s){
  var st=s||"pendiente";
  var cls={pendiente:"pend",facturado:"fact",cobrado:"cobr"}[st]||"pend";
  return '<span class="pill '+cls+'">'+st.charAt(0).toUpperCase()+st.slice(1)+"</span>";
}

/* ============================ view: servicios ============================ */
function viewServicios(main){
  var list=servicesOf(ui.month, ui.fCompany, ui.fStatus), t=totalsOf(list);
  main.innerHTML=
    head("Servicios del día",
         "Una línea por comida servida. El importe se calcula solo; el estado te dice qué falta por facturar y por cobrar.")+
    '<div class="stats">'+
      '<div class="stat"><div class="k">Servicios</div><div class="v">'+num(t.count)+'</div><div class="n">'+monthLabel(ui.month)+'</div></div>'+
      '<div class="stat"><div class="k">Comensales</div><div class="v">'+num(t.diners)+'</div><div class="n">del periodo</div></div>'+
      '<div class="stat"><div class="k">Subtotal</div><div class="v">'+eur(t.base)+'</div><div class="n">base sin IGI</div></div>'+
      '<div class="stat"><div class="k">IGI repercutido</div><div class="v">'+eur(t.igi)+'</div><div class="n">a liquidar</div></div>'+
      '<div class="stat"><div class="k">Total facturable</div><div class="v accent">'+eur(t.total)+'</div><div class="n">IGI incluido</div></div>'+
    '</div>'+

    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Anotar un servicio</h2>'+
      '<span class="hint hint-intro">Pulsa Intro en cualquier campo para añadir</span>'+
      '<button class="btn foto-btn" type="button" id="q_foto" title="Foto del recibo de la empresa y la fecha de abajo">'+ICO_CAM+'Foto del recibo</button></div>'+
    '<div class="card-body"><form id="quickForm" class="quick">'+
      '<div class="field"><label class="lbl" for="q_date">Fecha</label><input type="date" id="q_date" value="'+esc(todayISO())+'" required></div>'+
      '<div class="field"><label class="lbl" for="q_comp">Empresa</label><select id="q_comp" required>'+companyOptions(ui.fCompany,"— elegir —")+'</select></div>'+
      '<div class="field"><label class="lbl" for="q_tipo">Descripción</label><select id="q_tipo">'+
        tiposServicio().map(function(t){ return '<option'+(t===(ui.lastTipo||defaultDesc())?" selected":"")+'>'+esc(t)+'</option>'; }).join("")+
        '<option value="__otro">Otro…</option></select>'+
        '<input id="q_desc" placeholder="Escribe la descripción" style="display:none; margin-top:6px"></div>'+
      '<div class="field"><label class="lbl" for="q_ext">Extras (€)</label><input type="number" id="q_ext" min="0" step="0.01" placeholder="0,00"></div>'+
      '<div class="field"><label class="lbl" for="q_alb">Nº albarán</label><input id="q_alb" class="mono" placeholder="ALB-0001"></div>'+
      '<div class="field"><label class="lbl" for="q_din">Comens.</label><input type="number" id="q_din" min="0" step="1" value="1" required></div>'+
      '<div class="field"><label class="lbl" for="q_pri">€/persona'+(state.settings.pricesIncludeIgi?" (IGI incl.)":"")+'</label><input type="number" id="q_pri" min="0" step="0.01" value="'+esc(precioTipo(ui.fCompany, ui.lastTipo||defaultDesc()))+'" required></div>'+
      '<div style="display:flex; gap:10px; align-items:end"><span class="total-preview" id="q_total">—</span>'+
      '<button class="btn" type="button" id="q_more" title="Guarda esta línea y deja el mismo albarán abierto para añadir otra cosa (p. ej. bocadillos)">+ Otra línea</button>'+
      '<button class="btn primary" type="submit" id="q_add">Añadir</button></div>'+
    '</form></div></div>'+

    '<div class="card"><div class="card-head">'+
      '<div class="filters">'+
        '<div class="field"><label class="lbl" for="f_month">Periodo</label><input type="month" id="f_month" value="'+esc(ui.month)+'"></div>'+
        '<div class="field"><label class="lbl" for="f_comp">Empresa</label><select id="f_comp">'+companyOptions(ui.fCompany)+'</select></div>'+
        '<div class="field"><label class="lbl" for="f_stat">Estado</label><select id="f_stat">'+
          ["","pendiente","facturado","cobrado"].map(function(s){
            return '<option value="'+s+'"'+(ui.fStatus===s?" selected":"")+">"+(s?s.charAt(0).toUpperCase()+s.slice(1):"Todos")+"</option>";
          }).join("")+'</select></div>'+
      '</div></div>'+
      '<div class="tbl-wrap" id="svcTable"></div></div>';

  var f=document.getElementById("quickForm");
  var qc=document.getElementById("q_comp"), qp=document.getElementById("q_pri"),
      qd=document.getElementById("q_din"), qt=document.getElementById("q_total"), qa=document.getElementById("q_alb"),
      qe=document.getElementById("q_ext"), qtipo=document.getElementById("q_tipo"), qdesc=document.getElementById("q_desc");
  function descActual(){ return qtipo.value==="__otro" ? qdesc.value.trim() : qtipo.value; }
  qtipo.addEventListener("change", function(){
    var otro=qtipo.value==="__otro";
    qdesc.style.display=otro?"":"none";
    if(otro){ qdesc.focus(); return; }
    qp.value=precioTipo(qc.value, qtipo.value);
    refreshPreview();
  });
  function refreshPreview(){
    var importe=r2((+qd.value||0)*(+qp.value||0) + (+qe.value||0));
    if(!importe){ qt.textContent="—"; return; }
    var tot=state.settings.pricesIncludeIgi ? importe : r2(importe*(1+state.settings.igi/100));
    qt.textContent=eur(tot);
    qt.title="Total con IGI";
  }
  qc.addEventListener("change", function(){
    qp.value=qtipo.value==="__otro" ? precioPara(qc.value) : precioTipo(qc.value, qtipo.value);
    refreshPreview();
  });
  qd.addEventListener("input", refreshPreview); qp.addEventListener("input", refreshPreview);
  qe.addEventListener("input", refreshPreview);
  qa.value=nextAlbaran();
  refreshPreview();

  function verBotonFoto(){ document.getElementById("q_foto").style.display=pideFotos(qc.value)?"":"none"; }
  qc.addEventListener("change", verBotonFoto); verBotonFoto();
  document.getElementById("q_foto").addEventListener("click", function(){
    if(!pedirFoto(qc.value, document.getElementById("q_date").value, false) && !qc.value) qc.focus();
  });

  var masLineas=false;
  document.getElementById("q_more").addEventListener("click", function(){
    masLineas=true;
    if(f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit",{cancelable:true}));
  });
  document.getElementById("q_add").addEventListener("click", function(){ masLineas=false; });
  f.addEventListener("submit", function(ev){
    ev.preventDefault();
    var seguir=masLineas; masLineas=false;
    if(!qc.value){ toast("Elige la empresa a la que se apunta el servicio.", true); qc.focus(); return; }
    var s={
      id:uid(), date:document.getElementById("q_date").value, companyId:qc.value,
      desc:descActual()||defaultDesc(),
      albaran:qa.value.trim(), diners:+qd.value||0, price:+qp.value||0,
      extra:+qe.value||0,
      igi:state.settings.igi, gross:!!state.settings.pricesIncludeIgi,
      status:"pendiente", invoiceId:null
    };
    if(!s.diners){ toast("Pon cuántos comensales han comido.", true); qd.focus(); return; }
    state.services.push(s); touch();
    ui.month=s.date.slice(0,7);
    ui.lastTipo=tiposServicio().indexOf(s.desc)>=0 ? s.desc : "";
    render();
    var nq=document.getElementById("q_comp"); if(nq){ nq.value=s.companyId; nq.dispatchEvent(new Event("change")); }
    var nd=document.getElementById("q_date"); if(nd) nd.value=s.date;
    var na=document.getElementById("q_alb"); if(na) na.value=seguir ? s.albaran : nextAlbaran();
    var ne=document.getElementById("q_ext"); if(ne) ne.value="";
    if(seguir){
      var lineas=state.services.filter(function(x){ return x.companyId===s.companyId && x.date===s.date && s.albaran && x.albaran===s.albaran; });
      var tot=totalsOf(lineas).total;
      document.getElementById("q_tipo").focus();
      toast("Línea añadida al albarán "+(s.albaran||"")+" · "+lineas.length+" líneas · "+eur(tot)+". Elige la siguiente.");
    } else {
      document.getElementById("q_din").focus();
      toast("Servicio anotado: "+eur(svcAmounts(s).total));
    }
  });

  document.getElementById("f_month").addEventListener("change", function(){ ui.month=this.value; render(); });
  document.getElementById("f_comp").addEventListener("change", function(){ ui.fCompany=this.value; render(); });
  document.getElementById("f_stat").addEventListener("change", function(){ ui.fStatus=this.value; render(); });
  paintServices(list,t);
}
function nextAlbaran(){
  var best=null;
  state.services.forEach(function(s){
    var m=/(\d+)\s*$/.exec(s.albaran||""); if(!m) return;
    var n=+m[1]; if(best===null || n>best.n) best={n:n, pre:(s.albaran||"").slice(0,m.index), len:m[1].length};
  });
  if(!best) return "ALB-0001";
  var nx=String(best.n+1); while(nx.length<best.len) nx="0"+nx;
  return best.pre+nx;
}
function paintServices(list,t){
  var box=document.getElementById("svcTable"); if(!box) return;
  if(!list.length){
    box.innerHTML='<div class="empty"><strong>Ningún servicio en '+esc(monthLabel(ui.month))+'</strong>Anota el primero con el formulario de arriba.</div>';
    return;
  }
  var nFotos={}, chipVisto={};
  fotos().forEach(function(f){ var k=f.companyId+"|"+f.date; nFotos[k]=(nFotos[k]||0)+1; });
  var rows=list.map(function(s,ix){
    var a=svcAmounts(s), cont=sigueAlb(list[ix-1], s);
    var kf=s.companyId+"|"+s.date, chip="";
    if(!cont && s.companyId && pideFotos(s.companyId) && !chipVisto[kf]){
      chipVisto[kf]=1;
      var nf=nFotos[kf]||0;
      chip='<button type="button" class="foto-chip'+(nf?" tiene":"")+'" data-dia="'+esc(kf)+'" '+
           'aria-label="'+(nf?"Ver las "+nf+" fotos":"Hacer foto del recibo")+" de "+esc(companyName(s.companyId))+" del "+esc(dmy(s.date))+'">'+
           ICO_CAM+(nf?'<span>'+nf+'</span>':"")+'</button>';
    }
    return '<tr data-id="'+s.id+'"'+grpCls(list,ix)+'>'+
      '<td class="td-fecha">'+(cont?"":'<span class="fecha-cel">'+esc(dmy(s.date))+chip+'</span>')+"</td>"+
      "<td>"+(cont?"":esc(companyName(s.companyId)))+"</td>"+
      "<td>"+esc(s.desc)+"</td>"+
      '<td class="num">'+(extraDe(s)?eur(extraDe(s)):"—")+"</td>"+
      '<td class="mono">'+(cont?"":esc(s.albaran||"—"))+"</td>"+
      '<td class="num">'+num(s.diners)+"</td>"+
      '<td class="num">'+eur(s.price)+"</td>"+
      '<td class="num">'+eur(a.base)+"</td>"+
      '<td class="num">'+eur(a.igi)+"</td>"+
      '<td class="num"><strong>'+eur(a.total)+"</strong></td>"+
      "<td>"+statusPill(s.status)+"</td>"+
      '<td><div class="row-actions">'+
        '<button class="btn ghost sm" data-edit="'+s.id+'" aria-label="Editar el servicio del '+esc(dmy(s.date))+" de "+esc(companyName(s.companyId))+'">Editar</button>'+
        '<button class="btn ghost sm danger" data-del="'+s.id+'" aria-label="Borrar el servicio del '+esc(dmy(s.date))+" de "+esc(companyName(s.companyId))+'">Borrar</button>'+
      "</div></td></tr>";
  }).join("");
  box.innerHTML='<table><thead><tr>'+
    "<th>Fecha</th><th>Empresa</th><th>Descripción</th>"+
    '<th class="num">Extras</th><th>Nº albarán</th>'+
    '<th class="num">Com.</th><th class="num">€/pers.'+(state.settings.pricesIncludeIgi?" c/IGI":"")+"</th>"+
    '<th class="num">Subtotal</th><th class="num">IGI</th>'+
    '<th class="num">Total</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+"</tbody>"+
    '<tfoot><tr><td colspan="5">'+num(t.count)+' servicios</td>'+
    '<td class="num">'+num(t.diners)+'</td><td></td>'+
    '<td class="num">'+eur(t.base)+'</td><td class="num">'+eur(t.igi)+'</td>'+
    '<td class="num">'+eur(t.total)+'</td><td colspan="2"></td></tr></tfoot></table>';
  box.querySelectorAll("[data-edit]").forEach(function(b){ b.addEventListener("click",function(){ editService(b.getAttribute("data-edit")); }); });
  box.querySelectorAll("[data-dia]").forEach(function(b){ b.addEventListener("click",function(){
    var k=b.getAttribute("data-dia").split("|");
    if(fotosDelDia(k[0], k[1]).length) abrirDia(k[0], k[1]);
    else pedirFoto(k[0], k[1], false);
  }); });
  box.querySelectorAll("[data-del]").forEach(function(b){ b.addEventListener("click",function(){ delService(b.getAttribute("data-del")); }); });
}
function delService(id){
  var s=null; state.services.forEach(function(x){ if(x.id===id) s=x; });
  if(!s) return;
  if(s.invoiceId){ toast("Este servicio ya está en una factura emitida. Anula la factura antes de borrarlo.", true); return; }
  var a=svcAmounts(s);
  confirmar("Borrar servicio",
    "<p style=\"margin:0\">Vas a borrar el servicio del <strong>"+esc(dmy(s.date))+"</strong> de <strong>"+
      esc(companyName(s.companyId))+"</strong>: "+num(s.diners)+" comensales, "+eur(a.total)+".</p>"+
    '<p class="section-note" style="margin:12px 0 0">No se puede deshacer.</p>',
    function(){
      state.services=state.services.filter(function(x){ return x.id!==id; });
      touch(); render(); toast("Servicio borrado");
    },
    {okLabel:"Borrar servicio", danger:true});
}
function editService(id){
  var s=null; state.services.forEach(function(x){ if(x.id===id) s=x; });
  if(!s) return;
  openDialog("Editar servicio",
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="e_date">Fecha</label><input type="date" id="e_date" value="'+esc(s.date)+'"></div>'+
      '<div class="field"><label class="lbl" for="e_comp">Empresa</label><select id="e_comp">'+companyOptions(s.companyId,"— elegir —")+'</select></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="e_desc">Descripción</label><input id="e_desc" list="e_tipos" value="'+esc(s.desc)+'"><datalist id="e_tipos">'+tiposServicio().map(function(t){ return '<option value="'+esc(t)+'">'; }).join("")+'</datalist></div>'+
      '<div class="field"><label class="lbl" for="e_ext">Extras (€)</label><input type="number" id="e_ext" min="0" step="0.01" value="'+esc(extraDe(s)||"")+'"></div>'+
      '<div class="field"><label class="lbl" for="e_alb">Nº albarán</label><input id="e_alb" class="mono" value="'+esc(s.albaran||"")+'"></div>'+
      '<div class="field"><label class="lbl" for="e_din">Comensales</label><input type="number" id="e_din" min="0" step="1" value="'+esc(s.diners)+'"></div>'+
      '<div class="field"><label class="lbl" for="e_pri">Precio por persona (€)</label><input type="number" id="e_pri" min="0" step="0.01" value="'+esc(s.price)+'"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="check" style="margin:0"><input type="checkbox" id="e_gross"'+(isGross(s)?" checked":"")+">"+
        "<span><b>Ese precio ya lleva el IGI dentro</b>Si lo marcas, el IGI se desglosa hacia atrás en vez de sumarse encima.</span></label></div>"+
      '<div class="field"><label class="lbl" for="e_igi">IGI aplicado (%)</label><input type="number" id="e_igi" min="0" step="0.1" value="'+esc(s.igi==null?state.settings.igi:s.igi)+'"></div>'+
      '<div class="field"><label class="lbl" for="e_stat">Estado</label><select id="e_stat">'+
        ["pendiente","facturado","cobrado"].map(function(x){ return '<option value="'+x+'"'+((s.status||"pendiente")===x?" selected":"")+">"+x.charAt(0).toUpperCase()+x.slice(1)+"</option>"; }).join("")+
      '</select></div>'+
    '</div>'+(s.invoiceId?'<p class="section-note" style="margin-top:12px">Este servicio ya está incluido en una factura emitida; si cambias importes, la factura guardada no se recalcula.</p>':""),
    function(){
      s.date=document.getElementById("e_date").value||s.date;
      s.companyId=document.getElementById("e_comp").value||s.companyId;
      s.desc=document.getElementById("e_desc").value.trim()||s.desc;
      s.albaran=document.getElementById("e_alb").value.trim();
      s.extra=+document.getElementById("e_ext").value||0;
      s.diners=+document.getElementById("e_din").value||0;
      s.price=+document.getElementById("e_pri").value||0;
      s.gross=document.getElementById("e_gross").checked;
      s.igi=+document.getElementById("e_igi").value||0;
      s.status=document.getElementById("e_stat").value;
      touch(); render(); toast("Servicio actualizado");
    });
}

/* ============================ fotos de los recibos ============================
   Hay clientes que quieren copia de los recibos que firman sus empleados.
   Se les hace una foto desde Servicios, con la empresa y la fecha que ya
   estén puestas, y al mandar la factura del mes van detrás, en el mismo PDF.

   - la imagen, reducida a un tamaño que se lee bien y pesa poco, va a un
     archivo propio en el repositorio de datos (fotos/comanda/AAAA-MM/…);
     en datos.json solo se apunta dónde está, para no engordarlo;
   - mientras no se ha subido, la foto vive en este aparato (IndexedDB) y
     se reintenta sola, así no se pierde aunque no haya cobertura. */
function fotos(){ return state.fotos || (state.fotos=[]); }
function finDeMes(ym){ var a=ym.split("-"); return ym+"-"+p2(new Date(+a[0], +a[1], 0).getDate()); }
function fotosDe(cid, desde, hasta){
  return fotos().filter(function(f){ return f.companyId===cid && f.date>=desde && f.date<=hasta; })
    .sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:(a.at<b.at?-1:a.at>b.at?1:0); });
}
function fotosDelMes(cid, ym){ return fotosDe(cid, ym+"-01", finDeMes(ym)); }
function fotosDelDia(cid, date){ return fotosDe(cid, date, date); }
function pideFotos(cid){ var c=company(cid); return !!(c && c.fotos); }
var DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function diaLargo(iso){ var d=new Date(iso+"T12:00:00"); return DIAS[d.getDay()]+" "+dmy(iso); }
var ICO_CAM='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

/* ── Guardado en este aparato ── */
var IDB=null;
function idb(){
  if(IDB) return IDB;
  IDB=new Promise(function(ok,ko){
    var r=indexedDB.open("comanda-fotos",1);
    r.onupgradeneeded=function(){ r.result.createObjectStore("fotos"); };
    r.onsuccess=function(){ ok(r.result); };
    r.onerror=function(){ ko(r.error); };
  });
  return IDB;
}
function idbHacer(modo, fn){
  return idb().then(function(db){
    return new Promise(function(ok){
      var q=fn(db.transaction("fotos", modo).objectStore("fotos"));
      q.onsuccess=function(){ ok(q.result===undefined?null:q.result); };
      q.onerror=function(){ ok(null); };
    });
  }).catch(function(){ return null; });
}
function idbGet(k){ return idbHacer("readonly", function(s){ return s.get(k); }); }
function idbPut(k,v){ return idbHacer("readwrite", function(s){ return s.put(v,k); }); }
function idbDel(k){ return idbHacer("readwrite", function(s){ return s.delete(k); }); }

function bytesAB64(u8){
  var s="", CH=0x8000;
  for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null, u8.subarray(i,i+CH));
  return btoa(s);
}
function b64ABytes(b64){
  var bin=atob(b64), u=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u;
}
function blobABytes(b){ return b.arrayBuffer().then(function(ab){ return new Uint8Array(ab); }); }

/* La foto del móvil pesa varios megas: se deja en 1800 px por el lado
   largo, que se lee de sobra, y en JPEG. Así ronda los 300 KB. */
function comprimir(file){
  return new Promise(function(ok,ko){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var MAX=1800, w=img.naturalWidth, h=img.naturalHeight, k=Math.min(1, MAX/Math.max(w,h));
      var cw=Math.max(1,Math.round(w*k)), ch=Math.max(1,Math.round(h*k));
      var cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
      var ctx=cv.getContext("2d");
      ctx.fillStyle="#fff"; ctx.fillRect(0,0,cw,ch);
      ctx.drawImage(img,0,0,cw,ch);
      URL.revokeObjectURL(url);
      cv.toBlob(function(b){ b ? ok({blob:b,w:cw,h:ch}) : ko(new Error("no se pudo comprimir")); }, "image/jpeg", 0.72);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); ko(new Error("formato no reconocido")); };
    img.src=url;
  });
}
function slug(s){
  return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase().slice(0,40)||"empresa";
}

/* La cámara. Los dos campos de archivo viven fuera de la página para que
   repintar no se los lleve mientras la cámara está abierta. */
var pedidoFoto=null;
function entradaFoto(galeria){
  var id=galeria?"fotoInGal":"fotoInCam";
  var inp=document.getElementById(id);
  if(inp) return inp;
  inp=document.createElement("input");
  inp.type="file"; inp.accept="image/*"; inp.id=id; inp.hidden=true;
  if(galeria) inp.multiple=true; else inp.setAttribute("capture","environment");
  inp.addEventListener("change", function(){
    var p=pedidoFoto; pedidoFoto=null;
    if(p && inp.files && inp.files.length) anadirFotos(inp.files, p.cid, p.date);
    inp.value="";
  });
  document.body.appendChild(inp);
  return inp;
}
function pedirFoto(cid, date, galeria){
  if(!cid || !company(cid)){ toast("Elige primero la empresa.", true); return false; }
  if(!date){ toast("Pon la fecha del recibo.", true); return false; }
  pedidoFoto={cid:cid, date:date};
  entradaFoto(galeria).click();
  return true;
}

async function anadirFotos(files, cid, date){
  var lista=Array.prototype.slice.call(files||[]);
  if(!lista.length) return;
  toast(lista.length>1 ? "Guardando "+lista.length+" fotos…" : "Guardando la foto…");
  var bien=0, mal=0;
  for(var i=0;i<lista.length;i++){
    try{
      var r=await comprimir(lista[i]);
      var id=uid();
      var f={id:id, companyId:cid, date:date, w:r.w, h:r.h, at:new Date().toISOString(), subida:false,
             ruta:"fotos/comanda/"+date.slice(0,7)+"/"+date+"_"+slug(companyName(cid))+"_"+id+".jpg"};
      await idbPut(id, r.blob);
      fotos().push(f); bien++;
    }catch(e){ mal++; }
  }
  if(bien){ touch(); refrescarFotos(); }
  var n=fotosDelDia(cid, date).length;
  if(mal) toast(mal===1&&!bien ? "Esa imagen no se ha podido leer. Prueba a hacer la foto otra vez." :
                mal+" de "+lista.length+" imágenes no se han podido leer.", true);
  else toast((bien===1?"Foto guardada":bien+" fotos guardadas")+" · "+companyName(cid)+" · "+dmy(date)+
             (n>bien?" · "+n+" ese día":""));
  subirPendientes();
}

/* Tras añadir o borrar: se repinta la página y, si está abierto, el
   cuadro de fotos del día. */
function refrescarFotos(){
  var dia=document.getElementById("diaDlg");
  var abierto=dia ? {cid:dia.dataset.cid, date:dia.dataset.date} : null;
  if(ui.view==="servicios"){
    var keep={};
    ["q_comp","q_date","q_tipo","q_desc","q_ext","q_alb","q_din","q_pri"].forEach(function(id){
      var el=document.getElementById(id); if(el) keep[id]=el.value;
    });
    render();
    Object.keys(keep).forEach(function(id){ var el=document.getElementById(id); if(el) el.value=keep[id]; });
    var qt=document.getElementById("q_tipo"), qd=document.getElementById("q_desc");
    if(qt && qd) qd.style.display=qt.value==="__otro"?"":"none";
    var qd2=document.getElementById("q_din"); if(qd2) qd2.dispatchEvent(new Event("input"));
  } else render();
  if(abierto) pintarDia(abierto.cid, abierto.date);
}

/* Sube las que aún están solo en este aparato. Las que se hicieron en
   otro y aún no han llegado, se quedan esperando a que suba aquel. */
var subiendoFotos=false;
async function subirPendientes(){
  if(subiendoFotos || !window.Sync || !Sync.conectado || !Sync.conectado() || !Sync.subirArchivo) return;
  subiendoFotos=true;
  var fallo=false;
  try{
    var cola=fotos().filter(function(f){ return !f.subida; });
    for(var i=0;i<cola.length;i++){
      var f=cola[i], blob=await idbGet(f.id);
      if(!blob) continue;
      try{
        var b64=bytesAB64(await blobABytes(blob));
        await Sync.subirArchivo(f.ruta, b64, "foto: "+companyName(f.companyId)+" "+f.date);
        var viva=null; fotos().forEach(function(x){ if(x.id===f.id) viva=x; });
        if(viva){ viva.subida=true; touch(); }
        document.querySelectorAll('[data-marca="'+f.id+'"]').forEach(function(m){ m.remove(); });
      }catch(e){ fallo=true; break; }
    }
  } finally { subiendoFotos=false; }
  if(fallo) toast("Hay fotos que aún no se han podido subir. Se quedan en este aparato y se vuelve a intentar sola.", true);
}
window.addEventListener("online", function(){ subirPendientes(); });

/* La imagen de una foto: de este aparato si está; si no, del repositorio
   (y se guarda aquí para la próxima vez). */
async function blobDeFoto(f){
  var b=await idbGet(f.id);
  if(b) return b;
  if(!f.subida || !window.Sync || !Sync.leerArchivo) return null;
  var blob=new Blob([b64ABytes(await Sync.leerArchivo(f.ruta))], {type:"image/jpeg"});
  idbPut(f.id, blob);
  return blob;
}
var urlsFoto={};
function urlDeFoto(f){
  if(urlsFoto[f.id]) return Promise.resolve(urlsFoto[f.id]);
  return blobDeFoto(f).then(function(b){
    if(!b) return null;
    return (urlsFoto[f.id]=URL.createObjectURL(b));
  });
}

function borrarFoto(id){
  var f=null; fotos().forEach(function(x){ if(x.id===id) f=x; });
  if(!f) return;
  confirmar("Borrar foto",
    '<p style="margin:0">Vas a borrar una foto de <strong>'+esc(companyName(f.companyId))+'</strong> del <strong>'+
    esc(dmy(f.date))+'</strong>.</p><p class="section-note" style="margin:12px 0 0">No se puede deshacer.</p>',
    function(){
      var d=document.getElementById("fotoDlg"); if(d){ d.close(); d.remove(); }
      state.fotos=fotos().filter(function(x){ return x.id!==id; });
      touch(); refrescarFotos();
      idbDel(id);
      if(urlsFoto[id]){ URL.revokeObjectURL(urlsFoto[id]); delete urlsFoto[id]; }
      if(f.subida && window.Sync && Sync.borrarArchivo) Sync.borrarArchivo(f.ruta).catch(function(){});
      toast("Foto borrada");
    },
    {okLabel:"Borrar foto", danger:true});
}

/* Borrar varias de golpe: las de un día o las de todo el mes. */
function quitarFotos(lista){
  var ids={}; lista.forEach(function(f){ ids[f.id]=1; });
  state.fotos=fotos().filter(function(x){ return !ids[x.id]; });
  touch();
  lista.forEach(function(f){
    idbDel(f.id);
    if(urlsFoto[f.id]){ URL.revokeObjectURL(urlsFoto[f.id]); delete urlsFoto[f.id]; }
  });
  /* De una en una: GitHub no deja dos escrituras a la vez en la rama */
  (async function(){
    for(var i=0;i<lista.length;i++){
      var f=lista[i];
      if(f.subida && window.Sync && Sync.borrarArchivo){ try{ await Sync.borrarArchivo(f.ruta); }catch(e){} }
    }
  })();
}
function borrarTodas(lista, donde, alTerminar){
  if(!lista.length) return;
  var n=lista.length;
  confirmar(n>1?"Borrar las "+n+" fotos":"Borrar la foto",
    '<p style="margin:0">Vas a borrar <strong>'+(n>1?"las "+n+" fotos":"la foto")+'</strong> de <strong>'+
    esc(companyName(lista[0].companyId))+'</strong> '+donde+'.</p>'+
    '<p class="section-note" style="margin:12px 0 0">No se puede deshacer.</p>',
    function(){
      quitarFotos(lista);
      if(alTerminar) alTerminar(); else refrescarFotos();
      toast(n>1?n+" fotos borradas":"Foto borrada");
    },
    {okLabel:n>1?"Borrar las "+n:"Borrar", danger:true});
}

function verFoto(id){
  var f=null; fotos().forEach(function(x){ if(x.id===id) f=x; });
  if(!f) return;
  var old=document.getElementById("fotoDlg"); if(old) old.remove();
  var d=document.createElement("dialog"); d.id="fotoDlg"; d.style.maxWidth="760px";
  d.innerHTML='<div class="dlg-head"><h3>'+esc(companyName(f.companyId))+' · '+esc(dmy(f.date))+'</h3>'+
    '<button class="btn ghost" data-x>Cerrar</button></div>'+
    '<div class="dlg-body ver-foto"><div class="empty">Cargando…</div></div>'+
    '<div class="dlg-foot"><button class="btn danger" data-borrar>Borrar foto</button>'+
    '<span class="spacer"></span><button class="btn" data-x>Cerrar</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){ b.addEventListener("click",function(){ d.close(); d.remove(); }); });
  d.querySelector("[data-borrar]").addEventListener("click", function(){ borrarFoto(id); });
  d.showModal();
  urlDeFoto(f).then(function(u){
    var c=d.querySelector(".ver-foto");
    c.innerHTML=u ? '<img alt="Recibo del '+esc(dmy(f.date))+'" src="'+u+'">'
                  : '<div class="empty">Esta foto se hizo en otro aparato y todavía no se ha subido.</div>';
  }).catch(function(){
    d.querySelector(".ver-foto").innerHTML='<div class="empty">No se ha podido descargar la foto. Mira la conexión.</div>';
  });
}

/* Las fotos de una empresa en un día: verlas, añadir más o borrar. */
function abrirDia(cid, date){
  var old=document.getElementById("diaDlg"); if(old) old.remove();
  var d=document.createElement("dialog"); d.id="diaDlg"; d.style.maxWidth="640px";
  d.dataset.cid=cid; d.dataset.date=date;
  d.innerHTML='<div class="dlg-head"><h3>Recibos · '+esc(companyName(cid))+'</h3>'+
    '<button class="btn ghost" data-x>Cerrar</button></div>'+
    '<div class="dlg-body"><p class="section-note dia-sub"></p><div class="fotos-grid" id="diaGrid"></div></div>'+
    '<div class="dlg-foot dia-foot">'+
      '<button class="btn" data-gal>Galería</button>'+
      '<button class="btn danger" data-borrar-todas style="display:none">Borrar todas</button>'+
      '<span class="spacer"></span>'+
      '<button class="btn primary" data-cam>'+ICO_CAM+'Hacer foto</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){ b.addEventListener("click",function(){ d.close(); d.remove(); }); });
  d.querySelector("[data-cam]").addEventListener("click", function(){ pedirFoto(cid, date, false); });
  d.querySelector("[data-gal]").addEventListener("click", function(){ pedirFoto(cid, date, true); });
  d.querySelector("[data-borrar-todas]").addEventListener("click", function(){
    borrarTodas(fotosDelDia(cid, date), "del "+dmy(date));
  });
  d.addEventListener("close", function(){ d.remove(); });
  d.showModal();
  pintarDia(cid, date);
}
function pintarDia(cid, date){
  var d=document.getElementById("diaDlg"); if(!d) return;
  var lista=fotosDelDia(cid, date);
  var bt=d.querySelector("[data-borrar-todas]");
  bt.style.display=lista.length>1?"":"none";
  bt.textContent="Borrar todas ("+lista.length+")";
  d.querySelector(".dia-sub").innerHTML='<span class="cap">'+esc(diaLargo(date))+'</span> · '+
    (lista.length ? lista.length+(lista.length>1?" fotos":" foto") : "ninguna foto todavía");
  var g=d.querySelector("#diaGrid");
  if(!lista.length){
    g.innerHTML='<div class="empty" style="grid-column:1/-1">Pulsa <strong style="display:inline;font:inherit;font-weight:600">Hacer foto</strong> y fotografía el recibo.</div>';
    return;
  }
  g.innerHTML=lista.map(function(f){
    return '<div class="foto-celda"><button type="button" class="foto-th" data-ver="'+f.id+'" aria-label="Ver la foto">'+
      '<img alt="" data-img="'+f.id+'">'+
      (f.subida?"":'<span class="marca" data-marca="'+f.id+'">sin subir</span>')+'</button>'+
      '<button type="button" class="foto-del" data-borrar-foto="'+f.id+'" aria-label="Borrar esta foto" title="Borrar">'+
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  }).join("");
  g.querySelectorAll("[data-ver]").forEach(function(b){ b.addEventListener("click", function(){ verFoto(b.getAttribute("data-ver")); }); });
  g.querySelectorAll("[data-borrar-foto]").forEach(function(b){ b.addEventListener("click", function(){ borrarFoto(b.getAttribute("data-borrar-foto")); }); });
  lista.forEach(function(f){
    urlDeFoto(f).then(function(u){
      var im=g.querySelector('[data-img="'+f.id+'"]');
      if(im && u) im.src=u;
    }).catch(function(){});
  });
}

/* ── Las fotos en el PDF ──
   Los recibos son altos y estrechos: dos caben uno al lado del otro y se
   leen bien. Los apaisados van solos en su página. */
async function cargarFotos(lista){
  var out=[], faltan=0;
  for(var i=0;i<lista.length;i++){
    var f=lista[i], data=null;
    try{ var b=await blobDeFoto(f); if(b) data=await blobABytes(b); }catch(e){}
    if(!data) faltan++;
    out.push({f:f, img:data?{data:data, pw:f.w, ph:f.h}:null});
  }
  return {items:out, faltan:faltan};
}
function layoutFotos(items, cid, texto){
  var pages=[], L=PAGE.m, R=PAGE.w-PAGE.m, top=PAGE.m+40, bottom=PAGE.h-PAGE.m-14;
  var nombre=companyName(cid);
  var porDia={}; items.forEach(function(it){ porDia[it.f.date]=(porDia[it.f.date]||0)+1; });
  var vistoDia={};
  items.forEach(function(it){ vistoDia[it.f.date]=0; });

  function pagina(){
    var ops=[];
    ops.push({t:"text",v:"COPIA DE LOS RECIBOS",x:L,y:PAGE.m+2,s:7.4,b:true,c:C_ACC,a:"left"});
    ops.push({t:"text",v:clip(nombre,60),x:L,y:PAGE.m+17,s:12,b:true,c:C_INK,a:"left"});
    ops.push({t:"text",v:texto,x:R,y:PAGE.m+17,s:8.6,b:false,c:C_MUT,a:"right"});
    ops.push({t:"line",x1:L,y1:PAGE.m+26,x2:R,y2:PAGE.m+26,w:0.6,c:C_LINE});
    return ops;
  }
  function poner(ops, it, x, y, cw, ch){
    vistoDia[it.f.date]++;
    var cap=dmy(it.f.date)+(porDia[it.f.date]>1?"  ·  "+vistoDia[it.f.date]+"/"+porDia[it.f.date]:"");
    var alto=ch-18;
    if(it.img){
      var k=Math.min(cw/it.f.w, alto/it.f.h), dw=it.f.w*k, dh=it.f.h*k, dx=x+(cw-dw)/2;
      ops.push({t:"img", img:it.img, x:dx, y:y, w:dw, h:dh});
      [[dx,y,dx+dw,y],[dx,y+dh,dx+dw,y+dh],[dx,y,dx,y+dh],[dx+dw,y,dx+dw,y+dh]].forEach(function(l){
        ops.push({t:"line",x1:l[0],y1:l[1],x2:l[2],y2:l[3],w:0.4,c:C_LINE});
      });
      ops.push({t:"text",v:cap,x:x+cw/2,y:y+dh+13,s:8.4,b:false,c:C_MUT,a:"center"});
    } else {
      ops.push({t:"rect",x:x,y:y,w:cw,h:60,c:C_SOFT});
      ops.push({t:"text",v:"Foto no disponible",x:x+cw/2,y:y+28,s:9,b:true,c:C_MUT,a:"center"});
      ops.push({t:"text",v:cap,x:x+cw/2,y:y+44,s:8.4,b:false,c:C_MUT,a:"center"});
    }
  }
  function vertical(it){ return it.f.h >= it.f.w*1.15; }
  for(var i=0;i<items.length;){
    var ops=pagina(), a=items[i], b=items[i+1];
    if(b && vertical(a) && vertical(b)){
      var cw=(R-L-18)/2;
      poner(ops, a, L, top, cw, bottom-top);
      poner(ops, b, L+cw+18, top, cw, bottom-top);
      i+=2;
    } else {
      poner(ops, a, L, top, R-L, bottom-top);
      i+=1;
    }
    pages.push(ops);
  }
  pages.forEach(function(ops, n){
    ops.push({t:"text",v:"Recibos · página "+(n+1)+" de "+pages.length,x:R,y:PAGE.h-PAGE.m+4,s:7.6,b:false,c:C_MUT,a:"right"});
  });
  return pages;
}

/* Las fotos del mes van aparte de la factura: una carpeta comprimida
   (.zip) con una imagen por recibo, nombrada por día. La factura sigue
   siendo su PDF de siempre. */
function fotosDeFactura(inv){ return (inv && inv.companyId && inv.period) ? fotosDelMes(inv.companyId, inv.period) : []; }
function llevaFotos(inv){ return ui.conFotos!==false && fotosDeFactura(inv).length>0; }

var CRC_T=null;
function crc32(u8){
  if(!CRC_T){ CRC_T=new Uint32Array(256); for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; CRC_T[n]=c>>>0; } }
  var crc=0xFFFFFFFF; for(var i=0;i<u8.length;i++) crc=CRC_T[(crc^u8[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
/* ZIP sin comprimir (los JPEG ya van comprimidos): cabecera de cada
   archivo, su contenido y, al final, el índice. */
function hacerZip(archivos){
  var enc=new TextEncoder(), partes=[], indice=[], pos=0;
  var d=new Date(), hora=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),
      fecha=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  function cab(tam){ return {b:new Uint8Array(tam), v:null}; }
  archivos.forEach(function(a){
    var nom=enc.encode(a.nombre), crc=crc32(a.datos), n=a.datos.length;
    var h=new Uint8Array(30+nom.length), v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x0800,true); v.setUint16(8,0,true);
    v.setUint16(10,hora,true); v.setUint16(12,fecha,true); v.setUint32(14,crc,true);
    v.setUint32(18,n,true); v.setUint32(22,n,true); v.setUint16(26,nom.length,true); v.setUint16(28,0,true);
    h.set(nom,30);
    var c=new Uint8Array(46+nom.length), w=new DataView(c.buffer);
    w.setUint32(0,0x02014b50,true); w.setUint16(4,20,true); w.setUint16(6,20,true); w.setUint16(8,0x0800,true);
    w.setUint16(10,0,true); w.setUint16(12,hora,true); w.setUint16(14,fecha,true); w.setUint32(16,crc,true);
    w.setUint32(20,n,true); w.setUint32(24,n,true); w.setUint16(28,nom.length,true);
    w.setUint32(42,pos,true); c.set(nom,46);
    partes.push(h, a.datos); indice.push(c); pos+=h.length+n;
  });
  var tamIndice=indice.reduce(function(t,c){ return t+c.length; },0);
  var fin=new Uint8Array(22), f=new DataView(fin.buffer);
  f.setUint32(0,0x06054b50,true); f.setUint16(8,archivos.length,true); f.setUint16(10,archivos.length,true);
  f.setUint32(12,tamIndice,true); f.setUint32(16,pos,true);
  return new Blob(partes.concat(indice,[fin]), {type:"application/zip"});
}
function nombreZip(inv){
  return ("Recibos-"+slug(companyName(inv.companyId))+"-"+inv.period).slice(0,80)+".zip";
}
async function zipDeFotos(inv){
  var c=await cargarFotos(fotosDeFactura(inv));
  var carpeta="Recibos "+monthLabel(inv.period)+" - "+companyName(inv.companyId).replace(/[\\/:*?"<>|]/g,"");
  var porDia={}, archivos=[];
  c.items.forEach(function(it){
    if(!it.img) return;
    porDia[it.f.date]=(porDia[it.f.date]||0)+1;
    archivos.push({nombre:carpeta+"/"+it.f.date+" recibo "+porDia[it.f.date]+".jpg", datos:it.img.data});
  });
  if(c.faltan) toast(c.faltan+(c.faltan>1?" fotos no han llegado":" foto no ha llegado")+" todavía de otro aparato y no va"+(c.faltan>1?"n":"")+" en la carpeta.", true);
  if(!archivos.length) return null;
  return new File([hacerZip(archivos)], nombreZip(inv), {type:"application/zip"});
}
/* Las fotos sueltas, una imagen por recibo, para quien no quiera la
   carpeta comprimida: llegan abiertas en el correo. */
async function jpgsDeFotos(inv){
  var c=await cargarFotos(fotosDeFactura(inv));
  var porDia={}, out=[];
  c.items.forEach(function(it){
    if(!it.img) return;
    porDia[it.f.date]=(porDia[it.f.date]||0)+1;
    out.push(new File([it.img.data], "Recibo "+dmy(it.f.date).replace(/\//g,"-")+" ("+porDia[it.f.date]+").jpg", {type:"image/jpeg"}));
  });
  if(c.faltan) toast(c.faltan+(c.faltan>1?" fotos no han llegado":" foto no ha llegado")+" todavía de otro aparato y no va"+(c.faltan>1?"n":"")+".", true);
  return out;
}
/* Comprimidas (.zip) o sueltas, según se elija al enviar */
function fotosEnZip(){ return state.settings.fotosZip!==false; }
async function archivosDeFotos(inv){
  if(fotosEnZip()){ var z=await zipDeFotos(inv); return z?[z]:[]; }
  return jpgsDeFotos(inv);
}
/* Para compartir, el móvil exige que los archivos estén listos en el
   mismo toque: se preparan mientras se mira la factura. */
var pdfListo=null;
function clavePdf(inv){
  return inv.id+"|"+(fotosEnZip()?"z":"s")+"|"+(llevaFotos(inv)?fotosDeFactura(inv).map(function(f){ return f.id; }).join(","):"");
}
function prepararPdf(inv){
  var clave=clavePdf(inv);
  if(pdfListo && pdfListo.clave===clave) return pdfListo.promesa;
  var p=(llevaFotos(inv)?archivosDeFotos(inv):Promise.resolve([])).then(function(fotosA){
    var files=[new File([buildPDF(layoutInvoice(inv))], invFilename(inv,"pdf"), {type:"application/pdf"})].concat(fotosA);
    if(pdfListo && pdfListo.clave===clave) pdfListo.files=files;
    return files;
  });
  pdfListo={clave:clave, promesa:p, files:null};
  p.catch(function(){ if(pdfListo && pdfListo.clave===clave) pdfListo=null; });
  return p;
}

/* ============================ view: empresas ============================ */
function viewEmpresas(main){
  main.innerHTML=head("Empresas cliente",
    "Los datos fiscales que pongas aquí son los que salen impresos en la factura, así que conviene tenerlos exactos.",
    '<button class="btn primary" id="addComp">Nueva empresa</button>')+
    '<div class="card"><div class="tbl-wrap" id="compTable"></div></div>';
  document.getElementById("addComp").addEventListener("click", function(){ editCompany(null); });
  var box=document.getElementById("compTable");
  if(!state.companies.length){
    box.innerHTML='<div class="empty"><strong>Todavía no hay empresas</strong>Da de alta la primera para poder anotarle servicios.</div>';
    return;
  }
  var rows=companiesByUse().map(function(c){
    var pend=totalsOf(state.services.filter(function(s){ return s.companyId===c.id && (s.status||"pendiente")==="pendiente"; }));
    return "<tr>"+
      '<td style="width:34px;padding-right:0"><button class="pin-btn'+(c.pinned?' on':'')+'" data-cpin="'+c.id+'" title="'+(c.pinned?'Quitar de arriba':'Fijar arriba')+'" aria-pressed="'+(c.pinned?'true':'false')+'">'+(c.pinned?'★':'☆')+'</button></td>'+
      "<td><strong>"+esc(c.name)+"</strong></td>"+
      '<td class="num">'+num(companyUses(c.id))+"</td>"+
      '<td class="mono">'+esc(c.nrt||"—")+"</td>"+
      "<td>"+esc(correosDe(c).join(", ")||"—")+"</td>"+
      "<td>"+esc(c.contact||"—")+"</td>"+
      '<td class="num">'+(c.price?eur(c.price):"—")+"</td>"+
      '<td class="num">'+(pend.count?num(pend.count)+" · "+eur(pend.total):"—")+"</td>"+
      '<td><div class="row-actions">'+
        '<button class="btn ghost sm" data-cedit="'+c.id+'">Editar</button>'+
        '<button class="btn ghost sm danger" data-cdel="'+c.id+'">Borrar</button>'+
      "</div></td></tr>";
  }).join("");
  box.innerHTML='<table><thead><tr><th></th><th>Empresa</th><th class="num">Usos</th><th>NRT / CIF</th><th>Correo de facturación</th><th>Contacto</th>'+
    '<th class="num">€/persona</th><th class="num">Pendiente de facturar</th><th></th></tr></thead><tbody>'+rows+"</tbody></table>";
  box.querySelectorAll("[data-cedit]").forEach(function(b){ b.addEventListener("click",function(){ editCompany(b.getAttribute("data-cedit")); }); });
  box.querySelectorAll("[data-cdel]").forEach(function(b){ b.addEventListener("click",function(){ delCompany(b.getAttribute("data-cdel")); }); });
  box.querySelectorAll("[data-cpin]").forEach(function(b){ b.addEventListener("click",function(){
    var c=company(b.getAttribute("data-cpin")); if(!c) return;
    c.pinned=!c.pinned; touch(); render();
    toast(c.pinned?c.name+" fijada arriba":c.name+" vuelve a su orden por uso");
  }); });
}
function delCompany(id){
  var nombre=companyName(id);
  var propios=state.services.filter(function(s){ return s.companyId===id; });
  var facturados=propios.filter(function(s){ return !!s.invoiceId; }).length;
  var facturas=state.invoices.filter(function(i){ return i.companyId===id; }).length;

  function borrar(tambienServicios){
    if(tambienServicios) state.services=state.services.filter(function(s){ return s.companyId!==id; });
    else state.services.forEach(function(s){ if(s.companyId===id) s.companyId=null; });
    state.companies=state.companies.filter(function(c){ return c.id!==id; });
    if(ui.fCompany===id) ui.fCompany="";
    if(ui.invCompany===id) ui.invCompany="";
    touch(); render();
    toast("Empresa borrada"+(tambienServicios&&propios.length?" junto con sus "+propios.length+" servicios":""));
  }

  if(!propios.length){
    openDialog("Borrar empresa",
      "<p style=\"margin:0\">Vas a borrar <strong>"+esc(nombre)+"</strong>. No tiene servicios anotados, así que no se pierde nada más.</p>"+
      (facturas?'<p class="section-note" style="margin:12px 0 0">Sus '+facturas+" facturas emitidas se conservan: guardan sus propios datos fiscales.</p>":""),
      function(){ borrar(false); },
      {okLabel:"Borrar empresa", danger:true});
    return;
  }

  openDialog("Borrar "+nombre,
    '<p style="margin:0 0 14px">Esta empresa tiene <strong>'+propios.length+
      (propios.length>1?" servicios anotados":" servicio anotado")+"</strong>"+
      (facturados?" ("+facturados+" ya facturado"+(facturados>1?"s":"")+")":"")+
      ". ¿Qué hago con "+(propios.length>1?"ellos":"él")+"?</p>"+
    '<label class="choice"><input type="radio" name="delmode" value="all" checked>'+
      "<span><b>Borrar también "+(propios.length>1?"los servicios":"el servicio")+"</b>"+
      (propios.length>1?"Desaparecen":"Desaparece")+" del histórico y de los totales de cada mes. No se puede deshacer.</span></label>"+
    '<label class="choice"><input type="radio" name="delmode" value="keep">'+
      "<span><b>Conservar "+(propios.length>1?"los servicios":"el servicio")+"</b>"+
      (propios.length>1?"Se quedan anotados pero sin empresa, y podrás reasignarlos editándolos":"Se queda anotado pero sin empresa, y podrás reasignarlo editándolo")+".</span></label>"+
    (facturas?'<p class="section-note" style="margin:14px 0 0">Sus '+facturas+" facturas emitidas se conservan intactas en cualquier caso: cada factura guarda los datos fiscales con los que se emitió.</p>":""),
    function(){
      var sel=document.querySelector('input[name="delmode"]:checked');
      borrar(!sel || sel.value==="all");
    },
    {okLabel:"Borrar empresa", danger:true});
}
function editCompany(id){
  var c=id?company(id):{id:uid(),name:"",nrt:"",contact:"",email:"",phone:"",address:"",city:"",price:"",terms:""};
  openDialog(id?"Editar empresa":"Nueva empresa",
    '<div class="grid2">'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="c_name">Nombre fiscal</label><input id="c_name" value="'+esc(c.name)+'" placeholder="Construccions Pirineu, SL"></div>'+
      '<div class="field"><label class="lbl" for="c_nrt">NRT / CIF</label><input id="c_nrt" class="mono" value="'+esc(c.nrt)+'"></div>'+
      '<div class="field"><label class="lbl" for="c_price">Precio propio por persona (€)</label><input type="number" id="c_price" min="0" step="0.01" value="'+esc(c.price)+'" placeholder="Vacío: se usa el general ('+esc(num(state.settings.defaultPrice||0,2))+' €)"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="c_addr">Dirección</label><input id="c_addr" value="'+esc(c.address)+'"></div>'+
      '<div class="field"><label class="lbl" for="c_city">Población</label><input id="c_city" value="'+esc(c.city)+'"></div>'+
      '<div class="field"><label class="lbl" for="c_contact">Persona de contacto</label><input id="c_contact" value="'+esc(c.contact)+'"></div>'+
      /* Una línea por correo. Antes era un solo hueco donde había que
         escribirlos separados por comas, y así nadie se enteraba de que
         se podía poner más de uno. */
      '<div class="field" style="grid-column:1/-1"><label class="lbl">Correos de facturación</label>'+
        '<div id="c_correos"></div>'+
        '<button type="button" class="btn ghost" id="c_masCorreo" style="margin-top:8px;align-self:flex-start">'+
        '+ Añadir otro correo</button>'+
        '<span style="font-size:11.5px;color:var(--muted);margin-top:6px">Puedes poner los que hagan falta: '+
        'al enviar la factura salen todos marcados y quitas los que no toquen ese mes.</span></div>'+
      '<div class="field"><label class="lbl" for="c_phone">Teléfono (WhatsApp)</label><input id="c_phone" value="'+esc(c.phone)+'" placeholder="+376 800 111"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="c_terms">Condiciones de pago propias</label><input id="c_terms" value="'+esc(c.terms)+'" placeholder="Si lo dejas vacío se usan las de Ajustes"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="check" style="margin:0"><input type="checkbox" id="c_fotos"'+(c.fotos?" checked":"")+'>'+
        '<span><b>Pide fotos de los recibos</b>Sale la cámara en Servicios para esta empresa, y las fotos del mes se mandan con la factura.</span></label></div>'+
    '</div>',
    function(){
      var name=document.getElementById("c_name").value.trim();
      if(!name){ toast("La empresa necesita un nombre.", true); return true; }
      c.name=name;
      c.nrt=document.getElementById("c_nrt").value.trim();
      c.price=+document.getElementById("c_price").value||"";
      c.address=document.getElementById("c_addr").value.trim();
      c.city=document.getElementById("c_city").value.trim();
      c.contact=document.getElementById("c_contact").value.trim();
      c.emails=leerCorreos();
      c.email=c.emails[0]||"";
      c.phone=document.getElementById("c_phone").value.trim();
      c.terms=document.getElementById("c_terms").value.trim();
      c.fotos=document.getElementById("c_fotos").checked;
      if(!id) state.companies.push(c);
      touch(); render(); toast(id?"Empresa actualizada":"Empresa dada de alta");
    });

  /* ── Los correos, uno por fila ── */
  var cajaCorreos=document.getElementById("c_correos");

  function filaCorreo(valor){
    var f=document.createElement("div");
    f.className="fila-correo";
    f.style.cssText="display:flex;gap:6px;margin-bottom:6px;align-items:center";
    var i=document.createElement("input");
    i.type="email"; i.className="c-correo"; i.value=valor||"";
    i.placeholder="facturacion@empresa.ad";
    i.autocomplete="off";
    var x=document.createElement("button");
    x.type="button"; x.className="btn ghost"; x.textContent="✕";
    x.title="Quitar este correo";
    x.style.cssText="padding:6px 10px;flex:0 0 auto";
    x.addEventListener("click", function(){
      f.remove();
      /* que nunca se quede sin ninguna fila: si no, no hay dónde escribir */
      if(!cajaCorreos.querySelector(".c-correo")) cajaCorreos.appendChild(filaCorreo(""));
    });
    f.appendChild(i); f.appendChild(x);
    return f;
  }

  function leerCorreos(){
    return Array.prototype.slice.call(cajaCorreos.querySelectorAll(".c-correo"))
      .map(function(i){ return i.value.trim(); })
      .filter(function(v, idx, todos){
        /* fuera los vacíos y los repetidos */
        return v && todos.indexOf(v)===idx;
      });
  }

  var yaTiene=correosDe(c);
  (yaTiene.length?yaTiene:[""]).forEach(function(dir){
    cajaCorreos.appendChild(filaCorreo(dir));
  });
  document.getElementById("c_masCorreo").addEventListener("click", function(){
    var f=filaCorreo("");
    cajaCorreos.appendChild(f);
    f.querySelector("input").focus();
  });
}

/* ============================ view: facturar ============================ */
function viewFacturar(main){
  var cid=ui.invCompany, ym=ui.month;
  var pend=state.services.filter(function(s){
    return s.date.slice(0,7)===ym && (!cid || s.companyId===cid) && (s.status||"pendiente")==="pendiente";
  });
  /* los servicios que se quedaron sin empresa no se pueden facturar: hay que reasignarlos antes */
  var huerfanos=pend.filter(function(s){ return !s.companyId || !company(s.companyId); }).length;
  pend=pend.filter(function(s){ return s.companyId && company(s.companyId); });
  var byComp={};
  pend.forEach(function(s){ (byComp[s.companyId]=byComp[s.companyId]||[]).push(s); });

  main.innerHTML=head("Facturar el mes",
    "Elige empresa y periodo, revisa el borrador y emite. Al emitir se guarda la factura con su número y los servicios pasan a «facturado».")+
    '<div class="card" style="margin-bottom:18px"><div class="card-body"><div class="filters">'+
      '<div class="field"><label class="lbl" for="i_month">Periodo</label><input type="month" id="i_month" value="'+esc(ym)+'"></div>'+
      '<div class="field"><label class="lbl" for="i_comp">Empresa</label><select id="i_comp">'+companyOptions(cid)+'</select></div>'+
      '<div class="field"><label class="lbl" for="i_perfil">Emitir como</label><select id="i_perfil">'+
        perfiles().map(function(p){
          return '<option value="'+p.id+'"'+((perfilActivo()&&perfilActivo().id)===p.id?" selected":"")+">"+esc(p.name||"(sin nombre)")+"</option>";
        }).join("")+'</select></div>'+
    '</div>'+
    (perfilActivo()?'<p class="section-note" style="margin:12px 0 0">Saldrá a nombre de <strong>'+
      esc(perfilActivo().name||"—")+'</strong>, con la serie <span class="mono">'+
      esc(perfilActivo().prefix+"-"+ym.slice(0,4)+"-"+String(perfilActivo().nextNumber).padStart(4,"0"))+
      '</span>.</p>':"")+
    '</div></div>'+
    '<div id="invZone"></div>';
  document.getElementById("i_month").addEventListener("change", function(){ ui.month=this.value; render(); });
  document.getElementById("i_comp").addEventListener("change", function(){ ui.invCompany=this.value; render(); });
  var selPerfil=document.getElementById("i_perfil");
  if(selPerfil) selPerfil.addEventListener("change", function(){
    ui.perfil=this.value; state.settings.perfilActivo=this.value; touch(); render();
  });

  var zone=document.getElementById("invZone");
  var aviso=huerfanos?'<div class="warn-banner">Hay '+huerfanos+" servicio"+(huerfanos>1?"s":"")+
    " sin empresa en este periodo. Ve a Servicios, edítalo"+(huerfanos>1?"s":"")+" y asígnale"+(huerfanos>1?"s":"")+" una para poder facturarlo"+(huerfanos>1?"s":"")+".</div>":"";
  var ids=Object.keys(byComp);
  if(!ids.length){
    zone.innerHTML=aviso+'<div class="card"><div class="empty"><strong>Nada pendiente en '+esc(monthLabel(ym))+'</strong>'+
      "Todos los servicios de ese periodo ya están facturados, o aún no has anotado ninguno.</div></div>";
    return;
  }
  zone.innerHTML=aviso+ids.map(function(id){
    var list=sortedServices(byComp[id]), t=totalsOf(list), c=company(id);
    return '<div class="card" style="margin-bottom:18px"><div class="card-head">'+
      "<div><h2>"+esc(companyName(id))+'</h2><span class="hint">'+num(nAlb(list))+" albaranes · "+num(t.diners)+" comensales · "+esc(monthLabel(ym))+
        (fotosDelMes(id, ym).length?" · "+fotosDelMes(id, ym).length+(fotosDelMes(id, ym).length>1?" fotos de recibos":" foto de recibo"):"")+"</span></div>"+
      '<div class="toolbar" style="margin:0">'+
        '<span style="font-weight:600; font-size:16px; font-variant-numeric:tabular-nums">'+eur(t.total)+"</span>"+
        '<button class="btn" data-preview="'+id+'">Ver borrador</button>'+
        '<button class="btn primary" data-emit="'+id+'">Emitir factura</button>'+
      "</div></div>"+
      (c&&!c.nrt?'<div class="card-body" style="padding-bottom:0"><div class="warn-banner" style="margin:0">A '+esc(c.name)+" le falta el NRT/CIF, y la factura debe llevarlo.</div></div>":"")+
      '<div class="tbl-wrap">'+miniTable(list,t)+"</div></div>";
  }).join("");
  zone.querySelectorAll("[data-emit]").forEach(function(b){ b.addEventListener("click",function(){ emitInvoice(b.getAttribute("data-emit"), ym); }); });
  zone.querySelectorAll("[data-preview]").forEach(function(b){ b.addEventListener("click",function(){ previewDraft(b.getAttribute("data-preview"), ym); }); });
}
function miniTable(list,t){
  return "<table><thead><tr><th>Fecha</th><th>Nº albarán</th><th>Descripción</th>"+
    '<th class="num">Com.</th><th class="num">€/pers.</th><th class="num">Extras</th>'+
    '<th class="num">Importe</th></tr></thead><tbody>'+
    list.map(function(s,ix){ var a=svcAmounts(s), cont=sigueAlb(list[ix-1], s);
      return "<tr"+grpCls(list,ix)+"><td>"+(cont?"":esc(dmy(s.date)))+'</td><td class="mono">'+(cont?"":esc(s.albaran||"—"))+"</td><td>"+esc(s.desc)+
      '</td><td class="num">'+num(s.diners)+'</td><td class="num">'+eur(s.price)+
      '</td><td class="num">'+(extraDe(s)?eur(extraDe(s)):"—")+'</td><td class="num">'+
      eur(a.gross?a.total:a.base)+"</td></tr>";
    }).join("")+"</tbody><tfoot><tr><td colspan=\"3\">Subtotal "+eur(t.base)+" · IGI "+eur(t.igi)+
    '</td><td class="num">'+num(t.diners)+'</td><td></td>'+
    '<td class="num">'+eur(t.extras)+'</td><td class="num">'+eur(t.total)+"</td></tr></tfoot></table>";
}
function draftInvoice(cid, ym){
  var list=sortedServices(state.services.filter(function(s){
    return s.companyId===cid && s.date.slice(0,7)===ym && (s.status||"pendiente")==="pendiente";
  }));
  var t=totalsOf(list);
  var st=state.settings;
  var em=perfilActivo()||{prefix:"F", nextNumber:1};
  var c=company(cid)||{};
  var d=todayISO();
  return {
    id:"draft", perfilId:em.id,
    number:(em.prefix||"F")+"-"+ym.slice(0,4)+"-"+String(em.nextNumber||1).padStart(4,"0"),
    date:d, due:addDays(d, +st.dueDays||0),
    companyId:cid, period:ym, igiRate:st.igi,
    lines:list.map(function(s){ var a=svcAmounts(s);
      /* amount = lo que se imprime en la columna Importe: con IGI si el precio lo lleva */
      return {date:s.date, albaran:s.albaran, desc:s.desc, diners:s.diners, price:s.price,
              extra:extraDe(s),
              base:a.base, amount:a.gross?a.total:a.base, gross:a.gross, serviceId:s.id};
    }),
    base:t.base, igi:t.igi, total:t.total, diners:t.diners, extras:t.extras,
    taxes:t.taxes, gross:t.gross,
    status:"borrador",
    client:{name:c.name,nrt:c.nrt,address:c.address,city:c.city,
            email:correosDe(c)[0]||"", emails:correosDe(c), contact:c.contact, phone:c.phone},
    issuer:{name:em.name,nrt:em.nrt,address:em.address,city:em.city,
            phone:em.phone,email:em.email},
    terms:(c.terms||em.terms||st.terms), iban:em.iban||st.iban,
    cierre:textoDeCierre(em.cierre||st.cierre, em.iban||st.iban)
  };
}
/* La despedida de una factura. Las emitidas antes de que esto existiera
   no la llevan guardada, y el texto es de presentación, no un dato
   fiscal: se resuelve al pintarla y así también salen las viejas. */
function cierreDeFactura(inv){
  if(inv && inv.cierre) return inv.cierre;
  var st=state.settings||{};
  var em=(inv && inv.perfilId) ? perfil(inv.perfilId) : null;
  return textoDeCierre((em&&em.cierre)||st.cierre, (inv&&inv.iban)||(em&&em.iban)||st.iban);
}

/* El texto del pie, con el IBAN puesto donde toque. Si no hay IBAN
   guardado, se quita la frase entera en vez de dejar un hueco raro. */
function textoDeCierre(texto, iban){
  var t=String(texto||"").trim();
  if(!t) return "";
  if(t.indexOf("{IBAN}")<0) return t;
  if(iban) return t.split("{IBAN}").join(iban);
  return t.split("\n").filter(function(linea){ return linea.indexOf("{IBAN}")<0; })
          .join("\n").replace(/\n{3,}/g,"\n\n").trim();
}

/* ── Control de facturas repetidas ───────────────────────────────────
   Un numero de factura no puede salir dos veces: es el identificador
   del documento que ya esta en manos del cliente y de Hacienda. */
function facturaConNumero(num, exceptoId){
  for(var i=0;i<state.invoices.length;i++){
    var f=state.invoices[i];
    if(f.number===num && f.id!==exceptoId) return f;
  }
  return null;
}

/* Sube el contador hasta dar con un numero que no este usado. */
function siguienteLibre(em, anio){
  var n=+em.nextNumber||1, tope=n+5000;
  while(n<tope && facturaConNumero((em.prefix||"F")+"-"+anio+"-"+String(n).padStart(4,"0"))) n++;
  return n;
}

/* Facturas ya emitidas a la misma empresa por el mismo periodo. */
function facturasDe(cid, ym){
  return state.invoices.filter(function(f){ return f.companyId===cid && f.period===ym; });
}

/* Todos los numeros que aparecen mas de una vez. */
function numerosRepetidos(){
  var vistos={}, repes={};
  state.invoices.forEach(function(f){
    if(vistos[f.number]) repes[f.number]=(repes[f.number]||1)+1;
    vistos[f.number]=true;
  });
  return Object.keys(repes);
}

function previewDraft(cid, ym){ showInvoice(draftInvoice(cid,ym), true); }
function emitInvoice(cid, ym){
  var inv=draftInvoice(cid,ym);
  if(!inv.lines.length){ toast("No hay servicios pendientes que facturar.", true); return; }
  var emisor=perfilActivo();
  if(!emisor || !emisor.name){ toast("Antes rellena los datos del emisor en Ajustes.", true); ui.view="ajustes"; render(); return; }

  // ¿Ese número ya se usó? No se emite: se ofrece el siguiente libre.
  var choque=facturaConNumero(inv.number);
  if(choque){
    var libre=siguienteLibre(emisor, ym.slice(0,4));
    var numeroLibre=(emisor.prefix||"F")+"-"+ym.slice(0,4)+"-"+String(libre).padStart(4,"0");
    openDialog("Ese número ya está usado",
      '<p style="margin:0">La factura <strong class="mono">'+esc(inv.number)+'</strong> ya existe: '+
      'se emitió el <strong>'+esc(dmy(choque.date))+'</strong> a <strong>'+
      esc((choque.client&&choque.client.name)||companyName(choque.companyId))+'</strong> por <strong>'+
      eur(choque.total)+'</strong>.</p>'+
      '<p class="section-note" style="margin:12px 0 0">Dos facturas no pueden llevar el mismo número. '+
      'El siguiente libre de esta serie es <strong class="mono">'+esc(numeroLibre)+'</strong>.</p>',
      function(){
        emisor.nextNumber=libre;
        touch(); render();
        toast("Numeración ajustada a "+numeroLibre+". Vuelve a emitir.");
      },
      {okLabel:"Usar "+numeroLibre});
    return;
  }

  // ¿Ya hay una factura a esta empresa por este mismo periodo?
  var mismas=facturasDe(cid, ym);
  if(mismas.length && !emitInvoice._insistiendo){
    openDialog("Ya facturaste este periodo",
      '<p style="margin:0">A <strong>'+esc(companyName(cid))+'</strong> ya le emitiste '+
      (mismas.length>1?'<strong>'+mismas.length+' facturas</strong>':'la factura <strong class="mono">'+esc(mismas[0].number)+'</strong>')+
      ' de <strong>'+esc(monthLabel(ym))+'</strong>'+
      (mismas.length>1?'':' por <strong>'+eur(mismas[0].total)+'</strong>')+'.</p>'+
      '<p class="section-note" style="margin:12px 0 0">Esta llevaría '+nAlb(inv.lines)+
      (nAlb(inv.lines)>1?' albaranes nuevos':' albarán nuevo')+
      ' que aún no estaban facturados. Si es una factura complementaria, adelante; '+
      'si te has confundido, mejor revisa antes en «Facturas».</p>',
      function(){
        emitInvoice._insistiendo=true;
        emitInvoice(cid, ym);
        emitInvoice._insistiendo=false;
      },
      {okLabel:"Emitirla igualmente", danger:true});
    return;
  }
  confirmar("Emitir factura "+inv.number,
    '<p style="margin:0">Vas a emitir la factura <strong class="mono">'+esc(inv.number)+"</strong> a <strong>"+
      esc(companyName(cid))+"</strong> por <strong>"+eur(inv.total)+"</strong>, "+
      "a nombre de <strong>"+esc(emisor.name)+"</strong>.</p>"+
    '<p class="section-note" style="margin:12px 0 0">El número queda usado en firme y '+
      (inv.lines.length>1? "sus "+inv.lines.length+" servicios pasan" : "su servicio pasa")+
      " a «facturado». Si te equivocas, puedes anularla desde Facturas.</p>",
    function(){
      inv.id=uid(); inv.status="emitida";
      state.invoices.push(inv);
      var em=perfil(inv.perfilId)||emisor;
      em.nextNumber=(+em.nextNumber||1)+1;
      var ids={}; inv.lines.forEach(function(l){ ids[l.serviceId]=1; });
      state.services.forEach(function(s){ if(ids[s.id]){ s.status="facturado"; s.invoiceId=inv.id; } });
      touch(); ui.view="facturas"; render();
      showInvoice(inv,false);
      toast("Factura "+inv.number+" emitida");
    },
    {okLabel:"Emitir factura"});
}

/* ============================ view: facturas ============================ */
function viewFacturas(main){
  var repes=numerosRepetidos();
  main.innerHTML=head("Facturas emitidas",
    "Desde aquí descargas el PDF que adjuntas al correo y llevas el control de cobros.")+
    (repes.length
      ? '<div class="warn-banner">⚠️ Hay '+(repes.length>1?'números repetidos':'un número repetido')+
        ' entre tus facturas: <strong class="mono">'+repes.map(esc).join('</strong>, <strong class="mono">')+
        '</strong>. Dos facturas no deberían compartir número: anula la que sobre y vuelve a emitirla.</div>'
      : '')+
    '<div class="card"><div class="tbl-wrap" id="invTable"></div></div>';
  var box=document.getElementById("invTable");
  if(!state.invoices.length){
    box.innerHTML='<div class="empty"><strong>Aún no has emitido ninguna factura</strong>Ve a «Facturar» cuando cierres el mes.</div>';
    return;
  }
  var curYM=todayISO().slice(0,7);
  function isOld(i){ return i.status==="cobrada" && (i.period||"")<curYM; }
  var list=state.invoices.slice().sort(function(a,b){
    var oa=isOld(a)?1:0, ob=isOld(b)?1:0;
    if(oa!==ob) return oa-ob;
    return a.number<b.number?1:-1;
  });
  var sepDone=false;
  var rows=list.map(function(i){
    var repetida=repes.indexOf(i.number)>=0, old=isOld(i), sep="";
    if(old && !sepDone){ sepDone=true; sep='<tr class="inv-sep"><td colspan="10">Cobradas de meses anteriores</td></tr>'; }
    return sep+'<tr'+(old?' class="inv-old"':'')+(repetida?' style="background:var(--warn-soft)"':'')+'>'+
      '<td class="mono"><strong>'+esc(i.number)+"</strong>"+
      (repetida?' <span class="pill fact" title="Este número aparece en más de una factura">repetido</span>':'')+"</td>"+
      "<td>"+esc(dmy(i.date))+"</td>"+
      "<td>"+esc(i.client&&i.client.name?i.client.name:companyName(i.companyId))+"</td>"+
      "<td>"+esc(monthLabel(i.period))+"</td>"+
      '<td class="num">'+num(nAlb(i.lines))+"</td>"+
      '<td class="num">'+eur(i.base)+"</td>"+
      '<td class="num">'+eur(i.igi)+"</td>"+
      '<td class="num"><strong>'+eur(i.total)+"</strong></td>"+
      "<td>"+(i.status==="cobrada"?'<span class="pill cobr">Cobrada</span>':'<span class="pill fact">Emitida</span>')+
        (i.sentAt?'<div style="font-size:11px;color:var(--muted);margin-top:3px" title="'+esc((i.sentTo||[]).join(", "))+'">✉ Enviada '+esc(dmy(i.sentAt))+'</div>':'')+"</td>"+
      '<td><div class="row-actions">'+
        '<button class="btn ghost sm" data-open="'+i.id+'">Abrir</button>'+
        (i.status==="cobrada"?"":'<button class="btn ghost sm" data-paid="'+i.id+'">Cobrada</button>')+
        '<button class="btn ghost sm danger" data-void="'+i.id+'">Anular</button>'+
      "</div></td></tr>";
  }).join("");
  box.innerHTML='<table><thead><tr><th>Número</th><th>Fecha</th><th>Empresa</th><th>Periodo</th>'+
    '<th class="num">Albaranes</th><th class="num">Base</th><th class="num">IGI</th><th class="num">Total</th>'+
    "<th>Estado</th><th></th></tr></thead><tbody>"+rows+"</tbody></table>";
  box.querySelectorAll("[data-open]").forEach(function(b){ b.addEventListener("click",function(){ showInvoice(findInv(b.getAttribute("data-open")),false); }); });
  box.querySelectorAll("[data-paid]").forEach(function(b){ b.addEventListener("click",function(){ markPaid(b.getAttribute("data-paid")); }); });
  box.querySelectorAll("[data-void]").forEach(function(b){ b.addEventListener("click",function(){ voidInv(b.getAttribute("data-void")); }); });
}
function findInv(id){ for(var i=0;i<state.invoices.length;i++) if(state.invoices[i].id===id) return state.invoices[i]; return null; }
function markPaid(id){
  var i=findInv(id); if(!i) return;
  i.status="cobrada"; i.paidDate=todayISO();
  state.services.forEach(function(s){ if(s.invoiceId===id) s.status="cobrado"; });
  touch(); render(); toast("Factura "+i.number+" marcada como cobrada");
}
function voidInv(id){
  var i=findInv(id); if(!i) return;
  confirmar("Anular factura "+i.number,
    '<p style="margin:0">Sus servicios vuelven a <strong>«pendiente»</strong> y podrás volver a facturarlos.</p>'+
    '<p class="section-note" style="margin:12px 0 0">El número <span class="mono">'+esc(i.number)+
      "</span> queda sin usar. Si ya se la habías enviado a la empresa, avísale.</p>",
    function(){
      state.services.forEach(function(s){ if(s.invoiceId===id){ s.invoiceId=null; s.status="pendiente"; } });
      state.invoices=state.invoices.filter(function(x){ return x.id!==id; });
      touch(); render(); toast("Factura "+i.number+" anulada");
    },
    {okLabel:"Anular factura", danger:true});
}

/* ============================ view: ajustes ============================ */
function viewAjustes(main){
  var s=state.settings;
  main.innerHTML=head("Ajustes","Los datos de tu restaurante y las reglas de facturación. Todo esto sale impreso en la factura.")+
    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Perfiles de emisor</h2>'+
      '<button class="btn primary" id="addProf">Nuevo perfil</button></div><div class="card-body">'+
      '<p class="section-note">Cada factura se emite desde uno de estos perfiles: sus datos salen impresos, '+
      'su correo es el remitente y cada uno lleva su propia serie y numeración. En «Facturar» eliges con cuál.</p>'+
      '<div id="profList"></div>'+
    "</div></div>"+

    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>El menú de cada día</h2></div><div class="card-body">'+
      '<p class="section-note">Con esto llega relleno el formulario de Servicios, para que anotar el día a día sea solo poner comensales. Puedes cambiarlo en cualquier línea sin tocar nada de aquí.</p>'+
      '<div class="grid2">'+
        '<div class="field"><label class="lbl" for="s_dprice">Precio por persona (€)</label><input type="number" id="s_dprice" min="0" step="0.01" value="'+esc(s.defaultPrice)+'"></div>'+
        '<div class="field"><label class="lbl" for="s_ddesc">Descripción</label><input id="s_ddesc" value="'+esc(s.defaultDesc)+'"></div>'+
      "</div>"+
      '<div class="grid3" style="margin-top:13px">'+
        tiposServicio().filter(function(t){ return t!==defaultDesc(); }).map(function(t,ix){
          var v=precioTipoAjustes(t);
          return '<div class="field"><label class="lbl" for="s_tp'+ix+'">'+esc(t)+' (€/persona)</label>'+
            '<input type="number" id="s_tp'+ix+'" data-tipo="'+esc(t)+'" min="0" step="0.01" value="'+(v?esc((+v).toFixed(2)):"")+'" placeholder="'+esc(num(+s.defaultPrice||0,2))+'"></div>';
        }).join("")+
      "</div>"+
      '<p class="section-note" style="margin:13px 0 0">Si a una empresa le has puesto un precio propio en su ficha, ese manda sobre este.</p>'+
    "</div></div>"+

    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Facturación</h2></div><div class="card-body">'+
      '<label class="check" style="margin:0 0 16px"><input type="checkbox" id="s_gross"'+(s.pricesIncludeIgi?" checked":"")+">"+
        "<span><b>Los precios que apunto ya llevan el IGI incluido</b>"+
        "Es lo normal cuando cierras un precio por menú con la empresa. La factura desglosa el impuesto hacia atrás: subtotal, IGI y total, "+
        "y el total coincide al céntimo con lo que cobras. Solo afecta a los servicios que anotes a partir de ahora.</span></label>"+

      '<div class="grid3">'+
        '<div class="field"><label class="lbl" for="s_igi">IGI (%)</label><input type="number" id="s_igi" min="0" step="0.1" value="'+esc(s.igi)+'"></div>'+
        '<div class="field"><label class="lbl" for="s_due">Vencimiento (días, ya no se imprime)</label><input type="number" id="s_due" min="0" step="1" value="'+esc(s.dueDays)+'"></div>'+
        '<div class="field"><label class="lbl" for="s_cc">Prefijo país (WhatsApp)</label><input id="s_cc" class="mono" value="'+esc(s.countryCode)+'" placeholder="376"></div>'+
      "</div>"+
      '<p class="section-note" style="margin:13px 0 0">La serie, el número, las condiciones de pago y el IBAN '+
      'son de cada perfil de emisor, no generales.</p>'+
      '<label class="check"><input type="checkbox" id="s_copy"'+(s.paperCopy!==false?" checked":"")+">"+
        "<span><b>Al imprimir, añadir la copia para tu archivo</b>"+
        "El PDF para imprimir sale con el ejemplar del cliente y, detrás, el tuyo. Ambos llevan recuadro de firma y sello.</span></label>"+

    "</div></div>"+

    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Despedida de la factura</h2></div>'+
    '<div class="card-body">'+
      '<p class="section-note" style="margin:0 0 10px">Lo que se lee al pie de la factura, debajo del '+
      'total. Escribe <span class="mono">{IBAN}</span> donde quieras que salga el número de cuenta '+
      'y se pone solo el del perfil que emite: así no lo tienes escrito en dos sitios. '+
      'Si un perfil no tiene IBAN, esa línea desaparece.</p>'+
      '<textarea id="s_cierre" rows="8">'+esc(s.cierre||"")+"</textarea>"+
      '<p class="section-note" style="margin:10px 0 0">Un perfil de emisor puede llevar su propia '+
      'despedida; si la tiene, manda sobre ésta.</p>'+
    "</div></div>"+

    '<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Texto del correo</h2></div><div class="card-body">'+
      '<p class="section-note">Es el cuerpo que se copia al portapapeles cuando envías la factura. El asunto y los importes se añaden solos.</p>'+
      '<textarea id="s_mail" rows="5">'+esc(s.mailIntro)+"</textarea>"+
    "</div></div>"+

    '<div class="card"><div class="card-head"><h2>Copia de seguridad</h2></div><div class="card-body">'+
      '<p class="section-note">Descarga todos tus datos (empresas, servicios y facturas) en un archivo JSON, o recupéralos en otro navegador.</p>'+
      '<div class="toolbar" style="margin:0"><button class="btn" id="expBtn">Descargar copia</button>'+
      '<button class="btn" id="impBtn">Restaurar copia</button>'+
      '<input type="file" id="impFile" accept="application/json,.json" hidden></div>'+
    "</div></div>";

  var map={s_mail:"mailIntro", s_cc:"countryCode", s_ddesc:"defaultDesc", s_cierre:"cierre"};
  Object.keys(map).forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener("change", function(){ state.settings[map[id]]=this.value.trim?this.value.trim():this.value; touch(); });
  });
  ["s_igi","s_due","s_dprice"].forEach(function(id){
    var k={s_igi:"igi",s_due:"dueDays",s_dprice:"defaultPrice"}[id];
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener("change", function(){ state.settings[k]=+this.value||0; touch(); render(); });
  });
  main.querySelectorAll("[data-tipo]").forEach(function(el){
    el.addEventListener("change", function(){
      var tp=state.settings.tipoPrices||(state.settings.tipoPrices={});
      var v=+this.value||0, t=this.getAttribute("data-tipo");
      if(v) tp[t]=v; else delete tp[t];
      touch();
    });
  });
  document.getElementById("addProf").addEventListener("click", function(){ editarPerfil(null); });
  pintarPerfiles();
  document.getElementById("s_copy").addEventListener("change", function(){ state.settings.paperCopy=this.checked; touch(); });
  document.getElementById("s_gross").addEventListener("change", function(){ state.settings.pricesIncludeIgi=this.checked; touch(); });
  document.getElementById("expBtn").addEventListener("click", exportBackup);
  document.getElementById("impBtn").addEventListener("click", function(){ document.getElementById("impFile").click(); });
  document.getElementById("impFile").addEventListener("change", importBackup);
}
function exportBackup(){
  descargarArchivo("comanda-copia-"+todayISO()+".json", JSON.stringify(state,null,2), "application/json");
  toast("Copia descargada");
}
function importBackup(ev){
  var f=ev.target.files&&ev.target.files[0]; if(!f) return;
  var rd=new FileReader();
  rd.onload=function(){
    try{
      var d=JSON.parse(rd.result);
      if(!d||!d.settings) throw 0;
      confirmar("Restaurar copia",
        '<p style="margin:0">El archivo trae <strong>'+(d.companies||[]).length+" empresas</strong>, <strong>"+
          (d.services||[]).length+" servicios</strong> y <strong>"+(d.invoices||[]).length+" facturas</strong>.</p>"+
        '<p class="section-note" style="margin:12px 0 0">Sustituye por completo lo que tengas ahora en la app.</p>',
        function(){ state=d; touch(); render(); toast("Copia restaurada"); },
        {okLabel:"Restaurar copia", danger:true});
    }catch(e){ toast("Ese archivo no es una copia válida de Comanda.", true); }
  };
  rd.readAsText(f); ev.target.value="";
}

/* ============================ perfiles ============================ */
function pintarPerfiles(){
  var box=document.getElementById("profList"); if(!box) return;
  if(!perfiles().length){
    box.innerHTML='<div class="empty"><strong>Todavía no hay perfiles</strong>Crea el primero con los datos con los que facturas.</div>';
    return;
  }
  var activo=(perfilActivo()||{}).id;
  box.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Nombre fiscal</th><th>NRT</th>'+
    '<th>Correo del remitente</th><th class="num">Próximo número</th><th></th></tr></thead><tbody>'+
    perfiles().map(function(p){
      return "<tr>"+
        "<td><strong>"+esc(p.name||"(sin nombre)")+"</strong>"+
          (p.id===activo?' <span class="pill cobr">En uso</span>':"")+"</td>"+
        '<td class="mono">'+esc(p.nrt||"—")+"</td>"+
        "<td>"+esc(p.email||"—")+"</td>"+
        '<td class="num mono">'+esc((p.prefix||"F")+"-"+new Date().getFullYear()+"-"+String(p.nextNumber||1).padStart(4,"0"))+"</td>"+
        '<td><div class="row-actions">'+
          '<button class="btn ghost sm" data-pedit="'+p.id+'">Editar</button>'+
          (p.id===activo?"":'<button class="btn ghost sm" data-puse="'+p.id+'">Usar</button>')+
          (perfiles().length>1?'<button class="btn ghost sm danger" data-pdel="'+p.id+'">Borrar</button>':"")+
        "</div></td></tr>";
    }).join("")+"</tbody></table></div>";

  box.querySelectorAll("[data-pedit]").forEach(function(b){ b.addEventListener("click",function(){ editarPerfil(b.getAttribute("data-pedit")); }); });
  box.querySelectorAll("[data-puse]").forEach(function(b){ b.addEventListener("click",function(){
    ui.perfil=b.getAttribute("data-puse"); state.settings.perfilActivo=ui.perfil; touch(); render();
    toast("Ahora facturas como "+nombrePerfil(ui.perfil));
  }); });
  box.querySelectorAll("[data-pdel]").forEach(function(b){ b.addEventListener("click",function(){ borrarPerfil(b.getAttribute("data-pdel")); }); });
}

function borrarPerfil(id){
  var p=perfil(id); if(!p) return;
  var usadas=state.invoices.filter(function(i){ return i.perfilId===id; }).length;
  confirmar("Borrar perfil",
    '<p style="margin:0">Vas a borrar <strong>'+esc(p.name||"(sin nombre)")+"</strong>.</p>"+
    (usadas?'<p class="section-note" style="margin:12px 0 0">Sus '+usadas+" factura"+(usadas>1?"s":"")+
      " emitida"+(usadas>1?"s":"")+" se conserva"+(usadas>1?"n":"")+": cada factura guarda los datos con los que se emitió.</p>":""),
    function(){
      state.profiles=perfiles().filter(function(x){ return x.id!==id; });
      if(state.settings.perfilActivo===id) state.settings.perfilActivo=(perfiles()[0]||{}).id||"";
      if(ui.perfil===id) ui.perfil=state.settings.perfilActivo;
      touch(); render(); toast("Perfil borrado");
    }, {okLabel:"Borrar perfil", danger:true});
}

function editarPerfil(id){
  var p=id?perfil(id):{id:uid(), name:"", nrt:"", address:"", city:"", phone:"", email:"",
                       iban:"", terms:"Transferencia bancaria", cierre:"", prefix:"F", nextNumber:1};
  openDialog(id?"Editar perfil":"Nuevo perfil de emisor",
    '<div class="grid2">'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="p_name">Nombre fiscal</label><input id="p_name" value="'+esc(p.name)+'" placeholder="Restaurant Cal Miquel, SL"></div>'+
      '<div class="field"><label class="lbl" for="p_nrt">NRT / CIF</label><input id="p_nrt" class="mono" value="'+esc(p.nrt)+'"></div>'+
      '<div class="field"><label class="lbl" for="p_phone">Teléfono</label><input id="p_phone" value="'+esc(p.phone)+'"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="p_email">Correos del remitente</label>'+
        '<textarea id="p_email" rows="2" placeholder="lapalmeradesoldeu@hotmail.com&#10;tucorreo@hotmail.com">'+
        esc(remitentesDe(p).join("\n"))+'</textarea>'+
        '<p class="section-note" style="margin:6px 0 0">Uno por línea. El primero es el que sale impreso '+
        'en la factura; al enviar eliges con cuál de ellos la mandas.</p></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="p_addr">Dirección</label><input id="p_addr" value="'+esc(p.address)+'"></div>'+
      '<div class="field"><label class="lbl" for="p_city">Población</label><input id="p_city" value="'+esc(p.city)+'"></div>'+
      '<div class="field"><label class="lbl" for="p_iban">IBAN para el cobro</label><input id="p_iban" class="mono" value="'+esc(p.iban)+'"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="p_terms">Condiciones de pago</label><input id="p_terms" value="'+esc(p.terms)+'"></div>'+
      '<div class="field" style="grid-column:1/-1"><label class="lbl" for="p_cierre">Despedida propia de este perfil</label>'+
        '<textarea id="p_cierre" rows="5" placeholder="Si lo dejas vacío se usa la de Ajustes">'+
        esc(p.cierre||"")+"</textarea></div>"+
      '<div class="field"><label class="lbl" for="p_prefix">Serie</label><input id="p_prefix" class="mono" value="'+esc(p.prefix)+'"></div>'+
      '<div class="field"><label class="lbl" for="p_next">Siguiente número</label><input type="number" id="p_next" min="1" step="1" value="'+esc(p.nextNumber)+'"></div>'+
    '</div>'+
    '<p class="section-note" style="margin-top:12px">El primer correo es el que aparece impreso en la factura. '+
    'Si pones más de uno, al enviar te deja elegir con cuál sale.</p>',
    function(){
      var nombre=document.getElementById("p_name").value.trim();
      if(!nombre){ toast("El perfil necesita un nombre fiscal.", true); return true; }
      p.name=nombre;
      p.nrt=document.getElementById("p_nrt").value.trim();
      p.phone=document.getElementById("p_phone").value.trim();
      p.emails=document.getElementById("p_email").value.split(/[\n;,]+/)
                 .map(function(x){ return x.trim(); }).filter(Boolean);
      p.email=p.emails[0]||"";
      p.address=document.getElementById("p_addr").value.trim();
      p.city=document.getElementById("p_city").value.trim();
      p.iban=document.getElementById("p_iban").value.trim();
      p.terms=document.getElementById("p_terms").value.trim();
      p.cierre=document.getElementById("p_cierre").value.trim();
      p.prefix=document.getElementById("p_prefix").value.trim()||"F";
      p.nextNumber=+document.getElementById("p_next").value||1;
      if(!id){ perfiles().push(p); if(!state.settings.perfilActivo){ state.settings.perfilActivo=p.id; ui.perfil=p.id; } }
      touch(); render(); toast(id?"Perfil actualizado":"Perfil creado");
    });
}

/* ============================ dialog ============================ */
/* El visor de artefactos ignora confirm()/alert() del navegador: toda
   confirmación tiene que ser un diálogo nuestro o el botón no hace nada. */
function confirmar(title, bodyHTML, onOk, opts){
  opts=opts||{};
  openDialog(title, bodyHTML, function(){ onOk(); }, {okLabel:opts.okLabel||"Aceptar", danger:opts.danger});
}
function openDialog(title, bodyHTML, onSave, opts){
  opts=opts||{};
  var old=document.getElementById("dlg"); if(old) old.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML='<div class="dlg-head"><h3>'+esc(title)+'</h3><button class="btn ghost" data-x>Cerrar</button></div>'+
    '<div class="dlg-body">'+bodyHTML+'</div>'+
    '<div class="dlg-foot"><button class="btn" data-x>Cancelar</button>'+
    '<button class="btn '+(opts.danger?"solid-danger":"primary")+'" data-ok>'+esc(opts.okLabel||"Guardar")+"</button></div>";
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){ b.addEventListener("click",function(){ d.close(); d.remove(); }); });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    var keep=onSave(); if(keep===true) return;
    d.close(); d.remove();
  });
  d.addEventListener("keydown", function(e){ if(e.key==="Enter" && e.target.tagName==="INPUT"){ e.preventDefault(); d.querySelector("[data-ok]").click(); } });
  d.showModal();
  var first=d.querySelector("input,select,textarea"); if(first) first.focus();
}

/* ============================ invoice modal ============================ */
function showInvoice(inv, isDraft){
  if(!inv) return;
  var old=document.getElementById("invDlg"); if(old) old.remove();
  var d=document.createElement("dialog"); d.id="invDlg";
  d.style.maxWidth="880px";
  d.innerHTML='<div class="dlg-head"><h3>'+(isDraft?"Borrador de factura":"Factura "+esc(inv.number))+"</h3>"+
      '<button class="btn ghost" data-x>Cerrar</button></div>'+
    '<div class="dlg-body" style="background:var(--ground)">'+invoiceHTML(inv)+(isDraft?"":sendBoxHTML(inv))+"</div>"+
    '<div class="dlg-foot">'+
      (isDraft?'<span class="hint" style="margin-right:auto; color:var(--muted); font-size:12.5px">Aún no está emitida: el número es provisional.</span>':
        '<button class="btn" data-png>Imagen</button>'+
        '<button class="btn" data-paper>PDF para imprimir</button>')+
      '<button class="btn" data-x>Cerrar</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){ b.addEventListener("click",function(){ d.close(); d.remove(); }); });
  if(!isDraft){
    d.querySelector("[data-paper]").addEventListener("click", function(){ downloadInvoice(inv,"paper"); });
    d.querySelector("[data-png]").addEventListener("click", function(){ downloadInvoice(inv,"png"); });
    engancharEnvio(d, inv);
    if(canShareFiles() && llevaFotos(inv)) prepararPdf(inv).catch(function(){});
  }
  d.showModal();
}
/* Los botones del panel de envio. Va aparte porque el panel se vuelve a
   pintar al cambiar de remitente. */
function engancharEnvio(d, inv){
  var bm=d.querySelector("[data-borrar-mes]");
  if(bm) bm.addEventListener("click", function(){
    borrarTodas(fotosDeFactura(inv), "de "+monthLabel(inv.period), function(){
      pdfListo=null; render();
      var caja=d.querySelector(".send-box"), nueva=document.createElement("div");
      nueva.innerHTML=sendBoxHTML(inv); caja.replaceWith(nueva.firstChild);
      engancharEnvio(d, inv);
    });
  });
  d.querySelectorAll("[data-fmodo]").forEach(function(b){
    b.addEventListener("click", function(){
      state.settings.fotosZip = b.getAttribute("data-fmodo")==="zip";
      touch();
      d.querySelectorAll("[data-fmodo]").forEach(function(x){
        var on=(x.getAttribute("data-fmodo")==="zip")===fotosEnZip();
        x.classList.toggle("primary", on); x.setAttribute("aria-pressed", on);
      });
      pdfListo=null;
      if(canShareFiles()) prepararPdf(inv).catch(function(){});
      toast(fotosEnZip() ? "Las fotos irán en una carpeta comprimida" : "Las fotos irán sueltas, una a una");
    });
  });
  var cf=d.querySelector("#conFotos");
  if(cf) cf.addEventListener("change", function(){
    ui.conFotos=cf.checked;
    if(canShareFiles()) prepararPdf(inv).catch(function(){});
  });
  d.querySelector("[data-pdf]").addEventListener("click", function(){ downloadInvoice(inv,"pdf"); });
  d.querySelector("[data-mail]").addEventListener("click", function(){ copyMail(inv); });
  d.querySelector("[data-mailto]").addEventListener("click", function(){ openMail(inv); });
  d.querySelector("[data-enviar]").addEventListener("click", function(){ enviarPorCorreo(inv, d); });
    /* Elegir con que correo sale: se repinta solo el panel de envio, que
       los destinatarios marcados se quedan como estan. */
  d.querySelectorAll("[data-remite]").forEach(function(b){
      b.addEventListener("click", function(){
        var marcados=Array.prototype.map.call(d.querySelectorAll(".dest-mail"), function(x){
          return {v:x.value, on:x.checked}; });
        var otro=(d.querySelector("#otroCorreo")||{}).value||"";
        ui.remitente=b.dataset.remite;
        var caja=d.querySelector(".send-box");
        var nueva=document.createElement("div");
        nueva.innerHTML=sendBoxHTML(inv);
        caja.replaceWith(nueva.firstChild);
        marcados.forEach(function(m){
          var x=d.querySelector('.dest-mail[value="'+m.v.replace(/"/g,'\\"')+'"]');
          if(x) x.checked=m.on;
        });
        var o=d.querySelector("#otroCorreo"); if(o) o.value=otro;
        engancharEnvio(d, inv);
      });
    });
  /* Los correos escritos a mano son de un envío. Con este botón se
     quedan en la ficha de la empresa y la próxima vez salen ya marcados,
     que es lo que uno quiere cuando manda siempre a los mismos. */
  var bg=d.querySelector("[data-guardar-correos]");
  if(bg) bg.addEventListener("click", function(){
    var campo=d.querySelector("#otroCorreo");
    var escritos=(campo && campo.value || "").split(/[;,\s]+/)
                   .map(function(x){ return x.trim(); })
                   .filter(function(x){ return x && x.indexOf("@")>0; });
    if(!escritos.length){ toast("Escribe primero el correo en el hueco de al lado.", true); return; }
    var viva=company(inv.companyId);
    if(!viva){ toast("Esta factura no apunta a ninguna empresa guardada.", true); return; }
    var ya=correosDe(viva);
    var nuevos=escritos.filter(function(x){ return ya.indexOf(x)<0; });
    if(!nuevos.length){ toast("Esos correos ya los tenía la empresa."); if(campo) campo.value=""; return; }
    viva.emails=ya.concat(nuevos);
    delete viva.email;              /* a partir de aquí manda la lista */
    touch();
    if(campo) campo.value="";
    render();
    toast(nuevos.length===1 ? "Correo guardado en "+(viva.name||"la empresa")
                            : nuevos.length+" correos guardados en "+(viva.name||"la empresa"));
  });

  d.querySelector("[data-wa]").addEventListener("click", function(){ openWhatsApp(inv); });
  var sh=d.querySelector("[data-share]");
  if(sh) sh.addEventListener("click", function(){ shareInvoice(inv); });
}
/* Ni mailto: ni wa.me admiten adjuntos: abren el mensaje escrito y el PDF lo
   añade la persona. En el móvil, navigator.share sí lleva el archivo dentro. */
function canShareFiles(){
  try{ return !!(navigator.canShare && navigator.share && navigator.canShare({files:[new File(["x"],"a.pdf",{type:"application/pdf"})]})); }
  catch(e){ return false; }
}
function sendBoxHTML(inv){
  var c=inv.client||{};
  var tel=waNumber(inv);
  var lista=correosDeFactura(inv);
  var em=inv.issuer||{};

  var casillas = lista.length
    ? lista.map(function(dir,i){
        return '<label class="check" style="margin:0 0 6px"><input type="checkbox" class="dest-mail" value="'+
               esc(dir)+'" checked><span>'+esc(dir)+'</span></label>';
      }).join("")
    : '<p class="section-note" style="margin:0 0 8px">Esta empresa no tiene correos guardados. '+
      'Añádelos en Empresas, o escribe uno aquí abajo.</p>';

  /* Con quien se manda: los correos del perfil y, al final, el programa
     de correo de siempre por si algun dia hace falta. */
  var remitentes=remitentesDe(em);
  if(!ui.remitente || (remitentes.indexOf(ui.remitente)<0 && ui.remitente!=="__mailto__"))
    ui.remitente = remitentes[0] || "__mailto__";
  var eleccion = remitentes.map(function(dir){
      var on=(ui.remitente===dir);
      return '<button class="btn'+(on?" primary":" ghost")+'" data-remite="'+esc(dir)+'" '+
             'style="padding:5px 10px;font-size:12.5px">'+esc(dir)+'</button>';
    }).join("")+
    '<button class="btn'+(ui.remitente==="__mailto__"?" primary":" ghost")+'" data-remite="__mailto__" '+
    'style="padding:5px 10px;font-size:12.5px">Mi programa de correo</button>';

  return '<div class="send-box"><h4>Enviar a '+esc(c.name||"la empresa")+"</h4>"+
    '<p class="lead">Marca a quién va y pulsa <b>Enviar por correo</b>. Ni el correo ni WhatsApp dejan que una web adjunte el PDF sola, así que lo único que haces tú es adjuntarlo.</p>'+
    '<div style="margin:0 0 10px">'+
      '<div class="lbl" style="margin-bottom:6px">Destinatarios</div>'+
      casillas+
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+
        '<input id="otroCorreo" placeholder="Más correos, separados por comas" '+
        'style="flex:1;min-width:220px" autocomplete="off">'+
        '<button class="btn ghost" data-guardar-correos '+
        'title="Dejarlos guardados en esta empresa para los próximos envíos" '+
        'style="padding:5px 10px;font-size:12.5px">Guardar en la empresa</button>'+
      "</div>"+
    "</div>"+
    (remitentes.length
      ? '<div style="margin:0 0 10px">'+
          '<div class="lbl" style="margin-bottom:6px">Enviar desde</div>'+
          '<div style="display:flex;gap:6px;flex-wrap:wrap">'+eleccion+'</div>'+
        '</div>'
      : "")+
    (function(){
      var n=fotosDeFactura(inv).length;
      if(!n) return "";
      return '<label class="check" style="margin:0 0 12px"><input type="checkbox" id="conFotos"'+(ui.conFotos!==false?" checked":"")+'>'+
        '<span><b>Mandar también '+(n>1?"las "+n+" fotos":"la foto")+' de los recibos de '+esc(monthLabel(inv.period))+'</b>'+
        'Una imagen por recibo, con su fecha. La factura sigue en su PDF.</span></label>'+
        '<div class="fotos-modo" role="radiogroup" aria-label="Cómo van las fotos" style="display:flex;gap:6px;flex-wrap:wrap;margin:-4px 0 10px 25px">'+
          '<button type="button" class="btn sm'+(fotosEnZip()?" primary":"")+'" data-fmodo="zip" aria-pressed="'+fotosEnZip()+'">Comprimidas (.zip)</button>'+
          '<button type="button" class="btn sm'+(!fotosEnZip()?" primary":"")+'" data-fmodo="sueltas" aria-pressed="'+(!fotosEnZip())+'">Sueltas, una a una</button>'+
        '</div>'+
        '<p class="section-note" style="margin:-4px 0 12px 25px"><button class="inline-link" data-borrar-mes style="color:var(--danger)">'+
        'Borrar '+(n>1?"las "+n+" fotos":"la foto")+' de '+esc(monthLabel(inv.period))+'</button> cuando ya las hayas mandado.</p>';
    })()+
    (inv.sentAt
      ? '<p class="section-note" style="margin:0 0 10px;color:var(--ok,#2e7d4f)"><b>✓ Enviada por correo el '+esc(dmy(inv.sentAt))+'</b>'+
        (inv.sentTo&&inv.sentTo.length?' a '+esc(inv.sentTo.join(", ")):'')+'. Si la vuelves a mandar, se apunta la nueva fecha.</p>'
      : "")+
    '<button class="btn primary" data-enviar style="width:100%;justify-content:center;padding:12px 16px;font-size:15px;margin:0 0 6px">'+
      '✉️ Enviar por correo</button>'+
    '<p class="section-note" style="margin:0 0 14px">'+(movilComparte()
      ? 'Se abre el menú del móvil con el PDF'+(llevaFotos(inv)?' y las fotos':'')+' ya dentro: elige <b>Mail</b> (o Gmail/Outlook) y pega los correos en «Para», que ya van copiados.'
      : 'Un solo clic: baja el PDF'+(llevaFotos(inv)?' y las fotos':'')+' y abre el correo ya escrito, con los destinatarios. Solo te queda adjuntar el PDF desde <b>Descargas</b> y darle a Enviar.')+'</p>'+
    '<div class="lbl" style="margin-bottom:6px">Otras formas</div>'+
    '<div class="toolbar" style="margin:0">'+
      '<button class="btn ghost" data-pdf>Descargar PDF</button>'+
      '<button class="btn ghost" data-mailto>Solo abrir el correo</button>'+
      '<button class="btn ghost" data-wa>Abrir WhatsApp</button>'+
      (canShareFiles()?'<button class="btn ghost" data-share>Compartir PDF…</button>':"")+
      '<button class="btn ghost" data-mail>Copiar texto</button>'+
    "</div>"+
    '<div class="dest">'+
      "<span>Sale desde: <b>"+esc(ui.remitente==="__mailto__"?"tu programa de correo":ui.remitente)+"</b></span>"+
      "<span>WhatsApp: <b>"+esc(tel?waDisplay(inv):"elegirás el contacto")+"</b></span>"+
    "</div>"+
    (ui.remitente==="__mailto__"
      ? '<p class="section-note" style="margin:10px 0 0">Se abre tu programa de correo, que manda con la cuenta '+
        'que tenga puesta. Si quieres que salga a nombre del restaurante, elige arriba su correo, o cámbialo '+
        'en el campo «De:» antes de enviar.</p>'
      : '<p class="section-note" style="margin:10px 0 0">Se abre <strong>'+
        esc(comoSeAbre(ui.remitente)==="gmail"?"Gmail":"Outlook")+'</strong> en el navegador con el mensaje escrito. '+
        'Comprueba arriba a la derecha que estás dentro de <strong>'+esc(ui.remitente)+'</strong>; si no, cambia de '+
        'cuenta y vuelve a darle.</p>')+
    "</div>";
}

/* Los correos marcados en el panel, mas el que se haya escrito a mano. */
function destinatariosElegidos(inv){
  var marcados = Array.prototype.slice.call(document.querySelectorAll(".dest-mail:checked"))
                   .map(function(x){ return x.value; });
  var otro = document.getElementById("otroCorreo");
  if (otro && otro.value.trim()) {
    otro.value.split(/[;,\s]+/).forEach(function(x){ x=x.trim(); if(x) marcados.push(x); });
  }
  if (!marcados.length) marcados = correosDeFactura(inv);
  // sin repetidos
  return marcados.filter(function(x,i){ return marcados.indexOf(x) === i; });
}
function waNumber(inv){
  var vivo=company(inv.companyId)||{};
  /* el teléfono guardado en la factura sobrevive aunque se borre la empresa */
  var tel=(inv.client&&inv.client.phone)||vivo.phone||"";
  var raw=tel.replace(/[^\d+]/g,"");
  if(!raw) return "";
  if(raw.charAt(0)==="+") return raw.slice(1).replace(/\D/g,"");
  var d=raw.replace(/\D/g,"");
  if(!d) return "";
  var pre=String(state.settings.countryCode||"").replace(/\D/g,"");
  /* un número corto es local: le anteponemos el prefijo del país */
  return (pre && d.length<=9) ? pre+d : d;
}
/* Para enseñarlo respetamos cómo está escrito el teléfono y solo añadimos
   el prefijo del país cuando falta: agrupar a ciegas parte mal los de fuera. */
function waDisplay(inv){
  if(!waNumber(inv)) return "";
  var vivo=company(inv.companyId)||{};
  var raw=(((inv.client&&inv.client.phone)||vivo.phone||"")+"").trim();
  if(raw.charAt(0)==="+") return raw;
  var pre=String(state.settings.countryCode||"").replace(/\D/g,"");
  return (pre?"+"+pre+" ":"")+raw;
}
function waText(inv){
  var st=state.settings;
  var l=["Hola"+((inv.client&&inv.client.contact)?" "+inv.client.contact:"")+":",
    "",
    "Te paso la factura "+inv.number+" de las comidas de "+monthLabel(inv.period)+".",
    "Subtotal: "+eur(inv.base),
    "IGI: "+eur(inv.igi),
    "TOTAL: "+eur(inv.total),
    ];
  if(inv.iban) l.push("IBAN: "+inv.iban);
  l.push("", "Te adjunto el PDF." , (st.name||""));
  return l.join("\n");
}
function openExternal(url, aviso){
  var w=null;
  try{ w=window.open(url,"_blank","noopener"); }catch(e){}
  if(!w){
    var a=document.createElement("a");
    a.href=url; a.target="_blank"; a.rel="noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  }
  if(aviso) toast(aviso);
}
function openMail(inv){
  var destinos=destinatariosElegidos(inv);
  if(!destinos.length){
    toast("Marca al menos un correo, o escribe uno en «Otro correo».", true);
    var otro=document.getElementById("otroCorreo"); if(otro) otro.focus();
    return;
  }
  var m=mailText(inv, destinos);
  var desde=(ui.remitente && ui.remitente!=="__mailto__") ? ui.remitente : "";
  var cuenta=remitentesDe(inv.issuer).indexOf(desde);
  openExternal(urlDelCorreo(desde, destinos, m.subject, m.body, cuenta),
    (desde ? "Se abre con "+desde+". " : "")+
    (destinos.length>1
      ? "Van "+destinos.length+" destinatarios. Adjunta el PDF antes de enviar."
      : "Adjunta el PDF antes de enviar."));
}
/* ¿Es un móvil o tablet que puede mandar el PDF dentro del correo? */
function movilComparte(){
  var tactil=false;
  try{ tactil = window.matchMedia("(pointer:coarse)").matches; }catch(e){}
  return tactil && canShareFiles();
}
/* Enviar por correo de una vez.
   En el móvil: copia los correos y abre el menú de compartir con el PDF
   (y las fotos) dentro, para mandarlo con Mail, Gmail u Outlook.
   En el ordenador: baja el PDF y abre el correo ya escrito con los
   destinatarios; lo único que queda es adjuntar el PDF. Al acabar se
   puede apuntar que la factura ya está enviada. */
function enviarPorCorreo(inv, dlg){
  var destinos=destinatariosElegidos(inv);
  if(!destinos.length){
    toast("Marca al menos un correo, o escribe uno en el hueco de «Más correos».", true);
    var otro=document.getElementById("otroCorreo"); if(otro) otro.focus();
    return;
  }
  if(movilComparte()){
    try{ navigator.clipboard.writeText(destinos.join(", ")).catch(function(){}); }catch(e){}
    shareInvoice(inv).then(function(ok){ if(ok) preguntarEnviada(inv, destinos, dlg); });
    return;
  }
  downloadInvoice(inv, "pdf");
  openMail(inv);
  var nombre=invFilename(inv, "pdf");
  openDialog("Adjunta el PDF y envía",
    '<ol style="margin:0;padding-left:20px;line-height:1.7">'+
      '<li>Se ha abierto el correo ya escrito, para <b>'+esc(destinos.join(", "))+'</b>.</li>'+
      '<li>En el correo, pulsa <b>📎 Adjuntar</b>.</li>'+
      '<li>Entra en <b>Descargas</b> y elige <b>'+esc(nombre)+'</b>'+(llevaFotos(inv)?' (y las fotos de '+esc(monthLabel(inv.period))+')':'')+'.</li>'+
      '<li>Dale a <b>Enviar</b>.</li>'+
    '</ol>'+
    '<p class="section-note" style="margin:12px 0 0">Truco: también puedes arrastrar el PDF desde la barra de descargas del navegador hasta el correo.</p>'+
    '<p class="section-note" style="margin:8px 0 0">¿No se ha abierto el correo? <button class="inline-link" data-reabrir>Ábrelo otra vez</button>.</p>',
    function(){ marcarEnviada(inv, destinos, dlg); },
    {okLabel:"Ya la he enviado"});
  var re=document.querySelector("#dlg [data-reabrir]");
  if(re) re.addEventListener("click", function(){ openMail(inv); });
}
function preguntarEnviada(inv, destinos, dlg){
  openDialog("¿Se ha enviado?",
    '<p style="margin:0">Si has mandado la factura '+esc(inv.number)+', la dejo apuntada como enviada para que no se te olvide ni la mandes dos veces.</p>',
    function(){ marcarEnviada(inv, destinos, dlg); },
    {okLabel:"Sí, enviada"});
}
function marcarEnviada(inv, destinos, dlg){
  var real=(state.invoices||[]).filter(function(x){ return x.id===inv.id; })[0] || inv;
  real.sentAt=todayISO(); real.sentTo=destinos.slice();
  if(real!==inv){ inv.sentAt=real.sentAt; inv.sentTo=real.sentTo; }
  touch(); render();
  if(dlg){
    var caja=dlg.querySelector(".send-box");
    if(caja){ var nueva=document.createElement("div"); nueva.innerHTML=sendBoxHTML(inv); caja.replaceWith(nueva.firstChild); engancharEnvio(dlg, inv); }
  }
  toast("Factura "+inv.number+" apuntada como enviada");
}
function openWhatsApp(inv){
  var tel=waNumber(inv);
  openExternal("https://wa.me/"+tel+"?text="+encodeURIComponent(waText(inv)),
    tel ? "Adjunta el PDF en el chat antes de enviar." : "Elige el contacto en WhatsApp y adjunta el PDF.");
}
async function shareInvoice(inv){
  try{
    var files;
    if(llevaFotos(inv)){
      files=(pdfListo && pdfListo.clave===clavePdf(inv)) ? pdfListo.files : null;
      if(!files){
        toast("Preparando las fotos… vuelve a pulsar en un momento.");
        prepararPdf(inv).then(function(){ toast("Listo. Pulsa «Compartir PDF»."); })
          .catch(function(){ toast("No se pudieron preparar las fotos. Mira la conexión.", true); });
        return;
      }
    } else {
      files=[new File([buildPDF(layoutInvoice(inv))], invFilename(inv,"pdf"), {type:"application/pdf"})];
    }
    if(!(navigator.canShare && navigator.canShare({files:files}))){
      if(files.length>1 && navigator.canShare({files:[files[0]]})){
        files.slice(1).forEach(function(f,i){ setTimeout(function(){ descargarArchivo(f.name, f, f.type); }, 400*i); });
        files=[files[0]];
        toast("Las fotos se han descargado: adjúntalas también.", true);
      } else { toast("Este dispositivo no permite compartir archivos.", true); return; }
    }
    await navigator.share({files:files, title:"Factura "+inv.number, text:waText(inv)});
    return true;
  }catch(e){
    if(e && (e.name==="AbortError")) return;
    toast("No se pudo compartir aquí. Descarga el PDF y adjúntalo a mano.", true);
  }
}
function invTaxes(inv){
  if(inv.taxes && inv.taxes.length) return inv.taxes;
  return [{rate:inv.igiRate, base:inv.base, amount:inv.igi}];
}
function invoiceHTML(inv){
  var i=inv.issuer||{}, c=inv.client||{};
  var rows=inv.lines.map(function(l,ix){
    var cont=sigueAlb(inv.lines[ix-1], l);
    return "<tr"+grpCls(inv.lines,ix)+"><td>"+(cont?"":esc(dmy(l.date)))+'</td><td class="mono">'+(cont?"":esc(l.albaran||"—"))+"</td><td>"+esc(l.desc)+
      '</td><td class="num">'+num(l.diners)+'</td><td class="num">'+eur(l.price)+
      '</td><td class="num">'+((+l.extra||0)?eur(l.extra):"—")+'</td><td class="num">'+
      eur(l.amount==null?l.base:l.amount)+"</td></tr>";
  }).join("");
  var gross=!!inv.gross;
  return '<div class="paper">'+
    '<div class="p-top"><div class="issuer"><div class="nm">'+esc(i.name||"—")+"</div>"+
      (i.nrt?"<div>NRT "+esc(i.nrt)+"</div>":"")+
      (i.address?"<div>"+esc(i.address)+"</div>":"")+
      (i.city?"<div>"+esc(i.city)+"</div>":"")+
      (i.phone?"<div>Tel. "+esc(i.phone)+"</div>":"")+
      (i.email?"<div>"+esc(i.email)+"</div>":"")+
    '</div><div class="inv-box"><div class="ttl">FACTURA</div><div class="no">'+esc(inv.number)+"</div>"+
      '<div class="dt">Fecha de emisión: '+esc(dmy(inv.date))+"</div></div></div>"+
    '<div class="bill-to"><div class="k">Facturar a</div><div class="nm">'+esc(c.name||"—")+"</div>"+
      (c.nrt?"<div>NRT "+esc(c.nrt)+"</div>":"")+
      (c.address?"<div>"+esc(c.address)+(c.city?", "+esc(c.city):"")+"</div>":"")+
    "</div>"+
    '<p style="margin:14px 0 0; font-size:12.5px; color:#5B4E50">Servicio de comidas para personal — periodo de <strong>'+esc(monthLabel(inv.period))+
      "</strong>. "+num(nAlb(inv.lines))+" albaranes, "+num(inv.diners)+" comensales."+
      (gross?" Importes con el IGI incluido.":"")+"</p>"+
    '<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Nº albarán</th><th>Concepto</th>'+
      '<th class="num">Comens.</th><th class="num">€/pers.</th><th class="num">Extras</th>'+
      '<th class="num">Importe</th></tr></thead><tbody>'+rows+"</tbody></table></div>"+
    '<div class="totals">'+
      '<div class="r"><span>Subtotal (base imponible)</span><span>'+eur(inv.base)+"</span></div>"+
      invTaxes(inv).map(function(tx){
        return '<div class="r"><span>IGI '+esc(pct(tx.rate))+(invTaxes(inv).length>1?" sobre "+eur(tx.base):"")+
               "</span><span>"+eur(tx.amount)+"</span></div>";
      }).join("")+
      '<div class="r grand"><span>TOTAL A PAGAR</span><span>'+eur(inv.total)+"</span></div>"+
    "</div>"+
    (function(){
      var texto=cierreDeFactura(inv);
      return texto ? '<div class="p-cierre" style="white-space:pre-wrap">'+esc(texto)+'</div>' : "";
    })()+
    '<div class="p-foot"><div><div class="k">Forma de pago</div><div>'+esc(inv.terms||"—")+"</div>"+
      (inv.iban?'<div class="k" style="margin-top:8px">IBAN</div><div class="mono">'+esc(inv.iban)+"</div>":"")+
      "</div>"+
      '<div><div style="margin-top:8px">Factura sujeta a IGI. Conserve este documento como justificante.</div></div></div>'+
  "</div>";
}

/* ============================ email text ============================ */
function mailText(inv, destinos){
  var c=inv.client||{};
  var para=(destinos && destinos.length) ? destinos : correosDeFactura(inv);
  var subject="Factura "+inv.number+" — "+(inv.issuer&&inv.issuer.name?inv.issuer.name:"")+" — "+monthLabel(inv.period);
  var body=(state.settings.mailIntro||"")+"\n\n"+
    "Factura: "+inv.number+"\n"+
    "Periodo: "+monthLabel(inv.period)+"\n"+
    "Albaranes: "+nAlb(inv.lines)+"  ·  Comensales: "+num(inv.diners)+"\n"+
    "Subtotal (base imponible): "+eur(inv.base)+"\n"+
    invTaxes(inv).map(function(tx){ return "IGI "+pct(tx.rate)+": "+eur(tx.amount)+"\n"; }).join("")+
    "TOTAL: "+eur(inv.total)+"\n"+
    (inv.iban?"IBAN: "+inv.iban+"\n":"")+
    "\n"+(inv.issuer&&inv.issuer.name?inv.issuer.name:"")+(inv.issuer&&inv.issuer.phone?" · "+inv.issuer.phone:"");
  return {to:para.join(","), subject:subject, body:body, lista:para};
}
async function copyMail(inv){
  var m=mailText(inv, destinatariosElegidos(inv));
  var txt="Para: "+(m.lista.join(", ")||"(sin correo guardado)")+"\nAsunto: "+m.subject+"\n\n"+m.body;
  var ok=false;
  try{ await navigator.clipboard.writeText(txt); ok=true; }catch(e){
    try{
      var ta=document.createElement("textarea"); ta.value=txt;
      ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta);
      ta.select(); ok=document.execCommand("copy"); ta.remove();
    }catch(e2){ ok=false; }
  }
  if(ok) toast("Correo copiado: pégalo en tu gestor de correo y adjunta el PDF");
  else openDialog("Texto del correo",
    '<p class="section-note">Copia este texto a mano y adjunta el PDF descargado.</p>'+
    '<textarea rows="14" readonly>'+esc(txt)+"</textarea>", function(){});
}

/* ============================ invoice layout → draw ops ============================ */
var PAGE={w:595.28,h:841.89,m:46};
var C_INK=[0.13,0.11,0.11], C_MUT=[0.36,0.31,0.31], C_ACC=[0.48,0.18,0.23], C_LINE=[0.79,0.75,0.74], C_SOFT=[0.97,0.965,0.96];
/* opts.label: rótulo del ejemplar ("ORIGINAL" / "COPIA…") en la factura en papel.
   opts.paper: reserva sitio al pie para los recuadros de firma y sello. */
function layoutInvoice(inv, opts){
  opts=opts||{};
  var pages=[], ops=[], y, i=inv.issuer||{}, c=inv.client||{}, gross=!!inv.gross;
  var L=PAGE.m, R=PAGE.w-PAGE.m;
  function T(v,x,yy,s,b,col,a){ ops.push({t:"text",v:String(v),x:x,y:yy,s:s,b:!!b,c:col||C_INK,a:a||"left"}); }
  function LN(x1,yy,x2,y2,w,col){ ops.push({t:"line",x1:x1,y1:yy,x2:x2,y2:y2,w:w||0.6,c:col||C_LINE}); }
  function RC(x,yy,w,h,col){ ops.push({t:"rect",x:x,y:yy,w:w,h:h,c:col}); }

  /* header */
  y=PAGE.m+6;
  T(i.name||"—", L, y, 17, true); y+=15;
  [i.nrt?"NRT "+i.nrt:"", i.address, i.city, i.phone?"Tel. "+i.phone:"", i.email].forEach(function(l){
    if(l){ T(l, L, y, 8.6, false, C_MUT); y+=10.5; }
  });
  var yh=PAGE.m+6;
  T("FACTURA", R, yh+1, 21, true, C_ACC, "right"); yh+=22;
  T(inv.number, R, yh, 12, true, C_INK, "right"); yh+=15;
  T("Fecha de emisión: "+dmy(inv.date), R, yh, 8.6, false, C_MUT, "right"); yh+=11;
  if(opts.label){
    var lw=textW(opts.label,7.6,true)+14;
    RC(R-lw, yh-2, lw, 14, C_ACC);
    T(opts.label, R-7, yh+8, 7.6, true, [1,1,1], "right"); yh+=18;
  }
  y=Math.max(y,yh)+16;

  /* bill to */
  var boxTop=y, lines=[];
  if(c.nrt) lines.push("NRT "+c.nrt);
  if(c.address) lines.push(c.address+(c.city?", "+c.city:""));
  else if(c.city) lines.push(c.city);
  var boxH=26+lines.length*11;
  RC(L, boxTop, R-L, boxH, C_SOFT);
  RC(L, boxTop, 2.4, boxH, C_ACC);
  T("FACTURAR A", L+11, boxTop+12, 7.6, true, C_ACC);
  T(c.name||"—", L+11, boxTop+25, 11.5, true);
  lines.forEach(function(l,k){ T(l, L+11, boxTop+37+k*11, 8.8, false, C_MUT); });
  y=boxTop+boxH+18;

  T("Servicio de comidas para personal — periodo de "+monthLabel(inv.period)+"."+
    (gross?" Importes con el IGI incluido.":""), L, y, 9.2, false, C_MUT);
  T(nAlb(inv.lines)+" albaranes · "+num(inv.diners)+" comensales", R, y, 9.2, false, C_MUT, "right");
  y+=16;

  /* table */
  /* Bordes de columna. Los cuatro numeros van alineados a la derecha, y
     al concepto le queda el hueco entre el albaran y los comensales. */
  var COL={fecha:L, alb:L+56, desc:L+138, com:L+292, pri:L+346, ext:L+400, imp:R};
  function tableHead(){
    RC(L, y-10, R-L, 15, C_SOFT);
    T("FECHA", COL.fecha+2, y, 7.4, true, C_MUT);
    T("Nº ALBARÁN", COL.alb, y, 7.4, true, C_MUT);
    T("CONCEPTO", COL.desc, y, 7.4, true, C_MUT);
    T("COMENS.", COL.com+38, y, 7.4, true, C_MUT, "right");
    T("€/PERS.", COL.pri+52, y, 7.4, true, C_MUT, "right");
    T("EXTRAS", COL.ext+52, y, 7.4, true, C_MUT, "right");
    T("IMPORTE", COL.imp-2, y, 7.4, true, C_MUT, "right");
    y+=6; LN(L,y,R,y,0.7,C_LINE); y+=13;
  }
  tableHead();
  var reserve=opts.paper?95:0;           /* sitio para firma y sello al pie */
  var maxY=PAGE.h-PAGE.m-120-reserve;
  inv.lines.forEach(function(l,ix){
    var cont=sigueAlb(inv.lines[ix-1], l), abre=sigueAlb(l, inv.lines[ix+1]);
    if(y>maxY){
      cont=false;
      T("Continúa en la página siguiente", R, PAGE.h-PAGE.m-10, 8, false, C_MUT, "right");
      pages.push(ops); ops=[]; y=PAGE.m+10; tableHead(); maxY=PAGE.h-PAGE.m-60-reserve;
    }
    if(!cont){
      T(dmy(l.date), COL.fecha+2, y, 9);
      T(l.albaran||"—", COL.alb, y, 9);
    }
    T(clip(l.desc||"", 26), COL.desc, y, 9);
    T(num(l.diners), COL.com+38, y, 9, false, C_INK, "right");
    T(eur(l.price), COL.pri+52, y, 9, false, C_INK, "right");
    T((+l.extra||0)?eur(l.extra):"—", COL.ext+52, y, 9, false, C_INK, "right");
    T(eur(l.amount==null?l.base:l.amount), COL.imp-2, y, 9, false, C_INK, "right");
    if(abre){ y+=14; }
    else { y+=5; LN(L,y,R,y,0.35,[0.9,0.88,0.87]); y+=12; }
  });

  /* totals */
  y+=8;
  if(y>PAGE.h-PAGE.m-120){ pages.push(ops); ops=[]; y=PAGE.m+20; }
  var tw=230, tx=R-tw;
  T("Subtotal (base imponible)", tx, y, 9.5, false, C_MUT); T(eur(inv.base), R-2, y, 9.5, false, C_INK, "right"); y+=15;
  var txs=invTaxes(inv);
  txs.forEach(function(item){
    T("IGI "+pct(item.rate)+(txs.length>1?" sobre "+eur(item.base):""), tx, y, 9.5, false, C_MUT);
    T(eur(item.amount), R-2, y, 9.5, false, C_INK, "right"); y+=15;
  });
  y-=6; LN(tx,y,R,y,0.5,C_LINE); y+=8;
  RC(tx, y-2, tw, 26, C_ACC);
  T("TOTAL A PAGAR", tx+10, y+15, 10.5, true, [1,1,1]);
  T(eur(inv.total), R-10, y+15, 12.5, true, [1,1,1], "right");
  y+=44;

  /* El texto de cierre, antes del pie de pago */
  var textoCierre=cierreDeFactura(inv);
  if(textoCierre){
    LN(L,y,R,y,0.5,C_LINE); y+=15;
    lineasDeTexto(textoCierre, R-L, 9).forEach(function(linea){
      if(y>PAGE.h-PAGE.m-70){ pages.push(ops); ops=[]; y=PAGE.m+20; }
      if(linea) T(linea, L, y, 9);
      y+=12;
    });
    y+=6;
  }

  /* footer */
  LN(L,y,R,y,0.5,C_LINE); y+=14;
  T("FORMA DE PAGO", L, y, 7.4, true, C_MUT); y+=12;
  T(inv.terms||"—", L, y, 9); y+=12;
  if(inv.iban){ T("IBAN", L, y, 7.4, true, C_MUT); y+=11; T(inv.iban, L, y, 9); y+=12; }
  T("Factura sujeta a IGI. Conserve este documento como justificante.", L, y+4, 8, false, C_MUT);

  if(opts.paper){
    y+=22;
    if(y>PAGE.h-PAGE.m-80){ pages.push(ops); ops=[]; y=PAGE.m+20; }
    var bw=(R-L-16)/2, bh=58;
    [[L,"FIRMA Y SELLO DEL EMISOR",""],
     [L+bw+16,"RECIBÍ CONFORME","Nombre, fecha y firma de quien recibe"]].forEach(function(b){
      LN(b[0], y, b[0]+bw, y, 0.5, C_LINE);
      LN(b[0], y, b[0], y+bh, 0.5, C_LINE);
      LN(b[0]+bw, y, b[0]+bw, y+bh, 0.5, C_LINE);
      LN(b[0], y+bh, b[0]+bw, y+bh, 0.5, C_LINE);
      T(b[1], b[0]+9, y+13, 7.4, true, C_MUT);
      if(b[2]) T(b[2], b[0]+9, y+bh-8, 7.6, false, C_LINE);
    });
  }
  pages.push(ops);
  return pages;
}
/* Ejemplar en papel: original para el cliente y, si procede, copia para el archivo. */
function layoutPaper(inv, withCopy){
  var pages=layoutInvoice(inv,{paper:true, label:"ORIGINAL · PARA EL CLIENTE"});
  if(withCopy) pages=pages.concat(layoutInvoice(inv,{paper:true, label:"COPIA · PARA EL EMISOR"}));
  return pages;
}
function clip(s,n){ return s.length>n ? s.slice(0,n-1)+"…" : s; }

/* ============================ PDF writer ============================ */
var HW=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
var HB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
/* Parte un texto en líneas que quepan en el ancho dado. Respeta los
   saltos que ya trae escritos: el pie de la factura es una carta, no un
   párrafo suelto. */
function lineasDeTexto(texto, ancho, size){
  var salida=[];
  String(texto).split("\n").forEach(function(parrafo){
    if(!parrafo.trim()){ salida.push(""); return; }
    var linea="";
    parrafo.split(/\s+/).forEach(function(palabra){
      var prueba = linea ? linea+" "+palabra : palabra;
      if(textW(prueba, size, false) > ancho && linea){ salida.push(linea); linea=palabra; }
      else linea=prueba;
    });
    if(linea) salida.push(linea);
  });
  return salida;
}

function charW(ch,bold){
  var t=bold?HB:HW, cc=ch.charCodeAt(0);
  if(cc>=32&&cc<=126) return t[cc-32];
  if(ch==="€") return bold?556:556;
  var base=ch.normalize("NFD").charAt(0), bc=base.charCodeAt(0);
  if(bc>=32&&bc<=126) return t[bc-32];
  return bold?611:556;
}
function textW(str,size,bold){
  var w=0; for(var i=0;i<str.length;i++) w+=charW(str.charAt(i),bold);
  return w*size/1000;
}
var CP1252={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
function pdfString(str){
  var out=[];
  for(var i=0;i<str.length;i++){
    var ch=str.charAt(i), cc=ch.charCodeAt(0), b;
    if(CP1252[ch]!==undefined) b=CP1252[ch];
    else if(cc<=255) b=cc;
    else{ var base=ch.normalize("NFD").charAt(0); b=base.charCodeAt(0)<=255?base.charCodeAt(0):63; }
    if(b===40||b===41||b===92) out.push(92);
    out.push(b);
  }
  return out;
}
function fmt(n){ return (Math.round(n*100)/100).toString(); }
function buildPDF(pages){
  var chunks=[], len=0;
  function push(bytes){ chunks.push(bytes); len+=bytes.length; }
  function pushStr(s){ var a=[]; for(var i=0;i<s.length;i++) a.push(s.charCodeAt(i)&0xFF); push(a); }
  var offsets=[];
  pushStr("%PDF-1.4\n%âãÏÓ\n");

  /* Las fotos van como imágenes JPEG tal cual (DCTDecode): una por
     objeto, al final, y cada página dice cuáles usa. */
  var imgs=[];
  pages.forEach(function(ops){ ops.forEach(function(o){ if(o.t==="img" && imgs.indexOf(o.img)<0) imgs.push(o.img); }); });

  /* objetos: 1 catálogo, 2 árbol de páginas, 3 y 4 fuentes, 2 por página y 1 por imagen */
  var nPages=pages.length;
  var fontR=3, fontB=4, firstPage=5, firstImg=firstPage+nPages*2;
  var lastObj=firstImg+imgs.length-1;
  function obj(num, bodyBytes){
    offsets[num]=len;
    pushStr(num+" 0 obj\n"); push(bodyBytes); pushStr("\nendobj\n");
  }
  function strBytes(s){ var a=[]; for(var i=0;i<s.length;i++) a.push(s.charCodeAt(i)&0xFF); return a; }

  var kids=[];
  for(var k=0;k<nPages;k++) kids.push((firstPage+k*2)+" 0 R");
  obj(1, strBytes("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, strBytes("<< /Type /Pages /Count "+nPages+" /Kids ["+kids.join(" ")+"] >>"));
  obj(fontR, strBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  obj(fontB, strBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

  for(var pi=0; pi<nPages; pi++){
    var pnum=firstPage+pi*2, cnum=pnum+1;
    var usadas=[];
    pages[pi].forEach(function(o){ if(o.t==="img" && usadas.indexOf(o.img)<0) usadas.push(o.img); });
    var xobj=usadas.length ? " /XObject << "+usadas.map(function(im){
      var n=imgs.indexOf(im); return "/Im"+n+" "+(firstImg+n)+" 0 R"; }).join(" ")+" >>" : "";
    obj(pnum, strBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+fmt(PAGE.w)+" "+fmt(PAGE.h)+"] "+
      "/Resources << /Font << /F1 "+fontR+" 0 R /F2 "+fontB+" 0 R >>"+xobj+" >> /Contents "+cnum+" 0 R >>"));
    var stream=[];
    function put(s){ var a=strBytes(s); for(var i=0;i<a.length;i++) stream.push(a[i]); }
    pages[pi].forEach(function(o){
      if(o.t==="img"){
        put("q "+fmt(o.w)+" 0 0 "+fmt(o.h)+" "+fmt(o.x)+" "+fmt(PAGE.h-o.y-o.h)+" cm /Im"+imgs.indexOf(o.img)+" Do Q\n");
      } else if(o.t==="rect"){
        put(fmt(o.c[0])+" "+fmt(o.c[1])+" "+fmt(o.c[2])+" rg\n");
        put(fmt(o.x)+" "+fmt(PAGE.h-o.y-o.h)+" "+fmt(o.w)+" "+fmt(o.h)+" re f\n");
      } else if(o.t==="line"){
        put(fmt(o.c[0])+" "+fmt(o.c[1])+" "+fmt(o.c[2])+" RG "+fmt(o.w)+" w\n");
        put(fmt(o.x1)+" "+fmt(PAGE.h-o.y1)+" m "+fmt(o.x2)+" "+fmt(PAGE.h-o.y2)+" l S\n");
      } else {
        var w=textW(o.v,o.s,o.b), x=o.x;
        if(o.a==="right") x=o.x-w; else if(o.a==="center") x=o.x-w/2;
        put(fmt(o.c[0])+" "+fmt(o.c[1])+" "+fmt(o.c[2])+" rg\n");
        put("BT /"+(o.b?"F2":"F1")+" "+fmt(o.s)+" Tf 1 0 0 1 "+fmt(x)+" "+fmt(PAGE.h-o.y)+" Tm (");
        var sb=pdfString(o.v); for(var q=0;q<sb.length;q++) stream.push(sb[q]);
        put(") Tj ET\n");
      }
    });
    var head=strBytes("<< /Length "+stream.length+" >>\nstream\n");
    var tail=strBytes("\nendstream");
    var body=head.concat(stream, tail);
    obj(cnum, body);
  }

  imgs.forEach(function(im, n){
    var num=firstImg+n;
    offsets[num]=len;
    pushStr(num+" 0 obj\n<< /Type /XObject /Subtype /Image /Width "+im.pw+" /Height "+im.ph+
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+im.data.length+" >>\nstream\n");
    push(im.data);
    pushStr("\nendstream\nendobj\n");
  });

  var xrefPos=len;
  var total=lastObj+1;                  /* entradas del xref: el objeto libre 0 más cada objeto */
  pushStr("xref\n0 "+total+"\n0000000000 65535 f \n");
  for(var n=1;n<=lastObj;n++){
    var off=offsets[n]||0, s=String(off); while(s.length<10) s="0"+s;
    pushStr(s+" 00000 n \n");
  }
  pushStr("trailer\n<< /Size "+total+" /Root 1 0 R >>\nstartxref\n"+xrefPos+"\n%%EOF");

  var out=new Uint8Array(len), pos=0;
  chunks.forEach(function(c){ out.set(c, pos); pos+=c.length; });
  return out;
}

/* ============================ PNG renderer (fallback) ============================ */
function renderPNG(pages){
  return new Promise(function(resolve){
    var sc=2, gap=16;
    var cv=document.createElement("canvas");
    cv.width=Math.round(PAGE.w*sc);
    cv.height=Math.round((PAGE.h*pages.length + gap*(pages.length-1))*sc);
    var ctx=cv.getContext("2d");
    ctx.fillStyle="#EDE9E7"; ctx.fillRect(0,0,cv.width,cv.height);
    pages.forEach(function(ops,pi){
      var oy=pi*(PAGE.h+gap);
      ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,oy*sc,PAGE.w*sc,PAGE.h*sc);
      ops.forEach(function(o){
        if(o.t==="img") return;
        var col=function(c){ return "rgb("+Math.round(c[0]*255)+","+Math.round(c[1]*255)+","+Math.round(c[2]*255)+")"; };
        if(o.t==="rect"){ ctx.fillStyle=col(o.c); ctx.fillRect(o.x*sc,(o.y+oy)*sc,o.w*sc,o.h*sc); }
        else if(o.t==="line"){
          ctx.strokeStyle=col(o.c); ctx.lineWidth=Math.max(1,o.w*sc);
          ctx.beginPath(); ctx.moveTo(o.x1*sc,(o.y1+oy)*sc); ctx.lineTo(o.x2*sc,(o.y2+oy)*sc); ctx.stroke();
        } else {
          ctx.fillStyle=col(o.c);
          ctx.font=(o.b?"700 ":"400 ")+(o.s*sc)+'px Helvetica, Arial, sans-serif';
          ctx.textAlign=o.a==="right"?"right":(o.a==="center"?"center":"left");
          ctx.textBaseline="alphabetic";
          ctx.fillText(o.v, o.x*sc, (o.y+oy)*sc);
        }
      });
    });
    cv.toBlob(function(b){ resolve(b); }, "image/png");
  });
}

/* ============================ download ============================ */
function invFilename(inv, ext){
  var who=(inv.client&&inv.client.name?inv.client.name:"cliente").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"");
  return ("Factura-"+inv.number+"-"+who).slice(0,80)+"."+ext;
}
async function downloadInvoice(inv, kind){
  var paper=(kind==="paper");
  var pages=paper ? layoutPaper(inv, state.settings.paperCopy!==false) : layoutInvoice(inv);
  try{
    if(kind==="pdf"||paper){
      var bytes=buildPDF(pages);
      descargarArchivo(invFilename(inv, paper?"papel.pdf":"pdf"), bytes, "application/pdf");
      var fa=[];
      if(!paper && llevaFotos(inv)){
        toast("Preparando las fotos…");
        fa=await archivosDeFotos(inv);
        var compartibles=false;
        try{ compartibles=!fotosEnZip() && fa.length && canShareFiles() && navigator.canShare({files:fa}); }catch(e){}
        if(compartibles){
          /* En el móvil solo baja un archivo de golpe: las fotos sueltas se
             guardan todas de una vez desde el menú de compartir. */
          openDialog("Guardar las fotos",
            '<p style="margin:0">La factura ya está bajada. El móvil no deja bajar '+fa.length+(fa.length>1?" fotos":" foto")+' de golpe: '+
            'toca <b>Guardar</b> y elige <b>Guardar '+(fa.length>1?"imágenes":"imagen")+'</b> (o la carpeta donde quieras tenerlas).</p>',
            function(){ navigator.share({files:fa}).catch(function(){}); },
            {okLabel:"Guardar "+(fa.length>1?"las "+fa.length+" fotos":"la foto")});
          return;
        }
        fa.forEach(function(f,i){ setTimeout(function(){ descargarArchivo(f.name, f, f.type); }, 600+400*i); });
      }
      toast(paper ? "PDF listo: ábrelo y dale a imprimir en A4" :
            !fa.length ? "PDF descargado: adjúntalo al correo" :
            fotosEnZip() ? "Descargados la factura y la carpeta de fotos: adjunta los dos al correo"
                         : "Descargadas la factura y "+fa.length+(fa.length>1?" fotos":" foto")+": adjúntalas al correo");
    } else {
      var blob=await renderPNG(pages);
      descargarArchivo(invFilename(inv,"png"), blob, "image/png");
      toast("Imagen descargada");
    }
  }catch(e){
    toast("No se pudo generar el archivo. Vuelve a intentarlo.", true);
  }
}

/* ============================ go ============================ */
render();
boot();
})();
