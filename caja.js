/* ══════════════════════════════════════════════════════════════════
   CAJA — el cierre diario del restaurante
   ══════════════════════════════════════════════════════════════════
   El parte de cada día, con los mismos conceptos de siempre:

     Visas         cobrado con tarjeta
     Efectivo      cobrado en metálico
     Pagos         lo que se paga de la caja
     C. amarilla   lo que se aparta al fondo
     Fondo caja    lo que se deja de cambio para mañana
     Sobrante      lo que queda tras repartir

     Sobrante = efectivo − pagos − c. amarilla − fondo caja

   La amarilla tiene un objetivo (1500 € de partida, editable): la app
   dice cuánto lleva, cuánto falta y, si sacas dinero, cuánto reponer.

   Los datos los guarda sync.js en el repositorio privado.
   ══════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var CLAVE = "caja.libro.v1";

function p2(n){ return (n<10?"0":"")+n; }
function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function libroVacio(){
  return {
    v:1, actualizado:new Date().toISOString(),
    ajustes:{ nombre:"", objetivoAmarilla:1500, fondoHabitual:0,
              destinatario:"", prefijo:"376", telefono:"" },
    dias:[],          /* {id, fecha, visa, efectivo, gastos, detalle:[…], aAmarilla, fondoCaja, nota} */
    aportaciones:[],  /* {id, fecha, importe, motivo} — dinero que entra sin ser de la caja */
    retiradas:[]      /* {id, fecha, importe, motivo} — dinero que sale de la amarilla */
  };
}

var libro = libroVacio();
var ui = { vista:"dia", dia:hoyISO(), mes:hoyISO().slice(0,7), anio:hoyISO().slice(0,4) };

/* ── Dinero y fechas ──────────────────────────────────────────── */
function r2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function eur(n){ return (n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
function num(n,d){ d=d||0; return (n||0).toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d}); }
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
           "septiembre","octubre","noviembre","diciembre"];
var DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function mesLargo(ym){ if(!ym) return ""; var a=ym.split("-"); return MESES[+a[1]-1]+" "+a[0]; }
function dmy(iso){ if(!iso) return ""; var a=iso.split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }
function diaSemana(iso){ return DIAS[new Date(iso+"T12:00:00").getDay()]; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

/* ── Guardado ─────────────────────────────────────────────────── */
function guardar(){
  libro.actualizado=new Date().toISOString();
  try{ localStorage.setItem(CLAVE, JSON.stringify(libro)); }catch(e){}
}
function cargar(){
  try{
    var crudo=localStorage.getItem(CLAVE);
    if(!crudo) return;
    var d=JSON.parse(crudo);
    if(!d || typeof d!=="object") return;
    var base=libroVacio();
    Object.keys(base).forEach(function(k){ if(d[k]===undefined) d[k]=base[k]; });
    if(!d.ajustes) d.ajustes=base.ajustes;
    if(d.ajustes.objetivoAmarilla==null) d.ajustes.objetivoAmarilla=1500;
    libro=d;
  }catch(e){}
}

/* ── Aviso flotante ───────────────────────────────────────────── */
var relojAviso=null;
function avisar(mensaje, malo){
  var viejo=document.querySelector(".aviso-flotante"); if(viejo) viejo.remove();
  var a=document.createElement("div");
  a.className="aviso-flotante"+(malo?" malo":"");
  a.textContent=mensaje;
  document.body.appendChild(a);
  clearTimeout(relojAviso);
  relojAviso=setTimeout(function(){ a.remove(); }, malo?5000:2600);
}

/* ── Ventana ──────────────────────────────────────────────────── */
function abrirVentana(titulo, cuerpoHTML, alGuardar, opciones){
  opciones=opciones||{};
  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3>'+
              '<button class="btn suave" data-x>Cerrar</button></div>'+
              '<div class="dlg-cuerpo">'+cuerpoHTML+'</div>'+
              '<div class="dlg-pie"><button class="btn" data-x>Cancelar</button>'+
              '<button class="btn '+(opciones.malo?"malo":"fuerte")+'" data-ok>'+
              esc(opciones.aceptar||"Guardar")+'</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    if(alGuardar()===true) return;
    d.close(); d.remove();
  });
  d.addEventListener("keydown", function(e){
    if(e.key==="Enter" && e.target.tagName==="INPUT"){ e.preventDefault(); d.querySelector("[data-ok]").click(); }
  });
  d.showModal();
  var primero=d.querySelector("input,select,textarea"); if(primero) primero.focus();
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  opciones=opciones||{};
  abrirVentana(titulo, cuerpo, function(){ alAceptar(); },
               {aceptar:opciones.aceptar||"Aceptar", malo:opciones.malo});
}
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():""; }
function numero(id){ var e=document.getElementById(id); return e?(+e.value||0):0; }

/* ══════════════════════════════════════════════════════════════
   CUENTAS
   ══════════════════════════════════════════════════════════════ */
function diaDe(fecha){
  return (libro.dias||[]).filter(function(d){ return d.fecha===fecha; })[0] || null;
}
function totalGastos(d){
  if(!d) return 0;
  if((d.detalle||[]).length) return r2(d.detalle.reduce(function(s,g){ return s+(+g.importe||0); },0));
  return +d.gastos||0;
}
function cuentasDia(d){
  if(!d) return {visa:0, efectivo:0, gastos:0, ventas:0, neto:0,
                 amarilla:0, fondo:0, sobrante:0};
  var visa=+d.visa||0, efectivo=+d.efectivo||0;
  var gastos=totalGastos(d), amarilla=+d.aAmarilla||0;
  var fondo=+d.fondoCaja||0;
  var neto=r2(efectivo-gastos);
  return {
    visa:visa, efectivo:efectivo, gastos:gastos,
    ventas:r2(visa+efectivo),
    neto:neto,                    /* lo que queda tras los pagos */
    amarilla:amarilla,
    fondo:fondo,                  /* lo que se deja de cambio */
    sobrante:r2(neto-amarilla-fondo)
  };
}
function diasDe(prefijo){
  return (libro.dias||[]).filter(function(d){ return (d.fecha||"").indexOf(prefijo)===0; })
                         .sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
}
function sumaCuentas(dias){
  var t={visa:0, efectivo:0, gastos:0, ventas:0, neto:0,
         amarilla:0, fondo:0, sobrante:0, dias:dias.length};
  dias.forEach(function(d){
    var c=cuentasDia(d);
    Object.keys(t).forEach(function(k){ if(k!=="dias") t[k]=r2(t[k]+c[k]); });
  });
  return t;
}

/* La amarilla: lo apartado en los cierres, más lo que se mete de fuera,
   menos lo que se saca. */
