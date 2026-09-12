/* ══════════════════════════════════════════════════════════════════
   CAJA — el cierre diario del restaurante
   ══════════════════════════════════════════════════════════════════
   El parte de cada día, con los mismos conceptos de siempre:

     Visas         cobrado con tarjeta
     Efectivo      cobrado en metálico
     Efec. real    el dinero que hay de verdad en el cajón, contado
     Pagos         lo que se paga de la caja
     C. amarilla   lo que hay dentro de la amarilla esa noche
     Fondo caja    lo que se deja de cambio para mañana
     Se saca       lo que se lleva quien cierra
     Sobra am.     lo que pasa del objetivo de la amarilla

   Al lado del efectivo hay sitio para el que se cuenta de verdad al
   cerrar. Son dos cosas distintas y por eso van en dos casillas: el
   efectivo es lo que se ha cobrado en metálico, y el real es lo que
   aparece al contar el cajón. La app enseña los dos y lo que baila
   entre ellos, pero no toca ninguno: las ventas siguen saliendo del
   efectivo de siempre, y el recuento se queda como lo que es, un
   recuento.

   El efectivo no se escribe: sabiendo qué parte de las ventas se cobra
   con tarjeta (80 % de partida, editable en Ajustes y también al lado
   del propio campo), sale solo a partir de las visas: con el 80 %, el
   20 % de lo cobrado con tarjeta. Las visas no se tocan ni se amplían,
   que son las del datáfono. Se puede escribir encima cuando un día no
   cuadre.
   Esa cifra no es dinero y en ningún sitio se enseña como si lo fuera:
   va apagada y con su procedencia escrita al lado. La que va en negrita
   es siempre la del recuento, que es la única que ha contado alguien.

   Pero el efectivo también se puede CUADRAR, y entonces no hay que
   suponer nada. Todo lo que se cobra en metálico acaba en uno de cuatro
   sitios: dentro de la amarilla, dentro de la registradora, pagado a
   alguien, o fuera de la caja porque alguien se lo llevó. Así que

     efectivo del día = lo que suben las dos cajas + pagos + lo que se saca

   Eso no es una estimación, es una identidad: con los cuatro apuntados,
   la cifra es la que es. Por eso «Se saca» tiene casilla propia — era el
   único de los cuatro que no se apuntaba, y sin él la cuenta no cierra.
   El día enseña las tres cifras del mismo dinero (el %, el recuento del
   cajón y esta) y lo que baila entre ellas.

   Y un apartado, «Sin retirar», para las temporadas en que el dinero se
   queda dentro porque no hay quien lo saque: esos días quedan agrupados
   en un tramo, con su fondo aparte y con lo que se ha ido quedando
   encima, que es lo que habrá que entregar. Ahí tampoco se suman
   recuentos: la cifra buena es la última noche menos el fondo.

   La caja amarilla es el fondo del negocio: 1.500 € (editable) que se
   van recuperando poco a poco. Cada noche se cuenta lo que hay dentro y
   se anota, así que es un RECUENTO, no una entrega del día. Sumar los
   recuentos de varios días da una cifra que no existe en ninguna parte
   y no cuadra con nada. Por eso, aquí, la amarilla nunca se suma: el
   saldo es el último recuento anotado, y en el mes y en el año se
   enseña el recuento de cierre.

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
    ajustes:{ nombre:"", objetivoAmarilla:1500, fondoHabitual:0, pctVisa:80,
              gente:[] },      /* {id, nombre, telefono} — a quien va el parte */
    dias:[],          /* {id, fecha, visa, efectivo, efectivoReal, gastos, detalle:[…],
                         aAmarilla, fondoCaja, retirado, nota} */
    aportaciones:[],  /* {id, fecha, importe, motivo} — dinero que entra sin ser de la caja */
    retiradas:[],     /* {id, fecha, importe, motivo} — dinero que sale de la amarilla */
    tramos:[]         /* {id, desde, hasta, motivo, entregado, fechaEntrega} — dias sin retirar */
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
    if(d.ajustes.pctVisa==null) d.ajustes.pctVisa=80;
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
function contarDias(){ return (libro.dias||[]).length; }
function contarHojas(){ return Object.keys(libro.hojas||{}).length; }
function pesoHojas(){
  var letras=Object.keys(libro.hojas||{}).reduce(function(s,k){
    return s+String(libro.hojas[k]||"").length; },0);
  var bytes=Math.round(letras*0.75);   /* base64 abulta un tercio */
  return bytes>1048576 ? num(bytes/1048576,1)+" MB" : num(bytes/1024,0)+" kB";
}
function plural(n, uno, varios){ return n+" "+(n===1?uno:varios); }
/* elige la frase entera, para que concuerden el verbo y el artículo */
function segunCuantos(n, uno, varios){ return n===1 ? uno : varios; }
/* elige la frase entera según sean uno o varios, para que concuerden
   el verbo y el artículo */
