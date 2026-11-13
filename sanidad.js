/* ================================================================
   CONTROL SANITARIO — el registro del día a día de la cocina para
   tenerlo al corriente si viene inspección: temperaturas de neveras y
   congeladores, plan de limpieza, mercancía recibida e incidencias.
   Todo se guarda en el repositorio privado de datos (sync.js).
   ================================================================ */
(function(){
"use strict";
/* Los estilos propios de la app van aquí también, para que se vea bien
   aunque el sanidad.html subido sea uno anterior. */
(function(){
  if(document.getElementById("sanidad-css")) return;
  var st=document.createElement("style"); st.id="sanidad-css";
  st.textContent="/* \u2500\u2500 Sanidad \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.quien{display:flex;align-items:center;gap:10px;margin:0 0 14px;max-width:420px}\n.quien .lbl{white-space:nowrap}\n.fila-eq{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;border-bottom:1px solid var(--linea-suave);flex-wrap:wrap}\n.fila-eq:last-of-type{border-bottom:0}\n.eq-nom{display:flex;flex-direction:column;min-width:150px}\n.eq-nom small{color:var(--muted);font-size:12px}\n.eq-ts{display:flex;gap:10px}\n.t-caja{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--muted);font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em}\n.t-caja input{width:96px;text-align:center;font-size:20px;font-weight:600;padding:8px 6px;font-family:var(--texto);border-width:1.5px}\n.t-caja small{font-size:10.5px;text-transform:none;letter-spacing:0;font-family:var(--texto)}\n.t-caja.bien input{border-color:var(--ok);background:var(--ok-suave);color:var(--ok)}\n.t-caja.mal input{border-color:var(--malo);background:var(--malo-suave);color:var(--malo)}\n.accion{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 4px 10px;font-size:13px}\n.tarea{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--linea-suave);cursor:pointer}\n.tarea:last-child{border-bottom:0}\n.tarea input{width:22px;height:22px;accent-color:var(--acento);flex:none;margin:0}\n.tarea .t-nom{flex:1;font-size:14.5px}\n.tarea .t-quien{font-size:12px;color:var(--muted);white-space:nowrap}\n.tarea.hecha .t-nom{color:var(--muted);text-decoration:line-through}\n.fila-rec{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--linea-suave);\n          background:transparent;padding:11px 4px;cursor:pointer;font:inherit;color:inherit;flex-wrap:wrap}\n.fila-rec:last-child{border-bottom:0}\n.fila-rec:hover{background:var(--sup2)}\n.meta-r{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center}\ntr.clic{cursor:pointer}\ntr.clic:hover td{background:var(--sup2)}\n.mes-t td,.mes-t th{padding:6px 8px}\n.mes-t tr.dom td{border-bottom:2px solid var(--linea)}\n.mes-t td.falta{color:var(--linea)}\n.mes-t td.t-mal{color:var(--malo);font-weight:700;background:var(--malo-suave)}\n.mes-l th,.mes-l td{padding:5px 4px}\n.mes-l td:first-child{min-width:170px;position:sticky;left:0;background:var(--sup);z-index:1}\n.mes-l th:first-child{position:sticky;left:0;background:var(--sup);z-index:1}\n.l-c{text-align:center;cursor:pointer;min-width:24px;font-weight:700;font-size:13px}\n.l-c.ok-c{color:var(--ok);background:var(--ok-suave)}\n.l-c.mal-c{color:var(--malo);background:var(--malo-suave)}\n.l-c.toca-c{color:var(--acento)}\nth.hoy-c{color:var(--acento)}\n.rapidas{display:flex;flex-wrap:wrap;gap:6px}\n.t-fila{display:flex;gap:4px;align-items:stretch}\n.rueda-btn{border:1.5px solid var(--linea);background:var(--sup);color:var(--acento);border-radius:var(--radio-s);width:40px;font-size:20px;cursor:pointer;padding:0}\n.rueda-btn:hover{border-color:var(--acento)}\n.dlg-rueda{max-width:340px}\n.rueda-caja{display:flex;flex-direction:column;align-items:center;gap:6px}\n.rueda-paso{width:120px;justify-content:center}\n.rueda-poner{width:200px;justify-content:center;padding:12px;font-size:16px;margin-top:4px}\n.dlg-rueda .dlg-pie{padding-top:8px;padding-bottom:8px}\n.rueda{position:relative;height:230px;width:200px;overflow-y:auto;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;\n       border:1px solid var(--linea);border-radius:12px;background:var(--sup2);scrollbar-width:none;outline:none}\n.rueda::-webkit-scrollbar{display:none}\n.rueda ul{list-style:none;margin:0;padding:92px 0}\n.rueda li{height:46px;line-height:46px;text-align:center;font-size:19px;scroll-snap-align:center;cursor:pointer;opacity:.45;font-variant-numeric:tabular-nums;transition:opacity .1s,font-size .1s}\n.rueda li.r-bien{color:var(--ok)}\n.rueda li.r-mal{color:var(--malo)}\n.dlg-sub{max-width:340px}\n.dlg-cab .reco{margin-left:auto;margin-right:6px;white-space:nowrap}\n.dlg-rueda .dlg-cab{gap:8px}\n.rueda li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px}\n.rueda li.sel{opacity:1;font-size:26px;font-weight:700}\n.rueda-marco{position:sticky;top:92px;height:46px;margin-bottom:-46px;border-top:2px solid var(--acento);border-bottom:2px solid var(--acento);pointer-events:none;z-index:1}\n.chips-q{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}\n.chip-q{border:1px solid var(--linea);background:var(--sup);color:var(--tinta);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}\n.chip-q.on,.chip-q:hover{border-color:var(--acento);background:var(--acento-suave);color:var(--acento);font-weight:600}\n.flechas{display:inline-flex;gap:2px;margin-right:8px;vertical-align:middle}\n.flechas .btn{padding:2px 7px;font-size:11px;line-height:1.4}\n.flechas .btn:disabled{opacity:.25;cursor:default}\n.btn.malo-f{background:var(--malo);border-color:var(--malo);color:#fff}\n.dos{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.tres{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}\n.seg{display:inline-flex;border:1px solid var(--linea);border-radius:8px;overflow:hidden}\n.seg button{border:0;background:var(--sup);padding:7px 12px;cursor:pointer;font-size:13px;color:var(--muted);border-right:1px solid var(--linea-suave)}\n.seg button:last-child{border-right:0}\n.seg button[aria-pressed=\"true\"]{background:var(--acento-suave);color:var(--acento);font-weight:600}\n.seg button:disabled{cursor:default}\n@media (max-width:560px){\n  .dos,.tres{grid-template-columns:1fr}\n  .eq-ts{width:100%;justify-content:flex-start}\n  .t-caja input{width:110px}\n  .quien{flex-direction:column;align-items:stretch;gap:4px}\n}\n";
  document.head.appendChild(st);
})();

var LS = "sanidad.libro.v1";
var TIPOS = {nevera:"Nevera", congelador:"Congelador", camara:"Cámara", otro:"Otro"};
var RANGO = {nevera:[0,4], congelador:[-25,-18], camara:[0,4], otro:[0,8]};
var FREC = {diaria:"Cada día", semanal:"Cada semana", mensual:"Cada mes"};
var DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
var DIAS_C = ["D","L","M","X","J","V","S"];
var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ── datos ─────────────────────────────────────────────────────── */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function inicial(){
  var eq=function(n,t){ return {id:uid(), nombre:n, tipo:t, min:RANGO[t][0], max:RANGO[t][1]}; };
  var ta=function(n,f,d){ return {id:uid(), nombre:n, frec:f, dia:d==null?null:d}; };
  return {
    equipos:[eq("Nevera cocina","nevera"), eq("Nevera bebidas","nevera"), eq("Cámara","camara"), eq("Congelador","congelador")],
    tareas:[ta("Superficies y mesas de trabajo","diaria"), ta("Suelos de cocina","diaria"), ta("Fregadero y lavavajillas","diaria"),
            ta("Cubos de basura","diaria"), ta("Baños","diaria"), ta("Campana y filtros","semanal",1),
            ta("Neveras por dentro","semanal",2), ta("Desagües","semanal",4), ta("Cámara a fondo","mensual",1),
            ta("Congelador a fondo","mensual",15)],
    temps:[], limpiezas:[], recepciones:[], incidencias:[], gente:[], turnos:"dos"
  };
}
var state;
try{ state=JSON.parse(localStorage.getItem(LS)||"null"); }catch(e){ state=null; }
if(!state || !Array.isArray(state.equipos)) state=inicial();
["temps","limpiezas","recepciones","incidencias","gente","tareas","equipos"].forEach(function(k){ if(!Array.isArray(state[k])) state[k]=[]; });
if(!state.turnos) state.turnos="dos";
/* Los encargados salen para elegirlos con un toque en «Recibe» */
if(!Array.isArray(state.encargados)) state.encargados=["Valeriano","Luis","Martin"];
state.encargados.forEach(function(n){ if(state.gente.indexOf(n)<0) state.gente.push(n); });
/* Desde cuándo se lleva el registro: lo de antes no cuenta como olvidado */
if(!state.desde){ state.desde=iso(new Date()); try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){} }
/* Si se apunta algo de antes de cuando se empezó, el registro empieza ese día */
function ajustarDesde(){
  var min=state.desde;
  ["temps","limpiezas","recepciones","incidencias"].forEach(function(k){ state[k].forEach(function(x){ if(x.fecha && x.fecha<min) min=x.fecha; }); });
  state.desde=min;
}
function guardar(){ ajustarDesde(); try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){ aviso("No se ha podido guardar.", true); } }

var hoy0=new Date();
var ui={vista:"hoy", fecha:iso(hoy0), mes:iso(hoy0).slice(0,7)};
var QUIEN_KEY="sanidad.quien";
function quien(){ try{ return localStorage.getItem(QUIEN_KEY)||""; }catch(e){ return ""; } }
function ponQuien(q){ try{ localStorage.setItem(QUIEN_KEY, q); }catch(e){} }