function amarillaDeCaja(){
  return r2((libro.dias||[]).reduce(function(s,d){ return s+(+d.aAmarilla||0); },0));
}
function amarillaDeFuera(){
  return r2((libro.aportaciones||[]).reduce(function(s,a){ return s+(+a.importe||0); },0));
}
function amarillaSacado(){
  return r2((libro.retiradas||[]).reduce(function(s,r){ return s+(+r.importe||0); },0));
}
function amarillaGuardado(){
  return r2(amarillaDeCaja()+amarillaDeFuera()-amarillaSacado());
}
function objetivoAmarilla(){ return +libro.ajustes.objetivoAmarilla || 0; }
function faltaAmarilla(){ return r2(Math.max(0, objetivoAmarilla()-amarillaGuardado())); }

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"dia",      nombre:"Día"},
  {id:"mes",      nombre:"Mes"},
  {id:"anio",     nombre:"Año"},
  {id:"amarilla", nombre:"Caja amarilla"},
  {id:"ajustes",  nombre:"Ajustes"}
];

function pintar(){
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Caja</span>'+
        '<span class="sub">'+esc(libro.ajustes.nombre||"Restaurante")+'</span></div>'+
      APARTADOS.map(function(a){
        return '<button class="nav" data-ir="'+a.id+'" aria-current="'+(ui.vista===a.id)+'">'+
               '<span>'+a.nombre+'</span></button>';
      }).join("")+
      '<div class="pie-rail">'+
        '<div id="sync-estado" style="font-size:11.5px;color:var(--muted)"></div>'+
        '<a href="index.html">&larr; Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll("[data-ir]").forEach(function(b){
    b.addEventListener("click", function(){ ui.vista=b.getAttribute("data-ir"); pintar(); });
  });
  if(window.Sync && Sync.mostrarEstadoEn) Sync.mostrarEstadoEn(document.getElementById("sync-estado"));

  var main=document.getElementById("main");
  ({dia:verDia, mes:verMes, anio:verAnio, amarilla:verAmarilla, ajustes:verAjustes})[ui.vista](main);
}

function cabecera(titulo, sub, derecha){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         (sub?'<p>'+sub+'</p>':"")+'</div>'+
         '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:end">'+(derecha||"")+'</div></div>';
}

/* ══════════════════════════════════════════════════════════════
   DÍA
   ══════════════════════════════════════════════════════════════ */
