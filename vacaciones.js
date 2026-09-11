/* ══════════════════════════════════════════════════════════════════
   VACACIONES — quién ha pagado qué, y cómo se cuadra al final
   ══════════════════════════════════════════════════════════════════
   En un viaje paga el que tiene la tarjeta más a mano. Uno pone la casa,
   otro el alquiler del coche, otro va poniendo las comidas. Al volver,
   nadie se acuerda de nada y se acaba haciendo a ojo.

   Aquí se apunta cada gasto con dos cosas: QUIÉN lo pagó y PARA QUIÉN
   era. Casi siempre para todos, pero no siempre —una excursión que dos
   no hicieron, una cena de la que alguien se fue—, y es justo eso lo que
   no se puede reconstruir después. Por eso se pregunta al apuntarlo, que
   es cuando se sabe.

   De ahí salen tres cifras por persona:

     ha pagado    lo que ha puesto de su bolsillo
     le tocaba    su parte de los gastos en los que entraba
     saldo        la resta: a favor si le deben, en contra si debe

   Y del saldo sale el cuadre: quién le paga a quién y cuánto, con los
   menos movimientos posibles. Con cuatro personas, lo normal es que se
   arregle con dos transferencias y no con doce.

   Los gastos se reparten a partes iguales entre la gente a la que iban.
   Si una vez hay que hacerlo desigual, se apunta como dos gastos.

   Los datos los guarda sync.js en el repositorio privado.
   ══════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var CLAVE = "vacaciones.libro.v1";

function p2(n){ return (n<10?"0":"")+n; }
function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function libroVacio(){
  return {
    v:1, actualizado:new Date().toISOString(),
    ajustes:{ viajeAbierto:null },
    viajes:[]   /* {id, nombre, lugar, desde, hasta, moneda, cerrado,
                    gente:[{id,nombre}],
                    gastos:[{id,fecha,concepto,importe,paga,para:[]}],
                    pagos:[{id,fecha,de,a,importe}] } */
  };
}

var libro = libroVacio();
var ui = { vista:"gastos" };

/* ── Dinero, fechas y texto ───────────────────────────────────── */
function r2(n){ return Math.round(((+n||0)+Number.EPSILON)*100)/100; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function num(n,d){ d=(d==null?2:d); return (+n||0).toLocaleString("es-ES",
  {minimumFractionDigits:d, maximumFractionDigits:d}); }
function plural(n, uno, varios){ return n+" "+(n===1?uno:varios); }
function dmy(iso){ if(!iso) return ""; var a=String(iso).split("-");
  return a.length===3 ? a[2]+"/"+a[1]+"/"+a[0] : iso; }
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():""; }
function numero(id){ var e=document.getElementById(id); return e?(+e.value||0):0; }

/* ── Guardar ──────────────────────────────────────────────────── */
function guardar(){
  libro.actualizado=new Date().toISOString();
  try{ localStorage.setItem(CLAVE, JSON.stringify(libro)); }
  catch(e){ avisar("No he podido guardar: "+e.message, true); }
}
function cargar(){
  try{
    var t=localStorage.getItem(CLAVE);
    if(t){ var d=JSON.parse(t); if(d && typeof d==="object") libro=d; }
  }catch(e){}
  if(!libro.ajustes) libro.ajustes={};
  if(!libro.viajes) libro.viajes=[];
  libro.viajes.forEach(function(v){
    if(!v.id) v.id=uid();
    if(!v.gente) v.gente=[];
    if(!v.gastos) v.gastos=[];
    if(!v.pagos) v.pagos=[];
    if(!v.moneda) v.moneda="€";
    v.gente.forEach(function(p){ if(!p.id) p.id=uid(); });
    v.gastos.forEach(function(g){ if(!g.id) g.id=uid(); if(!g.para) g.para=[]; });
  });
  /* Si el viaje que estaba abierto ya no existe, se abre el último. */
  if(!viajeAbierto() && libro.viajes.length)
    libro.ajustes.viajeAbierto=libro.viajes[libro.viajes.length-1].id;
}

var elAviso=null;
function avisar(mensaje, malo){
  if(elAviso) elAviso.remove();
  var d=document.createElement("div");
  d.className="aviso-flotante"+(malo?" malo":"");
  d.textContent=mensaje;
  document.body.appendChild(d); elAviso=d;
  setTimeout(function(){ if(d===elAviso){ d.remove(); elAviso=null; } }, malo?4200:2600);
}

/* ── El viaje ─────────────────────────────────────────────────── */
function viajeAbierto(){
  var id=libro.ajustes.viajeAbierto;
  return libro.viajes.filter(function(v){ return v.id===id; })[0] || null;
}
function moneda(v){ return (v&&v.moneda)||"€"; }
function eur(n, v){ return num(n)+" "+moneda(v||viajeAbierto()); }
function personaDe(v, id){
  return (v.gente||[]).filter(function(p){ return p.id===id; })[0] || null;
}
function nombreDe(v, id){
  var p=personaDe(v, id);
  return p ? p.nombre : "—";
}
/* Sin nadie marcado, el gasto era para todos: es el caso de nueve de
   cada diez y no tiene sentido obligar a marcarlos uno por uno. */
function paraDe(v, g){
  var ids=(g.para||[]).filter(function(id){ return !!personaDe(v, id); });
  return ids.length ? ids : (v.gente||[]).map(function(p){ return p.id; });
}
function gastosOrdenados(v){
  return (v.gastos||[]).slice().sort(function(a,b){
    return String(b.fecha||"").localeCompare(String(a.fecha||"")) ||
           String(b.id).localeCompare(String(a.id));
  });
}