function conArticulo(n, uno, varios){ return n===1 ? uno : varios; }
function contarMovimientos(){
  return (libro.aportaciones||[]).length + (libro.retiradas||[]).length;
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
/* El sobrante lo cuenta el, no la app: es lo que hay en la mano al
   cerrar. La cuenta se sigue haciendo, pero solo para dos cosas: sugerir
   una cifra al anotar, y avisar si lo contado no cuadra con ella. */
function sobranteAnotado(d){
  return (d && d.sobrante!=null && d.sobrante!=="") ? r2(+d.sobrante) : null;
}
function cuentasDia(d){
  if(!d) return {visa:0, efectivo:0, gastos:0, ventas:0, neto:0, fondoTotal:0,
                 efectivoPrevisto:0, difEfectivo:0,
                 efectivoReal:0, hayReal:false, difReal:0,
                 retirado:0, hayRetirado:false,
                 amarilla:0, fondo:0, sobrante:0, sobranteCuenta:0, descuadre:0};
  var visa=+d.visa||0, efectivo=+d.efectivo||0;
  var gastos=totalGastos(d), amarilla=+d.aAmarilla||0;
  var fondo=+d.fondoCaja||0;
  var neto=r2(efectivo-gastos);
  /* Las visas son las visas: lo que dice el datáfono, y ahí no se toca
     nada. El metálico que tendría que haber es ese mismo dinero por el
     resto del porcentaje —con el 80 %, el 20 % de las visas—, y es una
     referencia para ver de un vistazo si falta dinero, no una cuenta
     exacta: hay días que se sale de la media. */
  var pct=pctVisa();
  var hayPct=(pct>0 && pct<100);
  var previsto=hayPct ? r2(visa*(100-pct)/100) : 0;
  /* El sobrante es lo que entra en la amarilla por encima del objetivo:
     cuando ya están los 1500, lo demás sobra. Se sigue pudiendo escribir
     a mano, y entonces manda lo escrito. */
  var cuenta=objetivoAmarilla()>0 ? r2(Math.max(0, amarilla-objetivoAmarilla())) : 0;
  var anotado=sobranteAnotado(d);
  /* El efectivo real es un recuento, así que se distingue el «no lo he
     contado» del «he contado cero»: sin nada escrito, no hay cifra y no
     se compara con nada. */
  var real=(d.efectivoReal!=null && d.efectivoReal!=="") ? r2(+d.efectivoReal||0) : null;
  /* Lo que se lleva quien cierra. Vacío es «no lo he apuntado», que no es
     lo mismo que «no saqué nada»: sin ese dato la caja no cuadra, y más
     vale que se vea el hueco que dar un cero por bueno. */
  var llevado=(d.retirado!=null && d.retirado!=="") ? r2(+d.retirado||0) : null;
  return {
    /* El fondo de caja son los dos sitios juntos: lo que se aparta a la
       amarilla y lo que se deja en la registradora para el cambio. */
    fondoTotal:r2(amarilla+fondo),
    visa:visa, efectivo:efectivo, gastos:gastos,
    ventas:r2(visa+efectivo),
    neto:neto,                    /* lo que queda tras los pagos */
    efectivoPrevisto:previsto,    /* lo que tocaria en metalico segun el % */
    difEfectivo:hayPct ? r2(efectivo-previsto) : 0,
    efectivoReal:(real==null?0:real),   /* lo contado en el cajon */
    hayReal:(real!=null),
    difReal:(real==null?0:r2(real-efectivo)),
    retirado:(llevado==null?0:llevado),  /* lo que salio de la caja al cerrar */
    hayRetirado:(llevado!=null),
    amarilla:amarilla,
    fondo:fondo,                  /* lo que se deja de cambio */
    sobrante:(anotado!=null?anotado:cuenta),
    sobranteCuenta:cuenta,        /* lo que saldria por la cuenta */
    descuadre:(anotado!=null?r2(anotado-cuenta):0)
  };
}
function diasDe(prefijo){
  return (libro.dias||[]).filter(function(d){ return (d.fecha||"").indexOf(prefijo)===0; })
                         .sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
}
/* Aquí no entran ni la amarilla ni el cambio de la registradora: son el
   recuento de una noche, y el total de un mes de recuentos no significa
   nada. Para el saldo del periodo está recuentoHasta(). */
function sumaCuentas(dias){
  var t={visa:0, efectivo:0, gastos:0, ventas:0, neto:0,
         efectivoPrevisto:0, difEfectivo:0,
         efectivoReal:0, difReal:0,
         sobrante:0, sobranteCuenta:0, descuadre:0,
         dias:dias.length};
  dias.forEach(function(d){
    var c=cuentasDia(d);
    Object.keys(t).forEach(function(k){ if(k!=="dias") t[k]=r2(t[k]+c[k]); });
  });
  return t;
}

/* La caja amarilla es un recuento, no una suma: cada día se anota lo que
   hay dentro, igual que en la hoja de papel. Antes la app iba sumando lo
   de todos los días y salía una cifra que no existía en ninguna parte.

   Por eso lo que hay guardado es, sencillamente, lo último que se anotó. */
/* El último recuento anotado hasta el final de un periodo ("2026",
   "2026-03" o vacío para todo). Si dentro del periodo no se contó ningún
   día, vale el de antes: el dinero sigue en la caja aunque nadie lo haya
   apuntado ese mes. Nunca suma nada. */
function recuentoHasta(prefijo){
  var fin=(prefijo||"")+"\uffff";
  var candidatos=(libro.dias||[]).filter(function(d){
    return d.aAmarilla!=null && d.aAmarilla!=="" && (d.fecha||"")<fin;
  }).sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
  return candidatos.length ? candidatos[candidatos.length-1] : null;
}
function ultimoDiaConAmarilla(){ return recuentoHasta(""); }
function amarillaGuardado(){
  var d=ultimoDiaConAmarilla();
  return d ? r2(+d.aAmarilla||0) : 0;
}
function fechaAmarilla(){
  var d=ultimoDiaConAmarilla();
  return d ? d.fecha : null;
}
/* Las entradas y salidas de fuera se siguen apuntando como historial, pero
   ya no mueven el saldo: el saldo es el recuento del día. */
function amarillaDeFuera(){
  return r2((libro.aportaciones||[]).reduce(function(s,a){ return s+(+a.importe||0); },0));
}
function amarillaSacado(){
  return r2((libro.retiradas||[]).reduce(function(s,r){ return s+(+r.importe||0); },0));
}
function objetivoAmarilla(){ return +libro.ajustes.objetivoAmarilla || 0; }

/* ── Tramos sin retirar ─────────────────────────────────────────
   Hay temporadas en que no se saca nada: el jefe no está y el dinero se
   va quedando dentro hasta que vuelva o diga. Un tramo son esos días
   juntos, apartados del resto, con su fondo y todo lo que se ha ido
   quedando encima.

   Un tramo no mueve ni un euro: los días siguen siendo los mismos y la
   amarilla sigue siendo el recuento de cada noche. Lo único que hace es
   agrupar y decir cuánto hay que entregar cuando vuelva. */
function tramosOrdenados(){
  return (libro.tramos||[]).slice().sort(function(a,b){
    return (b.desde||"").localeCompare(a.desde||"");
  });
}
function tramoAbierto(){
  return (libro.tramos||[]).filter(function(t){ return !t.hasta; })[0] || null;
}
/* El tramo que cubre un día, si lo hay: sirve para avisar al anotar. */
function tramoDe(fecha){
  return (libro.tramos||[]).filter(function(t){
    return (t.desde||"")<=fecha && (!t.hasta || fecha<=t.hasta);
  })[0] || null;
}
function diasDelTramo(t){
  if(!t) return [];
  var desde=t.desde||"", hasta=t.hasta||"\uffff";
  return (libro.dias||[]).filter(function(d){
    var f=d.fecha||"";
    return f>=desde && f<=hasta;
  }).sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
}
/* El último recuento anotado ANTES de una fecha: con cuánto empezó el
   tramo, para ver lo que ha subido desde entonces. */
function recuentoAntesDe(fecha){
  var previos=(libro.dias||[]).filter(function(d){
    return d.aAmarilla!=null && d.aAmarilla!=="" && (d.fecha||"")<fecha;
  }).sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
  return previos.length ? previos[previos.length-1] : null;
}
/* OJO con la tentación de sumar aquí el sobrante de cada día. Cuando el
   dinero se saca a diario, cada sobrante es una entrega suelta y sumarlos
   tiene sentido: es lo que hace el mes. Pero en un tramo no se saca nada,
   así que la amarilla va subiendo y el sobrante de cada noche ya lleva
   dentro el de las anteriores. Sumarlos contaría el mismo dinero muchas
   veces. Aquí la cifra buena es el nivel: lo que hay dentro la última
   noche, menos el fondo. */
function cuentasTramo(t){
  var dias=diasDelTramo(t);
  var s=sumaCuentas(dias);
  var conRecuento=dias.filter(function(d){ return d.aAmarilla!=null && d.aAmarilla!==""; });
  var ultimo=conRecuento.length ? conRecuento[conRecuento.length-1] : null;
  var previo=recuentoAntesDe(t.desde||"");
  var dentro=ultimo ? r2(+ultimo.aAmarilla||0) : null;
  var partida=previo ? r2(+previo.aAmarilla||0) : null;
  var fondo=objetivoAmarilla();
  return {
    dias:dias, nDias:dias.length, conRecuento:conRecuento.length,
    ventas:s.ventas, gastos:s.gastos,
    fondo:fondo,
    dentro:dentro,                 /* el nivel de la ultima noche */
    fecha:ultimo?ultimo.fecha:null,
    partida:partida,               /* con cuanto empezo */
    encima:(dentro==null)?null:r2(Math.max(0, dentro-fondo)),
    subido:(dentro==null||partida==null)?null:r2(dentro-partida)
  };
}
/* Lo que ya se entregó de tramos cerrados, solo para el resumen. */
function entregadoEnTramos(){
  return r2((libro.tramos||[]).reduce(function(s,t){ return s+(+t.entregado||0); },0));
}
/* Qué parte de las ventas se cobra con tarjeta, de media. De ahí sale el
   efectivo que debería haber. */
function pctVisa(){
  var p=+libro.ajustes.pctVisa;
  return (isFinite(p) && p>0 && p<100) ? p : 0;
}
/* "faltan 40 €" / "sobran 12 €", que es como se mira de verdad. */
function textoDiferencia(dif){
  if(Math.abs(dif)<0.005) return "cuadra";
  return (dif<0 ? "faltan " : "sobran ")+eur(Math.abs(dif));
}
function colorDiferencia(dif){
  if(Math.abs(dif)<0.005) return "var(--ok)";
  return dif<0 ? "var(--malo)" : "var(--muted)";
}
function faltaAmarilla(){ return r2(Math.max(0, objetivoAmarilla()-amarillaGuardado())); }

/* Lo que sobra de la amarilla: lo que entra una vez que ya están los
   1500. Es la última columna de la hoja. */
function sobraAmarilla(d){
  /* Sin objetivo no hay nada por encima de lo que sobrar. Antes se
     restaba de cero y salía que sobraba todo lo que había dentro. */
  var objetivo=objetivoAmarilla();
  if(objetivo<=0) return 0;
  var am=(d && d.aAmarilla!=null && d.aAmarilla!=="") ? r2(+d.aAmarilla||0) : 0;
  return r2(Math.max(0, am-objetivo));
}


/* ── Cuadrar la caja ─────────────────────────────────────────
   El efectivo del día sacado del dinero que hay, no de un porcentaje.
   Todo lo que se cobra en metálico acaba en uno de cuatro sitios: dentro
   de la amarilla, dentro de la registradora, pagado a alguien, o fuera
   de la caja porque alguien se lo llevó. De ahí:

     efectivo = lo que suben las dos cajas + pagos + lo que se saca

   Es una identidad, no una estimación. Lo único que puede faltar es el
   último sumando, y por eso ahora tiene casilla. */
function efectivoPorCajas(v){
  /* Si a alguno de los dos días le falta el cambio de la registradora, se
     da por que no se movió. Ponerle un cero diría que la registradora
     amaneció vacía, y esa diferencia saldría como venta del día. */
  var subeFondo=(v.fondoHoy==null || v.fondoAyer==null) ? 0 : r2(v.fondoHoy-v.fondoAyer);
  return r2(r2(v.amHoy-v.amAyer) + subeFondo + v.pagos + v.retirado
            + v.sacadoFuera - v.aportadoFuera);
}
function fondoDe(d){
  return (d && d.fondoCaja!=null && d.fondoCaja!=="") ? r2(+d.fondoCaja||0) : null;
}
/* Las aportaciones y las retiradas mueven la amarilla sin ser dinero
   cobrado ni pagado ese día. En el cuadre hay que descontarlas, o el
   subidón —o el bajón— de la caja se leería como venta. */
function deFueraEn(fecha){
  var suma=function(lista){
    return r2((lista||[]).filter(function(x){ return (x.fecha||"")===fecha; })
                         .reduce(function(t,x){ return t+(+x.importe||0); },0));
  };
  return { aportado:suma(libro.aportaciones), sacado:suma(libro.retiradas) };
}
/* El cuadre de un día. Devuelve siempre algo: cuando no se puede hacer la
   cuenta, dice qué falta, que es más útil que un hueco. */
function cuadreDia(fecha){
  var d=diaDe(fecha);
  if(!d) return null;
  var c=cuentasDia(d);
  var previo=recuentoAntesDe(fecha);
  /* En un tramo sin retirar no sale nada por definición, así que ahí el
     cero no hace falta apuntarlo. */
  var enTramo=!!tramoDe(fecha);
  var fuera=deFueraEn(fecha);
  var q={ hay:false, falta:"", previo:previo?previo.fecha:null, enTramo:enTramo,
          pagos:c.gastos, retirado:c.retirado, hayRetirado:(c.hayRetirado||enTramo),
          subeAmarilla:0, subeFondo:0, fondoSupuesto:false, cambioAnoche:null,
          aportado:fuera.aportado, sacadoFuera:fuera.sacado, efectivo:0 };
  if(d.aAmarilla==null || d.aAmarilla===""){ q.falta="el recuento de la amarilla de esta noche"; return q; }
  if(!previo){ q.falta="un cierre anterior con el que comparar; éste es el primero que hay"; return q; }
  if(!q.hayRetirado){ q.falta="apuntar lo que se saca al cerrar"; return q; }

  var fondoHoy=fondoDe(d), fondoAyer=fondoDe(previo);
  q.subeAmarilla=r2((+d.aAmarilla||0)-(+previo.aAmarilla||0));
  q.subeFondo=(fondoHoy==null||fondoAyer==null) ? 0 : r2(fondoHoy-fondoAyer);
  q.fondoSupuesto=(fondoHoy==null||fondoAyer==null);
  q.cambioAnoche=fondoAyer;
  q.efectivo=efectivoPorCajas({
    amHoy:r2(+d.aAmarilla||0), amAyer:r2(+previo.aAmarilla||0),
    fondoHoy:fondoHoy, fondoAyer:fondoAyer,
    pagos:q.pagos, retirado:q.retirado,
    sacadoFuera:q.sacadoFuera, aportadoFuera:q.aportado
  });
  q.hay=true;
  return q;
}

/* ── El % de visa, medido en vez de supuesto ──────────────────────
   En los días sin retirar no sale un euro de la caja, así que el efectivo
   de ese trecho sale entero de lo que han subido las dos cajas más lo
   pagado: sin ninguna incógnita. Y las visas son las del datáfono,
   exactas. De las dos juntas sale la proporción de verdad.

   Ojo con qué número se guarda en Ajustes: la app no calcula el efectivo
   como un trozo de la venta, sino como un tanto por ciento DE LAS VISAS
   —con el 80 puesto, el 20 % de las visas—. Así que el que hay que
   guardar es 100 menos lo que entra en metálico por cada 100 € de visa.
   La proporción de verdad sobre la venta va aparte, para mirarla. */
function medidoEntre(previo, ultimo){
  if(!previo || !ultimo || (previo.fecha||"")>=(ultimo.fecha||"")) return null;
  var dias=(libro.dias||[]).filter(function(d){
    return (d.fecha||"")>previo.fecha && (d.fecha||"")<=ultimo.fecha;
  });
  if(!dias.length) return null;
  var visas=0, pagos=0, sacado=0, aportadoF=0, sacadoF=0, sinApuntar=0;
  dias.forEach(function(d){
    var c=cuentasDia(d), f=deFueraEn(d.fecha);
    visas=r2(visas+c.visa); pagos=r2(pagos+c.gastos); sacado=r2(sacado+c.retirado);
    aportadoF=r2(aportadoF+f.aportado); sacadoF=r2(sacadoF+f.sacado);
    if(!c.hayRetirado && !tramoDe(d.fecha)) sinApuntar++;
  });
  var efectivo=efectivoPorCajas({
    amHoy:r2(+ultimo.aAmarilla||0), amAyer:r2(+previo.aAmarilla||0),
    fondoHoy:fondoDe(ultimo), fondoAyer:fondoDe(previo),
    pagos:pagos, retirado:sacado, sacadoFuera:sacadoF, aportadoFuera:aportadoF
  });
  var ventas=r2(visas+efectivo);
  var vale=(visas>0 && efectivo>=0 && ventas>0 && sinApuntar===0);
  return {
    desde:previo.fecha, hasta:ultimo.fecha, nDias:dias.length, sinApuntar:sinApuntar,
    visas:visas, efectivo:efectivo, ventas:ventas, pagos:pagos, vale:vale,
    /* metálico que entra por cada 100 € de visa */
    porVisa:vale ? r2(efectivo/visas*100) : null,
    /* lo que hay que guardar en Ajustes para que la cuenta de la app salga */
    ajuste:vale ? r2(100-efectivo/visas*100) : null,
    /* y lo que de verdad va en visa, sobre el total de la venta */
    enVisa:vale ? r2(visas/ventas*100) : null
  };
}
function ultimoConRecuento(dias){
  var con=(dias||[]).filter(function(d){ return d.aAmarilla!=null && d.aAmarilla!==""; })
                    .sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
  return con.length ? con[con.length-1] : null;
}
function medidoTramo(t){
  if(!t) return null;
  return medidoEntre(recuentoAntesDe(t.desde||""), ultimoConRecuento(diasDelTramo(t)));
}
/* Todos los tramos juntos: cuantos más días, mejor la media. */
function medidoEnTramos(){
  var visas=0, efectivo=0, nDias=0, tramos=0;
  (libro.tramos||[]).forEach(function(t){
    var m=medidoTramo(t);
    if(!m || !m.vale) return;
    visas=r2(visas+m.visas); efectivo=r2(efectivo+m.efectivo);
    nDias+=m.nDias; tramos++;
  });
  var ventas=r2(visas+efectivo);
  if(!tramos || visas<=0 || ventas<=0) return null;
  return { visas:visas, efectivo:efectivo, ventas:ventas, nDias:nDias, tramos:tramos,
           vale:true, porVisa:r2(efectivo/visas*100),
           ajuste:r2(100-efectivo/visas*100), enVisa:r2(visas/ventas*100) };
}
/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"dia",      nombre:"Día"},
  {id:"mes",      nombre:"Mes"},
  {id:"anio",     nombre:"Año"},
  {id:"comparar", nombre:"Comparar"},
  {id:"amarilla", nombre:"Caja amarilla"},
  {id:"tramos",   nombre:"Sin retirar"},
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
  ({dia:verDia, mes:verMes, anio:verAnio, comparar:verComparar, amarilla:verAmarilla,
    tramos:verTramos, ajustes:verAjustes})[ui.vista](main);
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
  /* Si el efectivo escrito es el que salía por el %, no hay nada
     que contar: la cifra ya lo dice todo. */
  var difPct = !!pctVisa() && c.visa>0 && Math.abs(c.difEfectivo)>=0.005;
  /* Aquí se enseñaba SIEMPRE el último recuento de todos, sin fecha:
     abrías cualquier día —el 2, el 6, el de hace un mes— y salía el
     mismo número, uno que a lo mejor se contó una semana después. De ahí
     la pregunta: «me sale cada día 400 y no sé de qué son».

     Ahora sale lo que había en la amarilla ESE día: el último recuento
     de ese día o de antes, y con su fecha puesta, que es lo que faltaba
     para que la cifra se explique sola. */
  var regAmarilla=recuentoHasta(ui.dia);
  var guardado=regAmarilla ? r2(+regAmarilla.aAmarilla||0) : 0;
  var fechaGuardado=regAmarilla ? regAmarilla.fecha : null;
  var esDeHoy=(fechaGuardado===ui.dia);
  var falta=objetivoAmarilla()>0 ? r2(Math.max(0, objetivoAmarilla()-guardado)) : 0;

  main.innerHTML=
    (objetivoAmarilla()<=0
      ? '<div class="aviso-caja">La caja amarilla no tiene objetivo puesto, así que la app no '+
        'puede saber cuánto sobra. Ponlo en <strong>Caja amarilla → Cambiar objetivo</strong> '+
        '(los 1.500 € de siempre) y esta cuenta saldrá sola.</div>'
      : "")+
    cabecera("Cierre del "+dmy(ui.dia),
      esc(diaSemana(ui.dia).charAt(0).toUpperCase()+diaSemana(ui.dia).slice(1))+
      ". Anota lo cobrado y lo pagado; el reparto se calcula solo.",
      '<div class="campo"><label class="lbl" for="d_fecha">Día</label>'+
      '<input type="date" id="d_fecha" value="'+esc(ui.dia)+'"></div>'+
      '<button class="btn wa" id="d_wa">📱 Enviar por WhatsApp</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Ventas del día</div><div class="v acento">'+eur(c.ventas)+'</div>'+
        '<div class="n">visa + '+(pctVisa() && !difPct ? "el efectivo calculado" : "efectivo")+'</div></div>'+
      '<div class="cifra"><div class="k">Visa</div><div class="v">'+eur(c.visa)+'</div>'+
        '<div class="n">'+(c.ventas>0?num(c.visa/c.ventas*100,0)+"% del total":"—")+'</div></div>'+
      /* Aquí al lado había otra casilla, «Debería haber», con esta misma
         cuenta. Desde que el campo se rellena solo con el %, era la misma
         cifra escrita dos veces: sobraba. Se dice en ésta, y sólo hay algo
         que decir cuando la cifra puesta a mano no es la que salía. */
      '<div class="cifra"><div class="k">Efectivo</div>'+
        '<div class="v" style="color:var(--muted)">'+eur(c.efectivo)+'</div>'+
        '<div class="n"'+(difPct?' style="color:'+colorDiferencia(c.difEfectivo)+'"':"")+'>'+
        (!pctVisa()
          ? (c.ventas>0?num(c.efectivo/c.ventas*100,0)+"% del total":"—")
          : difPct
            ? "a mano · el "+num(100-pctVisa(),0)+"% de las visas serían "+eur(c.efectivoPrevisto)
            : "el "+num(100-pctVisa(),0)+"% de las visas")+'</div></div>'+
      /* Lo contado en el cajón. Sin contar no se enseña un cero, que
         sería decir que el cajón estaba vacío. */
      /* Ésta sí es dinero, así que es la que va con el color de la casa;
         la de al lado, la calculada, va apagada. */
      '<div class="cifra"><div class="k">Efectivo real</div>'+
        '<div class="v'+(c.hayReal?' acento':'')+'">'+
        (c.hayReal?eur(c.efectivoReal):"—")+'</div>'+
        '<div class="n"'+(c.hayReal?' style="color:'+colorDiferencia(c.difReal)+'"':"")+'>'+
        (c.hayReal
          ? esc(textoDiferencia(c.difReal))+(pctVisa()?" contra lo que da el %":" contra lo escrito")
          : "sin contar")+
        '</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(c.gastos)+'</div>'+
        '<div class="n">'+((d&&(d.detalle||[]).length)?d.detalle.length+" apuntes":"pagados de caja")+'</div></div>'+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>El cierre del día</h2>'+
        '<span class="pista">Los recuentos los pones tú; la app no los inventa</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<table style="max-width:520px"><tbody>'+
          /* Esta fila no es un recuento y el cartel de arriba dice que aquí
             no se inventa nada, así que va apagada y con su procedencia
             puesta: es la cuenta de la app, no dinero que haya contado
             nadie. Le habían preguntado qué eran 301 € de efectivo un día
             en que el cajón estaba vacío, y la pregunta era justa. */
          '<tr><td style="color:var(--muted)">Efectivo '+
            '<span style="font-size:12px">'+
            (pctVisa() && !difPct
              ? '(lo pone la app: el '+num(100-pctVisa(),0)+' % de las visas)'
              : '(escrito a mano)')+'</span></td>'+
            '<td class="num" style="color:var(--muted)">'+eur(c.efectivo)+'</td></tr>'+
          (c.hayReal
            ? '<tr><td><strong>Efectivo real</strong> <span style="color:var(--muted);font-size:12px">'+
              '(contado en el cajón)</span></td><td class="num"><strong>'+eur(c.efectivoReal)+'</strong>'+
              (Math.abs(c.difReal)>=0.005
                ? ' <span style="font-size:12px;color:'+colorDiferencia(c.difReal)+'">'+
                  esc(textoDiferencia(c.difReal))+'</span>'
                : '')+'</td></tr>'
            /* Sin recuento, antes la fila desaparecía y sólo quedaba la
               cifra inventada, que es como se lee por dinero. */
            : '<tr><td>Efectivo real <span style="color:var(--muted);font-size:12px">'+
              '(contado en el cajón)</span></td>'+
              '<td class="num" style="color:var(--muted)">sin contar</td></tr>')+
          '<tr><td>− Pagos</td><td class="num" style="color:var(--malo)">'+eur(c.gastos)+'</td></tr>'+
          '<tr style="border-top:1px solid var(--linea)"><td><strong>Queda tras los pagos</strong>'+
            '<span style="color:var(--muted);font-size:12px"> '+
            (c.hayReal?'(del contado)':'(de la cifra de la app)')+'</span></td>'+
            '<td class="num"><strong>'+
            eur(c.hayReal ? r2(c.efectivoReal-c.gastos) : c.neto)+'</strong></td></tr>'+
          '<tr><td>Caja amarilla <span style="color:var(--muted);font-size:12px">(lo que hay dentro)</span></td>'+
            '<td class="num" style="color:var(--amarilla)"><strong>'+eur(c.amarilla)+'</strong></td></tr>'+
          '<tr><td>Caja registradora <span style="color:var(--muted);font-size:12px">(el cambio que dejas)</span></td>'+
            '<td class="num"><strong>'+eur(c.fondo)+'</strong></td></tr>'+
          '<tr><td style="color:var(--muted)">Fondo de caja, las dos juntas</td>'+
            '<td class="num" style="color:var(--muted)">'+eur(c.fondoTotal)+'</td></tr>'+
          (Math.abs(c.descuadre)>=0.005
            ? '<tr><td style="color:var(--muted)">Por encima de '+eur(objetivoAmarilla())+' saldrían</td>'+
              '<td class="num" style="color:var(--muted)">'+eur(c.sobranteCuenta)+'</td></tr>'
            : "")+
          '<tr style="border-top:2px solid var(--linea)"><td><strong'+
            (c.sobrante>0.004?"":' style="color:var(--muted)"')+'>Sobra c. amarilla'+
            (sobranteAnotado(d)!=null && c.sobrante>0.004
              ?' <span style="color:var(--muted);font-size:12px">(anotado)</span>':"")+
            '</strong></td>'+
            '<td class="num">'+(c.sobrante>0.004
              ? '<strong style="font-size:16px">'+eur(c.sobrante)+'</strong>'
              : '<span style="color:var(--muted)">—</span>')+'</td></tr>'+
        '</tbody></table>'+
        /* Cuando se paga más de lo que había en el cajón, el dinero salió
           de otro sitio. Decirlo evita quedarse mirando un negativo. */
        (c.hayReal && c.gastos>c.efectivoReal+0.004
          ? '<div class="aviso-caja" style="margin:14px 0 0">Pagaste <strong>'+eur(c.gastos)+
            '</strong> y en el cajón '+
            (c.efectivoReal<0.005 ? 'no había nada' : 'sólo había '+eur(c.efectivoReal))+
            ', así que <strong>'+eur(r2(c.gastos-c.efectivoReal))+'</strong> salieron de otro sitio: '+
            'de la amarilla, del cambio de la registradora o de tu bolsillo. Mientras no se sepa de '+
            'dónde, el día no puede cuadrar.</div>'
          : "")+
        (c.amarilla>0 && objetivoAmarilla()>0 && c.amarilla<objetivoAmarilla()
          ? '<div class="nota" style="margin:14px 0 0">A la amarilla le faltan '+
            eur(r2(objetivoAmarilla()-c.amarilla))+' para llegar a '+eur(objetivoAmarilla())+
            ', así que ese día no sobra nada.</div>'
          : "")+
      '</div></div>'+

    tarjetaCuadre(ui.dia)+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>La caja amarilla</h2>'+
        '<span class="pista">'+(objetivoAmarilla()>0
          ? "Objetivo: "+eur(objetivoAmarilla())
          : "sin objetivo puesto")+'</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">'+
          '<div><div class="lbl">'+(regAmarilla?"Lo que había dentro":"Sin ningún recuento")+'</div>'+
            '<div style="font-size:26px;font-weight:600;color:var(--amarilla);font-variant-numeric:tabular-nums">'+
            (regAmarilla?eur(guardado):"—")+'</div>'+
            '<div class="nota" style="margin:2px 0 0">'+
            (regAmarilla
              ? (esDeHoy
                  ? "lo contaste este mismo día"
                  : "contado el "+esc(dmy(fechaGuardado))+", que es el último antes de éste")
              : "nadie ha contado la amarilla antes de este día")+'</div></div>'+
          '<div style="text-align:right">'+
            (objetivoAmarilla()<=0 ? ""
              : falta>0
                ? '<div class="lbl">Falta</div><div style="font-size:18px;font-weight:600">'+eur(falta)+'</div>'
                : '<span class="chapa ok">Fondo completo</span>')+
          '</div>'+
        '</div>'+
        (objetivoAmarilla()>0
          ? '<div class="barra-fondo"><i style="width:'+
            Math.min(100, guardado/objetivoAmarilla()*100).toFixed(1)+'%"></i></div>'
          : "")+
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
  /* Si el día cae dentro de un tramo sin retirar, más vale decirlo aquí:
     ese día el dinero se queda dentro y la amarilla va a ir subiendo. */
  var elTramo=tramoDe(ui.dia);
  /* En un tramo sin retirar no sale nada, así que la casilla arranca en
     cero: es la respuesta, no un hueco por rellenar. */
  var sacaPuesto=(actual.retirado!=null && actual.retirado!=="") ? actual.retirado
                                                                : (elTramo ? 0 : "");
  caja.innerHTML=
    (elTramo
      ? '<div class="aviso-caja" style="margin-bottom:14px">Este día entra en un tramo '+
        'sin retirar'+(elTramo.motivo?" ("+esc(elTramo.motivo)+")":"")+', desde el '+
        esc(dmy(elTramo.desde))+'. El dinero se queda en la amarilla: anota el recuento '+
        'con lo que haya dentro, aunque pase del fondo.</div>'
      : "")+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="f_visa">Visa (€)</label>'+
        '<input type="number" class="grande" id="f_visa" min="0" step="0.01" value="'+esc(actual.visa)+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_efec">Efectivo (€)</label>'+
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 6px">se pone solo</div>'+
        '<input type="number" class="grande" id="f_efec" min="0" step="0.01" value="'+esc(actual.efectivo)+'">'+
        '<div style="font-size:12px;color:var(--muted);margin:6px 0 0;display:flex;'+
        'align-items:center;gap:6px;flex-wrap:wrap">'+
        '<input type="number" id="f_pct" min="1" max="99" step="1" value="'+
        esc(libro.ajustes.pctVisa!=null?libro.ajustes.pctVisa:80)+'" '+
        'style="width:56px;padding:3px 6px;font-size:12px">'+
        '<span>% de la venta va en visa</span></div>'+
        '<div class="nota" style="margin:4px 0 0" id="f_efecNota"></div></div>'+
      '<div class="campo"><label class="lbl" for="f_efecReal">Efectivo real (€)</label>'+
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 6px">lo que cuentas en el cajón</div>'+
        '<input type="number" class="grande" id="f_efecReal" min="0" step="0.01" value="'+
        esc(actual.efectivoReal!=null&&actual.efectivoReal!==""?actual.efectivoReal:"")+'" '+
        'placeholder="sin contar">'+
        '<div class="nota" style="margin:4px 0 0" id="f_realNota"></div></div>'+
      '<div class="campo"><label class="lbl" for="f_amar">Caja amarilla (€)</label>'+
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 6px">lo que hay dentro esta noche, contado</div>'+
        '<input type="number" class="grande" id="f_amar" min="0" step="0.01" value="'+esc(actual.aAmarilla)+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_fondo">Caja registradora (€)</label>'+
        '<input type="number" class="grande" id="f_fondo" min="0" step="0.01" value="'+
        esc(actual.fondoCaja!=null&&actual.fondoCaja!==""?actual.fondoCaja:(libro.ajustes.fondoHabitual||""))+'"></div>'+
      '<div class="campo"><label class="lbl" for="f_saca">Se saca (€)</label>'+
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 6px">lo que te llevas al cerrar</div>'+
        '<input type="number" class="grande" id="f_saca" min="0" step="0.01" value="'+
        esc(sacaPuesto)+'" placeholder="sin apuntar">'+
        '<div class="nota" style="margin:4px 0 0" id="f_sacaNota"></div></div>'+
      '<div class="campo"><label class="lbl" for="f_sobra">Sobra c. amarilla (€)</label>'+
        '<input type="number" class="grande" id="f_sobra" step="0.01" value="'+
        esc(actual.sobrante!=null&&actual.sobrante!==""?actual.sobrante:"")+'" '+
        'placeholder="0,00"></div>'+
    '</div>'+
    '<p class="nota" style="margin:6px 0 0" id="f_cuadre"></p>'+
    '<p class="nota" style="margin:6px 0 0" id="f_fondoTotal"></p>'+
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

  /* El efectivo ya no se escribe: sale de las visas. Con el 80 % en
     visa, el metálico es el 20 % de lo que hay en visas; las visas se
     quedan como están. El % se toca aquí mismo, junto al campo,
     y al soltarlo queda guardado en Ajustes como el de siempre.
     Si un día hace falta poner otra cifra, se escribe encima y el campo
     se queda quieto hasta que se pulse «Volver al %». */
  var efecAMano=false;
  function pctDelForm(){
    var campo=document.getElementById("f_pct");
    var p=campo ? +campo.value : 0;
    return (isFinite(p) && p>0 && p<100) ? p : 0;
  }
  function efectivoPorPct(){
    var p=pctDelForm();
    return p ? r2(numero("f_visa")*(100-p)/100) : null;
  }
  function ponerEfectivo(){
    if(efecAMano) return;
    var e=efectivoPorPct();
    if(e==null) return;
    document.getElementById("f_efec").value = numero("f_visa")>0 ? e : "";
  }

  function totalG(){
    var t=0;
    cajaGastos.querySelectorAll(".gasto").forEach(function(f){ t+=+f.querySelector(".g_imp").value||0; });
    return r2(t);
  }
  function refrescar(){
    var visa=numero("f_visa"), efec=numero("f_efec"), g=totalG();
    var am=numero("f_amar"), fondo=numero("f_fondo");
    var neto=r2(efec-g);
    var cuenta=objetivoAmarilla()>0 ? r2(Math.max(0, am-objetivoAmarilla())) : 0;
    var campoSobra=document.getElementById("f_sobra");
    var puesto=(campoSobra && campoSobra.value!=="") ? r2(+campoSobra.value||0) : null;
    var sobra=(puesto!=null?puesto:cuenta);
    var cuadre=document.getElementById("f_cuadre");
    if(cuadre){
      var objetivo=objetivoAmarilla();
      if(puesto==null){
        cuadre.innerHTML = cuenta>0
          ? 'La amarilla pasa de '+eur(objetivo)+', así que sobran <strong>'+eur(cuenta)+'</strong>. '+
            '<button type="button" class="btn sm suave" id="f_usarCuenta" '+
            'style="padding:2px 8px">Usar esa cifra</button>'
          : (objetivo>0
              ? 'Todavía no llega a '+eur(objetivo)+', así que no sobra nada. '+
                'Si sobró, escríbelo tú.'
              : 'Ponle un objetivo a la amarilla en su pestaña y aquí te diré cuánto sobra.');
        var usar=document.getElementById("f_usarCuenta");
        if(usar) usar.addEventListener("click", function(){
          campoSobra.value=cuenta; refrescar();
        });
      } else {
        var dif=r2(puesto-cuenta);
        cuadre.innerHTML = Math.abs(dif)<0.005
          ? (cuenta>0 ? 'Cuadra: es lo que pasa de '+eur(objetivo)+'.'
                      : 'Anotado a mano; por el objetivo no sobraría nada.')
          : '<strong style="color:var(--aviso)">'+eur(puesto)+'</strong>, cuando por encima de '+
            eur(objetivo)+' saldrían '+eur(cuenta)+'.';
      }
    }
    var linea=document.getElementById("f_fondoTotal");
    if(linea) linea.innerHTML = (am||fondo)
      ? "Fondo de caja de hoy: <strong>"+eur(r2(am+fondo))+"</strong> — "+
        eur(am)+" en la amarilla y "+eur(fondo)+" en la registradora."
      : "El fondo de caja son las dos juntas: lo que apartas a la amarilla y lo que dejas de cambio.";
    var efn=document.getElementById("f_efecNota");
    if(efn){
      var p=pctDelForm();
      if(!p){
        efn.innerHTML="Pon un % entre 1 y 99 y el efectivo se pone solo.";
      } else if(efecAMano){
        efn.innerHTML='Escrito a mano. El '+num(100-p,0)+'% de las visas serían <strong>'+
          eur(efectivoPorPct())+'</strong>. '+
          '<button type="button" class="btn sm suave" id="f_volverPct" '+
          'style="padding:2px 8px">Volver al %</button>';
        var volver=document.getElementById("f_volverPct");
        if(volver) volver.addEventListener("click", function(){
          efecAMano=false; ponerEfectivo(); refrescar();
        });
      } else if(visa>0){
        /* La cuenta, escrita tal cual se hace: un porcentaje de las
           visas. Decir sólo el resultado no explica de dónde sale. */
        efn.innerHTML="Puesto solo: el "+num(100-p,0)+"% de las visas — "+
          eur(visa)+" × "+num(100-p,0)+"% = <strong>"+eur(efectivoPorPct())+
          "</strong>. Escribe encima si un día no cuadra.";
      } else {
        efn.innerHTML="Puesto solo: el "+num(100-p,0)+"% de las visas, con el "+
                      num(p,0)+"% en visa. Escribe encima si un día no cuadra.";
      }
    }
    /* La casilla nueva es la que cierra la cuenta, así que en cuanto hay
       cifra se enseña aquí mismo el efectivo que sale por las cajas: es
       el momento en que se ve para qué sirve apuntarlo. */
    var sn=document.getElementById("f_sacaNota");
    if(sn){
      var campoSaca=document.getElementById("f_saca");
      var saca=(campoSaca && campoSaca.value!=="") ? r2(+campoSaca.value||0) : null;
      var previo=recuentoAntesDe(ui.dia);
      if(saca==null){
        sn.innerHTML = elTramo
          ? "Este día entra en un tramo sin retirar, así que va un 0."
          : "Sin esto la caja no se puede cuadrar. Si no sacaste nada, escribe un 0.";
      } else if(!previo){
        sn.innerHTML="Éste es el primer cierre que hay, así que todavía no hay con qué compararlo.";
      } else {
        var fuera=deFueraEn(ui.dia);
        var porCajas=efectivoPorCajas({
          amHoy:am, amAyer:r2(+previo.aAmarilla||0),
          fondoHoy:fondo, fondoAyer:fondoDe(previo),
          pagos:g, retirado:saca,
          sacadoFuera:fuera.sacado, aportadoFuera:fuera.aportado
        });
        sn.innerHTML="Por las cajas, el efectivo del día sale <strong>"+eur(porCajas)+"</strong> "+
                     "(desde el cierre del "+esc(dmy(previo.fecha))+").";
      }
    }
    var rn=document.getElementById("f_realNota");
    if(rn){
      var campoReal=document.getElementById("f_efecReal");
      var real=(campoReal && campoReal.value!=="") ? r2(+campoReal.value||0) : null;
      if(real==null){
        rn.innerHTML="Si lo cuentas, escríbelo aquí y te digo lo que baila con el efectivo.";
      } else {
        var dr=r2(real-efec);
        rn.innerHTML = Math.abs(dr)<0.005
          ? 'Igual que el efectivo de al lado: cuadra.'
          : 'Contra el efectivo de al lado ('+eur(efec)+'), <span style="color:'+
            colorDiferencia(dr)+'">'+esc(textoDiferencia(dr))+'</span>.';
      }
    }
    document.getElementById("f_resumen").innerHTML=
      "Visas <strong>"+eur(visa)+"</strong> · "+
      "efectivo <strong>"+eur(efec)+"</strong> · "+
      "ventas <strong>"+eur(r2(visa+efec))+"</strong> · "+
      "tras pagos <strong>"+eur(neto)+"</strong> · "+
      "sobra amarilla <strong>"+eur(sobra)+"</strong>";
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
  /* El de las visas va antes que el refresco: primero se pone el
     efectivo y luego se recalcula todo con la cifra ya puesta. */
  document.getElementById("f_visa").addEventListener("input", ponerEfectivo);
  var campoPct=document.getElementById("f_pct");
  campoPct.addEventListener("input", ponerEfectivo);
  campoPct.addEventListener("change", function(){
    var p=pctDelForm();
    if(p && p!==+libro.ajustes.pctVisa){
      libro.ajustes.pctVisa=p; guardar();
      avisar("Guardado: el "+num(p,0)+"% de las ventas va en visa");
    }
  });
  /* Escribir en el campo a mano lo deja quieto; ponerEfectivo() cambia
     el value sin disparar "input", así que no se pisa a sí mismo. */
  document.getElementById("f_efec").addEventListener("input", function(){
    efecAMano=true;
  });
  ["f_visa","f_efec","f_efecReal","f_pct","f_amar","f_fondo","f_saca","f_sobra"].forEach(function(id){
    document.getElementById(id).addEventListener("input", refrescar);
  });
  /* Un día ya guardado se abre a mano solo si su efectivo no es el que
     tocaba por el %; así no se le cambia la cifra por detrás. */
  if(d){
    var tocaba=efectivoPorPct();
    efecAMano = !(tocaba!=null && Math.abs((+actual.efectivo||0)-tocaba)<0.005);
  }
  ponerEfectivo();
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
    /* Vacío es «no lo he contado», y eso no es lo mismo que cero. */
    var cr=document.getElementById("f_efecReal");
    registro.efectivoReal=(cr && cr.value!=="") ? r2(+cr.value||0) : null;
    registro.detalle=detalle;
    registro.gastos=r2(detalle.reduce(function(s,g){ return s+g.importe; },0));
    registro.aAmarilla=numero("f_amar");
    var sob=document.getElementById("f_sobra");
    registro.sobrante = (sob && sob.value!=="") ? r2(+sob.value||0) : null;
    registro.fondoCaja=numero("f_fondo");
    /* Igual que el recuento del cajón: vacío es «no lo he apuntado», y un
       0 escrito es «no saqué nada». No son lo mismo para el cuadre. */
    var cx=document.getElementById("f_saca");
    registro.retirado=(cx && cx.value!=="") ? r2(+cx.value||0) : null;
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


/* ── La tarjeta del cuadre ──────────────────────────────────────────
   Las tres cifras del mismo dinero, una al lado de otra: la del %, la
   del recuento del cajón y la que sale de las cajas. Sólo la última está
   hecha de dinero contado de punta a punta; las otras dos están para
   contrastarla. Cuando no se puede hacer, la tarjeta dice qué falta, que
   es más útil que un hueco. */
function tarjetaCuadre(fecha){
  var d=diaDe(fecha);
  if(!d) return "";
  var c=cuentasDia(d);
  var q=cuadreDia(fecha);
  if(!q) return "";

  function trozo(k,v,n,color){
    return '<div class="cifra"><div class="k">'+k+'</div>'+
           '<div class="v"'+(color?' style="color:'+color+'"':"")+'>'+v+'</div>'+
           '<div class="n">'+n+'</div></div>';
  }
  var difReal=(q.hay && c.hayReal) ? r2(c.efectivoReal-q.efectivo) : null;

  var cifras='<div class="cifras">'+
    trozo("Por el %", eur(c.efectivo),
          pctVisa() ? "el "+num(100-pctVisa(),0)+"% de las visas" : "escrito a mano")+
    trozo("Contado en el cajón", c.hayReal?eur(c.efectivoReal):"—",
          c.hayReal?"lo que contaste":"sin contar")+
    trozo("Por las cajas", q.hay?eur(q.efectivo):"—",
          q.hay?"lo que suben + pagos + lo que sacas":"todavía no sale",
          q.hay?"var(--acento)":null)+
  '</div>';

  /* La cuenta escrita tal cual se hace. Decir sólo el resultado no
     explica de dónde sale, y aquí lo que hay que ver es de dónde sale. */
  var suma = q.hay
    ? '<p class="nota" style="margin:0 0 10px">Desde el cierre del '+esc(dmy(q.previo))+
      ': la amarilla '+(Math.abs(q.subeAmarilla)<0.005
        ? 'se queda igual'
        : (q.subeAmarilla>0?"sube ":"baja ")+'<strong>'+eur(Math.abs(q.subeAmarilla))+'</strong>')+
      (Math.abs(q.subeFondo)>=0.005
        ? ', la registradora '+(q.subeFondo>0?"sube ":"baja ")+
          '<strong>'+eur(Math.abs(q.subeFondo))+'</strong>'
        : '')+
      ', pagaste <strong>'+eur(q.pagos)+'</strong> y sacaste <strong>'+eur(q.retirado)+'</strong>'+
      (q.sacadoFuera>0 ? ', más '+eur(q.sacadoFuera)+' que salieron de la amarilla' : '')+
      (q.aportado>0 ? ', menos '+eur(q.aportado)+' que metiste de fuera' : '')+
      '.</p>'
    : "";

  var veredicto;
  if(!q.hay){
    veredicto='<div class="nota" style="margin:0">Para cuadrar el día falta '+esc(q.falta)+'.</div>';
  } else if(!c.hayReal){
    veredicto='<div class="nota" style="margin:0">Por las cajas el efectivo del día es <strong>'+
      eur(q.efectivo)+'</strong>. Cuenta el cajón y escríbelo arriba: son dos caminos distintos '+
      'al mismo dinero, y si dan lo mismo la cifra es buena.</div>';
  } else if(Math.abs(difReal)<0.005){
    veredicto='<div class="nota" style="margin:0;color:var(--ok)"><strong>Cuadra.</strong> '+
      'El recuento del cajón y las cajas dicen lo mismo, así que el efectivo del día es bueno.</div>';
  } else {
    /* Si lo que baila es justo el cambio de la noche anterior, no falta
       dinero: es que el cajón se está contando con el cambio dentro. Vale
       la pena decirlo, o se busca un descuadre que no existe. */
    var comoCambio=(q.cambioAnoche!=null && q.cambioAnoche>0 &&
                    Math.abs(Math.abs(difReal)-q.cambioAnoche)<1);
    veredicto='<div class="aviso-caja" style="margin:0">Bailan <strong>'+eur(Math.abs(difReal))+
      '</strong>: contaste '+eur(c.efectivoReal)+' en el cajón y por las cajas salen '+
      eur(q.efectivo)+'. '+
      (comoCambio
        ? 'Y es casi justo el cambio que dejaste la noche anterior ('+eur(q.cambioAnoche)+'), '+
          'así que lo más probable es que estés contando el cajón con el cambio de la mañana '+
          'dentro. Si es eso, cuenta sólo lo cobrado y no hay descuadre.'
        : (difReal<0
            ? 'Hay menos en el cajón de lo que sale de la cuenta: o falta dinero, o falta un '+
              'apunte — un pago que no anotaste, o algo que sacaste y no pusiste.'
            : 'Hay más en el cajón de lo que sale de la cuenta: mira si te falta apuntar algo '+
              'que metiste, o si contaste de más.'))+
      '</div>';
  }

  /* Y lo que esto le hace al %: es el único sitio donde se ve si el 20 %
     de las visas se parece a lo que entra de verdad. */
  var contraPct="";
  if(q.hay && pctVisa() && c.visa>0){
    var dp=r2(q.efectivo-c.efectivo);
    contraPct='<p class="nota" style="margin:10px 0 0">Por el '+num(100-pctVisa(),0)+
      '% de las visas salían '+eur(c.efectivo)+'. '+
      (Math.abs(dp)<0.005
        ? 'Justo lo mismo.'
        : 'Con lo de hoy, por cada 100 € de visa entraron <strong>'+
          num(q.efectivo/c.visa*100,1)+' €</strong> en metálico.')+
      ' Un día suelto no dice nada; la media buena está en <strong>Sin retirar</strong>.</p>';
  }

  return '<div class="tarjeta" style="margin-bottom:16px">'+
    '<div class="tarjeta-cab"><h2>El cuadre del efectivo</h2>'+
      '<span class="pista">Tres cuentas del mismo dinero</span></div>'+
    cifras+
    '<div class="tarjeta-cuerpo">'+suma+veredicto+contraPct+'</div>'+
  '</div>';
}

/* ── El parte diario para WhatsApp ─────────────────────────────── */
/* El parte de cada día, con los mismos conceptos y en el mismo orden
   que la hoja de siempre. Los importes se alinean a la derecha para que
   en WhatsApp queden en columna. */
function textoDia(fecha, opciones){
  var d=diaDe(fecha);
  if(!d) return "";
  var c=cuentasDia(d);
  /* En el parte no entra ni un numero supuesto. El campo "Efectivo" lo
     rellena la app sola con el resto del porcentaje de las visas: sirve
     para mirar de un vistazo si falta dinero, pero no es dinero que
     nadie haya contado, y en el parte de la noche pareceria que si. Asi
     que va el del cajon, contado, y las noches que no se cuenta el
     renglon dice "sin contar" y se queda sin cifra. Mejor un hueco
     honrado que una cuenta con pinta de recuento. */
  var lineas=[
    ["Visas",       eur(c.visa)],
    ["Efectivo",    c.hayReal ? eur(c.efectivoReal) : "sin contar"],
    ["C. amarilla", eur(c.amarilla)],
    ["Pagos",       eur(c.gastos)],
    ["Fondo caja",  eur(c.fondo)]
  ];
  /* Como en la hoja: la casilla del sobrante se queda en blanco mientras
     la amarilla no pase del objetivo. Sólo aparece cuando hay de más. */
  if(c.sobrante>0.004) lineas.push(["Sobra c. am.", eur(c.sobrante)]);
  var anchoTexto=Math.max.apply(null, lineas.map(function(x){ return x[0].length; }));
  var anchoImporte=Math.max.apply(null, lineas.map(function(x){ return x[1].length; }));

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
      var importe=" ".repeat(anchoImporte-x[1].length)+x[1];
      l.push(etiqueta+"  "+importe);
    } else {
      l.push(x[0]+": "+x[1]);
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

/* El numero se guarda entero, con el codigo del pais, tal cual se
   escribe. Antes la app le ponia el prefijo por su cuenta a todo numero
   de hasta nueve cifras, y a un numero espanol de nueve le encajaba un
   376 delante: salia un numero inexistente y WhatsApp respondia "no se
   pudo abrir este enlace". Aqui ya no se adivina nada. */
/* Ordenador: puntero fino y sin pantalla tactil. En el Mac, la
   aplicacion de WhatsApp rechaza los enlaces wa.me con texto, asi que
   ahi conviene ofrecer antes el navegador. */
function enOrdenador(){
  try{
    return !((navigator.maxTouchPoints||0) > 1 &&
             window.matchMedia("(pointer: coarse)").matches);
  }catch(e){ return true; }
}

/* Deja el numero como lo quiere WhatsApp: solo cifras, empezando por el
   codigo del pais. El 00 de toda la vida y el + son la misma cosa, pero
   WhatsApp solo entiende la version sin nada: con 00376341459 delante no
   hay ningun numero, y sale el aviso de que no se puede abrir. */
function soloNumero(bruto){
  var t=String(bruto||"").replace(/[^\d+]/g,"");
  if(!t) return "";
  if(t.charAt(0)==="+") return t.slice(1).replace(/\D/g,"");
  t=t.replace(/\D/g,"");
  if(t.indexOf("00")===0 && t.length>4) return t.slice(2);
  return t;
}
/* El parte puede ir a varias personas. WhatsApp abre un chat cada vez,
   asi que no se manda a todas de golpe: se elige a quien en el momento
   de enviar, y la lista esta aqui para no tener que buscar el numero. */
function gente(){
  return (libro.ajustes.gente||[]).filter(function(g){
    return String(g.nombre||"").trim() || soloNumero(g.telefono);
  });
}
function telefonoDe(g){ return g ? soloNumero(g.telefono) : ""; }
function bonito(tel){ return tel ? "+"+tel : ""; }
function nombreDe(g){
  if(!g) return "quien elijas";
  return String(g.nombre||"").trim() || bonito(telefonoDe(g)) || "quien elijas";
}
/* El primero de la lista es el de siempre: el que sale marcado al abrir
   el parte y el que se nombra en los avisos. */
function telefonoCompleto(){ return telefonoDe(gente()[0]); }
function telefonoBonito(){ return bonito(telefonoCompleto()); }
function nombreDestino(){ return nombreDe(gente()[0]); }

/* Enviar el parte. En vez de abrir WhatsApp a ciegas —que muchos
   navegadores bloquean sin avisar— se enseña el parte con un enlace de
   verdad y un boton para copiarlo. Pulsar un enlace nunca se bloquea. */
function enviarDiaPorWhatsApp(fecha){
  var texto=textoDia(fecha, {alineado:true});   /* para leer y copiar */
  var plano=textoDia(fecha);                    /* para el enlace */
  if(!texto){ avisar("Ese dia no tiene nada anotado. Guardalo primero.", true); return; }
  /* La lista de Ajustes. Se manda a uno, se vuelve y se manda al
     siguiente: WhatsApp no abre dos chats de una vez. */
  var lista=gente();
  var tel=telefonoDe(lista[0]);
  function enlaceApp(t){ return "https://wa.me/"+t+"?text="+encodeURIComponent(plano); }
  function enlaceWeb(t){ return "https://web.whatsapp.com/send?phone="+t+"&text="+encodeURIComponent(plano); }
  var destino=enlaceApp(tel);
  var porNavegador=enlaceWeb(tel);

  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Parte del '+esc(dmy(fecha))+'</h3>'+
      '<button class="btn suave" data-x>Cerrar</button></div>'+
    '<div class="dlg-cuerpo">'+
      (lista.length>1
        ? '<p class="nota" style="margin:0 0 6px">A quien se lo mandas:</p>'+
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px">'+
          lista.map(function(g,i){
            return '<button class="btn sm'+(i===0?" fuerte":"")+'" data-quien="'+i+'">'+
                   esc(nombreDe(g))+'</button>'; }).join("")+
          '</div>'
        : "")+
      (tel
        ? '<p class="nota"><span id="aQuien">Se abrira el chat de <strong>'+esc(nombreDe(lista[0]))+
          '</strong> <span class="mono">'+esc(bonito(tel))+'</span>.</span> '+
          '<button class="btn suave sm" data-otro style="padding:2px 6px">Enviar a otro</button></p>'
        : '<p class="nota"><span id="aQuien">No hay ningun numero guardado, asi que WhatsApp te dejara '+
          'elegir el contacto. Pon a quien quieras en Ajustes y ya no habra que buscarlo.</span></p>')+
      /* En la vista previa se quitan las marcas de bloque: aqui ya se ve
         con letra de maquina, y en WhatsApp se envian igualmente. */
      '<div class="parte" id="parteTexto">'+esc(texto.split("\n").filter(function(x){
         return x.trim()!=="```"; }).join("\n"))+'</div>'+
      '<p class="nota" style="margin:10px 0 0">'+(enOrdenador()
        ? 'En el ordenador, la aplicación de WhatsApp rechaza estos enlaces '+
          '(«no se pudo abrir este enlace»). Usa <strong>Abrir en el navegador</strong>, '+
          'que no pasa por ella, o <strong>copia el parte</strong> y pégalo en el chat.'
        : 'Si la aplicación dice que no puede abrir el enlace, usa '+
          '<strong>Abrir en el navegador</strong> o copia el parte y pégalo.')+'</p>'+
    '</div>'+
    /* En el ordenador va delante lo que funciona: copiar y el navegador.
       wa.me se lo pasa a la aplicacion de escritorio, y esa es la que
       responde "no se pudo abrir este enlace"; en el movil, en cambio,
       es el camino bueno y va la primera. */
    '<div class="dlg-pie">'+
      (enOrdenador()
        ? '<a class="btn suave" href="'+esc(destino)+'" target="_blank" rel="noopener" '+
          'style="text-decoration:none" data-abrir>Abrir la aplicación</a>'+
          '<button class="btn" data-copiar>Copiar el parte</button>'+
          '<a class="btn wa" href="'+esc(porNavegador)+'" target="_blank" rel="noopener" '+
          'style="text-decoration:none" data-web>Abrir en el navegador</a>'
        : '<button class="btn" data-copiar>Copiar el parte</button>'+
          '<a class="btn suave" href="'+esc(porNavegador)+'" target="_blank" rel="noopener" '+
          'style="text-decoration:none" data-web>Abrir en el navegador</a>'+
          '<a class="btn wa" href="'+esc(destino)+'" target="_blank" rel="noopener" '+
          'style="text-decoration:none" data-abrir>Abrir WhatsApp</a>')+
    '</div>';
  document.body.appendChild(d);

  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-copiar]").addEventListener("click", function(){
    copiarTexto(texto, this);   /* al copiar va la version alineada */
  });
  /* Reapuntar los dos enlaces al numero elegido. Los botones de abajo
     son los mismos; lo unico que cambia es a donde llevan. */
  function apuntarA(t, comoSeLlama){
    d.querySelector("[data-abrir]").setAttribute("href", enlaceApp(t));
    d.querySelector("[data-web]").setAttribute("href", enlaceWeb(t));
    var nota=d.querySelector("#aQuien");
    if(nota) nota.innerHTML='Se abrira el chat de <strong>'+esc(comoSeLlama)+'</strong> '+
      '<span class="mono">'+esc(bonito(t))+'</span>.';   /* el boton de al lado se queda */
  }
  d.querySelectorAll("[data-quien]").forEach(function(b){
    b.addEventListener("click", function(){
      var g=lista[+b.getAttribute("data-quien")];
      var t=telefonoDe(g);
      if(!t){ avisar(nombreDe(g)+" no tiene numero puesto en Ajustes.", true); return; }
      d.querySelectorAll("[data-quien]").forEach(function(o){ o.classList.remove("fuerte"); });
      b.classList.add("fuerte");
      apuntarA(t, nombreDe(g));
    });
  });
  var otro=d.querySelector("[data-otro]");
  if(otro) otro.addEventListener("click", function(){
    var escrito=prompt("¿A qué número lo mando? (con el prefijo del país)", bonito(tel));
    if(escrito===null) return;
    var limpio=escrito.replace(/[^\d]/g,"");
    if(!limpio){ avisar("Ese número no vale.", true); return; }
    d.querySelectorAll("[data-quien]").forEach(function(o){ o.classList.remove("fuerte"); });
    apuntarA(limpio, "+"+limpio);
    avisar("Este parte ira a +"+limpio);
  });

  d.querySelector("[data-abrir]").addEventListener("click", function(){
    /* damos tiempo a que abra la pestana antes de cerrar la ventana */
    setTimeout(function(){ if(document.getElementById("dlg")){ d.close(); d.remove(); } }, 600);
  });
  d.querySelector("[data-web]").addEventListener("click", function(){
    setTimeout(function(){ if(document.getElementById("dlg")){ d.close(); d.remove(); } }, 600);
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
  var cierreMes=recuentoHasta(ui.mes);

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
      /* En el mes, la casilla que antes repetía la cuenta del % ahora
         enseña lo que de verdad se contó en el cajón. */
      '<div class="cifra"><div class="k">Efectivo real</div><div class="v">'+
        (t.efectivoReal>0.004?eur(t.efectivoReal):"—")+'</div>'+
        '<div class="n"'+(t.efectivoReal>0.004?' style="color:'+colorDiferencia(t.difReal)+'"':"")+'>'+
        (t.efectivoReal>0.004?esc(textoDiferencia(t.difReal))+" contra el efectivo"
                             :"lo que cuentas en el cajón")+'</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(t.gastos)+'</div>'+
        '<div class="n">pagados de caja</div></div>'+
      /* El recuento con el que se cierra ESTE mes, no el de hoy: mirando
         un mes de hace medio año salía el saldo de ahora. */
      '<div class="cifra"><div class="k">C. amarilla</div><div class="v amarilla">'+
        eur(cierreMes?r2(+cierreMes.aAmarilla||0):0)+'</div>'+
        '<div class="n">'+(cierreMes?"recuento del "+esc(dmy(cierreMes.fecha)):"sin recuentos")+
        '</div></div>'+
      '<div class="cifra"><div class="k">Sobra amarilla</div><div class="v">'+eur(t.sobrante)+'</div>'+
        '<div class="n">lo que pasó de '+eur(objetivoAmarilla())+'</div></div>'+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Días</h2>'+
      '<span class="pista">Pulsa un día para abrirlo</span></div>'+
      '<div class="tabla-caja" id="cuadrante"></div></div>'+

    /* La hoja de papel del mes, escaneada. Sirve de respaldo y para
       contrastar cuando un número no cuadra. */
    '<div class="tarjeta" style="margin-top:16px">'+
      '<div class="tarjeta-cab"><h2>La hoja de '+esc(mesLargo(ui.mes))+'</h2>'+
        '<span class="pista">La foto de tu cuadrante en papel</span></div>'+
      '<div class="tarjeta-cuerpo" id="cajaHoja"></div></div>';

  document.getElementById("m_mes").addEventListener("change", function(){
    ui.mes=this.value; ui.dia=this.value+"-01"; pintar();
  });

  pintarHoja();   /* va aparte de la tabla: un mes sin días también puede tener su hoja */

  var caja=document.getElementById("cuadrante");
  if(!dias.length){
    caja.innerHTML='<div class="vacio"><strong>Sin días anotados en '+esc(mesLargo(ui.mes))+'</strong>'+
      'Ve a «Día» y anota el primer cierre.</div>';
    return;
  }
  /* Aquí había dos columnas con la misma invención: «Efectivo», que es
     la cifra guardada, y «Debería haber», que era esa misma cuenta
     rehecha con el % de hoy. Como el % se ha tocado por el camino, la
     segunda marcaba en rojo un desfase todos los días —«faltan 57,60»,
     «faltan 64,20»— que no era dinero que faltara, sino dos cálculos
     hechos con porcentajes distintos. Queda una sola, apagada y con su
     nombre: la cuenta de la app. La de verdad es la del recuento. */
  caja.innerHTML='<table><thead><tr><th>Día</th><th class="num">Visas</th>'+
    '<th class="num">Efectivo<div style="font-weight:400;color:var(--muted);font-size:11px">'+
      (pctVisa()?'el '+num(100-pctVisa(),0)+' % de las visas':'escrito a mano')+'</div></th>'+
    '<th class="num">Efec. real<div style="font-weight:400;color:var(--muted);font-size:11px">'+
      'contado en el cajón</div></th>'+
    '<th class="num">Pagos</th><th class="num">C. amarilla</th><th class="num">Fondo caja</th>'+
    '<th class="num">Sobra am.</th><th class="num">Ventas</th><th>Nota</th></tr></thead><tbody>'+
    dias.map(function(d){
      var c=cuentasDia(d);
      var esHoy=(d.fecha===hoyISO());
      return '<tr'+(esHoy?' class="hoy"':'')+' style="cursor:pointer" data-dia="'+d.fecha+'">'+
        "<td><strong>"+d.fecha.slice(8)+"</strong> "+
          '<span style="color:var(--muted);font-size:12px">'+diaSemana(d.fecha).slice(0,3)+"</span></td>"+
        '<td class="num">'+eur(c.visa)+"</td>"+
        /* Apagada: no es dinero, es la cuenta. Y si no es la que saldría
           con el % de ahora, se dice, que es lo único que aportaba la
           columna que había al lado. */
        '<td class="num" style="color:var(--muted)">'+eur(c.efectivo)+
          /* La guardada puede no ser la que saldría hoy: o se escribió a
             mano, o ese día el % era otro. Sin saber cuál de las dos, se
             dice lo único cierto: lo que daría el % de ahora. */
          (pctVisa() && c.visa>0 && Math.abs(c.difEfectivo)>=0.005
            ? '<div style="font-size:11px">por el % de hoy: '+eur(c.efectivoPrevisto)+'</div>'
            : "")+"</td>"+
        /* Lo contado esa noche: el único dinero de esta tabla que ha
           tocado alguien. Antes iba en rojo lo que le faltaba contra la
           cifra de al lado, pero eso es medirse contra una suposición. */
        '<td class="num">'+(c.hayReal
          ? "<strong>"+eur(c.efectivoReal)+"</strong>"
          : '<span style="color:var(--muted)">sin contar</span>')+"</td>"+
        '<td class="num"'+(c.gastos>0?' style="color:var(--malo)"':"")+">"+(c.gastos>0?eur(c.gastos):"—")+"</td>"+
        '<td class="num"'+(c.amarilla>0?' style="color:var(--amarilla);font-weight:600"':"")+">"+
          (c.amarilla>0?eur(c.amarilla):"—")+"</td>"+
        '<td class="num">'+(c.fondo>0?eur(c.fondo):"—")+"</td>"+
        '<td class="num">'+(c.sobrante>0.004?"<strong>"+eur(c.sobrante)+"</strong>":"—")+"</td>"+
        '<td class="num">'+eur(c.ventas)+"</td>"+
        '<td style="font-size:12.5px;color:var(--muted)">'+esc(d.nota||"")+"</td></tr>";
    }).join("")+
    '</tbody><tfoot><tr><td>'+t.dias+' días</td>'+
      '<td class="num">'+eur(t.visa)+'</td>'+
      '<td class="num" style="color:var(--muted)">'+eur(t.efectivo)+'</td>'+
      '<td class="num">'+(t.efectivoReal>0.004?"<strong>"+eur(t.efectivoReal)+"</strong>":"—")+'</td>'+
      /* La amarilla y el fondo son recuentos: sumar los de todos los días
         daría una cifra que no existe en ninguna parte. */
      '<td class="num">'+eur(t.gastos)+'</td>'+
      '<td class="num" style="color:var(--muted)">—</td>'+
      '<td class="num" style="color:var(--muted)">—</td>'+
      '<td class="num">'+eur(t.sobrante)+'</td>'+
      '<td class="num">'+eur(t.ventas)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-dia]").forEach(function(tr){
    tr.addEventListener("click", function(){
      ui.dia=tr.getAttribute("data-dia"); ui.vista="dia"; pintar();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   COMPARAR
   ══════════════════════════════════════════════════════════════
   Un mes suelto no dice nada: 100.000 € de ventas es mucho o poco según
   lo que hicieras el año pasado por estas fechas. Y en un sitio de
   temporada, comparar agosto con septiembre tampoco vale: hay que
   comparar agosto con AGOSTO.

   Así que aquí van las dos comparaciones que sirven: cada mes contra el
   mes anterior, y cada mes contra el mismo mes del año pasado. Escritas
   y dibujadas, que una cosa se ve en la tabla y la otra en el dibujo.

   Los dibujos son SVG a pelo, sin librerías: son cuatro barras y una
   línea, y traerse media web para eso sería tirar de un cañón. */

function mesesConDatos(){
  var hay={};
  (libro.dias||[]).forEach(function(d){ var m=(d.fecha||"").slice(0,7); if(m) hay[m]=1; });
  return Object.keys(hay).sort();
}
function aniosConDatos(){
  var hay={};
  (libro.dias||[]).forEach(function(d){ var a=(d.fecha||"").slice(0,4); if(a) hay[a]=1; });
  return Object.keys(hay).sort();
}
function nombreMes(ym){
  var a=ym.split("-");
  return MESES[+a[1]-1]+" "+a[0];
}
function nombreMesCorto(ym){
  var a=ym.split("-");
  return MESES[+a[1]-1].slice(0,3)+" "+a[0].slice(2);
}
/* El porcentaje de verdad: qué parte de la venta se cobró con tarjeta.
   No es el % de Ajustes —ése se aplica a las visas— sino el de verdad. */
function pctVisaDe(t){ return t.ventas>0 ? r2(t.visa/t.ventas*100) : null; }
function pctPagosDe(t){ return t.ventas>0 ? r2(t.gastos/t.ventas*100) : null; }

/* Cuánto ha cambiado una cifra respecto a otra, en tanto por ciento.
   Sin cifra de antes no hay variación: no es un 0 %, es que no hay con
   qué comparar, y pintarlo como 0 sería decir que no cambió nada. */
function variacion(ahora, antes){
  if(antes==null || antes===0) return null;
  return r2((ahora-antes)/antes*100);
}
function pintaVariacion(v, alReves){
  if(v==null) return '<span style="color:var(--muted)">—</span>';
  var sube=v>0.05, baja=v<-0.05;
  var col=(!sube&&!baja) ? "var(--muted)"
        : (alReves ? (sube?"var(--malo)":"var(--ok)") : (sube?"var(--ok)":"var(--malo)"));
  return '<span style="color:'+col+';font-weight:600">'+
         (sube?"+":baja?"−":"")+num(Math.abs(v),1)+' %</span>';
}

/* ── Los dibujos ──────────────────────────────────────────────── */
/* Barras apiladas: la visa abajo y el efectivo encima, para que se vea
   de un golpe el tamaño del mes y de qué está hecho. */
function grafBarras(filas, opciones){
  opciones=opciones||{};
  var W=Math.max(340, filas.length*62+40), H=210, base=H-34, techo=16;
  var tope=Math.max.apply(null, filas.map(function(f){
    return f.partes.reduce(function(t,p){ return t+p.valor; },0); }).concat([1]));
  var esc2=function(v){ return (base-techo)*v/tope; };
  var ancho=Math.min(42, (W-40)/filas.length-12);

  var barras=filas.map(function(f, i){
    var x=20+i*((W-40)/filas.length)+((W-40)/filas.length-ancho)/2;
    var y=base, trozos="";
    f.partes.forEach(function(p){
      var h=esc2(p.valor);
      if(h>0.4){ y-=h; trozos+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+ancho.toFixed(1)+
        '" height="'+h.toFixed(1)+'" fill="'+p.color+'"><title>'+esc(f.etiqueta+" · "+p.nombre+": "+eur(p.valor))+
        '</title></rect>'; }
    });
    var total=f.partes.reduce(function(t,p){ return t+p.valor; },0);
    return trozos+
      '<text x="'+(x+ancho/2).toFixed(1)+'" y="'+(y-5).toFixed(1)+'" text-anchor="middle" '+
        'font-size="10" font-family="var(--mono)" fill="var(--muted)">'+
        (total>=1000?num(total/1000,1)+"k":num(total,0))+'</text>'+
      '<text x="'+(x+ancho/2).toFixed(1)+'" y="'+(base+14)+'" text-anchor="middle" '+
        'font-size="10" font-family="var(--mono)" fill="var(--muted)">'+esc(f.etiqueta)+'</text>';
  }).join("");

  return '<div class="grafico"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" '+
    'role="img" aria-label="'+esc(opciones.titulo||"Gráfico")+'">'+
    '<line x1="14" y1="'+base+'" x2="'+(W-14)+'" y2="'+base+'" stroke="var(--linea)" stroke-width="1"/>'+
    barras+'</svg></div>';
}

/* Una línea para el porcentaje: lo que importa aquí no es el tamaño
   sino si sube o baja, y eso una línea lo dice mejor que una barra. */
function grafLinea(filas, opciones){
  opciones=opciones||{};
  var W=Math.max(340, filas.length*62+40), H=170, base=H-34, techo=18;
  var vals=filas.map(function(f){ return f.valor; }).filter(function(v){ return v!=null; });
  if(!vals.length) return "";
  var min=Math.min.apply(null, vals), max=Math.max.apply(null, vals);
  if(max-min<1){ max=max+1; min=min-1; }
  var y=function(v){ return base-(base-techo)*(v-min)/(max-min); };
  var x=function(i){ return 24+i*((W-48)/Math.max(1,filas.length-1)); };

  var puntos=filas.map(function(f,i){ return f.valor==null?null:[x(i), y(f.valor)]; });
  var camino=puntos.filter(Boolean).map(function(p,i){
    return (i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1); }).join(" ");

  return '<div class="grafico"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" '+
    'role="img" aria-label="'+esc(opciones.titulo||"Gráfico")+'">'+
    '<line x1="14" y1="'+base+'" x2="'+(W-14)+'" y2="'+base+'" stroke="var(--linea)" stroke-width="1"/>'+
    '<path d="'+camino+'" fill="none" stroke="var(--acento)" stroke-width="2.5" '+
      'stroke-linejoin="round" stroke-linecap="round"/>'+
    filas.map(function(f,i){
      if(f.valor==null) return "";
      return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(f.valor).toFixed(1)+'" r="4" '+
        'fill="var(--sup)" stroke="var(--acento)" stroke-width="2.5"><title>'+
        esc(f.etiqueta+": "+num(f.valor,1)+" %")+'</title></circle>'+
        '<text x="'+x(i).toFixed(1)+'" y="'+(y(f.valor)-10).toFixed(1)+'" text-anchor="middle" '+
        'font-size="10" font-family="var(--mono)" fill="var(--muted)">'+num(f.valor,0)+'%</text>'+
        '<text x="'+x(i).toFixed(1)+'" y="'+(base+14)+'" text-anchor="middle" '+
        'font-size="10" font-family="var(--mono)" fill="var(--muted)">'+esc(f.etiqueta)+'</text>';
    }).join("")+
    '</svg></div>';
}

function leyenda(cosas){
  return '<div class="leyenda">'+cosas.map(function(c){
    return '<span><i style="background:'+c.color+'"></i>'+esc(c.nombre)+'</span>';
  }).join("")+'</div>';
}

/* La variación entre dos meses, en total si son comparables y por día
   si no. Devuelve el HTML ya pintado. */
function variacionMes(d, otro){
  if(!otro || !otro.t.dias || !d.t.dias) return '<span style="color:var(--muted)">—</span>';
  var descuadre=Math.abs(d.t.dias-otro.t.dias)/Math.max(d.t.dias, otro.t.dias);
  if(descuadre>0.2){
    var v=variacion(d.porDia, otro.porDia);
    if(v==null) return '<span style="color:var(--muted)">—</span>';
    return pintaVariacion(v)+'<div style="font-size:10px;color:var(--muted)">al día</div>';
  }
  return pintaVariacion(variacion(d.t.ventas, otro.t.ventas));
}

function verComparar(main){
  var meses=mesesConDatos();
  if(!meses.length){
    main.innerHTML=cabecera("Comparar","Cómo va cada mes contra el anterior y contra el año pasado.")+
      '<div class="tarjeta"><div class="vacio"><strong>Todavía no hay meses que comparar</strong>'+
      'Anota unos cuantos días y aquí empezarán a salir las comparaciones.</div></div>';
    return;
  }
  var datos=meses.map(function(ym){
    var t=sumaCuentas(diasDe(ym));
    return {ym:ym, t:t, pct:pctVisaDe(t), pctPagos:pctPagosDe(t),
            porDia:t.dias>0?r2(t.ventas/t.dias):0};
  });
  var porYm={}; datos.forEach(function(d){ porYm[d.ym]=d; });
  function haceUnAnio(ym){
    var a=ym.split("-");
    return porYm[(+a[0]-1)+"-"+a[1]] || null;
  }

  var anios=aniosConDatos().map(function(a){
    var t=sumaCuentas(diasDe(a));
    return {a:a, t:t, pct:pctVisaDe(t), pctPagos:pctPagosDe(t),
            porDia:t.dias>0?r2(t.ventas/t.dias):0};
  });

  main.innerHTML=
    cabecera("Comparar",
      "Un mes suelto no dice nada. Aquí va contra el mes anterior y, lo que de verdad "+
      "importa en un sitio de temporada, contra el mismo mes del año pasado.")+

    tarjetaSospechas(datos)+
    tarjetaEnCristiano(datos, anios, haceUnAnio)+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Ventas de cada mes</h2>'+
        '<span class="pista">visa abajo, efectivo encima</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        grafBarras(datos.map(function(d){
          return {etiqueta:nombreMesCorto(d.ym), partes:[
            {nombre:"Visa", valor:d.t.visa, color:"var(--acento)"},
            {nombre:"Efectivo", valor:d.t.efectivo, color:"var(--amarilla)"}]};
        }), {titulo:"Ventas de cada mes"})+
        leyenda([{nombre:"Visa", color:"var(--acento)"},
                 {nombre:"Efectivo", color:"var(--amarilla)"}])+
      '</div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Qué parte se cobra con tarjeta</h2>'+
        '<span class="pista">de la venta de cada mes</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        grafLinea(datos.map(function(d){
          return {etiqueta:nombreMesCorto(d.ym), valor:d.pct}; }),
          {titulo:"Porcentaje de visa"})+
        '<p class="nota" style="margin:10px 0 0">Éste es el de verdad: las visas partido por la '+
        'venta. El de <strong>Ajustes</strong> es otra cosa —se aplica a las visas para calcular '+
        'el efectivo—, y por eso no dan el mismo número.</p>'+
      '</div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Pagos de cada mes</h2>'+
        '<span class="pista">lo que sale de la caja</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        grafBarras(datos.map(function(d){
          return {etiqueta:nombreMesCorto(d.ym), partes:[
            {nombre:"Pagos", valor:d.t.gastos, color:"var(--malo)"}]};
        }), {titulo:"Pagos de cada mes"})+
      '</div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Mes a mes</h2>'+
        '<span class="pista">contra el mes anterior y contra el año pasado</span></div>'+
      '<div class="tabla-caja"><table><thead><tr>'+
        '<th>Mes</th><th class="num">Días</th><th class="num">Visa</th><th class="num">Efectivo</th>'+
        '<th class="num">% visa</th><th class="num">Ventas</th><th class="num">Al día</th>'+
        '<th class="num">Pagos</th><th class="num">% pagos</th>'+
        '<th class="num">vs mes ant.</th><th class="num">vs año pas.</th>'+
      '</tr></thead><tbody>'+
      datos.map(function(d, i){
        var ant=i>0?datos[i-1]:null;
        var pas=haceUnAnio(d.ym);
        return '<tr style="cursor:pointer" data-mes="'+esc(d.ym)+'">'+
          '<td><strong>'+esc(nombreMes(d.ym))+'</strong></td>'+
          '<td class="num">'+d.t.dias+'</td>'+
          '<td class="num">'+eur(d.t.visa)+'</td>'+
          '<td class="num">'+eur(d.t.efectivo)+'</td>'+
          '<td class="num">'+(d.pct==null?"—":num(d.pct,0)+" %")+'</td>'+
          '<td class="num"><strong>'+eur(d.t.ventas)+'</strong></td>'+
          '<td class="num">'+eur(d.porDia)+'</td>'+
          '<td class="num" style="color:var(--malo)">'+eur(d.t.gastos)+'</td>'+
          '<td class="num">'+(d.pctPagos==null?"—":num(d.pctPagos,0)+" %")+'</td>'+
          /* Comparando meses con muy distintos días anotados, el total
             miente —«+3.338 %» contra un mes de un solo día—, así que
             ahí se compara lo del día, y se dice con el signo «/día». */
          '<td class="num">'+variacionMes(d, ant)+'</td>'+
          '<td class="num">'+variacionMes(d, pas)+'</td>'+
        '</tr>';
      }).join("")+
      '</tbody></table></div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Año contra año</h2>'+
      '<span class="pista">con los días que hay anotados de cada uno</span></div>'+
      '<div class="tabla-caja"><table><thead><tr>'+
        '<th>Año</th><th class="num">Días</th><th class="num">Visa</th><th class="num">Efectivo</th>'+
        '<th class="num">% visa</th><th class="num">Ventas</th><th class="num">Al día</th>'+
        '<th class="num">Pagos</th><th class="num">% pagos</th><th class="num">vs anterior</th>'+
      '</tr></thead><tbody>'+
      anios.map(function(x, i){
        var ant=i>0?anios[i-1]:null;
        return '<tr>'+
          '<td><strong>'+esc(x.a)+'</strong></td>'+
          '<td class="num">'+x.t.dias+'</td>'+
          '<td class="num">'+eur(x.t.visa)+'</td>'+
          '<td class="num">'+eur(x.t.efectivo)+'</td>'+
          '<td class="num">'+(x.pct==null?"—":num(x.pct,0)+" %")+'</td>'+
          '<td class="num"><strong>'+eur(x.t.ventas)+'</strong></td>'+
          '<td class="num">'+eur(x.porDia)+'</td>'+
          '<td class="num" style="color:var(--malo)">'+eur(x.t.gastos)+'</td>'+
          '<td class="num">'+(x.pctPagos==null?"—":num(x.pctPagos,0)+" %")+'</td>'+
          '<td class="num">'+pintaVariacion(ant?variacion(x.t.ventas, ant.t.ventas):null)+'</td>'+
        '</tr>';
      }).join("")+
      '</tbody></table></div>'+
      '<div class="tarjeta-cuerpo"><p class="nota" style="margin:0">Ojo al comparar años: cada uno '+
      'tiene los días que tenga anotados. Si de uno faltan meses, su total no es el del año, es el '+
      'de lo apuntado. La columna de días lo dice.</p></div>'+
    '</div>';

  main.querySelectorAll("[data-mes]").forEach(function(tr){
    tr.addEventListener("click", function(){
      ui.mes=tr.getAttribute("data-mes"); ui.dia=ui.mes+"-01"; ui.vista="mes"; pintar();
    });
  });
}