function verDia(main){
  var d=diaDe(ui.dia);
  var c=cuentasDia(d);
  var guardado=amarillaGuardado(), falta=faltaAmarilla();

  main.innerHTML=
    cabecera("Cierre del "+dmy(ui.dia),
      esc(diaSemana(ui.dia).charAt(0).toUpperCase()+diaSemana(ui.dia).slice(1))+
      ". Anota lo cobrado y lo pagado; el reparto se calcula solo.",
      '<div class="campo"><label class="lbl" for="d_fecha">Día</label>'+
      '<input type="date" id="d_fecha" value="'+esc(ui.dia)+'"></div>'+
      '<button class="btn wa" id="d_wa">📱 Enviar por WhatsApp</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Ventas del día</div><div class="v acento">'+eur(c.ventas)+'</div>'+
        '<div class="n">visa + efectivo</div></div>'+
      '<div class="cifra"><div class="k">Visa</div><div class="v">'+eur(c.visa)+'</div>'+
        '<div class="n">'+(c.ventas>0?num(c.visa/c.ventas*100,0)+"% del total":"—")+'</div></div>'+
      '<div class="cifra"><div class="k">Efectivo</div><div class="v">'+eur(c.efectivo)+'</div>'+
        '<div class="n">'+(c.ventas>0?num(c.efectivo/c.ventas*100,0)+"% del total":"—")+'</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(c.gastos)+'</div>'+
        '<div class="n">'+((d&&(d.detalle||[]).length)?d.detalle.length+" apuntes":"pagados de caja")+'</div></div>'+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Fondo de caja</h2>'+
        '<span class="pista">Lo que queda en efectivo, repartido</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<table style="max-width:520px"><tbody>'+
          '<tr><td>Efectivo</td><td class="num">'+eur(c.efectivo)+'</td></tr>'+
          '<tr><td>− Pagos</td><td class="num" style="color:var(--malo)">'+eur(c.gastos)+'</td></tr>'+
          '<tr style="border-top:1px solid var(--linea)"><td><strong>Queda tras los pagos</strong></td>'+
            '<td class="num"><strong>'+eur(c.neto)+'</strong></td></tr>'+
          '<tr><td>− C. amarilla</td>'+
            '<td class="num" style="color:var(--amarilla)"><strong>'+eur(c.amarilla)+'</strong></td></tr>'+
          '<tr><td>− Fondo de caja <span style="color:var(--muted);font-size:12px">(el cambio que dejas)</span></td>'+
            '<td class="num"><strong>'+eur(c.fondo)+'</strong></td></tr>'+
          '<tr style="border-top:2px solid var(--linea)"><td><strong>Sobrante</strong></td>'+
            '<td class="num"><strong style="font-size:16px'+(c.sobrante<0?";color:var(--malo)":"")+'">'+
            eur(c.sobrante)+'</strong></td></tr>'+
        '</tbody></table>'+
        (c.sobrante<0?'<div class="aviso-caja" style="margin:14px 0 0;background:var(--malo-suave);'+
          'border-color:var(--malo);color:var(--malo)">Falta dinero: entre la amarilla y el fondo de caja '+
          'estás apartando más de lo que queda tras los pagos.</div>':"")+
      '</div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>La caja amarilla</h2>'+
        '<span class="pista">Objetivo: '+eur(objetivoAmarilla())+'</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">'+
          '<div><div class="lbl">Guardado</div>'+
            '<div style="font-size:26px;font-weight:600;color:var(--amarilla);font-variant-numeric:tabular-nums">'+
            eur(guardado)+'</div></div>'+
          '<div style="text-align:right">'+
            (falta>0
              ? '<div class="lbl">Falta</div><div style="font-size:18px;font-weight:600">'+eur(falta)+'</div>'
              : '<span class="chapa ok">Fondo completo</span>')+
          '</div>'+
        '</div>'+
        '<div class="barra-fondo"><i style="width:'+
          (objetivoAmarilla()>0?Math.min(100, guardado/objetivoAmarilla()*100).toFixed(1):0)+'%"></i></div>'+
      '</div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>'+(d?"Editar el día":"Anotar el día")+'</h2></div>'+
      '<div class="tarjeta-cuerpo" id="formDia"></div></div>';

  document.getElementById("d_fecha").addEventListener("change", function(){
    ui.dia=this.value; ui.mes=this.value.slice(0,7); pintar();
  });
  document.getElementById("d_wa").addEventListener("click", function(){
    if(!diaDe(ui.dia)){
      avisar("Guarda primero el día y luego lo mandas.", true);
      var g=document.getElementById("f_guardar"); if(g) g.scrollIntoView({block:"center"});
      return;
    }
    enviarDiaPorWhatsApp(ui.dia);
  });

  pintarFormularioDia(d);
}

function pintarFormularioDia(d){
  var caja=document.getElementById("formDia");
  var actual=d||{visa:"", efectivo:"", gastos:"", aAmarilla:"", nota:"", detalle:[]};
  caja.innerHTML=
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="f_visa">Visa (€)</label>'+
        '<input type="number" class="grande" id="f_visa" min="0" step="0.01" value="'+esc(actual.visa)+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_efec">Efectivo (€)</label>'+
        '<input type="number" class="grande" id="f_efec" min="0" step="0.01" value="'+esc(actual.efectivo)+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_amar">C. amarilla (€)</label>'+
        '<input type="number" class="grande" id="f_amar" min="0" step="0.01" value="'+esc(actual.aAmarilla)+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_fondo">Fondo de caja (€)</label>'+
        '<input type="number" class="grande" id="f_fondo" min="0" step="0.01" value="'+
        esc(actual.fondoCaja!=null&&actual.fondoCaja!==""?actual.fondoCaja:(libro.ajustes.fondoHabitual||""))+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:16px 0 8px">Pagos hechos con dinero de la caja</p>'+
    '<div id="gastos"></div>'+
    '<button class="btn sm" id="masGasto" style="margin-top:8px">+ Añadir gasto</button>'+
    '<div class="campo" style="margin-top:16px"><label class="lbl" for="f_nota">Nota del día</label>'+
      '<input id="f_nota" value="'+esc(actual.nota||"")+'" placeholder="Fiesta mayor, cerrado por la tarde…"></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;'+
    'padding-top:14px;border-top:1px solid var(--linea);flex-wrap:wrap;gap:10px">'+
      '<div id="f_resumen" style="font-size:13px;color:var(--muted)"></div>'+
      '<div style="display:flex;gap:8px">'+
        (d?'<button class="btn malo" id="f_borrar">Borrar el día</button>':"")+
        '<button class="btn fuerte" id="f_guardar">'+(d?"Guardar cambios":"Guardar el día")+'</button>'+
      '</div>'+
    '</div>';

  var cajaGastos=document.getElementById("gastos");
  function totalG(){
    var t=0;
    cajaGastos.querySelectorAll(".gasto").forEach(function(f){ t+=+f.querySelector(".g_imp").value||0; });
    return r2(t);
  }
  function refrescar(){
    var visa=numero("f_visa"), efec=numero("f_efec"), g=totalG();
    var am=numero("f_amar"), fondo=numero("f_fondo");
    var neto=r2(efec-g), sobra=r2(neto-am-fondo);
    document.getElementById("f_resumen").innerHTML=
      "Visas <strong>"+eur(visa)+"</strong> · "+
      "tras pagos <strong>"+eur(neto)+"</strong> · "+
      "sobrante <strong"+(sobra<0?' style="color:var(--malo)"':"")+">"+eur(sobra)+"</strong>";
  }
  function añadirGasto(g){
    g=g||{concepto:"", importe:""};
    var f=document.createElement("div");
    f.className="gasto";
    f.style.cssText="display:grid;grid-template-columns:minmax(120px,2fr) 110px auto;gap:8px;margin-top:8px;align-items:end";
    f.innerHTML='<div class="campo"><input class="g_con" value="'+esc(g.concepto)+'" placeholder="Proveedor, hielo, taxi…"></div>'+
                '<div class="campo"><input type="number" class="g_imp" min="0" step="0.01" value="'+esc(g.importe)+'" placeholder="0,00"></div>'+
                '<button class="btn suave sm malo" title="Quitar">✕</button>';
    cajaGastos.appendChild(f);
    f.querySelector("button").addEventListener("click", function(){ f.remove(); refrescar(); });
    f.querySelector(".g_imp").addEventListener("input", refrescar);
  }
  (actual.detalle||[]).forEach(añadirGasto);
  if(!(actual.detalle||[]).length) añadirGasto();
  document.getElementById("masGasto").addEventListener("click", function(){ añadirGasto(); refrescar(); });
  ["f_visa","f_efec","f_amar","f_fondo"].forEach(function(id){
    document.getElementById(id).addEventListener("input", refrescar);
  });
  refrescar();

  document.getElementById("f_guardar").addEventListener("click", function(){
    var detalle=[];
    cajaGastos.querySelectorAll(".gasto").forEach(function(f){
      var con=f.querySelector(".g_con").value.trim();
      var imp=+f.querySelector(".g_imp").value||0;
      if(imp>0) detalle.push({concepto:con||"Gasto", importe:imp});
    });
    var registro=d||{id:uid(), fecha:ui.dia};
    registro.visa=numero("f_visa");
    registro.efectivo=numero("f_efec");
    registro.detalle=detalle;
    registro.gastos=r2(detalle.reduce(function(s,g){ return s+g.importe; },0));
    registro.aAmarilla=numero("f_amar");
    registro.fondoCaja=numero("f_fondo");
    registro.nota=valor("f_nota");
    if(!d) libro.dias.push(registro);
    guardar(); pintar();
    avisar(d?"Día actualizado":"Día guardado: "+eur(cuentasDia(registro).ventas));
  });

  var borrar=document.getElementById("f_borrar");
  if(borrar) borrar.addEventListener("click", function(){
    confirmar("Borrar el día "+dmy(ui.dia),
      '<p style="margin:0">Se borra el cierre de ese día, incluido lo que fue a la caja amarilla.</p>',
      function(){
        libro.dias=(libro.dias||[]).filter(function(x){ return x.fecha!==ui.dia; });
        guardar(); pintar(); avisar("Día borrado");
      }, {aceptar:"Borrar", malo:true});
  });
}

/* ── El parte diario para WhatsApp ─────────────────────────────── */
/* El parte de cada día, con los mismos conceptos y en el mismo orden
   que la hoja de siempre. Los importes se alinean a la derecha para que
   en WhatsApp queden en columna. */
function textoDia(fecha, opciones){
  var d=diaDe(fecha);
  if(!d) return "";
  var c=cuentasDia(d);
  var lineas=[
    ["Visas",       c.visa],
    ["Efectivo",    c.efectivo],
    ["Pagos",       c.gastos],
    ["C. amarilla", c.amarilla],
    ["Fondo caja",  c.fondo],
    ["Sobrante",    c.sobrante]
  ];
  var anchoTexto=Math.max.apply(null, lineas.map(function(x){ return x[0].length; }));
  var anchoImporte=Math.max.apply(null, lineas.map(function(x){ return eur(x[1]).length; }));

  /* Dos versiones del mismo parte:
       - alineada, con letra de maquina, para copiar y pegar
       - sencilla, para el enlace de WhatsApp: su app rechaza el enlace
         cuando lleva acentos graves o adornos, y sale "no se pudo abrir
         este enlace" */
  var alineado = (opciones && opciones.alineado);
  var l=[];
  if(libro.ajustes.nombre) l.push(libro.ajustes.nombre);
  l.push(dmy(fecha)+" - "+diaSemana(fecha));
  l.push("");
  if(alineado) l.push("```");
  lineas.forEach(function(x){
    if(alineado){
      var etiqueta=x[0]+" ".repeat(anchoTexto-x[0].length);
      var importe=eur(x[1]);
      importe=" ".repeat(anchoImporte-importe.length)+importe;
      l.push(etiqueta+"  "+importe);
    } else {
      l.push(x[0]+": "+eur(x[1]));
    }
  });
  if(alineado) l.push("```");
  if(c.gastos>0 && (d.detalle||[]).length){
    l.push("");
    l.push("Pagos:");
    d.detalle.forEach(function(g){ l.push("- "+g.concepto+": "+eur(g.importe)); });
  }
  l.push("");
  var guardado=amarillaGuardado(), falta=faltaAmarilla();
  l.push("Caja amarilla: "+eur(guardado));
  if(falta>0) l.push("faltan "+eur(falta)+" para "+eur(objetivoAmarilla()));
  if(d.nota){ l.push(""); l.push("Nota: "+d.nota); }
  return l.join("\n");
}

/* WhatsApp necesita el numero entero, con el codigo del pais y sin
   signos: si va suelto, te abre el chat de cualquier otro. */
function telefonoCompleto(){
  var pre=String(libro.ajustes.prefijo||"").replace(/\D/g,"");
  var tel=String(libro.ajustes.telefono||"").replace(/[^\d+]/g,"");
  if(!tel) return "";
  if(tel.charAt(0)==="+") return tel.slice(1).replace(/\D/g,"");
  tel=tel.replace(/\D/g,"");
  /* si ya viene con el prefijo delante, no se lo ponemos dos veces */
  if(pre && tel.indexOf(pre)===0 && tel.length>pre.length+5) return tel;
  /* un numero corto es de aqui: le anteponemos el prefijo */
  return (pre && tel.length<=9) ? pre+tel : tel;
}
function telefonoBonito(){
  var pre=String(libro.ajustes.prefijo||"").replace(/\D/g,"");
  var tel=String(libro.ajustes.telefono||"").trim();
  if(!tel) return "";
  return (tel.charAt(0)==="+"?tel:(pre?"+"+pre+" ":"")+tel);
}
function nombreDestino(){
  return libro.ajustes.destinatario || (telefonoBonito()||"quien elijas");
}

/* Enviar el parte. En vez de abrir WhatsApp a ciegas —que muchos
   navegadores bloquean sin avisar— se enseña el parte con un enlace de
   verdad y un boton para copiarlo. Pulsar un enlace nunca se bloquea. */
function enviarDiaPorWhatsApp(fecha){
  var texto=textoDia(fecha, {alineado:true});   /* para leer y copiar */
  var plano=textoDia(fecha);                    /* para el enlace */
  if(!texto){ avisar("Ese dia no tiene nada anotado. Guardalo primero.", true); return; }
  var tel=telefonoCompleto();
  var destino="https://wa.me/"+tel+"?text="+encodeURIComponent(plano);

  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Parte del '+esc(dmy(fecha))+'</h3>'+
      '<button class="btn suave" data-x>Cerrar</button></div>'+
    '<div class="dlg-cuerpo">'+
      (tel
        ? '<p class="nota">Se abrira el chat de <strong>'+esc(nombreDestino())+'</strong> '+
          '<span class="mono">'+esc(telefonoBonito())+'</span>. '+
          '<button class="btn suave sm" data-otro style="padding:2px 6px">Enviar a otro</button></p>'
        : '<p class="nota">No hay ningun numero guardado, asi que WhatsApp te dejara elegir el contacto. '+
          'Ponlo en Ajustes y el parte ira siempre al mismo sitio.</p>')+
      /* En la vista previa se quitan las marcas de bloque: aqui ya se ve
         con letra de maquina, y en WhatsApp se envian igualmente. */
      '<div class="parte" id="parteTexto">'+esc(texto.split("\n").filter(function(x){
         return x.trim()!=="```"; }).join("\n"))+'</div>'+
    '</div>'+
    '<div class="dlg-pie">'+
      '<button class="btn" data-copiar>Copiar el parte</button>'+
      /* Para mandarlo a otra persona sin tocar los ajustes. En el Mac,
         WhatsApp rechaza los enlaces sin numero ("no se pudo abrir este
         enlace"), asi que aqui no se usa ninguno: se copia el parte y se
         abre la aplicacion, y el chat lo elige el a mano. */
      '<button class="btn suave" data-elegir>Copiar y abrir WhatsApp</button>'+
      '<a class="btn wa" href="'+esc(destino)+'" target="_blank" rel="noopener" '+
      'style="text-decoration:none" data-abrir>Abrir WhatsApp</a>'+
    '</div>';
  document.body.appendChild(d);

  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-copiar]").addEventListener("click", function(){
    copiarTexto(texto, this);   /* al copiar va la version alineada */
  });
  var otro=d.querySelector("[data-otro]");
  if(otro) otro.addEventListener("click", function(){
    var escrito=prompt("¿A qué número lo mando? (con el prefijo del país)",
                       telefonoBonito());
    if(escrito===null) return;
    var limpio=escrito.replace(/[^\d]/g,"");
    if(!limpio){ avisar("Ese número no vale.", true); return; }
    var enlace=d.querySelector("[data-abrir]");
    enlace.setAttribute("href", "https://wa.me/"+limpio+"?text="+encodeURIComponent(plano));
    d.querySelector(".nota").innerHTML='Se abrira el chat de <span class="mono">+'+esc(limpio)+'</span>, '+
      'solo para este envio.';
    avisar("Este parte ira a +"+limpio);
  });

  d.querySelector("[data-abrir]").addEventListener("click", function(){
    /* damos tiempo a que abra la pestana antes de cerrar la ventana */
    setTimeout(function(){ if(document.getElementById("dlg")){ d.close(); d.remove(); } }, 600);
  });
  d.querySelector("[data-elegir]").addEventListener("click", function(){
    copiarTexto(texto, null);
    avisar("Parte copiado. Abre el chat que quieras y pegalo.");
    window.location.href="whatsapp://";
    setTimeout(function(){ if(document.getElementById("dlg")){ d.close(); d.remove(); } }, 900);
  });
  d.showModal();
}