/* ── Las cuentas ──────────────────────────────────────────────── */
function totalViaje(v){
  return r2((v.gastos||[]).reduce(function(t,g){ return t+(+g.importe||0); },0));
}
function haPagado(v, pid){
  return r2((v.gastos||[]).reduce(function(t,g){
    return t + (g.paga===pid ? (+g.importe||0) : 0); },0));
}
/* Su parte: de cada gasto en el que entraba, lo que valía dividido entre
   los que entraban. No se redondea por gasto —con tres personas y 10 €,
   redondear cada trozo a 3,33 pierde un céntimo por gasto y al final del
   viaje faltan veinte—; se suma entero y se redondea al final. */
function leToca(v, pid){
  return r2((v.gastos||[]).reduce(function(t,g){
    var para=paraDe(v, g);
    if(para.indexOf(pid)<0 || !para.length) return t;
    return t + (+g.importe||0)/para.length;
  },0));
}
function haEntregado(v, pid){
  return r2((v.pagos||[]).reduce(function(t,p){
    return t + (p.de===pid ? (+p.importe||0) : 0); },0));
}
function haRecibido(v, pid){
  return r2((v.pagos||[]).reduce(function(t,p){
    return t + (p.a===pid ? (+p.importe||0) : 0); },0));
}
/* A favor si le deben, en contra si debe. Los pagos ya hechos entre
   ellos entran aquí: quien ya ha soltado el dinero deja de deberlo. */
function saldo(v, pid){
  return r2(haPagado(v,pid) - leToca(v,pid) + haEntregado(v,pid) - haRecibido(v,pid));
}

/* El cuadre, con los menos movimientos posibles: se empareja siempre al
   que más debe con el que más tiene que cobrar. Así, con cuatro
   personas, se suele arreglar con dos transferencias y no con doce. */
/* Los saldos de todos, cuadrados entre sí.

   Cada saldo se redondea a céntimos por su cuenta, y al redondear pueden
   dejar de sumar cero: un viaje de 1.992,55 € entre cuatro dejaba un
   céntimo suelto. Ese céntimo hacía que el viaje no cuadrara nunca —
   siempre quedaba un pago de 0,01 € por hacer—, así que se carga en el
   saldo más gordo, que es donde menos se nota.

   Lo usan las fichas de la gente y el cuadre, los dos: si cada uno
   arreglara el céntimo por su cuenta, la ficha diría una cosa y el pago
   otra, que es justo lo que pasaba. */
function saldosCuadrados(v){
  var saldos=(v.gente||[]).map(function(p){ return {id:p.id, s:saldo(v, p.id)}; });
  var sobra=r2(saldos.reduce(function(t,x){ return t+x.s; },0));
  if(Math.abs(sobra)>=0.005 && saldos.length){
    var gordo=saldos.slice().sort(function(a,b){ return Math.abs(b.s)-Math.abs(a.s); })[0];
    gordo.s=r2(gordo.s-sobra);
  }
  return saldos;
}
function saldoCuadrado(v, pid){
  var x=saldosCuadrados(v).filter(function(y){ return y.id===pid; })[0];
  return x ? x.s : 0;
}

function comoCuadra(v){
  var CENT=0.005;
  var debe=[], cobra=[];
  saldosCuadrados(v).forEach(function(x){
    if(x.s < -CENT) debe.push({id:x.id, falta:-x.s});
    else if(x.s > CENT) cobra.push({id:x.id, falta:x.s});
  });
  debe.sort(function(a,b){ return b.falta-a.falta; });
  cobra.sort(function(a,b){ return b.falta-a.falta; });

  var pasos=[], i=0, j=0, vueltas=0;
  while(i<debe.length && j<cobra.length && vueltas<500){
    vueltas++;
    var cuanto=Math.min(debe[i].falta, cobra[j].falta);
    if(cuanto>CENT) pasos.push({de:debe[i].id, a:cobra[j].id, importe:r2(cuanto)});
    debe[i].falta=r2(debe[i].falta-cuanto);
    cobra[j].falta=r2(cobra[j].falta-cuanto);
    if(debe[i].falta<=CENT) i++;
    if(cobra[j].falta<=CENT) j++;
  }
  return pasos;
}
/* Cuadrado es que no quede ningún pago por hacer. Un céntimo de resto
   no es una deuda: nadie se hace una transferencia de 0,01 €. */
function estaCuadrado(v){ return comoCuadra(v).length===0; }

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"gastos",  nombre:"Gastos", cuenta:function(){
     var v=viajeAbierto(); return v ? (v.gastos||[]).length : 0; }},
  {id:"cuentas", nombre:"Cuentas"},
  {id:"viajes",  nombre:"Viajes"}
];