/* Antes de comparar nada, mirar si hay algún número imposible. Un mes
   que paga más de lo que vende no es un mal mes: es un dedazo, y basta
   uno para que todas las comparaciones de ese año salgan torcidas.
   Pasó de verdad: 772.350 € de pagos un 5 de agosto, que se comieron el
   mes entero. Más vale que salte aquí que estar mirando gráficos que no
   significan nada. */
function tarjetaSospechas(datos){
  return avisoPagosImposibles(datos) + avisoEfectivoRaro(datos);
}

/* El efectivo que se sale de lo normal. Es el aviso que pidió: al meter
   una hoja vieja, lo que más fácil se queda a medias es la columna del
   efectivo, y no se nota mirando los totales —las ventas siguen
   pareciendo buenas— pero sí en la proporción de tarjeta.

   Se compara cada mes con la mediana de los demás, no con la media: un
   mes disparatado arrastra la media y entonces el raro parece normal y
   los normales raros. Y sólo entran los meses con una semana o más:
   con dos días, cualquier proporción es casualidad.

   No dice que esté mal, dice que lo mires. Puede que ese mes se cobrara
   de verdad casi todo con tarjeta. */
function avisoEfectivoRaro(datos){
  var buenos=datos.filter(function(d){ return d.t.dias>=7 && d.pct!=null; });
  if(buenos.length<3) return "";
  function mediana(v){
    var x=v.slice().sort(function(a,b){ return a-b; });
    var m=Math.floor(x.length/2);
    return x.length%2 ? x[m] : r2((x[m-1]+x[m])/2);
  }
  /* Contra la mediana de TODOS, no contra la de los demás: quitando uno
     cada vez, con pocos meses la mediana se mueve tanto que acababa
     marcando cuatro de cinco, y un aviso que salta siempre no lo lee
     nadie. Y diez puntos de margen, que entre invierno y verano la
     proporción cambia sola sin que nada esté mal. */
  var normal=mediana(buenos.map(function(d){ return d.pct; }));
  var raros=buenos.filter(function(d){ return Math.abs(d.pct-normal)>=10; });
  if(!raros.length) return "";
  return '<div class="aviso-caja">'+
    '<strong>El efectivo de '+(raros.length===1?"un mes se sale":"unos meses se sale")+
    ' de lo normal.</strong> En el resto, con tarjeta se cobra alrededor del '+
    num(normal,0)+' %. Aquí no: '+
    raros.map(function(d){
      return esc(nombreMes(d.ym))+' va al '+num(d.pct,0)+' % ('+eur(d.t.efectivo)+
             ' de efectivo sobre '+eur(d.t.ventas)+')';
    }).join("; ")+
    '. Puede que fuera así de verdad, pero es justo lo que pasa cuando la columna del '+
    'efectivo se queda a medias al pasar una hoja. Mira esos meses.</div>';
}