/* Copiar al portapapeles, con recambio para cuando el navegador no deja */
function copiarTexto(texto, boton){
  function hecho(){
    if(boton){ var antes=boton.textContent; boton.textContent="Copiado"; 
               setTimeout(function(){ boton.textContent=antes; }, 1800); }
    avisar("Parte copiado");
  }
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(texto).then(hecho, function(){ copiarAMano(texto, hecho); });
  } else {
    copiarAMano(texto, hecho);
  }
}
function copiarAMano(texto, hecho){
  try{
    var ta=document.createElement("textarea");
    ta.value=texto;
    ta.style.cssText="position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok=document.execCommand("copy");
    ta.remove();
    if(ok){ hecho(); return; }
  }catch(e){}
  /* Ultimo recurso: dejar el parte ya seleccionado para copiarlo a mano */
  try{
    var caja=document.getElementById("parteTexto");
    if(caja){
      var rango=document.createRange();
      rango.selectNodeContents(caja);
      var sel=window.getSelection();
      sel.removeAllRanges(); sel.addRange(rango);
      avisar("Te lo dejo seleccionado: pulsa Cmd+C para copiarlo.", true);
      return;
    }
  }catch(e){}
  avisar("No he podido copiarlo. Selecciona el texto a mano.", true);
}