function pintar(){
  var v=viajeAbierto();
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Vacaciones</span>'+
        '<span class="sub">'+esc(v?v.nombre:"sin viaje")+'</span></div>'+
      APARTADOS.map(function(a){
        var c=a.cuenta?a.cuenta():0;
        return '<button class="nav" data-ir="'+a.id+'" aria-current="'+(ui.vista===a.id)+'">'+
               '<span>'+a.nombre+'</span>'+(c?'<span class="cuenta">'+c+'</span>':"")+'</button>';
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

  ({gastos:verGastos, cuentas:verCuentas, viajes:verViajes})[ui.vista](document.getElementById("main"));
}

function cabecera(titulo, sub, derecha){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         (sub?'<p>'+sub+'</p>':"")+'</div>'+
         '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:end">'+(derecha||"")+'</div></div>';
}

/* Lo primero de todo es que haya viaje y gente: sin eso, apuntar un
   gasto no tiene dónde ir. */
function faltaLoBasico(main, v){
  if(!libro.viajes.length){
    main.innerHTML=cabecera("Vacaciones",
      "Un sitio para apuntar quién paga qué, y cuadrarlo al volver.")+
      '<div class="tarjeta"><div class="vacio"><strong>Todavía no hay ningún viaje</strong>'+
      'Empieza por crear uno: un nombre, las fechas y quién va.'+
      '<div style="margin-top:16px"><button class="btn fuerte" id="fb_viaje">Crear el primer viaje</button></div>'+
      '</div></div>';
    document.getElementById("fb_viaje").addEventListener("click", function(){ editarViaje(null); });
    return true;
  }
  if(!v){ ui.vista="viajes"; pintar(); return true; }
  if(!(v.gente||[]).length){
    main.innerHTML=cabecera(v.nombre, "Primero, quién va.")+
      '<div class="tarjeta"><div class="vacio"><strong>Este viaje no tiene gente</strong>'+
      'Sin saber quiénes van no se puede repartir nada. Añádelos y ya podrás apuntar gastos.'+
      '<div style="margin-top:16px"><button class="btn fuerte" id="fb_gente">Añadir gente</button></div>'+
      '</div></div>';
    document.getElementById("fb_gente").addEventListener("click", function(){ editarPersona(v, null); });
    return true;
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════
   GASTOS
   ══════════════════════════════════════════════════════════════ */
function verGastos(main){
  var v=viajeAbierto();
  if(faltaLoBasico(main, v)) return;

  var lista=gastosOrdenados(v);
  var total=totalViaje(v);
  var porCabeza=(v.gente||[]).length ? r2(total/v.gente.length) : 0;

  main.innerHTML=
    cabecera(v.nombre,
      (v.lugar?esc(v.lugar)+". ":"")+
      "Apunta cada gasto con quién lo pagó y para quién era. Lo demás sale solo.",
      '<button class="btn fuerte" id="g_nuevo">+ Apuntar gasto</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Gastado en total</div>'+
        '<div class="v acento">'+eur(total, v)+'</div>'+
        '<div class="n">'+plural(lista.length,"gasto","gastos")+'</div></div>'+
      '<div class="cifra"><div class="k">Sale a</div><div class="v">'+eur(porCabeza, v)+'</div>'+
        '<div class="n">por cabeza, entre '+plural(v.gente.length,"persona","personas")+'</div></div>'+
      '<div class="cifra"><div class="k">Días</div>'+
        '<div class="v">'+(diasDeViaje(v)||"—")+'</div>'+
        '<div class="n">'+(diasDeViaje(v)
          ? eur(r2(total/diasDeViaje(v)), v)+" al día" : "ponle fechas al viaje")+'</div></div>'+
      '<div class="cifra"><div class="k">Cuadre</div>'+
        '<div class="v '+(estaCuadrado(v)?"ok":"malo")+'">'+
          (estaCuadrado(v)?"Cuadra":plural(comoCuadra(v).length,"pago","pagos"))+'</div>'+
        '<div class="n">'+(estaCuadrado(v)?"nadie debe nada":"para dejarlo a cero")+'</div></div>'+
    '</div>'+

    (lista.length
      ? '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr>'+
          '<th>Día</th><th>Concepto</th><th>Lo pagó</th><th>Para quién</th>'+
          '<th class="num">Importe</th><th></th></tr></thead><tbody>'+
        lista.map(function(g){
          var para=paraDe(v, g);
          var todos=(para.length===(v.gente||[]).length);
          return '<tr>'+
            '<td class="mono">'+esc(dmy(g.fecha))+'</td>'+
            '<td><strong>'+esc(g.concepto||"—")+'</strong></td>'+
            '<td>'+esc(nombreDe(v, g.paga))+'</td>'+
            '<td>'+(todos
              ? '<span class="chapa neutra">todos</span>'
              : '<span class="gasto-para">'+para.map(function(id){
                  return esc(nombreDe(v,id)); }).join(", ")+'</span>')+
              (para.length>1?' <span class="gasto-para">· '+eur(r2((+g.importe||0)/para.length), v)+
                ' cada uno</span>':"")+'</td>'+
            '<td class="num"><strong>'+eur(g.importe, v)+'</strong></td>'+
            '<td class="num"><div class="acciones-fila">'+
              '<button class="btn suave sm" data-editar="'+esc(g.id)+'">Cambiar</button>'+
              '<button class="btn suave sm malo" data-borrar="'+esc(g.id)+'" title="Borrarlo">✕</button>'+
            '</div></td>'+
          '</tr>';
        }).join("")+
        '</tbody><tfoot><tr><td colspan="4">Total</td>'+
          '<td class="num">'+eur(total, v)+'</td><td></td></tr></tfoot></table></div></div>'
      : '<div class="tarjeta"><div class="vacio"><strong>Todavía no hay gastos</strong>'+
        'Apunta el primero con el botón de arriba. Da igual el orden: luego se ordenan por día.'+
        '</div></div>');

  document.getElementById("g_nuevo").addEventListener("click", function(){ editarGasto(v, null); });
  main.querySelectorAll("[data-editar]").forEach(function(b){
    b.addEventListener("click", function(){
      editarGasto(v, (v.gastos||[]).filter(function(g){ return g.id===b.getAttribute("data-editar"); })[0]);
    });
  });
  main.querySelectorAll("[data-borrar]").forEach(function(b){
    b.addEventListener("click", function(){
      var g=(v.gastos||[]).filter(function(x){ return x.id===b.getAttribute("data-borrar"); })[0];
      if(!g) return;
      confirmar("Borrar el gasto",
        '<p style="margin:0"><strong>'+esc(g.concepto||"—")+'</strong>, '+eur(g.importe, v)+
        ', que pagó '+esc(nombreDe(v, g.paga))+'. Se va de la lista y las cuentas se rehacen.</p>',
        function(){
          v.gastos=(v.gastos||[]).filter(function(x){ return x.id!==g.id; });
          guardar(); pintar(); avisar("Gasto borrado");
        }, {aceptar:"Borrarlo", malo:true});
    });
  });
}

function diasDeViaje(v){
  if(!v.desde || !v.hasta) return 0;
  var a=Date.parse(v.desde+"T00:00:00"), b=Date.parse(v.hasta+"T00:00:00");
  if(isNaN(a)||isNaN(b)||b<a) return 0;
  return Math.round((b-a)/(1000*60*60*24))+1;
}

/* ── Apuntar un gasto ─────────────────────────────────────────── */
function editarGasto(v, g){
  var nuevo=!g;
  g=g||{id:null, fecha:hoyISO(), concepto:"", importe:null, paga:(v.gente[0]||{}).id, para:[]};
  var paraAhora=(g.para||[]).slice();

  abrirVentana(nuevo?"Apuntar un gasto":"Cambiar el gasto",
    '<div class="rejilla">'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="ga_con">Qué fue</label>'+
        '<input id="ga_con" class="grande" value="'+esc(g.concepto)+'" '+
        'placeholder="Cena en el puerto, gasolina, entradas…"></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-top:12px">'+
      '<div class="campo"><label class="lbl" for="ga_imp">Cuánto ('+esc(moneda(v))+')</label>'+
        '<input type="number" id="ga_imp" class="grande" min="0" step="0.01" '+
        'value="'+(g.importe!=null?esc(g.importe):"")+'" placeholder="0,00"></div>'+
      '<div class="campo"><label class="lbl" for="ga_dia">Qué día</label>'+
        '<input type="date" id="ga_dia" value="'+esc(g.fecha||hoyISO())+'"></div>'+
      '<div class="campo"><label class="lbl" for="ga_paga">Quién lo pagó</label>'+
        '<select id="ga_paga">'+v.gente.map(function(p){
          return '<option value="'+esc(p.id)+'"'+(p.id===g.paga?" selected":"")+'>'+
                 esc(p.nombre)+'</option>'; }).join("")+'</select></div>'+
    '</div>'+
    '<div style="margin-top:16px">'+
      '<div class="lbl">Para quién era</div>'+
      '<div class="quienes" id="ga_para">'+
        v.gente.map(function(p){
          var dentro=!paraAhora.length || paraAhora.indexOf(p.id)>=0;
          return '<button type="button" class="quien-chip" data-p="'+esc(p.id)+'" '+
                 'aria-pressed="'+dentro+'">'+esc(p.nombre)+'</button>';
        }).join("")+
      '</div>'+
      '<p class="nota" style="margin:8px 0 0" id="ga_reparto"></p>'+
    '</div>',
    function(){
      var imp=numero("ga_imp");
      if(!imp){ avisar("Ponle un importe.", true); return true; }
      var marcados=[].slice.call(document.querySelectorAll('#ga_para [aria-pressed="true"]'))
                      .map(function(b){ return b.getAttribute("data-p"); });
      if(!marcados.length){ avisar("Marca al menos a una persona.", true); return true; }
      var destino=g.id ? g : {id:uid()};
      destino.fecha=valor("ga_dia")||hoyISO();
      destino.concepto=valor("ga_con")||"Gasto";
      destino.importe=r2(imp);
      destino.paga=valor("ga_paga");
      /* Si van todos, se guarda vacío: así, si mañana entra alguien más
         en el viaje, los gastos de «todos» le incluyen solos. */
      destino.para=(marcados.length===v.gente.length) ? [] : marcados;
      if(!g.id) (v.gastos=v.gastos||[]).push(destino);
      guardar(); pintar();
      avisar(nuevo ? "Apuntado: "+destino.concepto+" · "+eur(destino.importe, v)
                   : "Gasto cambiado");
    },
    {aceptar:nuevo?"Apuntarlo":"Guardar", alAbrir:function(){
      var caja=document.getElementById("ga_para");
      function reparto(){
        var marcados=[].slice.call(caja.querySelectorAll('[aria-pressed="true"]'));
        var imp=numero("ga_imp");
        var t=document.getElementById("ga_reparto");
        if(!marcados.length){ t.innerHTML="No has marcado a nadie: el gasto no se repartiría."; return; }
        if(marcados.length===v.gente.length){
          t.innerHTML="Va para todos"+(imp?", a <strong>"+eur(r2(imp/marcados.length), v)+
            "</strong> cada uno":"")+".";
        } else {
          t.innerHTML="Sólo para "+plural(marcados.length,"persona","personas")+
            (imp?", a <strong>"+eur(r2(imp/marcados.length), v)+"</strong> cada uno":"")+
            ". Los demás no entran en este gasto.";
        }
      }
      caja.querySelectorAll("[data-p]").forEach(function(b){
        b.addEventListener("click", function(){
          b.setAttribute("aria-pressed", b.getAttribute("aria-pressed")!=="true");
          reparto();
        });
      });
      document.getElementById("ga_imp").addEventListener("input", reparto);
      reparto();
    }});
}

/* ══════════════════════════════════════════════════════════════
   CUENTAS
   ══════════════════════════════════════════════════════════════ */
function verCuentas(main){
  var v=viajeAbierto();
  if(faltaLoBasico(main, v)) return;

  var pasos=comoCuadra(v);
  var total=totalViaje(v);
  var maximo=Math.max.apply(null, v.gente.map(function(p){ return haPagado(v,p.id); }).concat([1]));

  main.innerHTML=
    cabecera("Las cuentas de "+v.nombre,
      "Lo que ha puesto cada uno, lo que le tocaba, y cómo se deja a cero.",
      (v.gastos||[]).length
        ? '<button class="btn" id="cu_mandar">📱 Mandar las cuentas</button>' : "")+

    '<div class="gente" style="margin-bottom:20px">'+
      v.gente.map(function(p){
        var pag=haPagado(v,p.id), toca=leToca(v,p.id), s=saldoCuadrado(v,p.id);
        var ent=haEntregado(v,p.id), rec=haRecibido(v,p.id);
        var clase=Math.abs(s)<0.005 ? "cuadra" : (s>0?"cobra":"paga");
        return '<div class="persona">'+
          '<div class="nom">'+esc(p.nombre)+'</div>'+
          '<div class="saldo '+clase+'">'+
            (Math.abs(s)<0.005 ? "En paz" : (s>0?"+":"−")+eur(Math.abs(s), v))+'</div>'+
          '<div class="detalle">'+
            (Math.abs(s)<0.005 ? "ni debe ni le deben"
              : s>0 ? "le tienen que devolver" : "tiene que poner")+'</div>'+
          '<div class="barra"><i style="width:'+
            Math.min(100, pag/maximo*100).toFixed(1)+'%"></i></div>'+
          '<div class="detalle" style="margin-top:7px">'+
            'Ha pagado <strong>'+eur(pag, v)+'</strong><br>'+
            'Le tocaba <strong>'+eur(toca, v)+'</strong>'+
            (ent?'<br>Ya ha entregado '+eur(ent, v):"")+
            (rec?'<br>Ya ha recibido '+eur(rec, v):"")+
          '</div>'+
        '</div>';
      }).join("")+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:18px">'+
      '<div class="tarjeta-cab"><h2>Cómo se cuadra</h2>'+
        '<span class="pista">'+(pasos.length
          ? "con "+plural(pasos.length,"movimiento","movimientos")+" queda a cero"
          : "no hace falta mover nada")+'</span></div>'+
      (pasos.length
        ? '<div class="tarjeta-cuerpo"><div class="pasos">'+
          pasos.map(function(x, i){
            return '<div class="paso">'+
              '<div class="quien"><b>'+esc(nombreDe(v,x.de))+'</b>'+
                '<span class="flecha">→</span><b>'+esc(nombreDe(v,x.a))+'</b></div>'+
              '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'+
                '<span class="cuanto">'+eur(x.importe, v)+'</span>'+
                '<button class="btn sm" data-pagado="'+i+'">Ya está pagado</button>'+
              '</div>'+
            '</div>';
          }).join("")+
          '</div>'+
          '<p class="nota" style="margin:14px 0 0">Se empareja al que más debe con el que más '+
          'tiene que cobrar, para que haya que hacer los menos movimientos posibles. Cuando '+
          'alguien pague, dale a <strong>Ya está pagado</strong> y desaparece de aquí.</p>'+
          '</div>'
        : '<div class="vacio"><strong>'+((v.gastos||[]).length?"Todo cuadrado":"Nada que cuadrar")+
          '</strong>'+((v.gastos||[]).length
            ? "Nadie le debe nada a nadie."
            : "Cuando haya gastos apuntados, aquí saldrá quién le paga a quién.")+'</div>')+
    '</div>'+

    ((v.pagos||[]).length ? tarjetaPagos(v) : "")+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>De dónde sale cada número</h2></div>'+
      '<div class="tarjeta-cuerpo"><div class="nota" style="max-width:78ch">'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Ha pagado</strong> es lo que ha '+
        'puesto de su bolsillo, sin más.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Le tocaba</strong> es su parte: '+
        'de cada gasto en el que entraba, lo que valía dividido entre los que entraban. Los gastos '+
        'que iban sólo para algunos no le tocan a los demás.</p>'+
        '<p style="margin:0 0 8px">El <strong style="color:var(--tinta)">saldo</strong> es la resta. '+
        'A favor quiere decir que puso más de lo que le tocaba y se lo tienen que devolver; en contra, '+
        'al revés.</p>'+
        '<p style="margin:0">Los gastos se parten <strong style="color:var(--tinta)">a partes '+
        'iguales</strong> entre la gente a la que iban. Si alguna vez hay que repartir desigual, '+
        'apúntalo como dos gastos.</p>'+
      '</div></div></div>';

  var bm=document.getElementById("cu_mandar");
  if(bm) bm.addEventListener("click", function(){ mandarCuentas(v); });

  main.querySelectorAll("[data-pagado]").forEach(function(b){
    b.addEventListener("click", function(){
      var x=pasos[+b.getAttribute("data-pagado")];
      if(!x) return;
      confirmar("Apuntar el pago",
        '<p style="margin:0 0 10px"><strong>'+esc(nombreDe(v,x.de))+'</strong> le ha dado '+
        '<strong>'+eur(x.importe, v)+'</strong> a <strong>'+esc(nombreDe(v,x.a))+'</strong>.</p>'+
        '<p class="nota" style="margin:0">Queda apuntado como pago entre vosotros, y los dos '+
        'saldos se mueven. Los gastos no se tocan.</p>',
        function(){
          (v.pagos=v.pagos||[]).push({id:uid(), fecha:hoyISO(),
                                      de:x.de, a:x.a, importe:x.importe});
          guardar(); pintar();
          avisar(nombreDe(v,x.de)+" → "+nombreDe(v,x.a)+": "+eur(x.importe, v));
        }, {aceptar:"Apuntarlo"});
    });
  });
  main.querySelectorAll("[data-borrar-pago]").forEach(function(b){
    b.addEventListener("click", function(){
      var id=b.getAttribute("data-borrar-pago");
      v.pagos=(v.pagos||[]).filter(function(x){ return x.id!==id; });
      guardar(); pintar(); avisar("Pago borrado");
    });
  });
}

function tarjetaPagos(v){
  var lista=(v.pagos||[]).slice().sort(function(a,b){
    return String(b.fecha||"").localeCompare(String(a.fecha||"")); });
  return '<div class="tarjeta" style="margin-bottom:18px">'+
    '<div class="tarjeta-cab"><h2>Pagos ya hechos</h2>'+
      '<span class="pista">lo que ya os habéis devuelto</span></div>'+
    '<div class="tabla-caja"><table><thead><tr><th>Día</th><th>De</th><th>A</th>'+
      '<th class="num">Importe</th><th></th></tr></thead><tbody>'+
    lista.map(function(p){
      return '<tr><td class="mono">'+esc(dmy(p.fecha))+'</td>'+
        '<td>'+esc(nombreDe(v,p.de))+'</td><td>'+esc(nombreDe(v,p.a))+'</td>'+
        '<td class="num"><strong>'+eur(p.importe, v)+'</strong></td>'+
        '<td class="num"><button class="btn suave sm malo" data-borrar-pago="'+esc(p.id)+'" '+
          'title="Quitarlo">✕</button></td></tr>';
    }).join("")+
    '</tbody></table></div></div>';
}

/* ── Mandar las cuentas ───────────────────────────────────────── */
function textoCuentas(v){
  var l=[];
  l.push(v.nombre+(v.lugar?" · "+v.lugar:""));
  if(v.desde) l.push(dmy(v.desde)+(v.hasta&&v.hasta!==v.desde?" - "+dmy(v.hasta):""));
  l.push("");
  l.push("Gastado en total: "+eur(totalViaje(v), v));
  l.push("Sale a "+eur(r2(totalViaje(v)/(v.gente.length||1)), v)+" por cabeza");
  l.push("");
  v.gente.forEach(function(p){
    var s=saldoCuadrado(v,p.id);
    l.push(p.nombre+": puso "+eur(haPagado(v,p.id), v)+
           ", le tocaba "+eur(leToca(v,p.id), v)+
           " -> "+(Math.abs(s)<0.005 ? "en paz"
                 : s>0 ? "le deben "+eur(s, v) : "debe "+eur(-s, v)));
  });
  var pasos=comoCuadra(v);
  l.push("");
  if(pasos.length){
    l.push("Para cuadrarlo:");
    pasos.forEach(function(x){
      l.push("- "+nombreDe(v,x.de)+" le da "+eur(x.importe, v)+" a "+nombreDe(v,x.a));
    });
  } else l.push("Todo cuadrado: nadie debe nada.");
  return l.join("\n");
}

function mandarCuentas(v){
  var texto=textoCuentas(v);
  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Las cuentas de '+esc(v.nombre)+'</h3>'+
      '<button class="btn suave" data-cerrar>✕</button></div>'+
    '<div class="dlg-cuerpo">'+
      '<div class="parte" id="elTexto">'+esc(texto)+'</div>'+
      '<p class="nota" style="margin:14px 0 0">Cópialo y mándalo por donde quieras, o dale al '+
      'botón verde y eliges el chat.</p>'+
    '</div>'+
    '<div class="dlg-pie">'+
      '<button class="btn" id="cu_copiar">Copiar</button>'+
      '<a class="btn fuerte" href="https://wa.me/?text='+encodeURIComponent(texto)+'" '+
        'target="_blank" rel="noopener" style="text-decoration:none">Abrir WhatsApp</a>'+
    '</div>';
  document.body.appendChild(d);
  d.showModal();
  d.querySelector("[data-cerrar]").addEventListener("click", function(){ d.close(); d.remove(); });
  document.getElementById("cu_copiar").addEventListener("click", function(){
    function seleccionar(){
      var r=document.createRange(); r.selectNodeContents(document.getElementById("elTexto"));
      var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      avisar("Seleccionado: cópialo con Cmd+C");
    }
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(texto).then(function(){ avisar("Copiado"); }, seleccionar);
    else seleccionar();
  });
}

/* ══════════════════════════════════════════════════════════════
   VIAJES Y GENTE
   ══════════════════════════════════════════════════════════════ */
function verViajes(main){
  var abierto=viajeAbierto();

  main.innerHTML=
    cabecera("Viajes",
      "Cada viaje lleva su gente y sus gastos aparte. El que esté abierto es el que ves "+
      "en las otras pestañas.",
      '<button class="btn fuerte" id="v_nuevo">+ Viaje</button>')+

    (libro.viajes.length
      ? '<div class="tarjeta" style="margin-bottom:18px"><div class="tabla-caja"><table><thead><tr>'+
        '<th>Viaje</th><th>Cuándo</th><th class="num">Gente</th><th class="num">Gastos</th>'+
        '<th class="num">Total</th><th>Estado</th><th></th></tr></thead><tbody>'+
        libro.viajes.slice().reverse().map(function(v){
          var esAbierto=(abierto && v.id===abierto.id);
          return '<tr'+(esAbierto?' style="background:var(--acento-suave)"':"")+'>'+
            '<td><strong>'+esc(v.nombre)+'</strong>'+
              (v.lugar?'<div style="font-size:11.5px;color:var(--muted)">'+esc(v.lugar)+'</div>':"")+'</td>'+
            '<td class="mono">'+(v.desde?esc(dmy(v.desde)):"—")+
              (v.hasta&&v.hasta!==v.desde?" – "+esc(dmy(v.hasta)):"")+'</td>'+
            '<td class="num">'+(v.gente||[]).length+'</td>'+
            '<td class="num">'+(v.gastos||[]).length+'</td>'+
            '<td class="num"><strong>'+eur(totalViaje(v), v)+'</strong></td>'+
            '<td>'+(estaCuadrado(v)
              ? '<span class="chapa ok">cuadrado</span>'
              : '<span class="chapa aviso">'+plural(comoCuadra(v).length,"pago","pagos")+'</span>')+
              (esAbierto?' <span class="chapa acento">abierto</span>':"")+'</td>'+
            '<td class="num"><div class="acciones-fila">'+
              (esAbierto?"":'<button class="btn suave sm" data-abrir="'+esc(v.id)+'">Abrirlo</button>')+
              '<button class="btn suave sm" data-editar-v="'+esc(v.id)+'">Cambiar</button>'+
              '<button class="btn suave sm malo" data-borrar-v="'+esc(v.id)+'" title="Borrarlo">✕</button>'+
            '</div></td>'+
          '</tr>';
        }).join("")+
        '</tbody></table></div></div>'
      : '<div class="tarjeta" style="margin-bottom:18px"><div class="vacio">'+
        '<strong>Ningún viaje todavía</strong>Créalo con el botón de arriba.</div></div>')+

    (abierto
      ? '<div class="tarjeta"><div class="tarjeta-cab"><h2>Quién va a '+esc(abierto.nombre)+'</h2>'+
        '<button class="btn sm" id="p_nueva">+ Persona</button></div>'+
        ((abierto.gente||[]).length
          ? '<div class="tabla-caja"><table><thead><tr><th>Nombre</th>'+
            '<th class="num">Ha pagado</th><th class="num">Le tocaba</th><th class="num">Saldo</th>'+
            '<th></th></tr></thead><tbody>'+
            abierto.gente.map(function(p){
              var s=saldoCuadrado(abierto,p.id);
              return '<tr><td><strong>'+esc(p.nombre)+'</strong></td>'+
                '<td class="num">'+eur(haPagado(abierto,p.id), abierto)+'</td>'+
                '<td class="num">'+eur(leToca(abierto,p.id), abierto)+'</td>'+
                '<td class="num"><strong style="color:'+
                  (Math.abs(s)<0.005?"var(--muted)":(s>0?"var(--ok)":"var(--malo)"))+'">'+
                  (Math.abs(s)<0.005?"en paz":(s>0?"+":"−")+eur(Math.abs(s), abierto))+'</strong></td>'+
                '<td class="num"><div class="acciones-fila">'+
                  '<button class="btn suave sm" data-editar-p="'+esc(p.id)+'">Cambiar</button>'+
                  '<button class="btn suave sm malo" data-borrar-p="'+esc(p.id)+'" title="Quitarla">✕</button>'+
                '</div></td></tr>';
            }).join("")+
            '</tbody></table></div>'
          : '<div class="vacio"><strong>Nadie todavía</strong>'+
            'Añade a los que van y ya podrás apuntar gastos.</div>')+
        '</div>'
      : "");

  document.getElementById("v_nuevo").addEventListener("click", function(){ editarViaje(null); });
  var bp=document.getElementById("p_nueva");
  if(bp) bp.addEventListener("click", function(){ editarPersona(abierto, null); });

  main.querySelectorAll("[data-abrir]").forEach(function(b){
    b.addEventListener("click", function(){
      libro.ajustes.viajeAbierto=b.getAttribute("data-abrir");
      guardar(); ui.vista="gastos"; pintar();
    });
  });
  main.querySelectorAll("[data-editar-v]").forEach(function(b){
    b.addEventListener("click", function(){
      editarViaje(libro.viajes.filter(function(v){ return v.id===b.getAttribute("data-editar-v"); })[0]);
    });
  });
  main.querySelectorAll("[data-borrar-v]").forEach(function(b){
    b.addEventListener("click", function(){ borrarViaje(b.getAttribute("data-borrar-v")); });
  });
  main.querySelectorAll("[data-editar-p]").forEach(function(b){
    b.addEventListener("click", function(){
      editarPersona(abierto, abierto.gente.filter(function(p){
        return p.id===b.getAttribute("data-editar-p"); })[0]);
    });
  });
  main.querySelectorAll("[data-borrar-p]").forEach(function(b){
    b.addEventListener("click", function(){ quitarPersona(abierto, b.getAttribute("data-borrar-p")); });
  });
}

function editarViaje(v){
  var nuevo=!v;
  v=v||{id:null, nombre:"", lugar:"", desde:hoyISO(), hasta:"", moneda:"€"};
  abrirVentana(nuevo?"Viaje nuevo":"Cambiar el viaje",
    '<div class="rejilla">'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="v_nom">Cómo se llama</label>'+
        '<input id="v_nom" class="grande" value="'+esc(v.nombre)+'" '+
        'placeholder="Semana Santa, Agosto en Cádiz…"></div>'+
      '<div class="campo"><label class="lbl" for="v_lug">Dónde</label>'+
        '<input id="v_lug" value="'+esc(v.lugar)+'" placeholder="Cádiz"></div>'+
      '<div class="campo"><label class="lbl" for="v_mon">Moneda</label>'+
        '<input id="v_mon" value="'+esc(v.moneda||"€")+'" placeholder="€"></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-top:12px">'+
      '<div class="campo"><label class="lbl" for="v_des">Desde</label>'+
        '<input type="date" id="v_des" value="'+esc(v.desde||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="v_has">Hasta</label>'+
        '<input type="date" id="v_has" value="'+esc(v.hasta||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:14px 0 0">Las fechas sólo sirven para saber cuántos días '+
    'fueron y lo que salió al día. Puedes dejarlas en blanco.</p>',
    function(){
      var nom=valor("v_nom");
      if(!nom){ avisar("Ponle un nombre al viaje.", true); return true; }
      var destino=v.id ? v : {id:uid(), gente:[], gastos:[], pagos:[]};
      destino.nombre=nom;
      destino.lugar=valor("v_lug");
      destino.moneda=valor("v_mon")||"€";
      destino.desde=valor("v_des");
      destino.hasta=valor("v_has");
      if(!v.id){ libro.viajes.push(destino); libro.ajustes.viajeAbierto=destino.id; }
      guardar();
      ui.vista=(!v.id && !destino.gente.length) ? "viajes" : ui.vista;
      pintar();
      avisar(nuevo?"Viaje creado: "+nom:"Viaje guardado");
    }, {aceptar:nuevo?"Crearlo":"Guardar"});
}

function borrarViaje(id){
  var v=libro.viajes.filter(function(x){ return x.id===id; })[0];
  if(!v) return;
  confirmar("Borrar "+v.nombre,
    '<p style="margin:0 0 10px">Se va el viaje entero: su gente, sus '+
    plural((v.gastos||[]).length,"gasto","gastos")+' y sus cuentas.</p>'+
    '<p class="nota" style="margin:0">Esto no se puede deshacer.</p>',
    function(){
      libro.viajes=libro.viajes.filter(function(x){ return x.id!==id; });
      if(libro.ajustes.viajeAbierto===id)
        libro.ajustes.viajeAbierto=libro.viajes.length
          ? libro.viajes[libro.viajes.length-1].id : null;
      guardar(); pintar(); avisar("Viaje borrado");
    }, {aceptar:"Borrarlo", malo:true});
}

function editarPersona(v, p){
  if(!v) return;
  var nuevo=!p;
  p=p||{id:null, nombre:""};
  abrirVentana(nuevo?"Añadir a alguien":"Cambiar el nombre",
    '<div class="campo"><label class="lbl" for="p_nom">Nombre</label>'+
      '<input id="p_nom" class="grande" value="'+esc(p.nombre)+'" placeholder="Marta"></div>'+
    '<p class="nota" style="margin:12px 0 0">Con el nombre basta. Lo que haya pagado sale de '+
    'los gastos que le apuntes.</p>',
    function(){
      var nom=valor("p_nom");
      if(!nom){ avisar("Ponle un nombre.", true); return true; }
      if(p.id) p.nombre=nom;
      else (v.gente=v.gente||[]).push({id:uid(), nombre:nom});
      guardar(); pintar();
      avisar(nuevo ? nom+" va al viaje" : "Nombre cambiado");
    }, {aceptar:nuevo?"Añadirla":"Guardar"});
}

/* Quitar a alguien que ya tiene gastos dejaría cuentas que no cuadran
   con nada, así que no se deja a medias: o no tiene nada, o hay que
   borrar antes lo suyo. */
function quitarPersona(v, id){
  if(!v) return;
  var p=(v.gente||[]).filter(function(x){ return x.id===id; })[0];
  if(!p) return;
  var suyos=(v.gastos||[]).filter(function(g){
    return g.paga===id || (g.para||[]).indexOf(id)>=0; }).length;
  var pagos=(v.pagos||[]).filter(function(x){ return x.de===id || x.a===id; }).length;

  if(suyos || pagos){
    confirmar("No puedo quitar a "+p.nombre+" sin más",
      '<p style="margin:0 0 10px">Sale en '+
      (suyos?plural(suyos,"gasto","gastos"):"")+
      (suyos&&pagos?" y ":"")+
      (pagos?plural(pagos,"pago","pagos"):"")+
      '. Si la quito, esas cuentas dejan de cuadrar con nada.</p>'+
      '<p class="nota" style="margin:0">Borra antes lo suyo, o cámbialo a otra persona, y '+
      'entonces la quito.</p>',
      function(){}, {aceptar:"Entendido", soloCerrar:true});
    return;
  }
  confirmar("Quitar a "+p.nombre,
    '<p style="margin:0">No tiene ningún gasto ni pago, así que se va sin dejar rastro.</p>',
    function(){
      v.gente=(v.gente||[]).filter(function(x){ return x.id!==id; });
      guardar(); pintar(); avisar(p.nombre+" fuera del viaje");
    }, {aceptar:"Quitarla", malo:true});
}

/* ══════════════════════════════════════════════════════════════
   VENTANAS
   ══════════════════════════════════════════════════════════════ */
/* Propias, no las del navegador: confirm() y alert() se ignoran sin
   decir nada en algunos visores y en algunos móviles. */
function cerrarVentana(){
  var v=document.getElementById("dlg");
  if(v){ try{ v.close(); }catch(e){} v.remove(); }
}
function abrirVentana(titulo, cuerpo, alAceptar, opciones){
  opciones=opciones||{};
  cerrarVentana();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>'+esc(titulo)+'</h3>'+
      '<button class="btn suave" data-cerrar>✕</button></div>'+
    '<div class="dlg-cuerpo">'+cuerpo+'</div>'+
    '<div class="dlg-pie">'+(opciones.extra||"")+
      (opciones.soloCerrar?"":'<button class="btn" data-cerrar>Cancelar</button>')+
      '<button class="btn '+(opciones.malo?"malo":"fuerte")+'" data-aceptar>'+
        esc(opciones.aceptar||"Guardar")+'</button>'+
    '</div>';
  document.body.appendChild(d);
  d.showModal();
  d.querySelectorAll("[data-cerrar]").forEach(function(b){
    b.addEventListener("click", function(){ cerrarVentana(); });
  });
  d.querySelector("[data-aceptar]").addEventListener("click", function(){
    /* Si el que guarda devuelve true, algo no cuadraba: la ventana se
       queda abierta para poder arreglarlo sin reescribirlo todo. */
    if(alAceptar && alAceptar()===true) return;
    cerrarVentana();
  });
  if(opciones.alAbrir) opciones.alAbrir();
  var primero=d.querySelector(".dlg-cuerpo input,.dlg-cuerpo select,.dlg-cuerpo textarea");
  if(primero && !("ontouchstart" in window)) primero.focus();
  return d;
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  abrirVentana(titulo, cuerpo, alAceptar, opciones||{aceptar:"Aceptar"});
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