function avisoPagosImposibles(datos){
  var malos=datos.filter(function(d){ return d.t.gastos > d.t.ventas && d.t.ventas>0; });
  if(!malos.length) return "";
  return malos.map(function(d){
    /* El día que se lleva la culpa: el de más pagos de ese mes. */
    var peor=diasDe(d.ym).slice().sort(function(a,b){
      return totalGastos(b)-totalGastos(a); })[0];
    return '<div class="aviso-caja"><strong>'+esc(nombreMes(d.ym))+' tiene algo mal.</strong> '+
      'Los pagos suman '+eur(d.t.gastos)+' y las ventas '+eur(d.t.ventas)+': se pagó '+
      num(d.t.gastos/d.t.ventas,0)+' veces lo que se vendió, y eso no puede ser.'+
      (peor && totalGastos(peor)>d.t.ventas
        ? ' Casi todo está en un solo día, el <strong>'+esc(dmy(peor.fecha))+'</strong>, con '+
          eur(totalGastos(peor))+' de pagos. Míralo, que con un cero de más se tuerce el año entero.'
        : "")+
      ' Mientras esté así, las comparaciones de ese mes no valen.</div>';
  }).join("");
}

/* Lo mismo, en cristiano. La tabla la mira quien quiere el número; esto
   lo lee cualquiera de pasada. */