/* ══════════════════════════════════════════════════════════════
   MES: el cuadrante
   ══════════════════════════════════════════════════════════════ */
function verMes(main){
  var dias=diasDe(ui.mes);
  var t=sumaCuentas(dias);

  main.innerHTML=
    cabecera("Cuadrante de "+mesLargo(ui.mes),
      "Un día por fila: lo cobrado, lo pagado y cómo quedó el fondo de caja.",
      '<div class="campo"><label class="lbl" for="m_mes">Mes</label>'+
      '<input type="month" id="m_mes" value="'+esc(ui.mes)+'"></div>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Ventas del mes</div><div class="v acento">'+eur(t.ventas)+'</div>'+
        '<div class="n">'+t.dias+' días anotados</div></div>'+
      '<div class="cifra"><div class="k">Visa</div><div class="v">'+eur(t.visa)+'</div>'+
        '<div class="n">'+(t.ventas>0?num(t.visa/t.ventas*100,0)+"%":"—")+'</div></div>'+
      '<div class="cifra"><div class="k">Efectivo</div><div class="v">'+eur(t.efectivo)+'</div>'+
        '<div class="n">'+(t.ventas>0?num(t.efectivo/t.ventas*100,0)+"%":"—")+'</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(t.gastos)+'</div>'+
        '<div class="n">pagados de caja</div></div>'+
      '<div class="cifra"><div class="k">C. amarilla</div><div class="v amarilla">'+eur(t.amarilla)+'</div>'+
        '<div class="n">guardado este mes</div></div>'+
      '<div class="cifra"><div class="k">Sobrante</div><div class="v">'+eur(t.sobrante)+'</div>'+
        '<div class="n">tras repartir</div></div>'+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Días</h2>'+
      '<span class="pista">Pulsa un día para abrirlo</span></div>'+
      '<div class="tabla-caja" id="cuadrante"></div></div>';

  document.getElementById("m_mes").addEventListener("change", function(){
    ui.mes=this.value; ui.dia=this.value+"-01"; pintar();
  });

  var caja=document.getElementById("cuadrante");
  if(!dias.length){
    caja.innerHTML='<div class="vacio"><strong>Sin días anotados en '+esc(mesLargo(ui.mes))+'</strong>'+
      'Ve a «Día» y anota el primer cierre.</div>';
    return;
  }
  caja.innerHTML='<table><thead><tr><th>Día</th><th class="num">Visas</th><th class="num">Efectivo</th>'+
    '<th class="num">Pagos</th><th class="num">C. amarilla</th><th class="num">Fondo caja</th>'+
    '<th class="num">Sobrante</th><th class="num">Ventas</th><th>Nota</th></tr></thead><tbody>'+
    dias.map(function(d){
      var c=cuentasDia(d);
      var esHoy=(d.fecha===hoyISO());
      return '<tr'+(esHoy?' class="hoy"':'')+' style="cursor:pointer" data-dia="'+d.fecha+'">'+
        "<td><strong>"+d.fecha.slice(8)+"</strong> "+
          '<span style="color:var(--muted);font-size:12px">'+diaSemana(d.fecha).slice(0,3)+"</span></td>"+
        '<td class="num">'+eur(c.visa)+"</td>"+
        '<td class="num">'+eur(c.efectivo)+"</td>"+
        '<td class="num"'+(c.gastos>0?' style="color:var(--malo)"':"")+">"+(c.gastos>0?eur(c.gastos):"—")+"</td>"+
        '<td class="num"'+(c.amarilla>0?' style="color:var(--amarilla);font-weight:600"':"")+">"+
          (c.amarilla>0?eur(c.amarilla):"—")+"</td>"+
        '<td class="num">'+(c.fondo>0?eur(c.fondo):"—")+"</td>"+
        '<td class="num"'+(c.sobrante<0?' style="color:var(--malo)"':"")+"><strong>"+eur(c.sobrante)+"</strong></td>"+
        '<td class="num">'+eur(c.ventas)+"</td>"+
        '<td style="font-size:12.5px;color:var(--muted)">'+esc(d.nota||"")+"</td></tr>";
    }).join("")+
    '</tbody><tfoot><tr><td>'+t.dias+' días</td>'+
      '<td class="num">'+eur(t.visa)+'</td><td class="num">'+eur(t.efectivo)+'</td>'+
      '<td class="num">'+eur(t.gastos)+'</td><td class="num">'+eur(t.amarilla)+'</td>'+
      '<td class="num">'+eur(t.fondo)+'</td><td class="num">'+eur(t.sobrante)+'</td>'+
      '<td class="num">'+eur(t.ventas)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-dia]").forEach(function(tr){
    tr.addEventListener("click", function(){
      ui.dia=tr.getAttribute("data-dia"); ui.vista="dia"; pintar();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   AÑO
   ══════════════════════════════════════════════════════════════ */
function verAnio(main){
  var anios=[...new Set((libro.dias||[]).map(function(d){ return (d.fecha||"").slice(0,4); }))]
              .filter(Boolean).sort();
  if(!anios.length) anios=[ui.anio];
  if(anios.indexOf(ui.anio)<0) ui.anio=anios[anios.length-1];

  var porMes=[];
  for(var m=1;m<=12;m++){
    var ym=ui.anio+"-"+p2(m);
    porMes.push({ym:ym, t:sumaCuentas(diasDe(ym))});
  }
  var total=sumaCuentas(diasDe(ui.anio));
  var mejorMes=porMes.slice().sort(function(a,b){ return b.t.ventas-a.t.ventas; })[0];

  main.innerHTML=
    cabecera("Año "+ui.anio,
      "Cómo ha ido cada mes y lo que se ha guardado en la amarilla.",
      '<div class="campo"><label class="lbl" for="a_anio">Año</label><select id="a_anio">'+
        anios.map(function(a){ return '<option'+(a===ui.anio?" selected":"")+">"+a+"</option>"; }).join("")+
      '</select></div>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Ventas del año</div><div class="v acento">'+eur(total.ventas)+'</div>'+
        '<div class="n">'+total.dias+' días</div></div>'+
      '<div class="cifra"><div class="k">Visa</div><div class="v">'+eur(total.visa)+'</div></div>'+
      '<div class="cifra"><div class="k">Efectivo</div><div class="v">'+eur(total.efectivo)+'</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(total.gastos)+'</div></div>'+
      '<div class="cifra"><div class="k">C. amarilla</div><div class="v amarilla">'+eur(total.amarilla)+'</div></div>'+
      '<div class="cifra"><div class="k">Sobrante</div><div class="v">'+eur(total.sobrante)+'</div></div>'+
      '<div class="cifra"><div class="k">Media por día</div>'+
        '<div class="v">'+eur(total.dias>0?r2(total.ventas/total.dias):0)+'</div>'+
        '<div class="n">'+(mejorMes&&mejorMes.t.ventas>0?"mejor: "+MESES[+mejorMes.ym.split("-")[1]-1]:"")+'</div></div>'+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Mes a mes</h2>'+
      '<span class="pista">Pulsa un mes para ver su cuadrante</span></div>'+
      '<div class="tabla-caja" id="tablaAnio"></div></div>';

  document.getElementById("a_anio").addEventListener("change", function(){ ui.anio=this.value; pintar(); });

  var maximo=Math.max.apply(null, porMes.map(function(p){ return p.t.ventas; }).concat([1]));
  document.getElementById("tablaAnio").innerHTML=
    '<table><thead><tr><th>Mes</th><th class="num">Días</th><th class="num">Visa</th>'+
    '<th class="num">Efectivo</th><th class="num">Ventas</th><th class="num">Gastos</th>'+
    '<th class="num">Amarilla</th><th style="width:130px"></th></tr></thead><tbody>'+
    porMes.map(function(p){
      var vacio=p.t.dias===0;
      return '<tr'+(vacio?' style="opacity:.45"':' style="cursor:pointer"')+' data-mes="'+p.ym+'">'+
        "<td><strong>"+MESES[+p.ym.split("-")[1]-1]+"</strong></td>"+
        '<td class="num">'+(p.t.dias||"—")+"</td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.visa))+"</td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.efectivo))+"</td>"+
        '<td class="num"><strong>'+(vacio?"—":eur(p.t.ventas))+"</strong></td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.gastos))+"</td>"+
        '<td class="num" style="color:var(--amarilla)">'+(vacio?"—":eur(p.t.amarilla))+"</td>"+
        '<td><div style="background:var(--sup2);border-radius:4px;height:7px;overflow:hidden">'+
          '<div style="background:var(--acento);height:100%;width:'+(p.t.ventas/maximo*100).toFixed(1)+'%"></div>'+
        "</div></td></tr>";
    }).join("")+
    '</tbody><tfoot><tr><td>Total</td><td class="num">'+total.dias+'</td>'+
    '<td class="num">'+eur(total.visa)+'</td><td class="num">'+eur(total.efectivo)+'</td>'+
    '<td class="num">'+eur(total.ventas)+'</td><td class="num">'+eur(total.gastos)+'</td>'+
    '<td class="num">'+eur(total.amarilla)+'</td><td></td></tr></tfoot></table>';

  document.querySelectorAll("#tablaAnio [data-mes]").forEach(function(tr){
    tr.addEventListener("click", function(){
      ui.mes=tr.getAttribute("data-mes"); ui.vista="mes"; pintar();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   CAJA AMARILLA
   ══════════════════════════════════════════════════════════════ */
function verAmarilla(main){
  var guardado=amarillaGuardado(), objetivo=objetivoAmarilla(), falta=faltaAmarilla();
  var deCierres=(libro.dias||[]).filter(function(d){ return (+d.aAmarilla||0)>0; })
    .map(function(d){ return {fecha:d.fecha, tipo:"entrada", origen:"cierre",
                              importe:+d.aAmarilla, motivo:"Cierre del día"}; });
  var deFuera=(libro.aportaciones||[]).map(function(a){
    return {id:a.id, fecha:a.fecha, tipo:"entrada", origen:"fuera",
            importe:+a.importe||0, motivo:a.motivo||"Aportación"};
  });
  var salidas=(libro.retiradas||[]).map(function(r){
    return {id:r.id, fecha:r.fecha, tipo:"salida", origen:"salida",
            importe:+r.importe||0, motivo:r.motivo||""};
  });
  var entradas=deCierres.concat(deFuera);
  var movimientos=entradas.concat(salidas)
    .sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });

  var esteMes=r2(entradas.filter(function(a){ return a.fecha.slice(0,7)===ui.mes; })
                         .reduce(function(s,a){ return s+a.importe; },0));

  main.innerHTML=
    cabecera("Caja amarilla",
      "El fondo que se va guardando cada día. Aquí ves cuánto llevas, de dónde salió y lo que se ha sacado.",
      '<button class="btn" id="am_objetivo">Cambiar objetivo</button>'+
      '<button class="btn" id="am_sacar">Sacar dinero</button>'+
      '<button class="btn fuerte" id="am_meter">Meter dinero</button>')+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cuerpo">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:14px">'+
        '<div><div class="lbl">Hay guardado</div>'+
          '<div style="font-size:38px;font-weight:600;color:var(--amarilla);'+
          'font-variant-numeric:tabular-nums;line-height:1.1">'+eur(guardado)+'</div></div>'+
        '<div style="text-align:right">'+
          (falta>0
            ? '<div class="lbl">Falta para llegar a '+eur(objetivo)+'</div>'+
              '<div style="font-size:24px;font-weight:600">'+eur(falta)+'</div>'
            : '<span class="chapa ok" style="font-size:13px;padding:5px 12px">Fondo completo</span>'+
              (guardado>objetivo?'<div class="n" style="margin-top:6px;color:var(--muted)">'+
                eur(r2(guardado-objetivo))+' por encima del objetivo</div>':""))+
        '</div>'+
      '</div>'+
      '<div class="barra-fondo" style="height:14px">'+
        '<i style="width:'+(objetivo>0?Math.min(100,guardado/objetivo*100).toFixed(1):0)+'%"></i></div>'+
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:6px">'+
        '<span>0 €</span><span>Objetivo '+eur(objetivo)+'</span></div>'+
    '</div></div>'+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Guardado este mes</div><div class="v amarilla">'+eur(esteMes)+'</div>'+
        '<div class="n">'+esc(mesLargo(ui.mes))+'</div></div>'+
      '<div class="cifra"><div class="k">De los cierres</div><div class="v">'+eur(amarillaDeCaja())+'</div>'+
        '<div class="n">'+deCierres.length+' días</div></div>'+
      '<div class="cifra"><div class="k">Metido de fuera</div><div class="v">'+eur(amarillaDeFuera())+'</div>'+
        '<div class="n">'+deFuera.length+' aportaciones</div></div>'+
      '<div class="cifra"><div class="k">Retiradas</div><div class="v malo">'+eur(amarillaSacado())+'</div>'+
        '<div class="n">'+salidas.length+' salidas</div></div>'+
    '</div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Movimientos</h2></div>'+
      '<div class="tabla-caja" id="tablaAmarilla"></div></div>';

  document.getElementById("am_objetivo").addEventListener("click", cambiarObjetivo);
  document.getElementById("am_sacar").addEventListener("click", sacarDeAmarilla);
  document.getElementById("am_meter").addEventListener("click", meterEnAmarilla);

  var caja=document.getElementById("tablaAmarilla");
  caja.innerHTML = !movimientos.length
    ? '<div class="vacio"><strong>Todavía no hay movimientos</strong>'+
      'Cada día que guardes algo en el cierre, aparecerá aquí.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Origen</th><th class="num">Entra</th>'+
      '<th class="num">Sale</th><th></th></tr></thead><tbody>'+
      movimientos.slice(0,60).map(function(m){
        var origen = m.origen==="cierre" ? '<span class="chapa neutra">De la caja</span>'
                   : m.origen==="fuera"  ? '<span class="chapa amarilla">De fuera</span>'
                   :                       '<span class="chapa malo">Salida</span>';
        return "<tr><td>"+esc(dmy(m.fecha))+"</td><td>"+esc(m.motivo)+"</td><td>"+origen+"</td>"+
          '<td class="num" style="color:var(--amarilla)">'+(m.tipo==="entrada"?eur(m.importe):"—")+"</td>"+
          '<td class="num" style="color:var(--malo)">'+(m.tipo==="salida"?eur(m.importe):"—")+"</td>"+
          "<td>"+(m.origen==="cierre"
            ? '<span style="color:var(--muted);font-size:12px">del día '+esc(dmy(m.fecha))+'</span>'
            : '<div class="acciones-fila"><button class="btn suave sm malo" data-mdel="'+m.origen+'|'+m.id+'">Borrar</button></div>')+
          "</td></tr>";
      }).join("")+"</tbody></table>";

  caja.querySelectorAll("[data-mdel]").forEach(function(b){
    b.addEventListener("click", function(){
      var partes=b.getAttribute("data-mdel").split("|");
      if(partes[0]==="fuera"){
        libro.aportaciones=(libro.aportaciones||[]).filter(function(a){ return a.id!==partes[1]; });
        avisar("Aportación borrada");
      } else {
        libro.retiradas=(libro.retiradas||[]).filter(function(r){ return r.id!==partes[1]; });
        avisar("Retirada borrada");
      }
      guardar(); pintar();
    });
  });
}

function cambiarObjetivo(){
  abrirVentana("Objetivo de la caja amarilla",
    '<p class="nota">Cuánto tiene que haber guardado en la amarilla.</p>'+
    '<div class="campo" style="max-width:200px"><label class="lbl" for="ob_val">Objetivo (€)</label>'+
    '<input type="number" id="ob_val" class="grande" min="0" step="10" value="'+esc(objetivoAmarilla())+'"></div>',
    function(){
      libro.ajustes.objetivoAmarilla=numero("ob_val");
      guardar(); pintar(); avisar("Objetivo: "+eur(objetivoAmarilla()));
    });
}

/* Reponer la amarilla con dinero que no sale de la caja del día:
   del banco, del bolsillo, de donde sea. No toca el cierre diario. */
function meterEnAmarilla(){
  var guardado=amarillaGuardado(), falta=faltaAmarilla();
  abrirVentana("Meter dinero en la caja amarilla",
    '<p class="nota">Para reponer con dinero que <strong>no sale de la caja del día</strong>. '+
    'No cambia ningún cierre: solo suma al fondo.</p>'+
    (falta>0
      ? '<div class="aviso-caja" style="background:var(--amarilla-suave);border-color:var(--amarilla-linea);'+
        'color:var(--amarilla)">Ahora hay '+eur(guardado)+'. Faltan <strong>'+eur(falta)+
        '</strong> para llegar a '+eur(objetivoAmarilla())+'.</div>'
      : '<div class="aviso-caja" style="background:var(--ok-suave);border-color:var(--ok);color:var(--ok)">'+
        'El fondo ya está completo ('+eur(guardado)+').</div>')+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="me_fecha">Fecha</label>'+
        '<input type="date" id="me_fecha" value="'+esc(hoyISO())+'"></div>'+
      '<div class="campo"><label class="lbl" for="me_imp">Importe (€)</label>'+
        '<input type="number" id="me_imp" class="grande" min="0" step="0.01" value="'+
        (falta>0?esc(falta):"")+'"></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="me_mot">De dónde sale</label>'+
        '<input id="me_mot" placeholder="Del banco, aportación propia, devolución…"></div>'+
    '</div>'+
    (falta>0?'<p class="nota" style="margin-top:12px">Viene puesto lo que falta para completar el fondo; '+
      'cámbialo si metes otra cantidad.</p>':""),
    function(){
      var imp=numero("me_imp");
      if(!imp){ avisar("Pon el importe.", true); return true; }
      libro.aportaciones=libro.aportaciones||[];
      libro.aportaciones.push({id:uid(), fecha:valor("me_fecha")||hoyISO(),
                               importe:imp, motivo:valor("me_mot")||"Aportación"});
      guardar(); pintar();
      var restante=faltaAmarilla();
      avisar(restante>0 ? "Metidos "+eur(imp)+". Faltan "+eur(restante)+"."
                        : "Metidos "+eur(imp)+". Fondo completo.");
    }, {aceptar:"Meter"});
}

function sacarDeAmarilla(){
  var guardado=amarillaGuardado();
  abrirVentana("Sacar de la caja amarilla",
    '<p class="nota">Ahora mismo hay <strong>'+eur(guardado)+'</strong>. '+
    'Lo que saques se descuenta y el fondo quedará por debajo del objetivo.</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="sa_fecha">Fecha</label>'+
        '<input type="date" id="sa_fecha" value="'+esc(hoyISO())+'"></div>'+
      '<div class="campo"><label class="lbl" for="sa_imp">Importe (€)</label>'+
        '<input type="number" id="sa_imp" min="0" step="0.01"></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="sa_mot">Motivo</label>'+
        '<input id="sa_mot" placeholder="Ingreso en el banco, pago a proveedor…"></div>'+
    '</div>',
    function(){
      var imp=numero("sa_imp");
      if(!imp){ avisar("Pon el importe.", true); return true; }
      libro.retiradas.push({id:uid(), fecha:valor("sa_fecha")||hoyISO(),
                            importe:imp, motivo:valor("sa_mot")||"Retirada"});
      guardar(); pintar();
      var falta=faltaAmarilla();
      avisar(falta>0 ? "Sacados "+eur(imp)+". Faltan "+eur(falta)+" para el objetivo."
                     : "Sacados "+eur(imp));
    }, {aceptar:"Sacar"});
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function verAjustes(main){
  main.innerHTML=
    cabecera("Ajustes", "El nombre que sale en el parte y a quién se lo mandas.")+
    '<div class="tarjeta" style="max-width:560px"><div class="tarjeta-cuerpo">'+
      '<div class="rejilla">'+
        '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="aj_nom">Nombre del restaurante</label>'+
          '<input id="aj_nom" value="'+esc(libro.ajustes.nombre||"")+'"></div>'+
        '<div class="campo"><label class="lbl" for="aj_obj">Objetivo de la caja amarilla (€)</label>'+
          '<input type="number" id="aj_obj" min="0" step="10" value="'+esc(objetivoAmarilla())+'"></div>'+
        '<div class="campo"><label class="lbl" for="aj_fondo">Fondo de caja habitual (€)</label>'+
          '<input type="number" id="aj_fondo" min="0" step="0.01" value="'+esc(libro.ajustes.fondoHabitual||"")+'"'+
          ' placeholder="349"></div>'+
      '</div>'+
      '<p class="nota" style="margin:12px 0 0">El fondo habitual es el cambio que sueles dejar en la caja. '+
      'Viene puesto en cada día nuevo y lo cambias si un día dejas otra cantidad.</p>'+

      '<p class="nota" style="margin:18px 0 8px"><strong style="color:var(--tinta)">A quién se manda el parte</strong></p>'+
      '<div class="rejilla">'+
        '<div class="campo"><label class="lbl" for="aj_dest">Nombre</label>'+
          '<input id="aj_dest" value="'+esc(libro.ajustes.destinatario||"")+'" placeholder="Valeriano"></div>'+
        '<div class="campo"><label class="lbl" for="aj_pre">Prefijo del país</label>'+
          '<input id="aj_pre" class="mono" value="'+esc(libro.ajustes.prefijo||"376")+'" placeholder="376"></div>'+
        '<div class="campo"><label class="lbl" for="aj_tel">Teléfono</label>'+
          '<input id="aj_tel" class="mono" value="'+esc(libro.ajustes.telefono||"")+'" placeholder="800100"></div>'+
      '</div>'+
      '<p class="nota" style="margin:10px 0 0" id="aj_previo"></p>'+
      '<p class="nota" style="margin:14px 0 0">Con el número puesto, el parte diario va directo a ese chat. '+
      'Si lo dejas vacío, WhatsApp te dejará elegir el contacto.</p>'+
      '<button class="btn fuerte" id="aj_guardar" style="margin-top:14px">Guardar</button>'+
    '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;margin-top:16px">'+
      '<div class="tarjeta-cab"><h2>Cómo se calcula</h2></div>'+
      '<div class="tarjeta-cuerpo" style="font-size:13px;color:var(--muted);line-height:1.7">'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Sobrante</strong> = efectivo − pagos '+
        '− c. amarilla − fondo de caja.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Fondo de caja</strong> es el cambio que '+
        'dejas para el día siguiente; no es un resultado, lo pones tú.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Ventas</strong> = visas + efectivo.</p>'+
        '<p style="margin:0"><strong style="color:var(--tinta)">Caja amarilla</strong> = lo apartado cada día, '+
        'más lo que metas de fuera, menos lo que saques.</p>'+
      '</div></div>';

  /* Mientras escribe, le enseñamos el número tal cual lo verá WhatsApp */
  function previoDestino(){
    var caja=document.getElementById("aj_previo"); if(!caja) return;
    var pre=valor("aj_pre").replace(/\D/g,""), tel=valor("aj_tel").replace(/\D/g,"");
    if(!tel){ caja.textContent="Sin número, WhatsApp te dejará elegir el contacto cada vez."; return; }
    var entero=(pre && tel.length<=9 && tel.indexOf(pre)!==0) ? pre+tel : tel;
    caja.innerHTML='El parte se abrirá en <strong>wa.me/'+esc(entero)+'</strong>'+
      (valor("aj_dest")?' — '+esc(valor("aj_dest")):"")+
      '. Si te sale otro contacto, revisa el prefijo.';
  }
  ["aj_pre","aj_tel","aj_dest"].forEach(function(id){
    var e=document.getElementById(id); if(e) e.addEventListener("input", previoDestino);
  });
  previoDestino();

  document.getElementById("aj_guardar").addEventListener("click", function(){
    libro.ajustes.nombre=valor("aj_nom");
    libro.ajustes.objetivoAmarilla=numero("aj_obj");
    libro.ajustes.telefono=valor("aj_tel");
    libro.ajustes.prefijo=valor("aj_pre");
    libro.ajustes.destinatario=valor("aj_dest");
    libro.ajustes.fondoHabitual=numero("aj_fondo");
    guardar(); pintar();
    avisar(telefonoCompleto()
      ? "El parte irá a "+nombreDestino()+" "+telefonoBonito()
      : "Ajustes guardados");
  });
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