/* ── utilidades ────────────────────────────────────────────────── */
function $(s,r){ return (r||document).querySelector(s); }
function $$(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
function esc(t){ return String(t==null?"":t).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function iso(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function deIso(s){ var a=s.split("-"); return new Date(+a[0], +a[1]-1, +(a[2]||1)); }
function dm(s){ var d=deIso(s); return d.getDate()+"/"+(d.getMonth()+1); }
function largo(s){ var d=deIso(s); return DIAS[d.getDay()]+" "+d.getDate()+" de "+MESES[d.getMonth()]; }
function mesTxt(m){ var d=deIso(m+"-01"); return MESES[d.getMonth()]+" "+d.getFullYear(); }
function hora(){ var d=new Date(); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function num(v){ if(v==null||v==="") return null; var n=parseFloat(String(v).replace(",",".")); return isNaN(n)?null:n; }
function fmtT(n){ return (Math.round(n*10)/10).toString().replace(".",",")+" °C"; }
function diasMes(m){ var d=deIso(m+"-01"), out=[]; while(iso(d).slice(0,7)===m){ out.push(iso(d)); d.setDate(d.getDate()+1); } return out; }
function porId(l,id){ return l.filter(function(x){ return x.id===id; })[0]; }
var avisoT;
function aviso(msg, malo){
  var v=$(".aviso-flotante"); if(v) v.remove();
  var d=document.createElement("div"); d.className="aviso-flotante"+(malo?" malo":""); d.textContent=msg;
  document.body.appendChild(d); clearTimeout(avisoT); avisoT=setTimeout(function(){ d.remove(); }, malo?5000:2400);
}
function turnos(){ return state.turnos==="uno" ? [["m","Al abrir"]] : [["m","Mañana"],["t","Tarde"]]; }
function fuera(eq, v){ return v!=null && (v<eq.min || v>eq.max); }
function tempDe(f, eqId, t){ return state.temps.filter(function(x){ return x.fecha===f && x.equipo===eqId && x.turno===t; })[0]; }
function tocaHoy(ta, f){
  var d=deIso(f);
  if(ta.frec==="diaria") return true;
  if(ta.frec==="semanal") return d.getDay()===(ta.dia==null?1:+ta.dia);
  if(ta.frec==="mensual"){
    var dia=ta.dia==null?1:+ta.dia, ult=new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return d.getDate()===Math.min(dia, ult);
  }
  return false;
}
function limpiezaDe(f, taId){ return state.limpiezas.filter(function(x){ return x.fecha===f && x.tarea===taId; })[0]; }
function abiertas(){ return state.incidencias.filter(function(i){ return !i.cerrada; }); }

/* ── diálogos ──────────────────────────────────────────────────── */
function dialogo(titulo, cuerpo, botones){
  var v=$("#dlg"); if(v){ v.close(); v.remove(); }
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3><button class="btn suave" data-x>Cerrar</button></div>'+
    '<div class="dlg-cuerpo">'+cuerpo+'</div><div class="dlg-pie">'+(botones||"")+'</div>';
  document.body.appendChild(d);
  $$("[data-x]", d).forEach(function(b){ b.addEventListener("click", function(){ d.close(); }); });
  d.addEventListener("close", function(){ d.remove(); });
  d.showModal();
  return d;
}
function confirmar(titulo, texto, si, etq){
  var d=dialogo(titulo, '<p style="margin:0">'+texto+'</p>', '<button class="btn" data-x>Cancelar</button><button class="btn fuerte malo-f" data-si>'+esc(etq||"Borrar")+'</button>');
  $("[data-si]", d).addEventListener("click", function(){ d.close(); si(); });
}
function selGente(id, val){
  var l=state.gente.slice(); if(val && l.indexOf(val)<0) l.push(val);
  return '<input id="'+id+'" list="'+id+'_l" value="'+esc(val||"")+'" placeholder="Nombre" autocomplete="off">'+
    '<datalist id="'+id+'_l">'+l.map(function(g){ return '<option value="'+esc(g)+'">'; }).join("")+'</datalist>';
}
function apuntarGente(n){ n=(n||"").trim(); if(n && state.gente.indexOf(n)<0) state.gente.push(n); return n; }

/* ── armazón ───────────────────────────────────────────────────── */
var VISTAS=[["hoy","Hoy"],["temperaturas","Temperaturas"],["limpieza","Limpieza"],["recepcion","Mercancía recibida"],["incidencias","Incidencias"],["informe","Resumen del mes"],["ajustes","Ajustes"]];
function pendientesHoy(){
  var f=iso(new Date()), n=0;
  state.equipos.forEach(function(e){ turnos().forEach(function(t){ if(!tempDe(f,e.id,t[0])) n++; }); });
  state.tareas.forEach(function(ta){ if(tocaHoy(ta,f) && !limpiezaDe(f,ta.id)) n++; });
  return n;
}
function render(){
  var root=$("#root");
  var cuentas={hoy:pendientesHoy()||"", incidencias:abiertas().length||""};
  root.innerHTML=
    '<nav class="rail"><div class="marca"><span class="nom">Sanidad</span><span class="sub">Control de cocina</span></div>'+
      VISTAS.map(function(v){ return '<button class="nav" data-v="'+v[0]+'" aria-current="'+(ui.vista===v[0])+'"><span>'+v[1]+'</span><span class="cuenta">'+(cuentas[v[0]]||"")+'</span></button>'; }).join("")+
      '<div class="pie-rail"><span id="sync-estado" style="font-size:12px;color:var(--muted)"></span><a href="index.html">&#8592; Escritorio</a></div>'+
    '</nav><main id="main"></main>';
  $$("[data-v]", root).forEach(function(b){ b.addEventListener("click", function(){ ui.vista=b.getAttribute("data-v"); if(ui.vista==="hoy") ui.fecha=iso(new Date()); render(); window.scrollTo(0,0); }); });
  if(window.Sync && Sync.mostrarEstadoEn) Sync.mostrarEstadoEn($("#sync-estado"));
  ({hoy:vHoy, temperaturas:vTemps, limpieza:vLimpieza, recepcion:vRecepcion, incidencias:vIncidencias, informe:vInforme, ajustes:vAjustes})[ui.vista]($("#main"));
}
function refrescarRail(){
  var c={hoy:pendientesHoy()||"", incidencias:abiertas().length||""};
  $$("[data-v]").forEach(function(b){ var v=b.getAttribute("data-v"); if(v in c) b.querySelector(".cuenta").textContent=c[v]; });
}
function cabecera(t, p, extra){
  return '<div class="cabecera"><div><h1>'+t+'</h1>'+(p?'<p>'+p+'</p>':'')+'</div>'+(extra?'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+extra+'</div>':'')+'</div>';
}
function selMes(){
  return '<div class="seg"><button data-mes="-1" aria-label="Mes anterior">‹</button><button disabled style="min-width:130px;color:var(--tinta);font-weight:600">'+esc(mesTxt(ui.mes))+'</button><button data-mes="1" aria-label="Mes siguiente">›</button></div>';
}
function engancharMes(box, fn){
  $$("[data-mes]", box).forEach(function(b){ b.addEventListener("click", function(){
    var d=deIso(ui.mes+"-01"); d.setMonth(d.getMonth()+(+b.getAttribute("data-mes"))); ui.mes=iso(d).slice(0,7); fn(box);
  }); });
}

/* ── HOY ───────────────────────────────────────────────────────── */
function vHoy(box){
  var f=ui.fecha, esHoy=f===iso(new Date());
  var tt=turnos();
  var tareas=state.tareas.filter(function(ta){ return tocaHoy(ta,f); });
  var rec=state.recepciones.filter(function(r){ return r.fecha===f; });
  var inc=abiertas();
  box.innerHTML=
    cabecera(esHoy?"Hoy":"El "+esc(largo(f)), esHoy?esc(largo(f).replace(/^./,function(c){return c.toUpperCase();})):"Estás apuntando un día pasado. Para ir a otro, elige la fecha arriba o usa ‹ ›.",
      '<input type="date" id="ir_dia" max="'+iso(new Date())+'" value="'+f+'" aria-label="Ir a un día" title="Ir a cualquier día, también de meses atrás" style="width:auto;padding:6px 8px">'+
      '<div class="seg"><button data-dia="-1" aria-label="Día anterior">‹</button><button data-dia="0"'+(esHoy?' aria-pressed="true"':'')+'>Hoy</button><button data-dia="1" aria-label="Día siguiente"'+(esHoy?' disabled':'')+'>›</button></div>')+
    '<div class="quien"><label class="lbl" for="q_quien">¿Quién apunta?</label>'+selGente("q_quien", quien())+'</div>'+
    /* Temperaturas */
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>🌡️ Temperaturas</h2><span class="pista">'+state.equipos.length+' equipos · en rojo si se sale del límite</span></div>'+
      '<div class="tarjeta-cuerpo" style="padding:6px 12px">'+
      (state.equipos.length ? state.equipos.map(function(e){
        return '<div class="fila-eq"><div class="eq-nom"><b>'+esc(e.nombre)+'</b><small>'+esc(TIPOS[e.tipo]||"")+' · de '+fmtT(e.min)+' a '+fmtT(e.max)+(e.tipo==="congelador"?' · el menos se pone solo':'')+'</small></div>'+
          '<div class="eq-ts">'+tt.map(function(t){
            var r=tempDe(f,e.id,t[0]), v=r?r.valor:null, mal=fuera(e,v);
            return '<div class="t-caja'+(r?(mal?" mal":" bien"):"")+'"><span>'+t[1]+'</span>'+
              '<div class="t-fila"><input type="text" inputmode="decimal" data-eq="'+e.id+'" data-t="'+t[0]+'" value="'+(r?String(v).replace(".",","):"")+'" placeholder="'+(e.tipo==="congelador"?"−°C":"°C")+'" aria-label="'+esc(e.nombre+" "+t[1])+'">'+
              '<button type="button" class="rueda-btn" data-rueda="'+e.id+'|'+t[0]+'" aria-label="Elegir la temperatura de '+esc(e.nombre+" "+t[1])+' con la ruleta" title="Ruleta">⟳</button></div>'+
              (r?'<small>'+esc([r.hora,r.quien].filter(Boolean).join(" · "))+'</small>':'<small>&nbsp;</small>')+'</div>';
          }).join("")+'</div></div>'+
          tt.map(function(t){ var r=tempDe(f,e.id,t[0]); return (r && fuera(e,r.valor)) ? '<div class="accion"><span class="chapa malo">'+t[1]+': '+fmtT(r.valor)+'</span> '+
            (r.accion?'<span>Acción: '+esc(r.accion)+'</span> <button class="btn suave sm" data-acc="'+r.id+'">Cambiar</button>':'<button class="btn sm malo" data-acc="'+r.id+'">Apuntar qué se ha hecho</button>')+'</div>' : ''; }).join("");
      }).join("") : '<p class="nota" style="margin:10px 0">No hay equipos. Añádelos en Ajustes.</p>')+
    '</div></section>'+
    /* Limpieza */
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>🧽 Limpieza que toca '+(esHoy?'hoy':'ese día')+'</h2><span class="pista">'+
      tareas.filter(function(ta){ return limpiezaDe(f,ta.id); }).length+' de '+tareas.length+' hechas</span></div>'+
      '<div class="tarjeta-cuerpo" style="padding:4px 12px">'+
      (tareas.length ? '<datalist id="limp_g">'+state.gente.map(function(g){ return '<option value="'+esc(g)+'">'; }).join("")+'</datalist>'+
        tareas.map(function(ta){
        var l=limpiezaDe(f,ta.id);
        /* La casilla del nombre va fuera del label a propósito: dentro,
           tocarla marcaría y desmarcaría la tarea. */
        return '<div class="tarea'+(l?" hecha":"")+'">'+
          '<label style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer;margin:0">'+
            '<input type="checkbox" data-ta="'+ta.id+'"'+(l?" checked":"")+'>'+
            '<span class="t-nom">'+esc(ta.nombre)+(ta.frec!=="diaria"?' <span class="chapa neutra">'+esc(FREC[ta.frec])+'</span>':'')+'</span>'+
          '</label>'+
          (l ? '<input data-ql="'+l.id+'" list="limp_g" value="'+esc(l.quien||"")+'" placeholder="¿Quién la hizo?" autocomplete="off" '+
                 'style="width:130px;flex:none;font-size:13px;padding:5px 8px">'+
               (l.hora?'<span class="t-quien">'+esc(l.hora)+'</span>':'')
             : '<span class="t-quien"></span>')+
        '</div>';
      }).join("") : '<p class="nota" style="margin:10px 0">Ese día no toca ninguna limpieza.</p>')+
    '</div></section>'+
    /* Mercancía */
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>📦 Mercancía recibida</h2><button class="btn fuerte sm" data-rec-nueva>+ Apuntar entrega</button></div>'+
      '<div class="tarjeta-cuerpo" style="padding:4px 12px">'+
      (rec.length ? rec.map(filaRec).join("") : '<p class="nota" style="margin:10px 0">Nada apuntado '+(esHoy?'hoy':'ese día')+'. Al recibir un pedido: proveedor, temperatura si es de frío y si se acepta.</p>')+
    '</div></section>'+
    /* Incidencias */
    '<section class="tarjeta"><div class="tarjeta-cab"><h2>⚠️ Incidencias abiertas</h2><button class="btn sm" data-inc-nueva>+ Apuntar incidencia</button></div>'+
      '<div class="tarjeta-cuerpo" style="padding:4px 12px">'+
      (inc.length ? inc.map(filaInc).join("") : '<p class="nota" style="margin:10px 0">Ninguna. Si pasa algo (una nevera que no enfría, una plaga, un producto en mal estado), apúntalo y lo que se hizo.</p>')+
    '</div></section>';

  $$("[data-dia]", box).forEach(function(b){ b.addEventListener("click", function(){
    var k=+b.getAttribute("data-dia");
    if(k===0) ui.fecha=iso(new Date()); else { var d=deIso(ui.fecha); d.setDate(d.getDate()+k); if(d<=new Date()) ui.fecha=iso(d); }
    vHoy(box);
  }); });
  var ir=$("#ir_dia", box);
  ir.addEventListener("change", function(){ if(ir.value && ir.value<=iso(new Date())){ ui.fecha=ir.value; vHoy(box); } });
  var qi=$("#q_quien", box);
  qi.addEventListener("change", function(){ ponQuien(qi.value.trim()); apuntarGente(qi.value); guardar(); });
  $$("[data-rueda]", box).forEach(function(b){ b.addEventListener("click", function(){
    var p=b.getAttribute("data-rueda").split("|");
    abrirRueda(f, p[0], p[1], function(v){ ponerTemp(f, p[0], p[1], String(v), box); });
  }); });
  $$("input[data-eq]", box).forEach(function(inp){
    inp.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); inp.blur(); } });
    inp.addEventListener("change", function(){ ponerTemp(f, inp.getAttribute("data-eq"), inp.getAttribute("data-t"), inp.value, box); });
  });
  $$("[data-acc]", box).forEach(function(b){ b.addEventListener("click", function(){ pedirAccion(porId(state.temps,b.getAttribute("data-acc")), function(){ vHoy(box); }); }); });
  $$("[data-ta]", box).forEach(function(c){ c.addEventListener("change", function(){
    var id=c.getAttribute("data-ta"), l=limpiezaDe(f,id);
    if(c.checked && !l){ state.limpiezas.push({id:uid(), tarea:id, fecha:f, quien:quienAhora(), hora:esHoy?hora():""}); }
    else if(!c.checked && l){ state.limpiezas=state.limpiezas.filter(function(x){ return x!==l; }); }
    guardar(); vHoy(box); refrescarRail();
  }); });
  $$("[data-ql]", box).forEach(function(i){ i.addEventListener("change", function(){
    var l=porId(state.limpiezas, i.getAttribute("data-ql")); if(!l) return;
    l.quien=apuntarGente(i.value); guardar();
  }); });
  $("[data-rec-nueva]", box).addEventListener("click", function(){ editarRec(null, f, function(){ vHoy(box); }); });
  $$("[data-rec]", box).forEach(function(b){ b.addEventListener("click", function(){ editarRec(porId(state.recepciones,b.getAttribute("data-rec")), f, function(){ vHoy(box); }); }); });
  $("[data-inc-nueva]", box).addEventListener("click", function(){ editarInc(null, function(){ vHoy(box); refrescarRail(); }); });
  $$("[data-inc]", box).forEach(function(b){ b.addEventListener("click", function(){ editarInc(porId(state.incidencias,b.getAttribute("data-inc")), function(){ vHoy(box); refrescarRail(); }); }); });
}
function quienAhora(){ var q=$("#q_quien"); var n=q?q.value.trim():quien(); if(n){ ponQuien(n); apuntarGente(n); } return n; }
function ponerTemp(f, eqId, t, val, box){
  var e=porId(state.equipos, eqId), r=tempDe(f,eqId,t), v=num(val);
  /* En los congeladores no hace falta poner el menos: 19 es −19.
     Si de verdad está por encima de cero, se escribe con + (+2). */
  if(e && e.tipo==="congelador" && v!=null && v>0 && String(val).trim().charAt(0)!=="+") v=-v;
  if(String(val).trim()===""){ if(r){ state.temps=state.temps.filter(function(x){ return x!==r; }); guardar(); } vHoy(box); refrescarRail(); return; }
  if(v==null || v<-40 || v>40){ aviso("Pon la temperatura en grados, por ejemplo 3 o -19,5", true); vHoy(box); return; }
  var esHoy=f===iso(new Date());
  if(r){ r.valor=v; r.quien=quienAhora()||r.quien; if(!fuera(e,v)) r.accion=""; }
  else { r={id:uid(), fecha:f, equipo:eqId, turno:t, valor:v, quien:quienAhora(), hora:esHoy?hora():"", accion:""}; state.temps.push(r); }
  guardar(); refrescarRail();
  if(fuera(e,v) && !r.accion) pedirAccion(r, function(){ vHoy(box); });
  else vHoy(box);
}
function pedirAccion(r, luego){
  if(!r) return;
  var e=porId(state.equipos, r.equipo)||{nombre:"?",min:0,max:0};
  var d=dialogo("Temperatura fuera de límite",
    '<p style="margin:0 0 10px"><b>'+esc(e.nombre)+'</b> está a <b style="color:var(--malo)">'+fmtT(r.valor)+'</b> (tiene que estar entre '+fmtT(e.min)+' y '+fmtT(e.max)+').</p>'+
    '<div class="lbl" style="margin-bottom:6px">¿Qué se ha hecho?</div>'+
    '<div class="rapidas">'+["Revisada la puerta y bien cerrada","Producto pasado a otra nevera","Termostato ajustado","Se vuelve a medir en 1 hora","Avisado el técnico","Producto tirado"].map(function(t){ return '<button class="btn sm" data-r>'+esc(t)+'</button>'; }).join("")+'</div>'+
    '<textarea id="a_txt" rows="3" style="margin-top:10px" placeholder="Escribe lo que se ha hecho">'+esc(r.accion||"")+'</textarea>',
    '<button class="btn" data-x>Luego</button><button class="btn fuerte" data-ok>Guardar</button>');
  var ta=$("#a_txt", d);
  $$("[data-r]", d).forEach(function(b){ b.addEventListener("click", function(){ ta.value=(ta.value?ta.value.replace(/\s+$/,"")+". ":"")+b.textContent; ta.focus(); }); });
  $("[data-ok]", d).addEventListener("click", function(){ r.accion=ta.value.trim(); guardar(); d.close(); });
  d.addEventListener("close", function(){ if(luego) luego(); });
}

/* ── ruleta para la temperatura ────────────────────────────────── */
/* Se gira con el dedo (o la rueda del ratón) y se para en un valor; en
   verde lo que está dentro del límite y en rojo lo que no. Sale ya en
   la última temperatura apuntada de ese equipo, que suele ser la buena. */
var ALTO_R=46;
function ultimaDe(eqId, antesDe){
  var l=state.temps.filter(function(x){ return x.equipo===eqId && x.fecha<=antesDe; });
  l.sort(function(a,b){ return a.fecha===b.fecha ? (a.turno<b.turno?1:-1) : (a.fecha<b.fecha?1:-1); });
  return l.length ? l[0].valor : null;
}
function abrirRueda(f, eqId, t, poner){
  var e=porId(state.equipos, eqId); if(!e) return;
  var r=tempDe(f, eqId, t);
  var desde=Math.floor(Math.min(e.min-8, e.min)), hasta=Math.ceil(e.max+10);
  if(e.tipo==="congelador"){ desde=Math.floor(Math.min(-32, e.min-6)); hasta=Math.ceil(Math.max(0, e.max+10)); }
  var vals=[]; for(var x=hasta*2; x>=desde*2; x--) vals.push(x/2);   /* de más calor arriba a más frío abajo, como un termómetro */
  var ini=r?r.valor:ultimaDe(eqId, f); if(ini==null) ini=(e.min+e.max)/2;
  ini=Math.round(ini*2)/2; if(ini<desde) ini=desde; if(ini>hasta) ini=hasta;
  var nomT=(turnos().filter(function(x){ return x[0]===t; })[0]||["",""])[1];
  var d=dialogo(e.nombre+" · "+nomT,
    '<p class="nota" style="margin:0 0 10px;text-align:center">Gira la ruleta hasta la temperatura · tiene que estar entre '+fmtT(e.min)+' y '+fmtT(e.max)+'</p>'+
    '<div class="rueda-caja"><button type="button" class="btn rueda-paso" data-paso="1" aria-label="Medio grado más">▲</button>'+
      '<div class="rueda" tabindex="0" aria-label="Ruleta de temperatura"><div class="rueda-marco"></div><ul>'+
        vals.map(function(v,i){ return '<li data-i="'+i+'" class="'+(fuera(e,v)?"r-mal":"r-bien")+'">'+String(v).replace(".",",")+' °C</li>'; }).join("")+
      '</ul></div><button type="button" class="btn rueda-paso" data-paso="-1" aria-label="Medio grado menos">▼</button>'+
      '<button type="button" class="btn fuerte rueda-poner" data-ok>Poner</button></div>',
    '<button class="btn" data-x>Cancelar</button>');
  d.classList.add("dlg-rueda");
  /* Arriba, al lado de Cerrar: la recomendada (la última apuntada o el
     punto medio del límite), para ponerla con un solo toque */
  var reco=document.createElement("button"); reco.type="button"; reco.className="btn fuerte sm reco";
  reco.textContent="Poner "+fmtT(ini); reco.title="Temperatura recomendada";
  $(".dlg-cab", d).insertBefore(reco, $(".dlg-cab [data-x]", d));
  reco.addEventListener("click", function(){ d.close(); poner(ini); });
  var rueda=$(".rueda", d), lis=$$("li", d), ok=$("[data-ok]", d), sel=vals.indexOf(ini);
  function marcar(i){
    sel=Math.max(0, Math.min(vals.length-1, i));
    lis.forEach(function(li,k){ li.classList.toggle("sel", k===sel); });
    ok.textContent="Poner "+fmtT(vals[sel]);
    ok.classList.toggle("malo-f", fuera(e, vals[sel]));
  }
  function ir(i, suave){ marcar(i); rueda.scrollTo({top:sel*ALTO_R, behavior:suave?"smooth":"auto"}); }
  var tScroll;
  var listo=false;
  rueda.addEventListener("scroll", function(){
    if(!listo) return;
    marcar(Math.round(rueda.scrollTop/ALTO_R));
    clearTimeout(tScroll);
  });
  lis.forEach(function(li){ li.addEventListener("click", function(){ ir(+li.getAttribute("data-i"), true); }); });
  $$("[data-paso]", d).forEach(function(b){ b.addEventListener("click", function(){ ir(sel + (+b.getAttribute("data-paso")) * -1, true); }); });
  rueda.addEventListener("keydown", function(ev){
    if(ev.key==="ArrowUp"){ ev.preventDefault(); ir(sel-1, true); }
    if(ev.key==="ArrowDown"){ ev.preventDefault(); ir(sel+1, true); }
    if(ev.key==="Enter"){ ev.preventDefault(); ok.click(); }
  });
  ok.addEventListener("click", function(){ var v=vals[sel]; d.close(); poner(v); });
  var inicio=sel;
  marcar(inicio);
  /* se coloca en el valor de partida en cuanto la ventana está pintada */
  [0,60,180].forEach(function(ms){ setTimeout(function(){ if(!listo){ rueda.scrollTop=inicio*ALTO_R; marcar(inicio); } }, ms); });
  setTimeout(function(){ listo=true; try{ rueda.focus({preventScroll:true}); }catch(e){} }, 260);
}

/* Lo último que trajo un proveedor */
function ultimaRec(prov){
  if(!prov) return null;
  var l=state.recepciones.filter(function(x){ return (x.proveedor||"").toLowerCase()===prov.toLowerCase(); });
  l.sort(function(a,b){ return a.fecha<b.fecha?1:-1; });
  return l[0]||null;
}
var PRODUCTOS=["Carne","Pescado","Marisco","Pollo y aves","Embutidos","Lácteos","Huevos","Fruta y verdura","Congelados","Pan","Pastelería","Bebidas","Secos y conservas","Aceite","Limpieza","Otros"];
/* Ruleta de una lista cualquiera: se gira y se pulsa Poner. Se abre
   encima de la ventana de la entrega, sin cerrarla. */
function ruedaLista(titulo, items, sel, poner){
  var d=document.createElement("dialog"); d.className="dlg-rueda dlg-sub";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3><button class="btn suave" data-cerrar>Cerrar</button></div>'+
    '<div class="dlg-cuerpo"><div class="rueda-caja"><button type="button" class="btn rueda-paso" data-paso="-1" aria-label="Anterior">▲</button>'+
      '<div class="rueda" tabindex="0"><div class="rueda-marco"></div><ul>'+
        items.map(function(it,i){ return '<li data-i="'+i+'" class="'+(it.cls||"")+'">'+esc(it.txt)+'</li>'; }).join("")+
      '</ul></div><button type="button" class="btn rueda-paso" data-paso="1" aria-label="Siguiente">▼</button>'+
      '<button type="button" class="btn fuerte rueda-poner" data-poner>Poner</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener("close", function(){ d.remove(); });
  $("[data-cerrar]", d).addEventListener("click", function(){ d.close(); });
  d.showModal();
  var rueda=$(".rueda", d), lis=$$("li", d), ok=$("[data-poner]", d), listo=false;
  function marcar(i){ sel=Math.max(0, Math.min(items.length-1, i)); lis.forEach(function(li,k){ li.classList.toggle("sel", k===sel); }); ok.textContent="Poner "+items[sel].txt; }
  function ir(i){ marcar(i); rueda.scrollTo({top:sel*ALTO_R, behavior:"smooth"}); }
  rueda.addEventListener("scroll", function(){ if(listo) marcar(Math.round(rueda.scrollTop/ALTO_R)); });
  lis.forEach(function(li){ li.addEventListener("click", function(){ ir(+li.getAttribute("data-i")); }); });
  $$("[data-paso]", d).forEach(function(b){ b.addEventListener("click", function(){ ir(sel + (+b.getAttribute("data-paso"))); }); });
  rueda.addEventListener("keydown", function(ev){
    if(ev.key==="ArrowUp"){ ev.preventDefault(); ir(sel-1); }
    if(ev.key==="ArrowDown"){ ev.preventDefault(); ir(sel+1); }
    if(ev.key==="Enter"){ ev.preventDefault(); ok.click(); }
  });
  ok.addEventListener("click", function(){ var v=items[sel].val; d.close(); poner(v); });
  var inicio=sel; marcar(inicio);
  [0,60,180].forEach(function(ms){ setTimeout(function(){ if(!listo){ rueda.scrollTop=inicio*ALTO_R; marcar(inicio); } }, ms); });
  setTimeout(function(){ listo=true; try{ rueda.focus({preventScroll:true}); }catch(e){} }, 260);
}

/* ── mercancía ─────────────────────────────────────────────────── */
function filaRec(r){
  return '<button class="fila-rec" data-rec="'+r.id+'"><span><b>'+esc(r.proveedor||"Sin proveedor")+'</b> · '+esc(r.producto||"")+'</span>'+
    '<span class="meta-r">'+(r.temp!=null?fmtT(r.temp)+' · ':'')+(r.lote?'lote '+esc(r.lote)+' · ':'')+
    (r.acepta===false?'<span class="chapa malo">Rechazado</span>':'<span class="chapa ok">Aceptado</span>')+'</span></button>';
}
function editarRec(r, f, luego){
  var nuevo=!r;
  r=r||{fecha:f, acepta:true, envase:"ok", quien:quien()};
  var provs=[]; state.recepciones.forEach(function(x){ if(x.proveedor && provs.indexOf(x.proveedor)<0) provs.push(x.proveedor); });
  var d=dialogo(nuevo?"Mercancía recibida":"Entrega del "+dm(r.fecha),
    '<div class="dos">'+
      '<div class="campo"><label class="lbl" for="r_prov">Proveedor</label><input id="r_prov" list="r_provl" value="'+esc(r.proveedor||"")+'" autocomplete="off"><datalist id="r_provl">'+provs.map(function(p){ return '<option value="'+esc(p)+'">'; }).join("")+'</datalist></div>'+
      '<div class="campo"><label class="lbl" for="r_prod">Qué llega</label><div class="t-fila"><input id="r_prod" value="'+esc(r.producto||"")+'" placeholder="Carne, pescado, lácteos…"><button type="button" class="rueda-btn" data-rp aria-label="Elegir qué llega con la ruleta" title="Ruleta">⟳</button></div></div>'+
    '</div>'+
    '<div class="tres" style="margin-top:10px">'+
      '<div class="campo"><label class="lbl" for="r_temp">Temperatura</label><div class="t-fila"><input id="r_temp" inputmode="decimal" placeholder="°C · congelado sin el menos" value="'+(r.temp!=null?String(r.temp).replace(".",","):"")+'"><button type="button" class="rueda-btn" data-rt aria-label="Elegir la temperatura con la ruleta" title="Ruleta">⟳</button></div></div>'+
      '<div class="campo"><label class="lbl" for="r_lote">Lote</label><input id="r_lote" value="'+esc(r.lote||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="r_cad">Caducidad</label><input id="r_cad" type="date" value="'+esc(r.cad||"")+'"></div>'+
    '</div>'+
    '<div class="dos" style="margin-top:10px">'+
      '<div class="campo"><span class="lbl">Envase y aspecto</span><div class="seg" data-g="envase"><button data-val="ok" aria-pressed="'+(r.envase!=="mal")+'">Bien</button><button data-val="mal" aria-pressed="'+(r.envase==="mal")+'">Mal</button></div></div>'+
      '<div class="campo"><span class="lbl">¿Se acepta?</span><div class="seg" data-g="acepta"><button data-val="si" aria-pressed="'+(r.acepta!==false)+'">Aceptado</button><button data-val="no" aria-pressed="'+(r.acepta===false)+'">Rechazado</button></div></div>'+
    '</div>'+
    '<div class="dos" style="margin-top:10px">'+
      '<div class="campo"><label class="lbl" for="r_quien">Recibe</label>'+selGente("r_quien", r.quien)+
        (state.encargados.length?'<div class="chips-q">'+state.encargados.map(function(n){ return '<button type="button" class="chip-q'+(n===r.quien?' on':'')+'" data-enc="'+esc(n)+'">'+esc(n)+'</button>'; }).join("")+'</div>':'')+'</div>'+
      '<div class="campo"><label class="lbl" for="r_nota">Nota</label><input id="r_nota" value="'+esc(r.nota||"")+'" placeholder="Albarán, motivo del rechazo…"></div>'+
    '</div>'+
    '<p class="nota" style="margin:10px 0 0">De frío: refrigerado hasta 4 °C, congelado −18 °C o menos.</p>',
    (nuevo?'':'<button class="btn malo" data-borrar style="margin-right:auto">Borrar</button>')+'<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-ok>Guardar</button>');
  $$("[data-enc]", d).forEach(function(b){ b.addEventListener("click", function(){
    $("#r_quien", d).value=b.getAttribute("data-enc");
    $$("[data-enc]", d).forEach(function(x){ x.classList.toggle("on", x===b); });
  }); });
  /* Ruletas de «Qué llega» y de la temperatura */
  $("[data-rp]", d).addEventListener("click", function(){
    var prov=$("#r_prov", d).value.trim(), act=$("#r_prod", d).value.trim();
    var lista=PRODUCTOS.slice();
    state.recepciones.forEach(function(x){ if(x.producto && lista.indexOf(x.producto)<0) lista.push(x.producto); });
    if(act && lista.indexOf(act)<0) lista.unshift(act);
    var ini=act || (ultimaRec(prov)||{}).producto || lista[0];
    ruedaLista("Qué llega", lista.map(function(t){ return {txt:t, val:t}; }), Math.max(0, lista.indexOf(ini)), function(v){ $("#r_prod", d).value=v; });
  });
  $("[data-rt]", d).addEventListener("click", function(){
    var prov=$("#r_prov", d).value.trim(), act=num($("#r_temp", d).value);
    var vals=[]; for(var x=30; x>=-50; x--) vals.push(x/2);
    var esCong=/congel/i.test($("#r_prod", d).value);
    if(act!=null && act>0 && esCong && $("#r_temp", d).value.trim().charAt(0)!=="+") act=-act;
    var ini=act!=null?act:((ultimaRec(prov)||{}).temp); if(ini==null || (esCong && ini>-10)) ini=esCong?-18:3;
    ini=Math.max(-25, Math.min(15, Math.round(ini*2)/2));
    ruedaLista("Temperatura al llegar", vals.map(function(v){ return {txt:String(v).replace(".",",")+" °C", val:v, cls:(v<=4)?"r-bien":(v>8?"r-mal":"")}; }),
      Math.max(0, vals.indexOf(ini)), function(v){ $("#r_temp", d).value=String(v).replace(".",","); });
  });
  $$(".seg[data-g] button", d).forEach(function(b){ b.addEventListener("click", function(){
    $$("button", b.parentNode).forEach(function(x){ x.setAttribute("aria-pressed", x===b); });
  }); });
  var val=function(g){ var b=$('.seg[data-g="'+g+'"] [aria-pressed="true"]', d); return b?b.getAttribute("data-val"):""; };
  $("[data-ok]", d).addEventListener("click", function(){
    var t=$("#r_temp", d).value.trim(), tv=num(t);
    /* Si llega congelado, no hace falta poner el menos: 18 es −18 (con + se queda en positivo) */
    if(tv!=null && tv>0 && t.charAt(0)!=="+" && /congel/i.test($("#r_prod", d).value)) tv=-tv;
    if(t && tv==null){ aviso("La temperatura tiene que ser un número", true); return; }
    r.proveedor=$("#r_prov", d).value.trim(); r.producto=$("#r_prod", d).value.trim();
    if(!r.proveedor && !r.producto){ aviso("Pon al menos el proveedor o qué llega", true); return; }
    r.temp=tv; r.lote=$("#r_lote", d).value.trim(); r.cad=$("#r_cad", d).value;
    r.envase=val("envase")||"ok"; r.acepta=val("acepta")!=="no";
    r.quien=apuntarGente($("#r_quien", d).value); if(r.quien) ponQuien(r.quien);
    r.nota=$("#r_nota", d).value.trim();
    if(nuevo){ r.id=uid(); r.hora=r.fecha===iso(new Date())?hora():""; state.recepciones.push(r); }
    if(r.acepta===false && nuevo){
      state.incidencias.push({id:uid(), fecha:r.fecha, texto:"Rechazada mercancía de "+(r.proveedor||"?")+(r.producto?" ("+r.producto+")":""), accion:r.nota||"Devuelta al proveedor", quien:r.quien, cerrada:true});
    }
    guardar(); d.close(); aviso("Entrega apuntada");
  });
  var bb=$("[data-borrar]", d);
  if(bb) bb.addEventListener("click", function(){ confirmar("Borrar entrega", "¿Borrar la entrega de <b>"+esc(r.proveedor||"")+"</b> del "+dm(r.fecha)+"?", function(){
    state.recepciones=state.recepciones.filter(function(x){ return x!==r; }); guardar(); d.close();
  }); });
  d.addEventListener("close", function(){ if(luego) luego(); });
}
function vRecepcion(box){
  var l=state.recepciones.filter(function(r){ return r.fecha.slice(0,7)===ui.mes; }).sort(function(a,b){ return a.fecha<b.fecha?1:-1; });
  var rech=l.filter(function(r){ return r.acepta===false; }).length;
  box.innerHTML=cabecera("Mercancía recibida", l.length+" entregas en "+esc(mesTxt(ui.mes))+(rech?" · "+rech+" rechazadas":""), selMes()+'<button class="btn fuerte" data-rec-nueva>+ Apuntar entrega</button>')+
    (l.length ? '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr><th>Día</th><th>Proveedor</th><th>Qué</th><th class="num">Temp.</th><th>Lote</th><th>Caduca</th><th>Envase</th><th>Estado</th><th>Recibe</th></tr></thead><tbody>'+
      l.map(function(r){ return '<tr class="clic" data-rec="'+r.id+'"><td>'+dm(r.fecha)+'</td><td>'+esc(r.proveedor||"")+'</td><td>'+esc(r.producto||"")+'</td><td class="num">'+(r.temp!=null?fmtT(r.temp):"—")+'</td><td>'+esc(r.lote||"")+'</td><td>'+(r.cad?dm(r.cad):"")+'</td>'+
        '<td>'+(r.envase==="mal"?'<span class="chapa malo">Mal</span>':'Bien')+'</td><td>'+(r.acepta===false?'<span class="chapa malo">Rechazado</span>':'<span class="chapa ok">Aceptado</span>')+'</td><td>'+esc(r.quien||"")+'</td></tr>'; }).join("")+
      '</tbody></table></div></div>' : '<div class="vacio"><strong>Nada este mes</strong>Las entregas se apuntan desde «Hoy» o con el botón de arriba.</div>');
  engancharMes(box, vRecepcion);
  $("[data-rec-nueva]", box).addEventListener("click", function(){ editarRec(null, iso(new Date()), function(){ vRecepcion(box); }); });
  $$("[data-rec]", box).forEach(function(b){ b.addEventListener("click", function(){ editarRec(porId(state.recepciones,b.getAttribute("data-rec")), null, function(){ vRecepcion(box); }); }); });
}

/* ── incidencias ───────────────────────────────────────────────── */
function filaInc(i){
  return '<button class="fila-rec" data-inc="'+i.id+'"><span><b>'+dm(i.fecha)+'</b> · '+esc(i.texto)+'</span>'+
    '<span class="meta-r">'+(i.cerrada?'<span class="chapa ok">Resuelta</span>':'<span class="chapa aviso">Abierta</span>')+'</span></button>';
}
function editarInc(i, luego){
  var nuevo=!i; i=i||{fecha:iso(new Date()), quien:quien(), cerrada:false};
  var d=dialogo(nuevo?"Apuntar incidencia":"Incidencia del "+dm(i.fecha),
    '<div class="dos"><div class="campo"><label class="lbl" for="i_f">Día</label><input id="i_f" type="date" value="'+esc(i.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="i_q">Quién</label>'+selGente("i_q", i.quien)+'</div></div>'+
    '<div class="campo" style="margin-top:10px"><label class="lbl" for="i_t">Qué ha pasado</label><textarea id="i_t" rows="2" placeholder="La cámara marca 9 °C por la mañana…">'+esc(i.texto||"")+'</textarea></div>'+
    '<div class="campo" style="margin-top:10px"><label class="lbl" for="i_a">Qué se ha hecho</label><textarea id="i_a" rows="2" placeholder="Llamado al técnico, producto tirado…">'+esc(i.accion||"")+'</textarea></div>'+
    '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13.5px"><input type="checkbox" id="i_c" style="width:auto"'+(i.cerrada?" checked":"")+'> Ya está resuelta</label>',
    (nuevo?'':'<button class="btn malo" data-borrar style="margin-right:auto">Borrar</button>')+'<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-ok>Guardar</button>');
  $("[data-ok]", d).addEventListener("click", function(){
    var t=$("#i_t", d).value.trim(); if(!t){ aviso("Escribe qué ha pasado", true); return; }
    i.fecha=$("#i_f", d).value||iso(new Date()); i.texto=t; i.accion=$("#i_a", d).value.trim();
    i.quien=apuntarGente($("#i_q", d).value); i.cerrada=$("#i_c", d).checked;
    if(nuevo){ i.id=uid(); state.incidencias.push(i); }
    guardar(); d.close(); aviso("Incidencia guardada");
  });
  var bb=$("[data-borrar]", d);
  if(bb) bb.addEventListener("click", function(){ confirmar("Borrar incidencia", "¿Borrar esta incidencia?", function(){ state.incidencias=state.incidencias.filter(function(x){ return x!==i; }); guardar(); d.close(); }); });
  d.addEventListener("close", function(){ if(luego) luego(); });
}
function vIncidencias(box){
  var l=state.incidencias.slice().sort(function(a,b){ return (a.cerrada?1:0)-(b.cerrada?1:0) || (a.fecha<b.fecha?1:-1); });
  box.innerHTML=cabecera("Incidencias", abiertas().length+" abiertas · "+l.length+" en total", '<button class="btn fuerte" data-inc-nueva>+ Apuntar incidencia</button>')+
    (l.length ? '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr><th>Día</th><th>Qué pasó</th><th>Qué se hizo</th><th>Quién</th><th>Estado</th></tr></thead><tbody>'+
      l.map(function(i){ return '<tr class="clic" data-inc="'+i.id+'"><td>'+dm(i.fecha)+'</td><td>'+esc(i.texto)+'</td><td>'+esc(i.accion||"—")+'</td><td>'+esc(i.quien||"")+'</td><td>'+(i.cerrada?'<span class="chapa ok">Resuelta</span>':'<span class="chapa aviso">Abierta</span>')+'</td></tr>'; }).join("")+
      '</tbody></table></div></div>' : '<div class="vacio"><strong>Sin incidencias</strong>Cuando pase algo, apúntalo aquí con lo que se hizo.</div>');
  $("[data-inc-nueva]", box).addEventListener("click", function(){ editarInc(null, function(){ vIncidencias(box); refrescarRail(); }); });
  $$("[data-inc]", box).forEach(function(b){ b.addEventListener("click", function(){ editarInc(porId(state.incidencias,b.getAttribute("data-inc")), function(){ vIncidencias(box); refrescarRail(); }); }); });
}

/* ── temperaturas del mes ──────────────────────────────────────── */
function vTemps(box){
  var dias=diasMes(ui.mes), tt=turnos(), hoyS=iso(new Date());
  var fueraN=0, faltan=0;
  box.innerHTML=cabecera("Temperaturas", esc(mesTxt(ui.mes))+" · pulsa un día para apuntar o corregir; con ‹ vas a meses atrasados", selMes()+'<button class="btn" data-a-hojas>📄 Pasar a Hojas</button>')+
    (state.equipos.length ? '<div class="tarjeta"><div class="tabla-caja"><table class="mes-t"><thead><tr><th>Día</th>'+
      state.equipos.map(function(e){ return '<th colspan="'+tt.length+'" style="text-align:center">'+esc(e.nombre)+'<br><span style="text-transform:none;letter-spacing:0">'+fmtT(e.min)+' / '+fmtT(e.max)+'</span></th>'; }).join("")+'</tr>'+
      (tt.length>1?'<tr><th></th>'+state.equipos.map(function(){ return tt.map(function(t){ return '<th class="num">'+t[1].slice(0,1)+'</th>'; }).join(""); }).join("")+'</tr>':'')+
      '</thead><tbody>'+
      dias.map(function(f){
        var fut=f>hoyS, d=deIso(f);
        return '<tr class="clic'+(d.getDay()===0?" dom":"")+'" data-ir="'+f+'"><td class="mono">'+DIAS_C[d.getDay()]+' '+d.getDate()+'</td>'+
          state.equipos.map(function(e){ return tt.map(function(t){
            var r=tempDe(f,e.id,t[0]);
            if(!r){ var cuenta=!fut && f>=state.desde; if(cuenta) faltan++; return '<td class="num'+(cuenta?' falta':'')+'">'+(cuenta?'—':'')+'</td>'; }
            var mal=fuera(e,r.valor); if(mal) fueraN++;
            return '<td class="num'+(mal?' t-mal':'')+'" title="'+esc((r.quien||"")+(r.accion?" · "+r.accion:""))+'">'+String(Math.round(r.valor*10)/10).replace(".",",")+(mal&&!r.accion?' !':'')+'</td>';
          }).join(""); }).join("")+'</tr>';
      }).join("")+'</tbody></table></div></div>'+
      '<p class="nota" style="margin-top:10px">'+(faltan?faltan+' tomas sin apuntar este mes. ':'Todas las tomas apuntadas. ')+(fueraN?fueraN+' fuera de límite (en rojo; con «!» si falta apuntar qué se hizo).':'Ninguna fuera de límite.')+'</p>'
    : '<div class="vacio"><strong>No hay equipos</strong>Añade tus neveras y congeladores en Ajustes.</div>');
  engancharMes(box, vTemps);
  var ah=$("[data-a-hojas]", box); if(ah) ah.addEventListener("click", function(){ pasarAHojas("temperaturas", ui.mes); });
  $$("[data-ir]", box).forEach(function(tr){ tr.addEventListener("click", function(){ var f=tr.getAttribute("data-ir"); if(f>hoyS) return; ui.fecha=f; ui.vista="hoy"; render(); window.scrollTo(0,0); }); });
}

/* ── pasar una hoja del mes a la app Hojas ─────────────────────── */
/* Se dibuja la tabla del mes en una imagen tamaño A4 apaisado y se deja
   preparada para la app Hojas, que la recoge al abrirse (las dos están
   en la misma web y comparten el navegador). Si ya hay una hoja con el
   mismo título, se cambia por la nueva. */
function tablaImagen(titulo, sub, cab, filas){
  var W=2339, H=1654, M=70, c=document.createElement("canvas"); c.width=W; c.height=H;
  var x=c.getContext("2d");
  x.fillStyle="#fff"; x.fillRect(0,0,W,H);
  x.fillStyle="#111"; x.font="bold 54px Georgia, serif"; x.textBaseline="alphabetic"; x.fillText(titulo, M, M+44);
  x.fillStyle="#555"; x.font="28px Helvetica, Arial, sans-serif"; x.fillText(sub, M, M+90);
  var top=M+130, colL=430, nC=cab.length, cw=(W-2*M-colL)/nC;
  var rh=Math.min(110, (H-top-M-70)/filas.length);
  /* cabecera */
  x.fillStyle="#eef3f3"; x.fillRect(M, top, W-2*M, 70);
  x.fillStyle="#333"; x.font="bold 24px Helvetica, Arial, sans-serif"; x.textAlign="center";
  cab.forEach(function(h,i){
    var cx=M+colL+cw*i+cw/2;
    if(h.fin) { x.fillStyle="#e6ecec"; x.fillRect(M+colL+cw*i, top, cw, 70+rh*filas.length); x.fillStyle="#333"; }
    x.fillText(h.a, cx, top+30); x.font="bold 26px Helvetica, Arial, sans-serif"; x.fillText(h.b, cx, top+60); x.font="bold 24px Helvetica, Arial, sans-serif";
  });
  x.textAlign="left";
  filas.forEach(function(f,r){
    var y=top+70+rh*r;
    x.fillStyle="#111"; x.font="bold "+Math.min(28,rh*.32)+"px Helvetica, Arial, sans-serif"; x.fillText(f.nom, M+12, y+rh*.45);
    x.fillStyle="#666"; x.font=Math.min(22,rh*.26)+"px Helvetica, Arial, sans-serif"; x.fillText(f.sub||"", M+12, y+rh*.8);
    f.celdas.forEach(function(t,i){
      if(!t) return;
      var cx=M+colL+cw*i, col=t.color||"#111";
      if(t.fondo){ x.fillStyle=t.fondo; x.fillRect(cx+2, y+2, cw-4, rh-4); }
      x.fillStyle=col; x.textAlign="center"; x.font="bold "+Math.min(t.g?40:26, rh*.42, cw*.42)+"px Helvetica, Arial, sans-serif";
      x.fillText(t.t, cx+cw/2, y+rh/2+Math.min(t.g?14:9, rh*.15)); x.textAlign="left";
    });
  });
  /* líneas */
  x.strokeStyle="#bbb"; x.lineWidth=2;
  for(var r=0;r<=filas.length;r++){ var yy=top+70+rh*r; x.beginPath(); x.moveTo(M,yy); x.lineTo(W-M,yy); x.stroke(); }
  for(var i=0;i<=nC;i++){ var xx=M+colL+cw*i; x.beginPath(); x.moveTo(xx,top); x.lineTo(xx,top+70+rh*filas.length); x.stroke(); }
  x.strokeStyle="#333"; x.strokeRect(M, top, W-2*M, 70+rh*filas.length);
  x.beginPath(); x.moveTo(M+colL, top); x.lineTo(M+colL, top+70+rh*filas.length); x.stroke();
  x.fillStyle="#888"; x.font="20px Helvetica, Arial, sans-serif"; x.fillText("La Palmera de Soldeu · Control sanitario · sacado el "+dm(iso(new Date()))+"/"+new Date().getFullYear(), M, H-M+20);
  return c.toDataURL("image/png");
}
function pasarAHojas(cual, m){
  var dias=diasMes(m), hoyS=iso(new Date()), titulo, sub, cab, filas;
  cab=dias.map(function(f){ var d=deIso(f); return {a:DIAS_C[d.getDay()], b:String(d.getDate()), fin:d.getDay()===0}; });
  if(cual==="limpieza"){
    if(!state.tareas.length){ aviso("No hay tareas de limpieza", true); return; }
    titulo="Plan de limpieza · "+mesTxt(m); sub="✓ hecha   ·   ✕ tocaba y no se hizo   ·   □ por hacer";
    filas=state.tareas.map(function(ta){
      return {nom:ta.nombre, sub:textoFrec(ta), celdas:dias.map(function(f){
        var toca=tocaHoy(ta,f), l=limpiezaDe(f,ta.id);
        if(l) return {t:"✓", color:"#1e7a3c", fondo:"#e3f3e8", g:1};
        if(!toca) return null;
        if(f<hoyS && f>=state.desde) return {t:"✕", color:"#b3261e", fondo:"#fbe4e1", g:1};
        return {t:"□", color:"#999"};
      })};
    });
  } else {
    if(!state.equipos.length){ aviso("No hay neveras", true); return; }
    var tt=turnos();
    titulo="Temperaturas · "+mesTxt(m); sub="°C de cada equipo"+(tt.length>1?" (arriba mañana, abajo tarde)":"")+"   ·   en rojo, fuera de límite";
    filas=[];
    state.equipos.forEach(function(e){ tt.forEach(function(t){
      filas.push({nom:e.nombre+(tt.length>1?" · "+t[1]:""), sub:fmtT(e.min)+" a "+fmtT(e.max), celdas:dias.map(function(f){
        var r=tempDe(f,e.id,t[0]); if(!r) return null;
        var mal=fuera(e,r.valor);
        return {t:String(Math.round(r.valor*10)/10).replace(".",","), color:mal?"#b3261e":"#111", fondo:mal?"#fbe4e1":null};
      })});
    }); });
  }
  var url=tablaImagen(titulo, sub, cab, filas);
  var nombre=titulo.replace(/ · /g," ").replace(/[^\wÀ-ÿ ]+/g,"").trim()+".png";
  try{
    localStorage.setItem("hojas.entrada", JSON.stringify({titulo:titulo, carpeta:"Restaurante", nombre:nombre, url:url, notas:"Sacada de Control sanitario", etiquetas:["sanidad", cual]}));
  }catch(e){
    var a=document.createElement("a"); a.href=url; a.download=nombre; document.body.appendChild(a); a.click(); a.remove();
    aviso("No cabe para pasarla sola: la tienes en Descargas para añadirla en Hojas.", true); return;
  }
  var d=dialogo("Pasar a Hojas",
    '<p style="margin:0 0 12px">La hoja <b>'+esc(titulo)+'</b> está lista. Al abrir la app <b>Hojas</b> se guarda sola en la carpeta <b>Restaurante</b>'+
    ' (si ya estaba la de este mes, se cambia por esta).</p><img src="'+url+'" alt="" style="width:100%;border:1px solid var(--linea);border-radius:6px">',
    '<button class="btn" data-x>Ahora no</button><a class="btn fuerte" href="hojas.html">Abrir Hojas</a>');
}

/* ── limpieza del mes ──────────────────────────────────────────── */
function vLimpieza(box){
  var dias=diasMes(ui.mes), hoyS=iso(new Date()), debidas=0, hechas=0;
  box.innerHTML=cabecera("Plan de limpieza", esc(mesTxt(ui.mes))+" · pulsa una casilla para marcarla o desmarcarla", selMes()+'<button class="btn" data-a-hojas>📄 Pasar a Hojas</button>')+
    (state.tareas.length ? '<div class="tarjeta"><div class="tabla-caja"><table class="mes-l"><thead><tr><th>Tarea</th>'+
      dias.map(function(f){ var d=deIso(f); return '<th class="num'+(f===hoyS?' hoy-c':'')+'">'+DIAS_C[d.getDay()]+'<br>'+d.getDate()+'</th>'; }).join("")+'</tr></thead><tbody>'+
      state.tareas.map(function(ta){
        return '<tr><td><b>'+esc(ta.nombre)+'</b><br><small style="color:var(--muted)">'+esc(textoFrec(ta))+'</small></td>'+
          dias.map(function(f){
            var toca=tocaHoy(ta,f), l=limpiezaDe(f,ta.id), fut=f>hoyS;
            var cuenta=toca && !fut && f>=state.desde;
            if(cuenta){ debidas++; if(l) hechas++; }
            var olvido=cuenta && f<hoyS && !l;
            var cl=l?"ok-c":(olvido?"mal-c":(toca&&f>=state.desde?"toca-c":""));
            return '<td class="l-c '+cl+'"'+(fut?'':' data-tg="'+ta.id+'|'+f+'"')+' title="'+esc(l?(l.quien||"")+" "+(l.hora||""):(toca?"Toca":""))+'">'+(l?"✓":(olvido?"✕":(toca&&f>=state.desde?"·":"")))+'</td>';
          }).join("")+'</tr>';
      }).join("")+'</tbody></table></div></div>'+
      '<p class="nota" style="margin-top:10px">'+hechas+' de '+debidas+' limpiezas hechas hasta hoy'+(state.desde>diasMes(ui.mes)[0]&&state.desde.slice(0,7)===ui.mes?' (cuenta desde el '+dm(state.desde)+', cuando empezaste)':'')+(debidas?' ('+Math.round(hechas/debidas*100)+' %)':'')+'. ✕ = tocaba y no se marcó.</p>'
    : '<div class="vacio"><strong>Sin tareas</strong>Añade las limpiezas en Ajustes.</div>');
  engancharMes(box, vLimpieza);
  $("[data-a-hojas]", box).addEventListener("click", function(){ pasarAHojas("limpieza", ui.mes); });
  $$("[data-tg]", box).forEach(function(td){ td.addEventListener("click", function(){
    var p=td.getAttribute("data-tg").split("|"), l=limpiezaDe(p[1],p[0]);
    if(l) state.limpiezas=state.limpiezas.filter(function(x){ return x!==l; });
    else state.limpiezas.push({id:uid(), tarea:p[0], fecha:p[1], quien:quien(), hora:p[1]===hoyS?hora():""});
    guardar(); vLimpieza(box); refrescarRail();
  }); });
}
function textoFrec(ta){
  if(ta.frec==="semanal") return "Cada "+DIAS[ta.dia==null?1:+ta.dia];
  if(ta.frec==="mensual") return "El día "+(ta.dia==null?1:ta.dia)+" de cada mes";
  return "Cada día";
}

/* ── resumen del mes ───────────────────────────────────────────── */
function vInforme(box){
  var dias=diasMes(ui.mes), hoyS=iso(new Date()), pas=dias.filter(function(f){ return f<=hoyS && f>=state.desde; }), tt=turnos();
  var tomas=0, hechasT=0, fueraL=[], sinAcc=0;
  pas.forEach(function(f){ state.equipos.forEach(function(e){ tt.forEach(function(t){ tomas++; var r=tempDe(f,e.id,t[0]); if(r){ hechasT++; if(fuera(e,r.valor)){ fueraL.push({r:r,e:e}); if(!r.accion) sinAcc++; } } }); }); });
  var deb=0, hec=0, faltaL=[];
  pas.forEach(function(f){ state.tareas.forEach(function(ta){ if(tocaHoy(ta,f)){ deb++; if(limpiezaDe(f,ta.id)) hec++; else faltaL.push({f:f,ta:ta}); } }); });
  var rec=state.recepciones.filter(function(r){ return r.fecha.slice(0,7)===ui.mes; });
  var inc=state.incidencias.filter(function(i){ return i.fecha.slice(0,7)===ui.mes; });
  var pct=function(a,b){ return b?Math.round(a/b*100)+" %":"—"; };
  box.innerHTML=cabecera("Resumen del mes", "Lo que enseñarías en una inspección, de "+esc(mesTxt(ui.mes))+".", selMes()+'<button class="btn" data-csv>Descargar el mes (Excel)</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Temperaturas</div><div class="v'+(hechasT<tomas?' malo':' acento')+'">'+pct(hechasT,tomas)+'</div><div class="n">'+hechasT+' de '+tomas+' tomas</div></div>'+
      '<div class="cifra"><div class="k">Fuera de límite</div><div class="v'+(fueraL.length?' malo':'')+'">'+fueraL.length+'</div><div class="n">'+(sinAcc?sinAcc+' sin acción apuntada':'todas con acción')+'</div></div>'+
      '<div class="cifra"><div class="k">Limpieza</div><div class="v'+(hec<deb?' malo':' acento')+'">'+pct(hec,deb)+'</div><div class="n">'+hec+' de '+deb+' hechas</div></div>'+
      '<div class="cifra"><div class="k">Entregas</div><div class="v">'+rec.length+'</div><div class="n">'+rec.filter(function(r){ return r.acepta===false; }).length+' rechazadas</div></div>'+
      '<div class="cifra"><div class="k">Incidencias</div><div class="v">'+inc.length+'</div><div class="n">'+inc.filter(function(i){ return !i.cerrada; }).length+' abiertas</div></div>'+
    '</div>'+
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>Temperaturas fuera de límite</h2></div><div class="tarjeta-cuerpo">'+
      (fueraL.length ? '<div class="tabla-caja"><table><thead><tr><th>Día</th><th>Equipo</th><th class="num">Temp.</th><th>Qué se hizo</th><th>Quién</th></tr></thead><tbody>'+
        fueraL.map(function(x){ return '<tr><td>'+dm(x.r.fecha)+' '+(x.r.turno==="t"?"tarde":"mañana")+'</td><td>'+esc(x.e.nombre)+'</td><td class="num" style="color:var(--malo)">'+fmtT(x.r.valor)+'</td><td>'+(x.r.accion?esc(x.r.accion):'<span class="chapa malo">Falta apuntar</span>')+'</td><td>'+esc(x.r.quien||"")+'</td></tr>'; }).join("")+'</tbody></table></div>'
        : '<p class="nota" style="margin:0">Ninguna. ✓</p>')+'</div></section>'+
    '<section class="tarjeta"><div class="tarjeta-cab"><h2>Limpiezas sin marcar</h2></div><div class="tarjeta-cuerpo">'+
      (faltaL.length ? '<p style="margin:0;line-height:1.8">'+faltaL.slice(0,60).map(function(x){ return '<span class="chapa neutra" style="margin:0 4px 4px 0">'+dm(x.f)+' · '+esc(x.ta.nombre)+'</span>'; }).join("")+(faltaL.length>60?' … y '+(faltaL.length-60)+' más':'')+'</p>'
        : '<p class="nota" style="margin:0">Todas marcadas. ✓</p>')+'</div></section>';
  engancharMes(box, vInforme);
  $("[data-csv]", box).addEventListener("click", function(){ csvMes(ui.mes); });
}
function csvMes(m){
  var dias=diasMes(m), tt=turnos(), filas=[];
  var q=function(v){ v=v==null?"":String(v); return '"'+v.replace(/"/g,'""')+'"'; };
  filas.push(["TEMPERATURAS "+mesTxt(m).toUpperCase()]);
  filas.push(["Día"].concat(state.equipos.reduce(function(a,e){ return a.concat(tt.map(function(t){ return e.nombre+" ("+t[1]+")"; })); }, [])));
  dias.forEach(function(f){ filas.push([dm(f)].concat(state.equipos.reduce(function(a,e){ return a.concat(tt.map(function(t){ var r=tempDe(f,e.id,t[0]); return r?String(r.valor).replace(".",",")+(fuera(e,r.valor)?" (fuera: "+(r.accion||"sin acción")+")":""):""; })); }, []))); });
  filas.push([]); filas.push(["LIMPIEZA"]); filas.push(["Día","Tarea","Hecha","Quién"]);
  dias.forEach(function(f){ state.tareas.forEach(function(ta){ if(tocaHoy(ta,f)){ var l=limpiezaDe(f,ta.id); filas.push([dm(f), ta.nombre, l?"Sí":"No", l?l.quien:""]); } }); });
  filas.push([]); filas.push(["MERCANCÍA RECIBIDA"]); filas.push(["Día","Proveedor","Producto","Temp.","Lote","Caducidad","Envase","Estado","Recibe","Nota"]);
  state.recepciones.filter(function(r){ return r.fecha.slice(0,7)===m; }).forEach(function(r){ filas.push([dm(r.fecha), r.proveedor, r.producto, r.temp!=null?String(r.temp).replace(".",","):"", r.lote, r.cad?dm(r.cad):"", r.envase==="mal"?"Mal":"Bien", r.acepta===false?"Rechazado":"Aceptado", r.quien, r.nota]); });
  filas.push([]); filas.push(["INCIDENCIAS"]); filas.push(["Día","Qué pasó","Qué se hizo","Quién","Estado"]);
  state.incidencias.filter(function(i){ return i.fecha.slice(0,7)===m; }).forEach(function(i){ filas.push([dm(i.fecha), i.texto, i.accion, i.quien, i.cerrada?"Resuelta":"Abierta"]); });
  var txt="﻿"+filas.map(function(f){ return f.map(q).join(";"); }).join("\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([txt],{type:"text/csv"})); a.download="control-sanitario-"+m+".csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
}

/* ── ajustes ───────────────────────────────────────────────────── */
function vAjustes(box){
  box.innerHTML=cabecera("Ajustes", "Tus neveras y congeladores, las limpiezas que tocan y quién trabaja en cocina. Con ▲ ▼ los pones en el orden en que salen en «Hoy».")+
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>Neveras y congeladores</h2><button class="btn fuerte sm" data-eq-nuevo>+ Añadir</button></div><div class="tarjeta-cuerpo">'+
      (state.equipos.length?'<div class="tabla-caja"><table><thead><tr><th>Nombre</th><th>Tipo</th><th class="num">Mínimo</th><th class="num">Máximo</th><th></th></tr></thead><tbody>'+
        state.equipos.map(function(e,i){ return '<tr class="clic" data-fila-eq="'+e.id+'"><td>'+flechas("eq",i,state.equipos.length)+esc(e.nombre)+'</td><td>'+esc(TIPOS[e.tipo]||e.tipo)+'</td><td class="num">'+fmtT(e.min)+'</td><td class="num">'+fmtT(e.max)+'</td><td class="num"><button class="btn suave sm" data-eq="'+e.id+'">Cambiar</button></td></tr>'; }).join("")+
      '</tbody></table></div>':'<p class="nota" style="margin:0">Sin equipos.</p>')+
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="lbl">Tomas al día</span>'+
        '<div class="seg"><button data-tur="dos" aria-pressed="'+(state.turnos!=="uno")+'">Dos (mañana y tarde)</button><button data-tur="uno" aria-pressed="'+(state.turnos==="uno")+'">Una</button></div></div>'+
    '</div></section>'+
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>Plan de limpieza</h2><button class="btn fuerte sm" data-ta-nueva>+ Añadir</button></div><div class="tarjeta-cuerpo">'+
      (state.tareas.length?'<div class="tabla-caja"><table><thead><tr><th>Tarea</th><th>Cuándo</th><th></th></tr></thead><tbody>'+
        state.tareas.map(function(t,i){ return '<tr class="clic" data-fila-ta="'+t.id+'"><td>'+flechas("ta",i,state.tareas.length)+esc(t.nombre)+'</td><td>'+esc(textoFrec(t))+'</td><td class="num"><button class="btn suave sm" data-ta="'+t.id+'">Cambiar</button></td></tr>'; }).join("")+
      '</tbody></table></div>':'<p class="nota" style="margin:0">Sin tareas.</p>')+
    '</div></section>'+
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>Desde cuándo llevas el registro</h2></div><div class="tarjeta-cuerpo">'+
      '<p class="nota">Lo de antes de esta fecha no sale como olvidado. Si quieres meter meses atrasados, pon aquí desde cuándo; también cambia sola al apuntar algo más antiguo.</p>'+
      '<div style="display:flex;gap:8px;align-items:center;max-width:360px"><input type="date" id="a_desde" max="'+iso(new Date())+'" value="'+esc(state.desde)+'"><button class="btn" data-desde>Guardar</button></div>'+
    '</div></section>'+
    '<section class="tarjeta" style="margin-bottom:16px;border-color:var(--malo)"><div class="tarjeta-cab"><h2>Empezar de cero</h2></div><div class="tarjeta-cuerpo">'+
      '<p class="nota">Borra todas las temperaturas, limpiezas, mercancía e incidencias apuntadas ('+
        (state.temps.length+state.limpiezas.length+state.recepciones.length+state.incidencias.length)+' registros) y el registro empieza hoy. '+
        'Las neveras, el plan de limpieza y los nombres se quedan. Antes de borrar se descarga una copia por si acaso.</p>'+
      '<button class="btn malo" data-cero>Borrar todos los registros</button>'+
    '</div></section>'+
    '<section class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>Encargados</h2></div><div class="tarjeta-cuerpo">'+
      '<p class="nota">Salen con un toque en «Recibe» al apuntar la mercancía.</p>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+state.encargados.map(function(g,i){ return '<span class="chapa neutra" style="font-size:12.5px;padding:4px 10px">'+esc(g)+' <button class="btn suave sm" data-eq-q="'+i+'" aria-label="Quitar '+esc(g)+'" style="padding:0 4px">✕</button></span>'; }).join("")+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:10px;max-width:360px"><input id="enc_n" placeholder="Nombre del encargado"><button class="btn" data-enc-add>Añadir</button></div>'+
    '</div></section>'+
    '<section class="tarjeta"><div class="tarjeta-cab"><h2>Personal de cocina</h2></div><div class="tarjeta-cuerpo">'+
      '<p class="nota">Salen para elegir quién apunta. También se añaden solos al escribir un nombre nuevo.</p>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+state.gente.map(function(g,i){ return '<span class="chapa neutra" style="font-size:12.5px;padding:4px 10px">'+esc(g)+' <button class="btn suave sm" data-gq="'+i+'" aria-label="Quitar '+esc(g)+'" style="padding:0 4px">✕</button></span>'; }).join("")+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:10px;max-width:360px"><input id="g_n" placeholder="Nombre"><button class="btn" data-g-add>Añadir</button></div>'+
    '</div></section>';
  $("[data-eq-nuevo]", box).addEventListener("click", function(){ editarEq(null, function(){ vAjustes(box); }); });
  $$("[data-fila-eq]", box).forEach(function(tr){ tr.addEventListener("click", function(ev){ if(ev.target.closest("button")) return; editarEq(porId(state.equipos,tr.getAttribute("data-fila-eq")), function(){ vAjustes(box); }); }); });
  $$("[data-fila-ta]", box).forEach(function(tr){ tr.addEventListener("click", function(ev){ if(ev.target.closest("button")) return; editarTa(porId(state.tareas,tr.getAttribute("data-fila-ta")), function(){ vAjustes(box); }); }); });
  $$("[data-mover]", box).forEach(function(b){ b.addEventListener("click", function(){
    var p=b.getAttribute("data-mover").split("|"), l=p[0]==="eq"?state.equipos:state.tareas, i=+p[1], j=i+(+p[2]);
    if(j<0||j>=l.length) return;
    var x=l[i]; l[i]=l[j]; l[j]=x; guardar(); vAjustes(box);
  }); });
  $$("[data-eq]", box).forEach(function(b){ b.addEventListener("click", function(){ editarEq(porId(state.equipos,b.getAttribute("data-eq")), function(){ vAjustes(box); }); }); });
  $("[data-ta-nueva]", box).addEventListener("click", function(){ editarTa(null, function(){ vAjustes(box); }); });
  $$("[data-ta]", box).forEach(function(b){ b.addEventListener("click", function(){ editarTa(porId(state.tareas,b.getAttribute("data-ta")), function(){ vAjustes(box); }); }); });
  $$("[data-tur]", box).forEach(function(b){ b.addEventListener("click", function(){ state.turnos=b.getAttribute("data-tur"); guardar(); vAjustes(box); refrescarRail(); }); });
  $$("[data-gq]", box).forEach(function(b){ b.addEventListener("click", function(){ state.gente.splice(+b.getAttribute("data-gq"),1); guardar(); vAjustes(box); }); });
  $("[data-desde]", box).addEventListener("click", function(){
    var v=$("#a_desde", box).value; if(!v) return;
    state.desde=v; try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){} aviso("Registro desde el "+dm(state.desde)); vAjustes(box);
  });
  $("[data-cero]", box).addEventListener("click", function(){
    var n=state.temps.length+state.limpiezas.length+state.recepciones.length+state.incidencias.length;
    if(!n){ aviso("No hay registros que borrar"); return; }
    confirmar("Borrar todos los registros", "Vas a borrar <b>"+n+" registros</b> (temperaturas, limpiezas, mercancía e incidencias) y empezar de cero hoy. Las neveras, el plan de limpieza y los nombres se quedan.<br><br>Antes se descarga una copia.", function(){
      var a=document.createElement("a");
      a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,1)],{type:"application/json"}));
      a.download="control-sanitario-copia-"+iso(new Date())+".json"; document.body.appendChild(a); a.click(); a.remove();
      state.temps=[]; state.limpiezas=[]; state.recepciones=[]; state.incidencias=[];
      state.desde=iso(new Date());
      try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){}
      ui.fecha=iso(new Date()); ui.mes=ui.fecha.slice(0,7);
      aviso("Registros borrados. Empiezas de cero hoy.");
      render();
    }, "Borrar todo");
  });
  $$("[data-eq-q]", box).forEach(function(b){ b.addEventListener("click", function(){ state.encargados.splice(+b.getAttribute("data-eq-q"),1); guardar(); vAjustes(box); }); });
  $("[data-enc-add]", box).addEventListener("click", function(){
    var n=$("#enc_n", box).value.trim(); if(!n) return;
    if(state.encargados.indexOf(n)<0) state.encargados.push(n); apuntarGente(n); guardar(); vAjustes(box);
  });
  $("[data-g-add]", box).addEventListener("click", function(){ var n=$("#g_n", box).value; if(apuntarGente(n)){ guardar(); vAjustes(box); } });
}
/* Subir y bajar en la lista: en ese orden salen en «Hoy» */
function flechas(k, i, n){
  return '<span class="flechas"><button class="btn suave sm" data-mover="'+k+'|'+i+'|-1"'+(i===0?' disabled':'')+' aria-label="Subir">▲</button>'+
    '<button class="btn suave sm" data-mover="'+k+'|'+i+'|1"'+(i===n-1?' disabled':'')+' aria-label="Bajar">▼</button></span>';
}
function editarEq(e, luego){
  var nuevo=!e; e=e||{tipo:"nevera", min:0, max:4};
  var d=dialogo(nuevo?"Añadir equipo":"Cambiar «"+e.nombre+"»",
    '<div class="campo"><label class="lbl" for="e_n">Nombre</label><input id="e_n" value="'+esc(e.nombre||"")+'" placeholder="Nevera de postres"></div>'+
    '<div class="tres" style="margin-top:10px"><div class="campo"><label class="lbl" for="e_t">Tipo</label><select id="e_t">'+Object.keys(TIPOS).map(function(k){ return '<option value="'+k+'"'+(e.tipo===k?" selected":"")+'>'+TIPOS[k]+'</option>'; }).join("")+'</select></div>'+
      '<div class="campo"><label class="lbl" for="e_min">Mínimo °C</label><input id="e_min" inputmode="decimal" value="'+String(e.min).replace(".",",")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_max">Máximo °C</label><input id="e_max" inputmode="decimal" value="'+String(e.max).replace(".",",")+'"></div></div>',
    (nuevo?'':'<button class="btn malo" data-borrar style="margin-right:auto">Quitar</button>')+'<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-ok>Guardar</button>');
  $("#e_t", d).addEventListener("change", function(){ var r=RANGO[this.value]; $("#e_min", d).value=String(r[0]); $("#e_max", d).value=String(r[1]); });
  $("[data-ok]", d).addEventListener("click", function(){
    var n=$("#e_n", d).value.trim(), mn=num($("#e_min", d).value), mx=num($("#e_max", d).value);
    if(!n){ aviso("Ponle un nombre", true); return; }
    if(mn==null||mx==null||mn>mx){ aviso("Revisa el mínimo y el máximo", true); return; }
    e.nombre=n; e.tipo=$("#e_t", d).value; e.min=mn; e.max=mx;
    if(nuevo){ e.id=uid(); state.equipos.push(e); }
    guardar(); d.close();
  });
  var bb=$("[data-borrar]", d);
  if(bb) bb.addEventListener("click", function(){ confirmar("Quitar equipo", "¿Quitar <b>"+esc(e.nombre)+"</b>? Las temperaturas ya apuntadas se guardan, pero no saldrá en la lista.", function(){
    state.equipos=state.equipos.filter(function(x){ return x!==e; }); guardar(); d.close();
  }, "Quitar"); });
  d.addEventListener("close", function(){ if(luego) luego(); });
}
function editarTa(t, luego){
  var nuevo=!t; t=t||{frec:"diaria", dia:null};
  var d=dialogo(nuevo?"Añadir limpieza":"Cambiar limpieza",
    '<div class="campo"><label class="lbl" for="t_n">Qué se limpia</label><input id="t_n" value="'+esc(t.nombre||"")+'" placeholder="Freidora"></div>'+
    '<div class="dos" style="margin-top:10px"><div class="campo"><label class="lbl" for="t_f">Cada cuánto</label><select id="t_f">'+Object.keys(FREC).map(function(k){ return '<option value="'+k+'"'+(t.frec===k?" selected":"")+'>'+FREC[k]+'</option>'; }).join("")+'</select></div>'+
      '<div class="campo" id="t_dw"><label class="lbl" for="t_d">Qué día</label><select id="t_d"></select></div></div>',
    (nuevo?'':'<button class="btn malo" data-borrar style="margin-right:auto">Quitar</button>')+'<button class="btn" data-x>Cancelar</button><button class="btn fuerte" data-ok>Guardar</button>');
  var fs=$("#t_f", d), ds=$("#t_d", d);
  function pintarDia(){
    var f=fs.value; $("#t_dw", d).style.visibility=f==="diaria"?"hidden":"visible";
    if(f==="semanal") ds.innerHTML=[1,2,3,4,5,6,0].map(function(i){ return '<option value="'+i+'"'+(+t.dia===i&&t.frec==="semanal"?" selected":"")+'>'+DIAS[i]+'</option>'; }).join("");
    else if(f==="mensual"){ var o=""; for(var i=1;i<=31;i++) o+='<option value="'+i+'"'+(+t.dia===i&&t.frec==="mensual"?" selected":"")+'>día '+i+'</option>'; ds.innerHTML=o; }
  }
  fs.addEventListener("change", pintarDia); pintarDia();
  $("[data-ok]", d).addEventListener("click", function(){
    var n=$("#t_n", d).value.trim(); if(!n){ aviso("Escribe qué se limpia", true); return; }
    t.nombre=n; t.frec=fs.value; t.dia=t.frec==="diaria"?null:+ds.value;
    if(nuevo){ t.id=uid(); state.tareas.push(t); }
    guardar(); d.close();
  });
  var bb=$("[data-borrar]", d);
  if(bb) bb.addEventListener("click", function(){ confirmar("Quitar limpieza", "¿Quitar <b>"+esc(t.nombre)+"</b> del plan? Lo ya marcado se guarda.", function(){
    state.tareas=state.tareas.filter(function(x){ return x!==t; }); guardar(); d.close();
  }, "Quitar"); });
  d.addEventListener("close", function(){ if(luego) luego(); });
}

/* ── arranque ──────────────────────────────────────────────────── */
render();
/* Si se deja abierta, a medianoche pasa al día nuevo */
var hoyAnt=iso(new Date());
setInterval(function(){
  var h=iso(new Date());
  if(h===hoyAnt) return;
  if(ui.vista==="hoy" && ui.fecha===hoyAnt && !document.querySelector("dialog[open]") && document.activeElement.tagName!=="INPUT"){ ui.fecha=h; render(); }
  hoyAnt=h;
}, 60000);
})();