function tarjetaEnCristiano(datos, anios, haceUnAnio){
  var frases=[];
  var ult=datos[datos.length-1];

  if(datos.length>1){
    var ant=datos[datos.length-2];
    var v=variacion(ult.t.ventas, ant.t.ventas);
    if(v!=null) frases.push("<strong>"+esc(nombreMes(ult.ym))+"</strong> lleva "+
      eur(ult.t.ventas)+" en "+plural(ult.t.dias,"día","días")+", "+
      (Math.abs(v)<0.05 ? "lo mismo que" : (v>0?"un "+num(Math.abs(v),1)+" % más que":
       "un "+num(Math.abs(v),1)+" % menos que"))+" "+esc(nombreMes(ant.ym))+".");
  }

  /* La comparación que de verdad sirve en un sitio de temporada. */
  datos.forEach(function(d){
    var pas=haceUnAnio(d.ym);
    if(!pas || !pas.t.dias || !d.t.dias) return;

    /* Con muy distintos días anotados, comparar los totales miente: un
       mes con un día apuntado sale «un 97 % menos» y no es que fuera
       mal, es que no está entero. En ese caso se compara por día, que
       es lo único que se puede comparar. */
    var descuadre=Math.abs(d.t.dias-pas.t.dias)/Math.max(d.t.dias,pas.t.dias);
    var porDia=(descuadre>0.2);
    var v=porDia ? variacion(d.porDia, pas.porDia) : variacion(d.t.ventas, pas.t.ventas);
    if(v==null) return;

    var t="<strong>"+esc(nombreMes(d.ym))+"</strong> contra "+esc(nombreMes(pas.ym))+": ";
    if(porDia){
      t+=eur(d.porDia)+" al día contra "+eur(pas.porDia)+", "+
        (Math.abs(v)<0.05?"prácticamente igual":
         (v>0?"un "+num(Math.abs(v),1)+" % más":"un "+num(Math.abs(v),1)+" % menos"))+
        " (van por día porque de uno hay "+plural(d.t.dias,"día","días")+
        " y del otro "+plural(pas.t.dias,"día","días")+")";
    } else {
      t+=eur(d.t.ventas)+" contra "+eur(pas.t.ventas)+", "+
        (Math.abs(v)<0.05?"prácticamente igual":
         (v>0?"un "+num(Math.abs(v),1)+" % más":"un "+num(Math.abs(v),1)+" % menos"));
      var vg=variacion(d.t.gastos, pas.t.gastos);
      /* Si uno de los dos meses tiene los pagos disparados, callarse:
         la comparación de pagos no diría nada cierto. */
      var fiable=(d.t.gastos<=d.t.ventas && pas.t.gastos<=pas.t.ventas);
      if(fiable && vg!=null && Math.abs(vg)>=1)
        t+=". Los pagos, un "+num(Math.abs(vg),1)+" % "+(vg>0?"más":"menos")+
           (vg>v+1 ? ", que suben más que las ventas" : "");
    }
    frases.push(t+".");
  });

  /* Dónde está el dinero: si el efectivo cae, no es lo mismo vender lo
     mismo. */
  if(datos.length>1){
    var pr=datos[0], ul=datos[datos.length-1];
    if(pr.pct!=null && ul.pct!=null && Math.abs(ul.pct-pr.pct)>=1){
      frases.push("Con tarjeta se cobra cada vez "+(ul.pct>pr.pct?"más":"menos")+": del "+
        num(pr.pct,0)+" % en "+esc(nombreMes(pr.ym))+" al "+num(ul.pct,0)+" % en "+
        esc(nombreMes(ul.ym))+".");
    }
  }
  var mejor=datos.slice().sort(function(a,b){ return b.porDia-a.porDia; })[0];
  if(mejor && mejor.porDia>0)
    frases.push("El mes que más ha dado por día es <strong>"+esc(nombreMes(mejor.ym))+
      "</strong>, con "+eur(mejor.porDia)+" de media.");

  if(!frases.length) return "";
  return '<div class="tarjeta" style="margin-bottom:16px">'+
    '<div class="tarjeta-cab"><h2>Lo que dicen los números</h2></div>'+
    '<div class="tarjeta-cuerpo"><ul class="en-cristiano">'+
      frases.map(function(f){ return "<li>"+f+"</li>"; }).join("")+
    '</ul></div></div>';
}

/* ══════════════════════════════════════════════════════════════
   LA HOJA DE PAPEL
   ══════════════════════════════════════════════════════════════
   Una foto por mes, guardada con el resto de los datos. Se reduce
   antes de guardarla, pero no tanto como en el álbum de monedas:
   aquí hay que poder leer las cifras escritas a mano.
   ══════════════════════════════════════════════════════════════ */
function hojaDelMes(ym){ return (libro.hojas||{})[ym||ui.mes] || null; }

function pintarHoja(){
  var caja=document.getElementById("cajaHoja"); if(!caja) return;
  var foto=hojaDelMes();

  caja.innerHTML = foto
    ? '<img src="'+esc(foto)+'" alt="La hoja de '+esc(mesLargo(ui.mes))+'" '+
      'id="hojaFoto" style="width:100%;max-width:620px;border-radius:8px;'+
      'border:1px solid var(--linea);cursor:zoom-in;display:block">'+
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
        '<button class="btn sm" id="hoja_ver">Verla grande</button>'+
        '<button class="btn sm" id="hoja_cambiar">Cambiar la foto</button>'+
        '<button class="btn sm malo" id="hoja_quitar">Quitarla</button>'+
      '</div>'+
      '<input type="file" id="hoja_archivo" accept="image/*" capture="environment" '+
      'style="display:none">'
    : '<p class="nota" style="margin:0 0 12px">Haz una foto a la hoja del mes y déjala aquí. '+
      'Queda guardada con los datos, así que la tienes en cualquier dispositivo y sirve para '+
      'contrastar cuando un número no cuadre.</p>'+
      '<input type="file" id="hoja_archivo" accept="image/*" capture="environment" '+
      'style="width:auto">';

  var archivo=document.getElementById("hoja_archivo");
  archivo.addEventListener("change", function(){
    var f=this.files && this.files[0];
    if(!f) return;
    encogerFoto(f, function(dataUrl){
      libro.hojas=libro.hojas||{};
      libro.hojas[ui.mes]=dataUrl;
      guardar(); pintar();
      avisar("Hoja de "+mesLargo(ui.mes)+" guardada");
    });
  });

  if(!foto) return;
  document.getElementById("hoja_cambiar").addEventListener("click", function(){ archivo.click(); });
  document.getElementById("hoja_ver").addEventListener("click", verHojaGrande);
  document.getElementById("hojaFoto").addEventListener("click", verHojaGrande);
  document.getElementById("hoja_quitar").addEventListener("click", function(){
    confirmar("Quitar la hoja de "+mesLargo(ui.mes),
      '<p style="margin:0">Se borra la foto. Los días anotados no se tocan.</p>',
      function(){
        if(libro.hojas) delete libro.hojas[ui.mes];
        guardar(); pintar(); avisar("Foto quitada");
      }, {aceptar:"Quitar", malo:true});
  });
}

function verHojaGrande(){
  var foto=hojaDelMes(); if(!foto) return;
  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.style.maxWidth="min(1000px, calc(100% - 32px))";
  d.innerHTML='<div class="dlg-cab"><h3>La hoja de '+esc(mesLargo(ui.mes))+'</h3>'+
    '<button class="btn suave" data-x>Cerrar</button></div>'+
    '<div class="dlg-cuerpo" style="max-height:80vh"><img src="'+esc(foto)+'" alt="" '+
    'style="width:100%;display:block;border-radius:6px"></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.showModal();
}

/* La foto se reduce antes de guardarla: 1100 px de lado largo, que es lo
   que hace falta para leer los números a mano sin que el archivo se
   dispare. El libro entero sube a GitHub en cada cambio. */
function encogerFoto(archivo, listo){
  var lector=new FileReader();
  lector.onload=function(){
    var img=new Image();
    img.onload=function(){
      var max=1100;
      var ancho=img.width, alto=img.height;
      if(ancho>alto && ancho>max){ alto=Math.round(alto*max/ancho); ancho=max; }
      else if(alto>=ancho && alto>max){ ancho=Math.round(ancho*max/alto); alto=max; }
      var cv=document.createElement("canvas");
      cv.width=ancho; cv.height=alto;
      var cx=cv.getContext("2d");
      cx.fillStyle="#fff"; cx.fillRect(0,0,ancho,alto);
      cx.drawImage(img,0,0,ancho,alto);
      listo(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror=function(){ avisar("No he podido leer esa imagen.", true); };
    img.src=lector.result;
  };
  lector.onerror=function(){ avisar("No he podido leer ese archivo.", true); };
  lector.readAsDataURL(archivo);
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
    porMes.push({ym:ym, t:sumaCuentas(diasDe(ym)), cierre:recuentoHasta(ym)});
  }
  var total=sumaCuentas(diasDe(ui.anio));
  var cierreAnio=recuentoHasta(ui.anio);
  var mejorMes=porMes.slice().sort(function(a,b){ return b.t.ventas-a.t.ventas; })[0];

  main.innerHTML=
    cabecera("Año "+ui.anio,
      "Cómo ha ido cada mes y lo que se ha guardado en la amarilla.",
      '<div class="campo"><label class="lbl" for="a_anio">Año</label><select id="a_anio">'+
        anios.map(function(a){ return '<option'+(a===ui.anio?" selected":"")+">"+a+"</option>"; }).join("")+
      '</select></div>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Ventas del año</div><div class="v acento">'+eur(total.ventas)+'</div>'+
        '<div class="n">'+plural(total.dias,"día","días")+'</div></div>'+
      '<div class="cifra"><div class="k">Visa</div><div class="v">'+eur(total.visa)+'</div></div>'+
      '<div class="cifra"><div class="k">Efectivo</div><div class="v">'+eur(total.efectivo)+'</div></div>'+
      '<div class="cifra"><div class="k">Pagos</div><div class="v malo">'+eur(total.gastos)+'</div></div>'+
      '<div class="cifra"><div class="k">C. amarilla</div><div class="v amarilla">'+
        eur(cierreAnio?r2(+cierreAnio.aAmarilla||0):0)+'</div>'+
        '<div class="n">'+(cierreAnio?"recuento del "+esc(dmy(cierreAnio.fecha)):"sin recuentos")+
        '</div></div>'+
      '<div class="cifra"><div class="k">Sobra amarilla</div><div class="v">'+eur(total.sobrante)+'</div></div>'+
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
    '<th class="num">Amarilla al cierre</th><th style="width:130px"></th></tr></thead><tbody>'+
    porMes.map(function(p){
      var vacio=p.t.dias===0;
      return '<tr'+(vacio?' style="opacity:.45"':' style="cursor:pointer"')+' data-mes="'+p.ym+'">'+
        "<td><strong>"+MESES[+p.ym.split("-")[1]-1]+"</strong></td>"+
        '<td class="num">'+(p.t.dias||"—")+"</td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.visa))+"</td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.efectivo))+"</td>"+
        '<td class="num"><strong>'+(vacio?"—":eur(p.t.ventas))+"</strong></td>"+
        '<td class="num">'+(vacio?"—":eur(p.t.gastos))+"</td>"+
        /* Lo que había en la amarilla al acabar el mes, que es un
           recuento. Antes aquí se sumaban los de todos sus días y salía
           una cifra disparatada. */
        '<td class="num" style="color:var(--amarilla)">'+
          ((vacio||!p.cierre)?"—":eur(r2(+p.cierre.aAmarilla||0)))+"</td>"+
        '<td><div style="background:var(--sup2);border-radius:4px;height:7px;overflow:hidden">'+
          '<div style="background:var(--acento);height:100%;width:'+(p.t.ventas/maximo*100).toFixed(1)+'%"></div>'+
        "</div></td></tr>";
    }).join("")+
    '</tbody><tfoot><tr><td>Total</td><td class="num">'+total.dias+'</td>'+
    '<td class="num">'+eur(total.visa)+'</td><td class="num">'+eur(total.efectivo)+'</td>'+
    '<td class="num">'+eur(total.ventas)+'</td><td class="num">'+eur(total.gastos)+'</td>'+
    '<td class="num" style="color:var(--amarilla)">'+
      (cierreAnio?eur(r2(+cierreAnio.aAmarilla||0)):"—")+'</td><td></td></tr></tfoot></table>';

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
  /* Cada cierre es un recuento de lo que había ese día, no una entrada:
     por eso se enseña como nivel y no se suma con los demás. */
  var deCierres=(libro.dias||[])
    .filter(function(d){ return d.aAmarilla!=null && d.aAmarilla!==""; })
    .map(function(d){ return {fecha:d.fecha, tipo:"nivel", origen:"cierre",
                              importe:+d.aAmarilla||0, motivo:"Recuento del día",
                              sobra:sobraAmarilla(d)}; });
  var deFuera=(libro.aportaciones||[]).map(function(a){
    return {id:a.id, fecha:a.fecha, tipo:"entrada", origen:"fuera",
            importe:+a.importe||0, motivo:a.motivo||"Aportación"};
  });
  var salidas=(libro.retiradas||[]).map(function(r){
    return {id:r.id, fecha:r.fecha, tipo:"salida", origen:"salida",
            importe:+r.importe||0, motivo:r.motivo||""};
  });
  var movimientos=deCierres.concat(deFuera).concat(salidas)
    .sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });

  /* Lo que ha sobrado este mes: la suma de lo que entró por encima del
     objetivo, que es lo único de la amarilla que sí se acumula. */
  var sobraMes=r2((libro.dias||[])
    .filter(function(d){ return (d.fecha||"").slice(0,7)===ui.mes; })
    .reduce(function(s,d){ return s+sobraAmarilla(d); },0));
  var cuando=fechaAmarilla();

  main.innerHTML=
    (objetivo<=0
      ? '<div class="aviso-caja">Todavía no le has puesto objetivo. Sin él no se puede saber '+
        'cuánto sobra cada día ni cuánto falta para completarlo. '+
        '<button class="btn sm" id="am_objetivo0" style="margin-left:6px">Ponerlo ahora</button></div>'
      : "")+
    cabecera("Caja amarilla",
      "Lo que hay dentro lo cuentas tú y lo anotas en el cierre de cada día. "+
      "Aquí ves el último recuento y todo lo que ha ido pasando.",
      '<button class="btn" id="am_objetivo">Cambiar objetivo</button>'+
      '<button class="btn malo" id="am_cero">Poner a cero</button>'+
      '<button class="btn" id="am_sacar">Sacar dinero</button>'+
      '<button class="btn fuerte" id="am_meter">Meter dinero</button>')+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cuerpo">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:14px">'+
        '<div><div class="lbl">'+(cuando?"Último recuento · "+esc(dmy(cuando)):"Hay guardado")+'</div>'+
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
      '<div class="cifra"><div class="k">Ha sobrado este mes</div><div class="v amarilla">'+eur(sobraMes)+'</div>'+
        '<div class="n">'+esc(mesLargo(ui.mes))+', por encima de '+eur(objetivo)+'</div></div>'+
      '<div class="cifra"><div class="k">Días con recuento</div><div class="v">'+deCierres.length+'</div>'+
        '<div class="n">anotados en los cierres</div></div>'+
      '<div class="cifra"><div class="k">Metido de fuera</div><div class="v">'+eur(amarillaDeFuera())+'</div>'+
        '<div class="n">'+plural(deFuera.length,"apunte","apuntes")+', sólo como registro</div></div>'+
      '<div class="cifra"><div class="k">Retiradas</div><div class="v malo">'+eur(amarillaSacado())+'</div>'+
        '<div class="n">'+plural(salidas.length,"apunte","apuntes")+', sólo como registro</div></div>'+
    '</div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Movimientos</h2></div>'+
      '<div class="tabla-caja" id="tablaAmarilla"></div></div>';

  document.getElementById("am_objetivo").addEventListener("click", cambiarObjetivo);
  var atajo=document.getElementById("am_objetivo0");
  if(atajo) atajo.addEventListener("click", cambiarObjetivo);
  document.getElementById("am_cero").addEventListener("click", ponerAmarillaACero);
  document.getElementById("am_sacar").addEventListener("click", sacarDeAmarilla);
  document.getElementById("am_meter").addEventListener("click", meterEnAmarilla);

  var caja=document.getElementById("tablaAmarilla");
  caja.innerHTML = !movimientos.length
    ? '<div class="vacio"><strong>Todavía no hay movimientos</strong>'+
      'Cada día que guardes algo en el cierre, aparecerá aquí.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Qué es</th><th class="num">Hay dentro</th>'+
      '<th class="num">Sobra</th><th></th></tr></thead><tbody>'+
      movimientos.slice(0,60).map(function(m){
        var quees = m.origen==="cierre" ? '<span class="chapa amarilla">Recuento</span>'
                  : m.origen==="fuera"  ? '<span class="chapa neutra">Metido de fuera</span>'
                  :                       '<span class="chapa malo">Sacado</span>';
        return "<tr><td>"+esc(dmy(m.fecha))+"</td><td>"+esc(m.motivo)+"</td><td>"+quees+"</td>"+
          '<td class="num"'+(m.tipo==="nivel"?' style="color:var(--amarilla)"':' style="color:var(--muted)"')+
            ">"+(m.tipo==="nivel"?"<strong>"+eur(m.importe)+"</strong>":eur(m.importe))+"</td>"+
          '<td class="num">'+(m.tipo==="nivel" && m.sobra>0 ? eur(m.sobra) : "—")+"</td>"+
          "<td>"+(m.origen==="cierre"
            ? '<span style="color:var(--muted);font-size:12px">en el cierre</span>'
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
    '<p class="nota">Cuánto tiene que haber guardado en la amarilla. '+
    'De ahí sale lo que sobra cada día: lo que entra cuando ya está completa.</p>'+
    '<div class="campo" style="max-width:200px"><label class="lbl" for="ob_val">Objetivo (€)</label>'+
    '<input type="number" id="ob_val" class="grande" min="0" step="10" value="'+
    esc(objetivoAmarilla()||"")+'" placeholder="1500"></div>'+
    (objetivoAmarilla()<=0
      ? '<p class="nota" style="margin:10px 0 0">Lo habitual aquí son <strong>1.500 €</strong>. '+
        '<button type="button" class="btn sm" id="ob_1500" style="margin-left:4px">Poner 1.500</button></p>'
      : ""),
    function(){
      libro.ajustes.objetivoAmarilla=numero("ob_val");
      guardar(); pintar(); avisar("Objetivo: "+eur(objetivoAmarilla()));
    });

  var rapido=document.getElementById("ob_1500");
  if(rapido) rapido.addEventListener("click", function(){
    document.getElementById("ob_val").value=1500;
  });
}

/* Reponer la amarilla con dinero que no sale de la caja del día:
   del banco, del bolsillo, de donde sea. No toca el cierre diario. */
function meterEnAmarilla(){
  var guardado=amarillaGuardado(), falta=faltaAmarilla();
  abrirVentana("Meter dinero en la caja amarilla",
    '<p class="nota">Para dejar constancia de una reposición con dinero que '+
    '<strong>no sale de la caja del día</strong>. Queda apuntada aquí, pero el saldo de la '+
    'amarilla sale del recuento que anotes en el cierre: acuérdate de subirlo allí.</p>'+
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

/* Poner la amarilla a cero es, sencillamente, anotar un recuento de 0 €
   hoy: como la caja amarilla es lo que se cuenta cada día, dejarla vacía
   es un recuento más. La retirada queda apuntada al lado como registro
   de adónde fue el dinero. */
function ponerAmarillaACero(){
  var guardado=amarillaGuardado();
  if(guardado<=0){ avisar("El último recuento ya es de 0 €.", true); return; }

  abrirVentana("Poner la caja amarilla a cero",
    '<p style="margin:0 0 12px">El último recuento, del '+esc(dmy(fechaAmarilla()))+
    ', es de <strong>'+eur(guardado)+'</strong>. Se anota un recuento de '+
    '<strong>0 €</strong> con fecha de hoy y la amarilla queda vacía.</p>'+
    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="c_motivo">Adónde ha ido el dinero</label>'+
      '<input id="c_motivo" value="Vaciado de la caja amarilla" '+
      'placeholder="Ingreso en el banco, se lo lleva Juan…"></div>'+
    '<label style="display:flex;gap:8px;align-items:center;cursor:pointer">'+
      '<input type="checkbox" id="c_apunte" style="width:auto" checked>'+
      '<span>Dejarlo apuntado como retirada de '+eur(guardado)+'</span></label>'+
    '<p class="nota" style="margin:12px 0 0">Los cierres de los días anteriores no se tocan: '+
    'cada uno guarda el recuento que tenía.</p>',
    function(){
      var hoy=hoyISO();
      var d=diaDe(hoy);
      if(d){ d.aAmarilla=0; }
      else { libro.dias.push({id:uid(), fecha:hoy, visa:0, efectivo:0, gastos:0,
                              detalle:[], aAmarilla:0, fondoCaja:0, nota:""}); }
      if(marcado("c_apunte")){
        libro.retiradas=libro.retiradas||[];
        libro.retiradas.push({id:uid(), fecha:hoy, importe:guardado,
                              motivo:valor("c_motivo")||"Vaciado de la caja amarilla"});
      }
      guardar(); pintar();
      avisar("Amarilla a cero. Anotado el recuento de hoy.");
    }, {aceptar:"Poner a cero", malo:true});
}

function sacarDeAmarilla(){
  var guardado=amarillaGuardado();
  abrirVentana("Sacar de la caja amarilla",
    '<p class="nota">En el último recuento había <strong>'+eur(guardado)+'</strong>. '+
    'Esto queda apuntado como registro de adónde va el dinero; el saldo sale del '+
    'recuento que anotes en el cierre del día.</p>'+
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
      avisar("Anotada la salida de "+eur(imp)+". Ajusta el recuento en el cierre del día.");
    }, {aceptar:"Sacar"});
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
/* ═════════════════════════════════════════════════════════════
   SIN RETIRAR
   ═════════════════════════════════════════════════════════════ */
function verTramos(main){
  var lista=tramosOrdenados(), abierto=tramoAbierto(), objetivo=objetivoAmarilla();
  var cAbierto=abierto?cuentasTramo(abierto):null;
  /* Aquí es donde el % deja de ser una suposición: en estos días el
     efectivo sale de dinero contado, no de una regla de tres. */
  var medido=medidoEnTramos();
  var puesto=pctVisa();

  main.innerHTML=
    (objetivo<=0
      ? '<div class="aviso-caja">La amarilla no tiene objetivo, y sin él no se sabe qué parte es '+
        'fondo y qué parte sobra. Pónselo en la pestaña de la caja amarilla.</div>'
      : "")+
    cabecera("Sin retirar",
      "Los días que el dinero se queda dentro porque no hay quien lo saque. Cada tramo va "+
      "aparte, con su fondo y con todo lo que se ha ido quedando encima.",
      (abierto
        ? '<button class="btn" id="tr_editar">Cambiar fechas</button>'+
          '<button class="btn fuerte" id="tr_cerrar">Cerrarlo y entregar</button>'
        : '<button class="btn fuerte" id="tr_nuevo">Empezar un tramo</button>'))+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Esperando entrega</div>'+
        '<div class="v amarilla">'+(cAbierto&&cAbierto.encima!=null?eur(cAbierto.encima):"—")+'</div>'+
        '<div class="n">'+(abierto
          ? (cAbierto.encima!=null
              ? "por encima del fondo de "+eur(cAbierto.fondo)
              : "aún no has anotado ningún recuento")
          : "ahora mismo no hay ningún tramo abierto")+'</div></div>'+
      '<div class="cifra"><div class="k">Días sin retirar</div>'+
        '<div class="v">'+(abierto?cAbierto.nDias:0)+'</div>'+
        '<div class="n">'+(abierto
          ? "desde el "+esc(dmy(abierto.desde))
          : "—")+'</div></div>'+
      '<div class="cifra"><div class="k">Tramos guardados</div><div class="v">'+lista.length+'</div>'+
        '<div class="n">'+plural(lista.filter(function(t){return !!t.hasta;}).length,"cerrado","cerrados")+'</div></div>'+
      '<div class="cifra"><div class="k">Ya entregado</div><div class="v">'+eur(entregadoEnTramos())+'</div>'+
        '<div class="n">de los tramos cerrados</div></div>'+
      '<div class="cifra"><div class="k">Metálico por 100 € de visa</div>'+
        '<div class="v"'+(medido?' style="color:var(--acento)"':"")+'>'+
        (medido?num(medido.porVisa,1)+" €":"—")+'</div>'+
        '<div class="n">'+(medido
          ? "medido en "+plural(medido.nDias,"día","días")+" · tienes puesto "+
            num(100-puesto,0)+" €"
          : "hace falta un tramo con recuentos a los dos lados")+'</div></div>'+
    '</div>'+

    (medido && medido.ajuste>0 && medido.ajuste<100 && Math.abs(medido.ajuste-puesto)>=0.5
      ? '<div class="aviso-caja">En estos días no salió un euro de la caja, así que el efectivo '+
        'no hay que suponerlo: sale de lo que subieron las dos cajas más lo pagado. '+
        '<strong>'+eur(medido.efectivo)+'</strong> de metálico contra <strong>'+
        eur(medido.visas)+'</strong> de visas, en '+plural(medido.nDias,"día","días")+'. '+
        'O sea que por cada 100 € de visa entran '+num(medido.porVisa,1)+' € en metálico, '+
        'y tú tienes puesto '+num(100-puesto,0)+'. En la casilla de Ajustes eso es un <strong>'+
        num(medido.ajuste,0)+' %</strong>. '+
        '<button class="btn sm" id="tr_usarPct" style="margin-left:4px">Usar el '+
        num(medido.ajuste,0)+' %</button>'+
        '<div style="margin-top:6px;font-size:12px">De la venta entera, en visa va el '+
        num(medido.enVisa,0)+' %.</div></div>'
      : "")+

    '<div id="listaTramos"></div>';

  var bPct=document.getElementById("tr_usarPct");
  if(bPct) bPct.addEventListener("click", function(){
    var nuevo=Math.round(medido.ajuste);
    if(!(nuevo>0 && nuevo<100)){ avisar("Esa cifra no vale para la casilla del %.", true); return; }
    libro.ajustes.pctVisa=nuevo; guardar(); pintar();
    avisar("Guardado: el efectivo saldrá del "+num(100-nuevo,0)+"% de las visas");
  });

  var bNuevo=document.getElementById("tr_nuevo");
  if(bNuevo) bNuevo.addEventListener("click", empezarTramo);
  var bCerrar=document.getElementById("tr_cerrar");
  if(bCerrar) bCerrar.addEventListener("click", function(){ cerrarTramo(abierto); });
  var bEditar=document.getElementById("tr_editar");
  if(bEditar) bEditar.addEventListener("click", function(){ editarTramo(abierto); });

  var caja=document.getElementById("listaTramos");
  caja.innerHTML = !lista.length
    ? '<div class="tarjeta"><div class="vacio"><strong>Todavía no hay ningún tramo</strong>'+
      'Cuando el dinero se vaya a quedar dentro unos días, empieza uno y esos días quedan '+
      'apartados aquí con su cuenta.</div></div>'
    : lista.map(tarjetaTramo).join("");

  /* Pinchar una fila lleva al cierre de ese día, como en el mes. */
  caja.querySelectorAll("tr[data-dia]").forEach(function(tr){
    tr.style.cursor="pointer";
    tr.addEventListener("click", function(){
      ui.dia=tr.getAttribute("data-dia"); ui.vista="dia"; pintar();
    });
  });
  caja.querySelectorAll("[data-tr]").forEach(function(b){
    b.addEventListener("click", function(){
      var partes=b.getAttribute("data-tr").split("|");
      var t=(libro.tramos||[]).filter(function(x){ return x.id===partes[1]; })[0];
      if(!t) return;
      if(partes[0]==="cerrar") cerrarTramo(t);
      else if(partes[0]==="editar") editarTramo(t);
      else if(partes[0]==="reabrir") reabrirTramo(t);
      else borrarTramo(t);
    });
  });
}

function tarjetaTramo(t){
  var c=cuentasTramo(t);
  var m=medidoTramo(t);
  var abierto=!t.hasta;
  var titulo=dmy(t.desde)+(t.hasta ? " – "+dmy(t.hasta) : " – sigue abierto");

  /* La tabla enseña el nivel de cada noche y lo que ha subido respecto a
     la anterior. No hay ninguna suma de recuentos: sumarlos daría una
     cifra que no existe. */
  var anterior=c.partida;
  var filas=c.dias.map(function(d){
    var cd=cuentasDia(d);
    var hay=(d.aAmarilla!=null && d.aAmarilla!=="") ? r2(+d.aAmarilla||0) : null;
    var sube=(hay!=null && anterior!=null) ? r2(hay-anterior) : null;
    if(hay!=null) anterior=hay;
    return '<tr data-dia="'+esc(d.fecha)+'"><td>'+esc(dmy(d.fecha))+'</td>'+
      '<td class="num">'+eur(cd.ventas)+'</td>'+
      '<td class="num"'+(hay!=null?' style="color:var(--amarilla)"':'')+'>'+
        (hay!=null?"<strong>"+eur(hay)+"</strong>":"—")+'</td>'+
      '<td class="num">'+(sube==null?"—":(sube>0?"+":"")+eur(sube))+'</td>'+
      '<td>'+esc(d.nota||"")+'</td></tr>';
  }).join("");

  return '<div class="tarjeta" style="margin-bottom:16px">'+
    '<div class="tarjeta-cab">'+
      '<h2>'+esc(titulo)+'</h2>'+
      '<div class="pista">'+(t.motivo?esc(t.motivo)+" · ":"")+
        plural(c.nDias,"día anotado","días anotados")+
        (abierto?' <span class="chapa amarilla">Abierto</span>'
                :' <span class="chapa ok">Cerrado</span>')+'</div>'+
    '</div>'+
    '<div class="tarjeta-cuerpo">'+
      '<div class="cifras" style="margin:0 0 14px">'+
        '<div class="cifra"><div class="k">Fondo</div><div class="v">'+eur(c.fondo)+'</div>'+
          '<div class="n">esto no se toca</div></div>'+
        '<div class="cifra"><div class="k">Hay dentro</div>'+
          '<div class="v amarilla">'+(c.dentro!=null?eur(c.dentro):"—")+'</div>'+
          '<div class="n">'+(c.fecha?"recuento del "+esc(dmy(c.fecha)):"sin recuento anotado")+'</div></div>'+
        '<div class="cifra"><div class="k">'+(t.hasta&&t.entregado?"Se entregó":"Por encima del fondo")+'</div>'+
          '<div class="v">'+(t.hasta&&t.entregado!=null&&t.entregado!==""
              ? eur(+t.entregado||0)
              : (c.encima!=null?eur(c.encima):"—"))+'</div>'+
          '<div class="n">'+(t.hasta&&t.fechaEntrega
              ? "el "+esc(dmy(t.fechaEntrega))
              : "es lo que hay que entregar")+'</div></div>'+
        '<div class="cifra"><div class="k">Ha subido</div>'+
          '<div class="v">'+(c.subido!=null?(c.subido>0?"+":"")+eur(c.subido):"—")+'</div>'+
          '<div class="n">'+(c.partida!=null
              ? "empezó con "+eur(c.partida)
              : "no hay recuento de antes")+'</div></div>'+
      '</div>'+
      '<p class="nota" style="margin:0 0 12px">Ventas del tramo: <strong>'+eur(c.ventas)+'</strong>. '+
      'Lo de la amarilla es el recuento de cada noche, así que no se suma: la cifra buena es la '+
      'última, y lo que hay que entregar es lo que pasa del fondo.</p>'+
      /* Y aquí el efectivo sin suponer nada. Las ventas de ahí arriba
         llevan el metálico calculado con el %; éste sale del dinero. */
      (m && m.vale
        ? '<p class="nota" style="margin:0 0 12px">Y como aquí no salió un euro de la caja, el '+
          'efectivo de estos días sale contado, no del %: <strong>'+eur(m.efectivo)+'</strong> '+
          'de metálico contra <strong>'+eur(m.visas)+'</strong> de visas, o sea <strong>'+
          num(m.porVisa,1)+' € de metálico por cada 100 € de visa</strong>. Con el % que tienes '+
          'puesto serían '+num(100-pctVisa(),0)+' €.</p>'
        : '<p class="nota" style="margin:0 0 12px">Para sacar el efectivo contado de este tramo '+
          'hacen falta recuentos de la amarilla a los dos lados: el de la noche de antes de '+
          'empezar y el de la última noche.</p>')+
      '<div class="tabla-caja">'+
        (filas
          ? '<table><thead><tr><th>Fecha</th><th class="num">Ventas</th>'+
            '<th class="num">Hay dentro</th><th class="num">Sube</th><th>Nota</th></tr></thead>'+
            '<tbody>'+filas+'</tbody></table>'
          : '<div class="vacio"><strong>Ningún día anotado en estas fechas</strong>'+
            'En cuanto guardes un cierre dentro del tramo, sale aquí.</div>')+
      '</div>'+
      '<div class="acciones-fila" style="margin-top:14px">'+
        '<button class="btn suave sm" data-tr="editar|'+esc(t.id)+'">Cambiar fechas</button>'+
        (abierto
          ? '<button class="btn sm fuerte" data-tr="cerrar|'+esc(t.id)+'">Cerrarlo y entregar</button>'
          : '<button class="btn suave sm" data-tr="reabrir|'+esc(t.id)+'">Reabrir</button>')+
        '<button class="btn suave sm malo" data-tr="borrar|'+esc(t.id)+'">Borrar</button>'+
      '</div>'+
    '</div></div>';
}

function empezarTramo(){
  var yaHay=tramoAbierto();
  if(yaHay){
    avisar("Ya hay un tramo abierto desde el "+dmy(yaHay.desde)+". Ciérralo primero.", true);
    return;
  }
  abrirVentana("Empezar un tramo sin retirar",
    '<p class="nota">Desde este día el dinero se queda dentro de la amarilla. Los cierres se '+
    'anotan igual que siempre; aquí solo quedan apartados para saber cuánto hay que entregar '+
    'cuando se pueda sacar.</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="tr_desde">Desde</label>'+
        '<input type="date" id="tr_desde" value="'+esc(hoyISO())+'"></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="tr_motivo">Por qué</label>'+
        '<input id="tr_motivo" placeholder="El jefe fuera, sin órdenes de sacar…"></div>'+
    '</div>',
    function(){
      var desde=valor("tr_desde");
      if(!desde){ avisar("Pon el día en que empieza.", true); return true; }
      libro.tramos=libro.tramos||[];
      libro.tramos.push({id:uid(), desde:desde, hasta:"", motivo:valor("tr_motivo"),
                         entregado:null, fechaEntrega:null});
      guardar(); pintar();
      avisar("Tramo empezado el "+dmy(desde));
    }, {aceptar:"Empezar"});
}

function editarTramo(t){
  if(!t) return;
  abrirVentana("Cambiar las fechas del tramo",
    '<p class="nota">Los días del tramo son los cierres que caen entre las dos fechas. '+
    'Déjalo sin fecha de fin si todavía sigue.</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="te_desde">Desde</label>'+
        '<input type="date" id="te_desde" value="'+esc(t.desde||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="te_hasta">Hasta</label>'+
        '<input type="date" id="te_hasta" value="'+esc(t.hasta||"")+'"></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="te_motivo">Por qué</label>'+
        '<input id="te_motivo" value="'+esc(t.motivo||"")+'"></div>'+
    '</div>',
    function(){
      var desde=valor("te_desde"), hasta=valor("te_hasta");
      if(!desde){ avisar("Pon el día en que empieza.", true); return true; }
      if(hasta && hasta<desde){ avisar("La fecha de fin es anterior a la de inicio.", true); return true; }
      t.desde=desde; t.hasta=hasta; t.motivo=valor("te_motivo");
      guardar(); pintar(); avisar("Tramo cambiado");
    });
}

function cerrarTramo(t){
  if(!t) return;
  var c=cuentasTramo(t);
  var sugerido=(c.encima!=null?c.encima:0);
  abrirVentana("Cerrar el tramo y entregar",
    '<p class="nota">'+
      (c.dentro!=null
        ? 'En el último recuento del tramo, el del '+esc(dmy(c.fecha))+', había <strong>'+
          eur(c.dentro)+'</strong>. Quitando el fondo de '+eur(c.fondo)+', por encima quedan '+
          '<strong>'+eur(sugerido)+'</strong>.'
        : 'En este tramo no hay ningún recuento anotado, así que la cifra la pones tú.')+
    '</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="tc_hasta">Último día</label>'+
        '<input type="date" id="tc_hasta" value="'+esc(hoyISO())+'"></div>'+
      '<div class="campo"><label class="lbl" for="tc_imp">Se entrega (€)</label>'+
        '<input type="number" id="tc_imp" min="0" step="0.01" value="'+esc(sugerido||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:10px 0 0">Queda apuntado también como salida de la amarilla, '+
    'para que el historial cuadre. Acuérdate de anotar en el cierre de ese día el recuento '+
    'que quede dentro después de sacarlo.</p>',
    function(){
      var hasta=valor("tc_hasta")||hoyISO();
      if(hasta<(t.desde||"")){ avisar("Ese día es anterior al principio del tramo.", true); return true; }
      var imp=numero("tc_imp");
      t.hasta=hasta; t.entregado=imp; t.fechaEntrega=hasta;
      if(imp>0){
        libro.retiradas=libro.retiradas||[];
        libro.retiradas.push({id:uid(), fecha:hasta, importe:imp,
                              motivo:"Entregado al cerrar el tramo"+(t.motivo?" · "+t.motivo:"")});
      }
      guardar(); pintar();
      avisar(imp>0 ? "Tramo cerrado y anotada la entrega de "+eur(imp)
                   : "Tramo cerrado, sin entrega anotada");
    }, {aceptar:"Cerrar"});
}

function reabrirTramo(t){
  if(!t) return;
  if(tramoAbierto()){ avisar("Ya hay otro tramo abierto. Ciérralo primero.", true); return; }
  confirmar("Reabrir el tramo",
    '<p class="nota">Vuelve a quedar sin fecha de fin y el dinero sigue contando como no '+
    'retirado. La salida que se apuntó en la amarilla no se borra: si no la quieres, '+
    'quítala desde la caja amarilla.</p>',
    function(){
      t.hasta=""; t.entregado=null; t.fechaEntrega=null;
      guardar(); pintar(); avisar("Tramo reabierto");
    }, {aceptar:"Reabrir"});
}

function borrarTramo(t){
  if(!t) return;
  confirmar("Borrar el tramo",
    '<p class="nota">Se borra solo la agrupación: los cierres de esos días y lo que hay en '+
    'la amarilla se quedan como están.</p>',
    function(){
      libro.tramos=(libro.tramos||[]).filter(function(x){ return x.id!==t.id; });
      guardar(); pintar(); avisar("Tramo borrado");
    }, {aceptar:"Borrar", malo:true});
}

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
        '<div class="campo"><label class="lbl" for="aj_visa">Ventas que se pagan con visa (%)</label>'+
          '<input type="number" id="aj_visa" min="0" max="99" step="1" '+
          'value="'+esc(libro.ajustes.pctVisa!=null?libro.ajustes.pctVisa:80)+'" placeholder="80"></div>'+
      '</div>'+
      '<p class="nota" style="margin:12px 0 0">El fondo habitual es el cambio que sueles dejar en la caja. '+
      'Viene puesto en cada día nuevo y lo cambias si un día dejas otra cantidad.</p>'+
      '<p class="nota" style="margin:8px 0 0">Con el <strong>% de visa</strong> la app rellena sola la '+
      'casilla del <strong style="color:var(--tinta)">efectivo</strong>: el '+
      num(100-(pctVisa()||80),0)+'% de lo cobrado con tarjeta. Las visas no se tocan; el metálico es '+
      'ese porcentaje de ellas. Es una referencia de la media, no una cuenta exacta: hay días que se '+
      'salen, y por eso esa cifra sale siempre apagada y nunca en el parte de la noche. La buena es '+
      'la del recuento del cajón.</p>'+
      /* El número medido, para que el de la casilla deje de ser un
         supuesto heredado. La cuenta entera está en «Sin retirar». */
      (function(){
        var m=medidoEnTramos();
        if(!m || !(m.ajuste>0 && m.ajuste<100)) return "";
        return '<p class="nota" style="margin:8px 0 0">Medido en los días sin retirar ('+
          plural(m.nDias,"día","días")+'): por cada 100 € de visa entran <strong>'+
          num(m.porVisa,1)+' €</strong> en metálico, que en esta casilla es un <strong>'+
          num(m.ajuste,0)+' %</strong>. Ahora tienes '+num(pctVisa(),0)+'. '+
          'La cuenta, en <strong style="color:var(--tinta)">Sin retirar</strong>.</p>';
      })()+

      '<p class="nota" style="margin:18px 0 8px"><strong style="color:var(--tinta)">A quién se manda el parte</strong> '+
      '— pon a toda la gente que quieras; al enviar eliges a cuál de ellos.</p>'+
      '<div id="aj_gente"></div>'+
      '<button class="btn suave" id="aj_mas" style="margin-top:8px">+ Añadir a alguien</button>'+
      '<p class="nota" style="margin:14px 0 0">Escribe el teléfono entero, empezando por el país: '+
      '<span class="mono">+376</span> Andorra, <span class="mono">+34</span> España. '+
      'Es el mismo número que ves en la ficha del contacto en WhatsApp. '+
      'El primero de la lista es el que sale marcado al abrir el parte. '+
      'Si no pones a nadie, tendrás que elegir el chat a mano cada vez.</p>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'+
        '<button class="btn fuerte" id="aj_guardar">Guardar</button>'+
      '</div>'+
    '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;margin-top:16px">'+
      '<div class="tarjeta-cab"><h2>Cómo se calcula</h2></div>'+
      '<div class="tarjeta-cuerpo" style="font-size:13px;color:var(--muted);line-height:1.7">'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Sobra c. amarilla</strong> es '+
        'el dinero que entra en la amarilla cuando ya están los '+eur(objetivoAmarilla())+'. '+
        'La app te lo sugiere —lo que pase del objetivo— pero lo pones tú.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Fondo de caja</strong> es el dinero que '+
        'no se retira, y está en dos sitios: la <strong style="color:var(--tinta)">caja amarilla</strong>, '+
        'que se va guardando hasta el objetivo, y la '+
        '<strong style="color:var(--tinta)">caja registradora</strong>, el cambio para el día siguiente. '+
        'Los dos los pones tú; no son un resultado.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Ventas</strong> = visas + efectivo, '+
        'y ese efectivo es el que pone la app, así que las ventas llevan dentro esa suposición.</p>'+
        '<p style="margin:0 0 8px"><strong style="color:var(--tinta)">Efectivo</strong> = el '+
        num(100-(pctVisa()||80),0)+'% de las visas del día. No es dinero contado: es lo que saldría si '+
        'ese día se cumpliera la media. <strong style="color:var(--tinta)">Efec. real</strong> es el '+
        'recuento del cajón, y ése sí es dinero.</p>'+
        '<p style="margin:0"><strong style="color:var(--tinta)">Caja amarilla</strong> = el recuento de '+
        'la última noche que la contaste. No se van sumando los días: se anota lo que hay dentro y '+
        'eso es el saldo. En el mes y en el año se enseña el recuento con el que se cerró.</p>'+
      '</div></div>'+

    /* Zona de borrado. Va la ultima y aparte, para no tropezarse con
       ella, y cada boton dice antes cuanto se lleva por delante. */
    '<div class="tarjeta" style="max-width:560px;margin-top:16px;border-color:var(--malo)">'+
      '<div class="tarjeta-cab"><h2 style="color:var(--malo)">Borrar</h2>'+
        '<span class="pista">No tiene vuelta atrás</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota" style="margin:0 0 14px">Lo borrado se va también de GitHub, '+
        'y no hay forma de recuperarlo desde aquí.</p>'+
        '<div style="display:flex;flex-direction:column;gap:10px">'+
          '<div><button class="btn malo" id="b_hojas">Quitar las fotos de las hojas</button>'+
            '<div class="nota" style="margin-top:4px">'+
            (contarHojas()
              ? plural(contarHojas(),"hoja guardada","hojas guardadas")+', '+pesoHojas()+
                '. Los días anotados se quedan.'
              : "no hay ninguna foto guardada")+'</div></div>'+
          '<div><button class="btn malo" id="b_dias">Borrar los días</button>'+
            '<div class="nota" style="margin-top:4px">'+
            (contarDias()? plural(contarDias(),"cierre anotado","cierres anotados")
                          : "no hay ningún día")+'</div></div>'+
          '<div><button class="btn malo" id="b_amar">Borrar los movimientos de la amarilla</button>'+
            '<div class="nota" style="margin-top:4px">'+
            (contarMovimientos()? plural(contarMovimientos(),"entrada o salida","entradas y salidas")
                                : "no hay movimientos")+
            '. Lo que se apartó cada día va con los cierres.</div></div>'+
          '<div style="border-top:1px solid var(--linea);padding-top:12px">'+
            '<button class="btn malo fuerte" id="b_todo">Poner todo a cero</button>'+
            '<div class="nota" style="margin-top:4px">Días y movimientos. '+
            'Los ajustes —objetivo, teléfono, fondo habitual— se quedan.</div></div>'+
        '</div>'+
      '</div></div>';

  /* La lista se edita sobre un borrador: así añadir o quitar a alguien
     no se lleva por delante lo que haya escrito sin guardar. */
  var borrador=(libro.ajustes.gente||[]).map(function(g){
    return {id:g.id||uid(), nombre:g.nombre||"", telefono:g.telefono||""};
  });
  if(!borrador.length) borrador.push({id:uid(), nombre:"", telefono:""});

  function leerBorrador(){
    borrador.forEach(function(g){
      var n=document.getElementById("g_nom_"+g.id), t=document.getElementById("g_tel_"+g.id);
      if(n) g.nombre=n.value;
      if(t) g.telefono=t.value;
    });
  }

  /* Mientras escribe, le enseñamos el número tal cual lo verá WhatsApp,
     y el botón de probar abre ese chat sin mandar nada: así se sabe si
     el problema es el número o el parte. */
  function avisoNumero(escrito){
    /* Si el movil ha colado un correo o un nombre, decirlo claro: al
       quitarle las letras quedaria un numero inventado. */
    if(/[a-zA-Z@]/.test(escrito))
      return '<strong style="color:var(--malo)">Eso no es un teléfono.</strong> '+
             'Parece que el móvil ha rellenado el campo por su cuenta. Borra lo que hay '+
             'y escribe sólo el número, empezando por el país.';
    var tel=soloNumero(escrito);
    if(!tel) return "Sin número no se le puede mandar el parte: tendrías que elegir el chat a mano.";
    var crudo=String(escrito).replace(/\D/g,"");
    return 'Se abrirá <strong>wa.me/'+esc(tel)+'</strong>. Pulsa <strong>Probar el número</strong>: '+
      'si abre el chat correcto, ya está.'+
      (crudo!==tel ? ' <strong>Le he quitado el 00 del principio</strong>, que es lo mismo '+
                     'que el + y WhatsApp no lo admite.' : "")+
      (tel.length<8 ? ' <strong>Parece corto: ¿le falta el país?</strong>' : "");
  }
  function refrescarFila(g){
    var t=document.getElementById("g_tel_"+g.id);
    var pie=document.getElementById("g_pie_"+g.id);
    var probar=document.getElementById("g_probar_"+g.id);
    if(!t || !pie) return;
    var limpio=/[a-zA-Z@]/.test(t.value) ? "" : soloNumero(t.value);
    pie.innerHTML=avisoNumero(t.value);
    if(probar){
      probar.setAttribute("href", limpio ? "https://wa.me/"+limpio : "#");
      probar.style.opacity = limpio ? "" : ".4";
      probar.style.pointerEvents = limpio ? "" : "none";
    }
  }
  function pintarGente(){
    var caja=document.getElementById("aj_gente"); if(!caja) return;
    caja.innerHTML=borrador.map(function(g,i){
      return '<div style="border:1px solid var(--linea);border-radius:10px;padding:12px;margin-bottom:8px">'+
        '<div class="rejilla">'+
          '<div class="campo"><label class="lbl" for="g_nom_'+g.id+'">Nombre</label>'+
            '<input id="g_nom_'+g.id+'" value="'+esc(g.nombre)+'" placeholder="Valeriano"></div>'+
          '<div class="campo" style="grid-column:span 2">'+
            '<label class="lbl" for="g_tel_'+g.id+'">Teléfono con el código del país</label>'+
            /* type=tel e inputmode: en el movil sale el teclado de numeros y
               el autorrelleno ofrece telefonos. Sin esto ofrecia el correo, y
               si lo aceptas te queda una arroba donde va el numero. */
            '<input id="g_tel_'+g.id+'" class="mono" type="tel" inputmode="tel" autocomplete="tel" '+
            'value="'+esc(g.telefono)+'" placeholder="+376 800100"></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">'+
          '<a class="btn suave sm" id="g_probar_'+g.id+'" href="#" target="_blank" rel="noopener" '+
          'style="text-decoration:none">Probar el número</a>'+
          '<button class="btn suave sm malo" data-quitar="'+g.id+'">Quitar</button>'+
          (i===0 ? '<span class="chapa neutra">Sale marcado al enviar</span>' : "")+
        '</div>'+
        '<p class="nota" style="margin:8px 0 0" id="g_pie_'+g.id+'"></p>'+
      '</div>';
    }).join("");
    borrador.forEach(function(g){
      ["g_nom_","g_tel_"].forEach(function(pre){
        var e=document.getElementById(pre+g.id);
        if(e) e.addEventListener("input", function(){ refrescarFila(g); });
      });
      refrescarFila(g);
    });
    caja.querySelectorAll("[data-quitar]").forEach(function(b){
      b.addEventListener("click", function(){
        leerBorrador();
        var fuera=b.getAttribute("data-quitar");
        borrador=borrador.filter(function(x){ return x.id!==fuera; });
        /* Nunca se queda sin ninguna fila: si no, no habria donde escribir. */
        if(!borrador.length) borrador.push({id:uid(), nombre:"", telefono:""});
        pintarGente();
      });
    });
  }
  pintarGente();
  document.getElementById("aj_mas").addEventListener("click", function(){
    leerBorrador();
    borrador.push({id:uid(), nombre:"", telefono:""});
    pintarGente();
    var ultimo=document.getElementById("g_nom_"+borrador[borrador.length-1].id);
    if(ultimo) ultimo.focus();
  });

  document.getElementById("b_hojas").addEventListener("click", function(){
    if(!contarHojas()){ avisar("No hay ninguna foto guardada.", true); return; }
    confirmar("Quitar las fotos de las hojas",
      '<p style="margin:0 0 10px">'+segunCuantos(contarHojas(),
        "Se va <strong>la única foto</strong>",
        "Se van <strong>las "+contarHojas()+" fotos</strong>")+
      ' de las hojas de papel ('+pesoHojas()+').</p>'+
      '<p class="nota" style="margin:0">Los días anotados no se tocan.</p>',
      function(){
        libro.hojas={}; guardar(); pintar(); avisar("Fotos quitadas");
      }, {aceptar:"Quitar", malo:true});
  });

  document.getElementById("b_dias").addEventListener("click", function(){
    if(!contarDias()){ avisar("No hay ningún día que borrar.", true); return; }
    confirmar("Borrar los días",
      '<p style="margin:0 0 10px">'+
      conArticulo(contarDias(),"Se borra <strong>el cierre del día</strong>",
                  "Se borran <strong>los "+contarDias()+" cierres</strong>")+
      ', con sus visas, su efectivo y sus pagos.</p>'+
      '<p class="nota" style="margin:0">Las entradas y salidas de la amarilla se quedan.</p>',
      function(){
        libro.dias=[]; guardar(); pintar(); avisar("Días borrados");
      }, {aceptar:"Borrar los días", malo:true});
  });

  document.getElementById("b_amar").addEventListener("click", function(){
    if(!contarMovimientos()){ avisar("No hay movimientos que borrar.", true); return; }
    confirmar("Borrar los movimientos de la amarilla",
      '<p style="margin:0 0 10px">'+
      conArticulo(contarMovimientos(),"Se borra <strong>el único movimiento</strong>",
                  "Se borran <strong>las "+contarMovimientos()+" entradas y salidas</strong>")+
      ' que anotaste a mano.</p>'+
      '<p class="nota" style="margin:0">Lo que se apartó cada día no está aquí: '+
      'eso va con los cierres.</p>',
      function(){
        libro.aportaciones=[]; libro.retiradas=[];
        guardar(); pintar(); avisar("Movimientos borrados");
      }, {aceptar:"Borrar", malo:true});
  });

  /* Para el borrado entero pedimos que lo escriba: un clic de mas no
     puede llevarse el año entero. */
  document.getElementById("b_todo").addEventListener("click", function(){
    abrirVentana("Poner todo a cero",
      '<p style="margin:0 0 10px">Se van <strong>'+plural(contarDias(),"cierre","cierres")+'</strong> y '+
      '<strong>'+plural(contarMovimientos(),"movimiento","movimientos")+'</strong> de la amarilla. '+
      'La caja se queda como el primer día.</p>'+
      '<p class="nota" style="margin:0 0 12px">Los ajustes se quedan como están.</p>'+
      '<div class="campo"><label class="lbl" for="b_palabra">Escribe BORRAR para confirmarlo</label>'+
        '<input id="b_palabra" class="mono" placeholder="BORRAR" autocomplete="off"></div>',
      function(){
        if(valor("b_palabra").toUpperCase()!=="BORRAR"){
          avisar("Escribe BORRAR para confirmarlo.", true);
          return true;   /* deja la ventana abierta */
        }
        libro.dias=[]; libro.aportaciones=[]; libro.retiradas=[];
        guardar(); pintar(); avisar("Caja a cero");
      }, {aceptar:"Poner todo a cero", malo:true});
  });

  document.getElementById("aj_guardar").addEventListener("click", function(){
    libro.ajustes.nombre=valor("aj_nom");
    libro.ajustes.objetivoAmarilla=numero("aj_obj");
    leerBorrador();
    var conLetras=borrador.filter(function(g){ return /[a-zA-Z@]/.test(g.telefono||""); })[0];
    if(conLetras){
      avisar("El teléfono de "+nombreDe(conLetras)+" lleva letras o una arroba. "+
             "Déjalo sólo en números.", true);
      return;
    }
    /* Las filas vacias no se guardan, y el numero queda ya escrito como
       lo quiere WhatsApp: con el + y sin espacios. */
    libro.ajustes.gente=borrador.filter(function(g){
      return String(g.nombre||"").trim() || soloNumero(g.telefono);
    }).map(function(g){
      var limpio=soloNumero(g.telefono);
      return {id:g.id, nombre:String(g.nombre||"").trim(), telefono:limpio?"+"+limpio:""};
    });
    libro.ajustes.fondoHabitual=numero("aj_fondo");
    libro.ajustes.pctVisa=numero("aj_visa");
    guardar(); pintar();
    var cuantos=gente().length;
    avisar(cuantos===0 ? "Ajustes guardados"
      : cuantos===1 ? "El parte irá a "+nombreDestino()+" "+telefonoBonito()
      : "El parte se lo podrás mandar a "+cuantos+" personas");
  });
}

/* El ajuste viejo guardaba prefijo y teléfono por separado. Se juntan
   una sola vez, y sólo cuando el número es corto de verdad —seis cifras,
   que es lo que mide uno de Andorra—; si ya era largo, se queda como
   estaba, que para eso funcionaba. */
function unificarTelefono(){
  var a=libro.ajustes; if(!a || a.prefijo===undefined) return;
  var pre=String(a.prefijo||"").replace(/\D/g,"");
  var tel=String(a.telefono||"").replace(/\D/g,"");
  if(tel && pre && tel.length<=6 && tel.indexOf(pre)!==0){ tel=pre+tel; a.telefono="+"+tel; }
  else a.telefono=tel;   /* sin poner un + que no sabemos si le toca */
  delete a.prefijo;
  if(tel) guardar();
}

/* Un numero apuntado con el 00 delante no le vale a WhatsApp. Se limpia
   una vez, para no tener que acordarse de arreglarlo a mano. */
function quitarCeros(){
  var a=libro.ajustes; if(!a) return;
  var bueno=soloNumero(a.telefono);
  if(bueno && String(a.telefono||"").replace(/\D/g,"")!==bueno){
    a.telefono="+"+bueno;
    guardar();
  }
}

/* Antes solo se podia guardar a una persona. Ese destinatario pasa a ser
   el primero de la lista, y los campos viejos se quedan donde estan por
   si un movil todavia tiene abierta la version anterior de la app. */
function unificarGente(){
  var a=libro.ajustes; if(!a) return;
  if(Array.isArray(a.gente)) return;
  a.gente=[];
  if(String(a.destinatario||"").trim() || soloNumero(a.telefono)){
    a.gente.push({id:uid(), nombre:a.destinatario||"", telefono:a.telefono||""});
  }
  guardar();
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
unificarTelefono();
quitarCeros();
unificarGente();
pintar();

})();
