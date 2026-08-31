/* ══════════════════════════════════════════════════════════════════
   CASA — la contabilidad de la familia
   ══════════════════════════════════════════════════════════════════
   Resumen    lo gastado por apartado y los avisos de caducidad
   Compra     productos, supermercados y el precio de cada uno en cada
              sitio, para ver de un golpe dónde sale más barato
   Médico     visitas por persona, con lo que devuelve la CASS y lo que
              devuelve el seguro, y si ya está todo cobrado
   Coche      seguro, ITV, repostajes y revisiones con sus piezas
   Fijos      luz, agua, internet, móvil, seguros… los de cada mes
   Viajes     un viaje agrupa sus hoteles, comidas y gasolina
   Otros      gimnasio, negocio y lo que no cae en los demás

   Los datos los guarda sync.js en el repositorio privado.
   ══════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var CLAVE = "casa.libro.v1";

function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function p2(n){ return (n<10?"0":"")+n; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function libroVacio(){
  return {
    v:1, actualizado:new Date().toISOString(),
    ajustes:{ personas:["Valeriano","Loli","Sara"] },
    supermercados:[], productos:[], precios:[], lista:[],
    compras:[], medico:[],
    coche:{ matricula:"", modelo:"",
            seguro:{compania:"", poliza:"", prima:0, caduca:""},
            itv:{caduca:"", coste:0} },
    repostajes:[], revisiones:[],
    fijos:[], viajes:[], otros:[]
  };
}

var libro = libroVacio();
var ui = { vista:"resumen", mes:hoyISO().slice(0,7), viaje:null };

/* ── Dinero, fechas y textos ──────────────────────────────────── */
function r2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function eur(n){ return (n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
function num(n,d){ d=d||0; return (n||0).toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d}); }
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
           "septiembre","octubre","noviembre","diciembre"];
function mesLargo(ym){ if(!ym) return ""; var a=ym.split("-"); return MESES[+a[1]-1]+" "+a[0]; }
function dmy(iso){ if(!iso) return ""; var a=iso.split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function diasHasta(iso){
  if(!iso) return null;
  var hoy=new Date(hoyISO()+"T12:00:00"), fin=new Date(iso+"T12:00:00");
  return Math.round((fin-hoy)/86400000);
}

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
    if(!d.ajustes || !d.ajustes.personas || !d.ajustes.personas.length) d.ajustes=base.ajustes;
    if(!d.coche) d.coche=base.coche;
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

/* ── Ventana de edición ───────────────────────────────────────── */
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
    if(alGuardar()===true) return;    /* true = algo falta, no cerrar */
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
function marcado(id){ var e=document.getElementById(id); return e?!!e.checked:false; }

/* ══════════════════════════════════════════════════════════════
   CÁLCULOS COMPARTIDOS
   ══════════════════════════════════════════════════════════════ */
function delMes(lista, ym, campoFecha){
  campoFecha=campoFecha||"fecha";
  return (lista||[]).filter(function(x){ return (x[campoFecha]||"").slice(0,7)===ym; });
}
function suma(lista, campo){
  return r2((lista||[]).reduce(function(s,x){ return s+(+x[campo]||0); }, 0));
}

function totalCompra(c){
  if(c.total!=null) return +c.total||0;
  return r2((c.lineas||[]).reduce(function(s,l){ return s+(+l.cantidad||0)*(+l.precio||0); },0));
}
function costeRevision(r){
  return r2((+r.manoObra||0) + (r.piezas||[]).reduce(function(s,p){ return s+(+p.precio||0); },0));
}
function pendienteMedico(v){
  /* Lo que aún no te han devuelto de esa visita */
  return r2((+v.consulta||0)+(+v.medicinas||0)-(+v.cass||0)-(+v.seguro||0));
}
function totalViaje(v){ return suma(v.gastos, "importe"); }

/* Gasto de un mes, apartado por apartado */
function gastoDelMes(ym){
  var g = {
    compra:   suma(delMes(libro.compras, ym).map(function(c){ return {x:totalCompra(c)}; }), "x"),
    medico:   suma(delMes(libro.medico, ym).map(function(v){ return {x:pendienteMedico(v)}; }), "x"),
    coche:    r2(suma(delMes(libro.repostajes, ym), "importe") +
                 suma(delMes(libro.revisiones, ym).map(function(r){ return {x:costeRevision(r)}; }), "x")),
    fijos:    suma(delMes(libro.fijos, ym), "importe"),
    viajes:   r2((libro.viajes||[]).reduce(function(s,v){
                   return s + suma(delMes(v.gastos, ym), "importe"); },0)),
    otros:    suma(delMes(libro.otros, ym), "importe")
  };
  g.total = r2(g.compra+g.medico+g.coche+g.fijos+g.viajes+g.otros);
  return g;
}

/* Avisos de caducidad: ITV y seguro del coche */
function avisosCaducidad(){
  var avisos=[];
  function mirar(nombre, fecha, extra){
    var d=diasHasta(fecha);
    if(d===null) return;
    if(d<0)        avisos.push({nivel:"malo",  texto:nombre+" caducó hace "+Math.abs(d)+" días ("+dmy(fecha)+")", extra:extra});
    else if(d<=45) avisos.push({nivel:"aviso", texto:nombre+" caduca en "+d+" días ("+dmy(fecha)+")", extra:extra});
  }
  mirar("La ITV", (libro.coche.itv||{}).caduca);
  mirar("El seguro del coche", (libro.coche.seguro||{}).caduca);
  return avisos;
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"resumen", nombre:"Resumen"},
  {id:"compra",  nombre:"Compra"},
  {id:"medico",  nombre:"Médico"},
  {id:"coche",   nombre:"Coche"},
  {id:"fijos",   nombre:"Gastos fijos"},
  {id:"viajes",  nombre:"Viajes"},
  {id:"otros",   nombre:"Otros"}
];

function cuentas(){
  var ym=ui.mes;
  return {
    resumen:"",
    compra: delMes(libro.compras, ym).length,
    medico: delMes(libro.medico, ym).length,
    coche:  delMes(libro.repostajes, ym).length + delMes(libro.revisiones, ym).length,
    fijos:  delMes(libro.fijos, ym).length,
    viajes: (libro.viajes||[]).length,
    otros:  delMes(libro.otros, ym).length
  };
}

function pintar(){
  var c=cuentas();
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Casa</span><span class="sub">Cuentas de la familia</span></div>'+
      APARTADOS.map(function(a){
        return '<button class="nav" data-ir="'+a.id+'" aria-current="'+(ui.vista===a.id)+'">'+
               '<span>'+a.nombre+'</span><span class="n">'+(c[a.id]===""?"":c[a.id])+'</span></button>';
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
  ({resumen:verResumen, compra:verCompra, medico:verMedico, coche:verCoche,
    fijos:verFijos, viajes:verViajes, otros:verOtros})[ui.vista](main);
}

function cabecera(titulo, sub, derecha){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         (sub?'<p>'+sub+'</p>':"")+'</div>'+
         '<div class="barra" style="margin:0">'+(derecha||"")+'</div></div>';
}
function selectorMes(id){
  return '<div class="campo"><label class="lbl" for="'+id+'">Mes</label>'+
         '<input type="month" id="'+id+'" value="'+esc(ui.mes)+'"></div>';
}
function engancharMes(id){
  var e=document.getElementById(id);
  if(e) e.addEventListener("change", function(){ ui.mes=this.value; pintar(); });
}

/* ══════════════════════════════════════════════════════════════
   RESUMEN
   ══════════════════════════════════════════════════════════════ */
function verResumen(main){
  var g=gastoDelMes(ui.mes);
  var avisos=avisosCaducidad();
  var apartados=[
    {k:"compra", nombre:"Compra",      ir:"compra"},
    {k:"fijos",  nombre:"Gastos fijos",ir:"fijos"},
    {k:"coche",  nombre:"Coche",       ir:"coche"},
    {k:"medico", nombre:"Médico",      ir:"medico"},
    {k:"viajes", nombre:"Viajes",      ir:"viajes"},
    {k:"otros",  nombre:"Otros",       ir:"otros"}
  ];
  var mayor=Math.max.apply(null, apartados.map(function(a){ return g[a.k]; }).concat([1]));

  main.innerHTML=
    cabecera("Resumen de "+mesLargo(ui.mes),
      "Lo que se ha ido este mes, apartado por apartado.", selectorMes("r_mes"))+
    (avisos.length ? avisos.map(function(a){
      return '<div class="aviso-caja" style="'+
        (a.nivel==="malo"?"background:var(--malo-suave);border-color:var(--malo);color:var(--malo)":"")+'">'+
        (a.nivel==="malo"?"⚠️ ":"🔔 ")+esc(a.texto)+'</div>';
    }).join("") : "")+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Total del mes</div><div class="v acento">'+eur(g.total)+'</div>'+
        '<div class="n">'+mesLargo(ui.mes)+'</div></div>'+
      '<div class="cifra"><div class="k">Compra</div><div class="v">'+eur(g.compra)+'</div>'+
        '<div class="n">'+delMes(libro.compras,ui.mes).length+' compras</div></div>'+
      '<div class="cifra"><div class="k">Fijos</div><div class="v">'+eur(g.fijos)+'</div>'+
        '<div class="n">'+delMes(libro.fijos,ui.mes).length+' recibos</div></div>'+
      '<div class="cifra"><div class="k">Coche</div><div class="v">'+eur(g.coche)+'</div>'+
        '<div class="n">gasolina y taller</div></div>'+
      '<div class="cifra"><div class="k">Médico</div><div class="v">'+eur(g.medico)+'</div>'+
        '<div class="n">lo que no te devuelven</div></div>'+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab"><h2>En qué se va el dinero</h2>'+
      '<span class="pista">Pulsa un apartado para ir a él</span></div>'+
      '<div class="tarjeta-cuerpo" id="reparto"></div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Lo último anotado</h2></div>'+
      '<div class="tabla-caja" id="ultimos"></div></div>';

  engancharMes("r_mes");

  var caja=document.getElementById("reparto");
  caja.innerHTML = g.total===0
    ? '<div class="vacio"><strong>Nada anotado en '+esc(mesLargo(ui.mes))+'</strong>'+
      'Empieza por el apartado que quieras: todo se guarda solo.</div>'
    : apartados.map(function(a){
        var pct=g.total>0?(g[a.k]/g.total*100):0;
        return '<div style="margin-bottom:11px;cursor:pointer" data-ir2="'+a.ir+'">'+
          '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:4px">'+
            '<span>'+esc(a.nombre)+'</span>'+
            '<span style="font-weight:600;font-variant-numeric:tabular-nums">'+eur(g[a.k])+
            ' <span style="color:var(--muted);font-size:11.5px">'+num(pct,0)+'%</span></span>'+
          '</div>'+
          '<div style="background:var(--sup2);border-radius:4px;height:6px;overflow:hidden">'+
            '<div style="background:var(--acento);height:100%;width:'+(g[a.k]/mayor*100).toFixed(1)+'%;border-radius:4px"></div>'+
          '</div></div>';
      }).join("");
  caja.querySelectorAll("[data-ir2]").forEach(function(d){
    d.addEventListener("click", function(){ ui.vista=d.getAttribute("data-ir2"); pintar(); });
  });

  /* Los últimos movimientos de todos los apartados, juntos */
  var movs=[];
  (libro.compras||[]).forEach(function(c){
    movs.push({fecha:c.fecha, que:"Compra", detalle:nombreSuper(c.superId), importe:totalCompra(c)});
  });
  (libro.fijos||[]).forEach(function(f){
    movs.push({fecha:f.fecha, que:"Fijo", detalle:f.concepto, importe:+f.importe||0});
  });
  (libro.repostajes||[]).forEach(function(r){
    movs.push({fecha:r.fecha, que:"Gasolina", detalle:r.estacion||"", importe:+r.importe||0});
  });
  (libro.revisiones||[]).forEach(function(r){
    movs.push({fecha:r.fecha, que:"Taller", detalle:r.motivo||r.taller||"", importe:costeRevision(r)});
  });
  (libro.medico||[]).forEach(function(v){
    movs.push({fecha:v.fecha, que:"Médico", detalle:v.persona+" · "+(v.medico||""), importe:pendienteMedico(v)});
  });
  (libro.otros||[]).forEach(function(o){
    movs.push({fecha:o.fecha, que:o.tipo||"Otros", detalle:o.concepto, importe:+o.importe||0});
  });
  (libro.viajes||[]).forEach(function(v){
    (v.gastos||[]).forEach(function(x){
      movs.push({fecha:x.fecha, que:"Viaje", detalle:v.nombre+" · "+(x.concepto||x.tipo), importe:+x.importe||0});
    });
  });
  movs.sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  movs=movs.slice(0,12);

  document.getElementById("ultimos").innerHTML = movs.length===0
    ? '<div class="vacio">Todavía no hay nada anotado.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Apartado</th><th>Detalle</th><th class="num">Importe</th></tr></thead><tbody>'+
      movs.map(function(m){
        return "<tr><td>"+esc(dmy(m.fecha))+"</td><td>"+esc(m.que)+"</td>"+
               "<td>"+esc(m.detalle)+'</td><td class="num">'+eur(m.importe)+"</td></tr>";
      }).join("")+"</tbody></table>";
}

/* ══════════════════════════════════════════════════════════════
   COMPRA: supermercados, productos y comparador de precios
   ══════════════════════════════════════════════════════════════ */
function nombreSuper(id){
  var s=(libro.supermercados||[]).filter(function(x){ return x.id===id; })[0];
  return s?s.nombre:"(sin supermercado)";
}
function nombreProducto(id){
  var p=(libro.productos||[]).filter(function(x){ return x.id===id; })[0];
  if(!p) return "(sin producto)";
  /* Con la marca y el formato al lado, dos leches distintas dejan de
     parecer la misma en los desplegables. */
  var cola=[p.marca, p.formato].filter(function(x){ return !!x; }).join(", ");
  return cola ? p.nombre+" · "+cola : p.nombre;
}
function precioDe(productoId, superId){
  var lista=(libro.precios||[]).filter(function(x){ return x.productoId===productoId && x.superId===superId; });
  if(!lista.length) return null;
  lista.sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  return lista[0];
}
function ponerPrecio(productoId, superId, precio){
  var p=precioDe(productoId, superId);
  if(p && p.fecha===hoyISO()){ p.precio=precio; }
  else libro.precios.push({id:uid(), productoId:productoId, superId:superId, precio:precio, fecha:hoyISO()});
  guardar();
}

function verCompra(main){
  var supers=libro.supermercados||[], productos=libro.productos||[];
  var comprasMes=delMes(libro.compras, ui.mes);
  var gastado=r2(comprasMes.reduce(function(s,c){ return s+totalCompra(c); },0));

  main.innerHTML=
    cabecera("Compra",
      "Los precios de cada producto en cada supermercado, para ver dónde sale más barato. Y lo que compras cada mes.",
      selectorMes("c_mes")+
      '<button class="btn" id="nuevoSuper">Nuevo supermercado</button>'+
      '<button class="btn" id="nuevoProd">Nuevo producto</button>'+
      '<button class="btn fuerte" id="nuevaCompra">Anotar compra</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Gastado</div><div class="v acento">'+eur(gastado)+'</div>'+
        '<div class="n">'+mesLargo(ui.mes)+'</div></div>'+
      '<div class="cifra"><div class="k">Compras</div><div class="v">'+comprasMes.length+'</div>'+
        '<div class="n">del mes</div></div>'+
      '<div class="cifra"><div class="k">Productos</div><div class="v">'+productos.length+'</div>'+
        '<div class="n">en la lista</div></div>'+
      '<div class="cifra"><div class="k">Supermercados</div><div class="v">'+supers.length+'</div>'+
        '<div class="n">comparando</div></div>'+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab">'+
      '<h2>Lista de la compra</h2>'+
      '<span class="pista">Lo que hay que comprar, y dónde sale más barato</span></div>'+
      '<div class="tarjeta-cuerpo" id="listaCompra"></div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab">'+
      '<h2>Comparador de precios</h2>'+
      '<span class="pista">En verde, el más barato de cada producto</span></div>'+
      '<div class="tabla-caja" id="comparador"></div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Compras de '+esc(mesLargo(ui.mes))+'</h2></div>'+
      '<div class="tabla-caja" id="listaCompras"></div></div>';

  engancharMes("c_mes");
  document.getElementById("nuevoSuper").addEventListener("click", function(){ editarSuper(null); });
  document.getElementById("nuevoProd").addEventListener("click", function(){ editarProducto(null); });
  document.getElementById("nuevaCompra").addEventListener("click", function(){ editarCompra(null); });

  pintarLista();
  pintarComparador();
  pintarCompras();
}

/* ══════════════════════════════════════════════════════════════
   LISTA DE LA COMPRA
   ══════════════════════════════════════════════════════════════
   Lo que hay que comprar, marcable a medida que cae en el carro.
   Con los precios ya anotados, dice lo que costaría en cada
   supermercado, que es para lo que sirve tener el comparador.
   ══════════════════════════════════════════════════════════════ */
function laLista(){ return libro.lista||(libro.lista=[]); }

/* Lo que costaría la lista en un supermercado. Devuelve también cuántos
   productos no tienen precio allí, para no dar por buena una cuenta
   coja. */
function costeLista(superId){
  var total=0, sinPrecio=0;
  laLista().forEach(function(it){
    if(it.hecho || !it.productoId) return;
    var pr=precioDe(it.productoId, superId);
    if(pr) total+=(+it.cantidad||1)*(+pr.precio||0);
    else sinPrecio++;
  });
  return {total:r2(total), sinPrecio:sinPrecio};
}

function pintarLista(){
  var caja=document.getElementById("listaCompra"); if(!caja) return;
  var items=laLista();
  var pendientes=items.filter(function(i){ return !i.hecho; });
  var hechos=items.filter(function(i){ return i.hecho; });
  var supers=libro.supermercados||[];

  /* Lo que costaría en cada sitio, de más barato a más caro */
  var costes=supers.map(function(s){
    var c=costeLista(s.id);
    return {id:s.id, nombre:s.nombre, total:c.total, sinPrecio:c.sinPrecio};
  }).filter(function(c){ return c.total>0 || c.sinPrecio>0; })
    .sort(function(a,b){ return a.total-b.total; });

  caja.innerHTML=
    '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'+
      '<button class="btn fuerte sm" id="l_nuevo">+ Añadir a la lista</button>'+
      (hechos.length?'<button class="btn sm" id="l_limpiar">Quitar lo ya cogido ('+hechos.length+')</button>':"")+
      (pendientes.length?'<button class="btn sm" id="l_compra">Pasarla a compra</button>':"")+
    '</div>'+

    (!items.length
      ? '<div class="vacio"><strong>La lista está vacía</strong>'+
        'Ve apuntando lo que falta en casa y márcalo cuando lo cojas.</div>'
      : '<div id="itemsLista">'+
        items.slice().sort(function(a,b){ return (a.hecho?1:0)-(b.hecho?1:0); })
             .map(filaLista).join("")+'</div>')+

    (pendientes.length && costes.length
      ? '<div style="border-top:1px solid var(--linea);margin-top:14px;padding-top:14px">'+
        '<p class="nota" style="margin:0 0 8px">Lo que costaría lo que queda por coger:</p>'+
        '<div class="tabla-caja"><table><tbody>'+
        costes.map(function(c,i){
          return '<tr><td>'+(i===0&&costes.length>1?'<span class="chapa ok">Más barato</span> ':"")+
            esc(c.nombre)+'</td>'+
            '<td class="num"><strong>'+eur(c.total)+'</strong></td>'+
            '<td style="color:var(--muted);font-size:12px">'+
            (c.sinPrecio? c.sinPrecio+(c.sinPrecio===1?" sin precio ahí":" sin precio ahí") : "todos con precio")+
            '</td></tr>';
        }).join("")+'</tbody></table></div>'+
        (function(){
          var avisos=[];
          if(costes.some(function(c){ return c.sinPrecio; }))
            avisos.push('Los que no tienen precio en un sitio no cuentan en su total: pon el precio '+
                        'en el comparador y cuadrará.');
          var aMano=pendientes.filter(function(i){ return !i.productoId; }).length;
          if(aMano)
            avisos.push(aMano===1
              ? 'Lo escrito a mano no entra en la cuenta, porque no tiene precio en ningún sitio.'
              : 'Los '+aMano+' escritos a mano no entran en la cuenta, porque no tienen precio '+
                'en ningún sitio.');
          return avisos.length
            ? '<p class="nota" style="margin:8px 0 0">'+avisos.join(" ")+'</p>' : "";
        })()+
        '</div>'
      : "");

  document.getElementById("l_nuevo").addEventListener("click", function(){ editarItem(null); });
  var limpiar=document.getElementById("l_limpiar");
  if(limpiar) limpiar.addEventListener("click", function(){
    confirmar("Quitar lo ya cogido",
      '<p style="margin:0">Se van de la lista '+
      (hechos.length===1?"<strong>el producto marcado</strong>":"los <strong>"+hechos.length+" productos marcados</strong>")+
      '. Lo que queda por coger no se toca.</p>',
      function(){
        libro.lista=laLista().filter(function(i){ return !i.hecho; });
        guardar(); pintar(); avisar("Lista limpia");
      }, {aceptar:"Quitar", malo:true});
  });
  var aCompra=document.getElementById("l_compra");
  if(aCompra) aCompra.addEventListener("click", listaACompra);

  caja.querySelectorAll("[data-lcheck]").forEach(function(c){
    c.addEventListener("change", function(){
      var it=laLista().filter(function(x){ return x.id===c.getAttribute("data-lcheck"); })[0];
      if(it){ it.hecho=c.checked; guardar(); pintarLista(); }
    });
  });
  caja.querySelectorAll("[data-ledit]").forEach(function(b){
    b.addEventListener("click", function(){ editarItem(b.getAttribute("data-ledit")); });
  });
  caja.querySelectorAll("[data-ldel]").forEach(function(b){
    b.addEventListener("click", function(){
      libro.lista=laLista().filter(function(x){ return x.id!==b.getAttribute("data-ldel"); });
      guardar(); pintarLista(); avisar("Quitado de la lista");
    });
  });
}

function filaLista(it){
  var nombre = it.productoId ? nombreProducto(it.productoId) : (it.texto||"");
  return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;'+
    'border-bottom:1px solid var(--linea-suave)'+(it.hecho?";opacity:.5":"")+'">'+
    '<input type="checkbox" data-lcheck="'+esc(it.id)+'"'+(it.hecho?" checked":"")+
      ' style="width:auto;flex:0 0 auto">'+
    '<span style="flex:1;min-width:0'+(it.hecho?";text-decoration:line-through":"")+'">'+
      esc(nombre)+
      ((+it.cantidad||1)>1?' <span style="color:var(--muted)">× '+(+it.cantidad)+'</span>':"")+
      (it.nota?'<div style="color:var(--muted);font-size:12px">'+esc(it.nota)+'</div>':"")+
    '</span>'+
    '<div class="acciones-fila">'+
      '<button class="btn suave sm" data-ledit="'+esc(it.id)+'">Editar</button>'+
      '<button class="btn suave sm malo" data-ldel="'+esc(it.id)+'">✕</button>'+
    '</div></div>';
}

function editarItem(id){
  var it=id?laLista().filter(function(x){ return x.id===id; })[0]
           :{id:uid(), productoId:"", texto:"", cantidad:1, nota:"", hecho:false};
  var productos=(libro.productos||[]).slice()
    .sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); });

  abrirVentana(id?"Editar de la lista":"Añadir a la lista",
    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="l_prod">Producto</label>'+
      '<select id="l_prod">'+
        '<option value="">— escribirlo a mano —</option>'+
        productos.map(function(p){
          return '<option value="'+esc(p.id)+'"'+(it.productoId===p.id?" selected":"")+'>'+
                 esc(nombreProducto(p.id))+'</option>';
        }).join("")+
      '</select></div>'+
    '<div class="campo" id="cajaTexto" style="margin-bottom:12px">'+
      '<label class="lbl" for="l_texto">Escríbelo</label>'+
      '<input id="l_texto" value="'+esc(it.texto||"")+'" placeholder="Pan, pilas, bombilla…"></div>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="l_cant">Cuántos</label>'+
        '<input type="number" id="l_cant" min="1" step="1" value="'+esc(it.cantidad||1)+'"></div>'+
      '<div class="campo"><label class="lbl" for="l_nota">Nota</label>'+
        '<input id="l_nota" value="'+esc(it.nota||"")+'" placeholder="El de la tapa azul…"></div>'+
    '</div>'+
    '<p class="nota" style="margin:12px 0 0">Los de la lista de productos entran en la cuenta de '+
    'lo que costaría en cada supermercado. Los escritos a mano, no: para eso dales de alta '+
    'como producto.</p>',
    function(){
      var pid=valor("l_prod");
      var texto=valor("l_texto");
      if(!pid && !texto){ avisar("Elige un producto o escríbelo.", true); return true; }
      it.productoId=pid; it.texto=pid?"":texto;
      it.cantidad=Math.max(1, Math.round(numero("l_cant")))||1;
      it.nota=valor("l_nota");
      if(!id) laLista().push(it);
      guardar(); pintar(); avisar(id?"Actualizado":"Añadido a la lista");
    }, {aceptar:id?"Guardar":"Añadir"});

  /* El hueco de escribir a mano sólo estorba si ya eligió un producto */
  function refrescar(){
    document.getElementById("cajaTexto").style.display = valor("l_prod") ? "none" : "";
  }
  document.getElementById("l_prod").addEventListener("change", refrescar);
  refrescar();
}

/* Pasar lo que queda por coger a una compra ya hecha, con los precios
   que tenga anotados ese supermercado. */
function listaACompra(){
  var pendientes=laLista().filter(function(i){ return !i.hecho && i.productoId; });
  if(!pendientes.length){
    avisar("En la lista no hay productos del catálogo por coger.", true); return;
  }
  var supers=libro.supermercados||[];
  if(!supers.length){ avisar("Antes da de alta un supermercado.", true); return; }

  abrirVentana("Pasar la lista a compra",
    '<p class="nota" style="margin:0 0 12px">Se crea una compra con '+
    pendientes.length+' '+(pendientes.length===1?"producto":"productos")+
    ', con el último precio anotado en ese supermercado. Después la puedes retocar.</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="lc_fecha">Fecha</label>'+
        '<input type="date" id="lc_fecha" value="'+esc(hoyISO())+'"></div>'+
      '<div class="campo"><label class="lbl" for="lc_super">Supermercado</label>'+
        '<select id="lc_super">'+supers.map(function(s){
          return '<option value="'+esc(s.id)+'">'+esc(s.nombre)+'</option>'; }).join("")+
      '</select></div>'+
    '</div>'+
    '<label class="marca-check" style="margin-top:14px">'+
      '<input type="checkbox" id="lc_quitar" checked>'+
      '<span>Quitarlos de la lista al pasarlos</span></label>',
    function(){
      var superId=valor("lc_super");
      var lineas=pendientes.map(function(it){
        var pr=precioDe(it.productoId, superId);
        return {productoId:it.productoId, cantidad:+it.cantidad||1, precio:pr?+pr.precio:0};
      });
      var c={id:uid(), fecha:valor("lc_fecha")||hoyISO(), superId:superId, lineas:lineas};
      c.total=r2(lineas.reduce(function(s,l){ return s+l.cantidad*l.precio; },0));
      libro.compras.push(c);
      if(marcado("lc_quitar")){
        var ids={};
        pendientes.forEach(function(it){ ids[it.id]=1; });
        libro.lista=laLista().filter(function(i){ return !ids[i.id]; });
      }
      guardar(); pintar();
      var sinPrecio=lineas.filter(function(l){ return !l.precio; }).length;
      avisar(sinPrecio
        ? "Compra creada. "+sinPrecio+" sin precio: ponlos en la compra."
        : "Compra creada por "+eur(c.total));
    }, {aceptar:"Crear la compra"});
}

function pintarComparador(){
  var caja=document.getElementById("comparador");
  var supers=libro.supermercados||[], productos=libro.productos||[];
  if(!supers.length || !productos.length){
    caja.innerHTML='<div class="vacio"><strong>Falta lo básico</strong>'+
      'Da de alta al menos un supermercado y un producto, y aquí podrás ir poniendo el precio de cada uno en cada sitio.</div>';
    return;
  }
  var html='<table><thead><tr><th>Producto</th>'+
    supers.map(function(s){
      /* El nombre del supermercado abre su ficha; la ✕ lo borra. Antes
         no había forma de tocarlos una vez creados, y un duplicado se
         quedaba ahí para siempre. */
      return '<th class="num"><div style="display:flex;gap:4px;align-items:center;'+
        'justify-content:flex-end">'+
        '<button class="btn suave sm" data-sedit="'+esc(s.id)+'" '+
        'style="padding:1px 5px;font-size:inherit;letter-spacing:inherit;text-transform:inherit" '+
        'title="Editar '+esc(s.nombre)+'">'+esc(s.nombre)+'</button>'+
        '<button class="btn suave sm malo" data-sdel="'+esc(s.id)+'" '+
        'style="padding:1px 5px" title="Borrar '+esc(s.nombre)+'">✕</button>'+
        '</div>'+
        (s.sitio?'<div style="font-weight:400;text-transform:none;letter-spacing:0;'+
          'color:var(--muted);font-size:10.5px;margin-top:2px">'+esc(s.sitio)+'</div>':"")+
        '</th>';
    }).join("")+
    '<th class="num">Más barato</th><th></th></tr></thead><tbody>';

  productos.slice().sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); }).forEach(function(p){
    var valores=supers.map(function(s){ var pr=precioDe(p.id,s.id); return pr?+pr.precio:null; });
    var conPrecio=valores.filter(function(v){ return v!=null; });
    var minimo=conPrecio.length?Math.min.apply(null,conPrecio):null;
    html+="<tr><td><strong>"+esc(p.nombre)+"</strong>"+
          (p.marca?' <span style="color:var(--muted);font-size:12px">'+esc(p.marca)+'</span>':"")+
          (p.formato?'<br><span style="color:var(--muted);font-size:12px">'+esc(p.formato)+'</span>':"")+
          "</td>";
    supers.forEach(function(s,i){
      var v=valores[i];
      var esMin=(v!=null && minimo!=null && Math.abs(v-minimo)<0.001 && conPrecio.length>1);
      html+='<td class="num'+(esMin?' mejor':'')+'" style="cursor:pointer" '+
            'data-precio="'+p.id+'|'+s.id+'" title="Pulsa para poner el precio">'+
            (v!=null?eur(v):'<span class="precio-vacio">—</span>')+"</td>";
    });
    html+='<td class="num">'+(minimo!=null?'<span class="chapa ok">'+eur(minimo)+'</span>':'<span class="precio-vacio">—</span>')+"</td>"+
          '<td><div class="acciones-fila">'+
          '<button class="btn suave sm" data-pedit="'+p.id+'">Editar</button>'+
          '<button class="btn suave sm malo" data-pdel="'+p.id+'">Borrar</button></div></td></tr>';
  });
  html+="</tbody></table>";
  caja.innerHTML=html;

  caja.querySelectorAll("[data-precio]").forEach(function(td){
    td.addEventListener("click", function(){
      var partes=td.getAttribute("data-precio").split("|");
      editarPrecio(partes[0], partes[1]);
    });
  });
  caja.querySelectorAll("[data-pedit]").forEach(function(b){
    b.addEventListener("click", function(e){ e.stopPropagation(); editarProducto(b.getAttribute("data-pedit")); });
  });
  caja.querySelectorAll("[data-pdel]").forEach(function(b){
    b.addEventListener("click", function(e){ e.stopPropagation(); borrarProducto(b.getAttribute("data-pdel")); });
  });
  caja.querySelectorAll("[data-sedit]").forEach(function(b){
    b.addEventListener("click", function(e){ e.stopPropagation(); editarSuper(b.getAttribute("data-sedit")); });
  });
  caja.querySelectorAll("[data-sdel]").forEach(function(b){
    b.addEventListener("click", function(e){ e.stopPropagation(); borrarSuper(b.getAttribute("data-sdel")); });
  });
}

function editarPrecio(productoId, superId){
  var actual=precioDe(productoId, superId);
  abrirVentana("Precio de "+nombreProducto(productoId),
    '<p class="nota">En <strong>'+esc(nombreSuper(superId))+'</strong>'+
    (actual?'. Última anotación: '+eur(actual.precio)+' el '+dmy(actual.fecha):"")+'</p>'+
    '<div class="campo"><label class="lbl" for="pr_val">Precio (€)</label>'+
    '<input type="number" id="pr_val" min="0" step="0.01" value="'+(actual?esc(actual.precio):"")+'"></div>',
    function(){
      var v=numero("pr_val");
      if(!v){ avisar("Pon un precio.", true); return true; }
      ponerPrecio(productoId, superId, v);
      pintar(); avisar("Precio guardado");
    });
}

function editarSuper(id){
  var s=id?(libro.supermercados||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), nombre:"", sitio:""};
  abrirVentana(id?"Editar supermercado":"Nuevo supermercado",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="s_nom">Nombre</label>'+
        '<input id="s_nom" value="'+esc(s.nombre)+'" placeholder="Mercadona, Andorrà…"></div>'+
      '<div class="campo"><label class="lbl" for="s_sitio">Dónde está</label>'+
        '<input id="s_sitio" value="'+esc(s.sitio||"")+'" placeholder="Escaldes, La Seu…"></div>'+
    '</div>',
    function(){
      var n=valor("s_nom");
      if(!n){ avisar("Ponle nombre.", true); return true; }
      s.nombre=n; s.sitio=valor("s_sitio");
      if(!id) libro.supermercados.push(s);
      guardar(); pintar(); avisar(id?"Supermercado actualizado":"Supermercado añadido");
    });
}

/* Borrar un supermercado se lleva por delante los precios que tenga
   anotados, y deja huérfanas las compras hechas allí. Se dice cuántas
   son antes de aceptar, porque el importe de esas compras no cambia
   pero se queda sin sitio al que apuntar. */
function borrarSuper(id){
  var s=(libro.supermercados||[]).filter(function(x){ return x.id===id; })[0];
  if(!s) return;
  var precios=(libro.precios||[]).filter(function(x){ return x.superId===id; }).length;
  var compras=(libro.compras||[]).filter(function(x){ return x.superId===id; }).length;

  confirmar("Borrar "+s.nombre,
    '<p style="margin:0 0 10px">Se va la columna de <strong>'+esc(s.nombre)+'</strong> del '+
    'comparador'+(precios?', con '+precios+' '+(precios===1?"precio anotado":"precios anotados"):
                          ', que no tiene ningún precio anotado')+'.</p>'+
    (compras
      ? '<p class="nota" style="margin:0">Hay '+compras+' '+
        (compras===1?"compra hecha":"compras hechas")+' allí. No se borran ni cambian de importe, '+
        'pero se quedarán sin supermercado.</p>'
      : '<p class="nota" style="margin:0">No hay ninguna compra anotada en ese supermercado.</p>'),
    function(){
      libro.supermercados=(libro.supermercados||[]).filter(function(x){ return x.id!==id; });
      libro.precios=(libro.precios||[]).filter(function(x){ return x.superId!==id; });
      guardar(); pintar(); avisar(s.nombre+" borrado");
    }, {aceptar:"Borrar", malo:true});
}

function editarProducto(id){
  var p=id?(libro.productos||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), nombre:"", marca:"", formato:""};
  /* Las marcas que ya haya escrito, para no volver a teclearlas */
  var marcas={};
  (libro.productos||[]).forEach(function(x){ if(x.marca) marcas[x.marca]=1; });

  abrirVentana(id?"Editar producto":"Nuevo producto",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="p_nom">Producto</label>'+
        '<input id="p_nom" value="'+esc(p.nombre)+'" placeholder="Leche entera"></div>'+
      '<div class="campo"><label class="lbl" for="p_marca">Marca</label>'+
        '<input id="p_marca" list="listaMarcas" value="'+esc(p.marca||"")+'" '+
        'placeholder="Central Lechera, blanca…">'+
        '<datalist id="listaMarcas">'+
          Object.keys(marcas).sort().map(function(m){ return '<option value="'+esc(m)+'">'; }).join("")+
        '</datalist></div>'+
      '<div class="campo"><label class="lbl" for="p_form">Formato</label>'+
        '<input id="p_form" value="'+esc(p.formato||"")+'" placeholder="1 L, pack de 6…"></div>'+
    '</div>'+
    '<p class="nota" style="margin-top:12px">La marca y el formato son lo que hace justa la '+
    'comparación: un litro de la misma marca contra un litro de la misma marca. '+
    'Si comparas marcas distintas del mismo producto, dales de alta por separado.</p>',
    function(){
      var n=valor("p_nom");
      if(!n){ avisar("Ponle nombre al producto.", true); return true; }
      p.nombre=n; p.marca=valor("p_marca"); p.formato=valor("p_form");
      if(!id) libro.productos.push(p);
      guardar(); pintar(); avisar(id?"Producto actualizado":"Producto añadido");
    });
}

function borrarProducto(id){
  confirmar("Borrar producto",
    '<p style="margin:0">Se borra <strong>'+esc(nombreProducto(id))+'</strong> y los precios que tengas anotados de él.</p>',
    function(){
      libro.productos=(libro.productos||[]).filter(function(p){ return p.id!==id; });
      libro.precios=(libro.precios||[]).filter(function(p){ return p.productoId!==id; });
      guardar(); pintar(); avisar("Producto borrado");
    }, {aceptar:"Borrar", malo:true});
}

function editarCompra(id){
  var c=id?(libro.compras||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:hoyISO(), superId:(libro.supermercados[0]||{}).id||"", lineas:[]};
  var supers=libro.supermercados||[], productos=libro.productos||[];
  if(!supers.length){ avisar("Antes da de alta un supermercado.", true); return; }

  abrirVentana(id?"Editar compra":"Anotar compra",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="co_fecha">Fecha</label>'+
        '<input type="date" id="co_fecha" value="'+esc(c.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="co_super">Supermercado</label><select id="co_super">'+
        supers.map(function(s){ return '<option value="'+s.id+'"'+(c.superId===s.id?" selected":"")+">"+esc(s.nombre)+"</option>"; }).join("")+
      '</select></div>'+
    '</div>'+
    '<p class="nota" style="margin-top:14px">Qué has comprado. El precio se rellena solo con el último que anotaste en ese supermercado.</p>'+
    '<div id="lineas"></div>'+
    '<button class="btn sm" id="masLinea" style="margin-top:8px">+ Añadir producto</button>'+
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;'+
    'padding-top:12px;border-top:1px solid var(--linea)">'+
      '<span class="lbl">Total</span><strong id="co_total" style="font-size:18px">0,00 €</strong></div>',
    function(){
      var lineas=[];
      document.querySelectorAll("#lineas .linea").forEach(function(f){
        var pid=f.querySelector(".l_prod").value;
        var cant=+f.querySelector(".l_cant").value||0;
        var pre=+f.querySelector(".l_pre").value||0;
        if(pid && cant>0) lineas.push({productoId:pid, cantidad:cant, precio:pre});
      });
      if(!lineas.length){ avisar("Añade al menos un producto.", true); return true; }
      c.fecha=valor("co_fecha")||hoyISO();
      c.superId=valor("co_super");
      c.lineas=lineas;
      c.total=r2(lineas.reduce(function(s,l){ return s+l.cantidad*l.precio; },0));
      /* De paso, el precio visto hoy actualiza el comparador */
      lineas.forEach(function(l){ if(l.precio>0) ponerPrecio(l.productoId, c.superId, l.precio); });
      if(!id) libro.compras.push(c);
      guardar(); pintar(); avisar(id?"Compra actualizada":"Compra anotada: "+eur(c.total));
    });

  /* Las líneas se montan a mano porque son dinámicas */
  var caja=document.getElementById("lineas");
  function totalLineas(){
    var t=0;
    caja.querySelectorAll(".linea").forEach(function(f){
      t+=(+f.querySelector(".l_cant").value||0)*(+f.querySelector(".l_pre").value||0);
    });
    document.getElementById("co_total").textContent=eur(r2(t));
  }
  function añadirLinea(linea){
    linea=linea||{productoId:(productos[0]||{}).id||"", cantidad:1, precio:0};
    var f=document.createElement("div");
    f.className="linea";
    f.style.cssText="display:grid;grid-template-columns:minmax(120px,2fr) 72px 92px auto;gap:8px;margin-top:8px;align-items:end";
    f.innerHTML=
      '<div class="campo"><select class="l_prod">'+
        productos.map(function(p){ return '<option value="'+p.id+'"'+(linea.productoId===p.id?" selected":"")+">"+esc(p.nombre)+"</option>"; }).join("")+
      '</select></div>'+
      '<div class="campo"><input type="number" class="l_cant" min="0" step="0.01" value="'+esc(linea.cantidad)+'" title="Cantidad"></div>'+
      '<div class="campo"><input type="number" class="l_pre" min="0" step="0.01" value="'+esc(linea.precio)+'" title="Precio por unidad"></div>'+
      '<button class="btn suave sm malo" title="Quitar">✕</button>';
    caja.appendChild(f);
    f.querySelector("button").addEventListener("click", function(){ f.remove(); totalLineas(); });
    f.querySelector(".l_prod").addEventListener("change", function(){
      var pr=precioDe(this.value, valor("co_super"));
      if(pr) f.querySelector(".l_pre").value=pr.precio;
      totalLineas();
    });
    f.querySelector(".l_cant").addEventListener("input", totalLineas);
    f.querySelector(".l_pre").addEventListener("input", totalLineas);
    totalLineas();
  }
  if(!productos.length){
    caja.innerHTML='<p class="nota">Aún no hay productos. Créalos con «Nuevo producto» y vuelve.</p>';
  } else {
    (c.lineas||[]).forEach(añadirLinea);
    if(!(c.lineas||[]).length) añadirLinea();
    document.getElementById("masLinea").addEventListener("click", function(){ añadirLinea(); });
  }
}

function pintarCompras(){
  var caja=document.getElementById("listaCompras");
  var lista=delMes(libro.compras, ui.mes).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  if(!lista.length){ caja.innerHTML='<div class="vacio">Sin compras en '+esc(mesLargo(ui.mes))+'.</div>'; return; }
  var total=r2(lista.reduce(function(s,c){ return s+totalCompra(c); },0));
  caja.innerHTML='<table><thead><tr><th>Fecha</th><th>Supermercado</th><th class="num">Productos</th>'+
    '<th class="num">Total</th><th></th></tr></thead><tbody>'+
    lista.map(function(c){
      return "<tr><td>"+esc(dmy(c.fecha))+"</td><td>"+esc(nombreSuper(c.superId))+"</td>"+
        '<td class="num">'+((c.lineas||[]).length)+"</td>"+
        '<td class="num"><strong>'+eur(totalCompra(c))+"</strong></td>"+
        '<td><div class="acciones-fila">'+
          '<button class="btn suave sm" data-cedit="'+c.id+'">Editar</button>'+
          '<button class="btn suave sm malo" data-cdel="'+c.id+'">Borrar</button></div></td></tr>';
    }).join("")+
    '</tbody><tfoot><tr><td colspan="3">'+lista.length+' compras</td>'+
    '<td class="num">'+eur(total)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-cedit]").forEach(function(b){
    b.addEventListener("click", function(){ editarCompra(b.getAttribute("data-cedit")); });
  });
  caja.querySelectorAll("[data-cdel]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmar("Borrar compra", '<p style="margin:0">No se puede deshacer.</p>', function(){
        libro.compras=(libro.compras||[]).filter(function(c){ return c.id!==b.getAttribute("data-cdel"); });
        guardar(); pintar(); avisar("Compra borrada");
      }, {aceptar:"Borrar", malo:true});
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   MÉDICO
   ══════════════════════════════════════════════════════════════ */
function verMedico(main){
  var visitas=(libro.medico||[]).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  var delAno=visitas.filter(function(v){ return (v.fecha||"").slice(0,4)===ui.mes.slice(0,4); });
  var gastado=r2(delAno.reduce(function(s,v){ return s+(+v.consulta||0)+(+v.medicinas||0); },0));
  var devuelto=r2(delAno.reduce(function(s,v){ return s+(+v.cass||0)+(+v.seguro||0); },0));
  var pendiente=r2(delAno.filter(function(v){ return !v.cobrado; })
                        .reduce(function(s,v){ return s+pendienteMedico(v); },0));

  main.innerHTML=
    cabecera("Médico",
      "Cada visita con lo que costó y lo que devuelven la CASS y el seguro. Lo pendiente es lo que aún no te han reembolsado.",
      '<button class="btn fuerte" id="nuevaVisita">Anotar visita</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Pagado en '+ui.mes.slice(0,4)+'</div><div class="v">'+eur(gastado)+'</div>'+
        '<div class="n">consultas y medicinas</div></div>'+
      '<div class="cifra"><div class="k">Devuelto</div><div class="v" style="color:var(--ok)">'+eur(devuelto)+'</div>'+
        '<div class="n">CASS y seguro</div></div>'+
      '<div class="cifra"><div class="k">Pendiente de cobrar</div><div class="v malo">'+eur(pendiente)+'</div>'+
        '<div class="n">visitas sin cerrar</div></div>'+
      '<div class="cifra"><div class="k">Visitas</div><div class="v">'+delAno.length+'</div>'+
        '<div class="n">en '+ui.mes.slice(0,4)+'</div></div>'+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Visitas</h2>'+
      '<span class="pista">Marca «cobrado» cuando te hayan devuelto todo</span></div>'+
      '<div class="tabla-caja" id="tablaMedico"></div></div>';

  document.getElementById("nuevaVisita").addEventListener("click", function(){ editarVisita(null); });

  var caja=document.getElementById("tablaMedico");
  if(!visitas.length){
    caja.innerHTML='<div class="vacio"><strong>Ninguna visita anotada</strong>'+
      'Anota la primera con el botón de arriba.</div>';
    return;
  }
  caja.innerHTML='<table><thead><tr><th>Fecha</th><th>Quién</th><th>Médico</th><th>Motivo</th>'+
    '<th class="num">Consulta</th><th class="num">Medicinas<br>'+
    '<span style="font-weight:400;text-transform:none;letter-spacing:0">y su recibo</span></th>'+
    '<th class="num">CASS</th>'+
    '<th class="num">Seguro</th><th class="num">Te queda</th><th>Estado</th><th></th></tr></thead><tbody>'+
    visitas.map(function(v){
      var queda=pendienteMedico(v);
      return "<tr>"+
        "<td>"+esc(dmy(v.fecha))+"</td>"+
        "<td><strong>"+esc(v.persona||"")+"</strong></td>"+
        "<td>"+esc(v.medico||"—")+"</td>"+
        "<td>"+esc(v.motivo||"—")+"</td>"+
        '<td class="num">'+eur(v.consulta)+"</td>"+
        '<td class="num">'+eur(v.medicinas)+
          (v.recibo?'<div class="mono" style="color:var(--muted);font-size:11px;'+
            'font-weight:400">'+esc(v.recibo)+'</div>':"")+
          (v.farmacia?'<div style="color:var(--muted);font-size:11px;font-weight:400">'+
            esc(v.farmacia)+'</div>':"")+"</td>"+
        '<td class="num">'+eur(v.cass)+"</td>"+
        '<td class="num">'+eur(v.seguro)+"</td>"+
        '<td class="num"><strong>'+eur(queda)+"</strong></td>"+
        "<td>"+(v.cobrado
                 ? '<span class="chapa ok">Cobrado</span>'
                 : (queda>0.004 ? '<span class="chapa aviso">Pendiente</span>'
                                : '<span class="chapa neutra">Al día</span>'))+"</td>"+
        '<td><div class="acciones-fila">'+
          '<button class="btn suave sm" data-medit="'+v.id+'">Editar</button>'+
          '<button class="btn suave sm malo" data-mdel="'+v.id+'">Borrar</button></div></td></tr>';
    }).join("")+"</tbody></table>";

  caja.querySelectorAll("[data-medit]").forEach(function(b){
    b.addEventListener("click", function(){ editarVisita(b.getAttribute("data-medit")); });
  });
  caja.querySelectorAll("[data-mdel]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmar("Borrar visita", '<p style="margin:0">No se puede deshacer.</p>', function(){
        libro.medico=(libro.medico||[]).filter(function(v){ return v.id!==b.getAttribute("data-mdel"); });
        guardar(); pintar(); avisar("Visita borrada");
      }, {aceptar:"Borrar", malo:true});
    });
  });
}

function editarVisita(id){
  var v=id?(libro.medico||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:hoyISO(), persona:(libro.ajustes.personas[0]||""), medico:"", motivo:"",
            consulta:0, medicinas:0, cass:0, seguro:0, cobrado:false};
  abrirVentana(id?"Editar visita":"Anotar visita al médico",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="v_fecha">Fecha</label>'+
        '<input type="date" id="v_fecha" value="'+esc(v.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="v_persona">Quién va</label><select id="v_persona">'+
        libro.ajustes.personas.map(function(p){
          return '<option'+(v.persona===p?" selected":"")+">"+esc(p)+"</option>"; }).join("")+
      '</select></div>'+
      '<div class="campo"><label class="lbl" for="v_medico">Médico o centro</label>'+
        '<input id="v_medico" value="'+esc(v.medico)+'" placeholder="Dr. Puig, dentista…"></div>'+
      '<div class="campo"><label class="lbl" for="v_motivo">Motivo</label>'+
        '<input id="v_motivo" value="'+esc(v.motivo)+'" placeholder="Revisión, gripe…"></div>'+
    '</div>'+
    '<p class="nota" style="margin:16px 0 8px">Lo que pagas</p>'+
    '<div class="rejilla3">'+
      '<div class="campo"><label class="lbl" for="v_cons">Consulta (€)</label>'+
        '<input type="number" id="v_cons" min="0" step="0.01" value="'+esc(v.consulta||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="v_medi">Medicinas (€)</label>'+
        '<input type="number" id="v_medi" min="0" step="0.01" value="'+esc(v.medicinas||"")+'"></div>'+
    '</div>'+
    /* El número del recibo de la farmacia es lo que piden luego para
       devolverte el dinero, así que se guarda con la visita. */
    '<div class="rejilla" style="margin-top:10px">'+
      '<div class="campo"><label class="lbl" for="v_farmacia">Farmacia</label>'+
        '<input id="v_farmacia" value="'+esc(v.farmacia||"")+'" placeholder="Farmàcia Pyrénées…"></div>'+
      '<div class="campo"><label class="lbl" for="v_recibo">Nº de recibo</label>'+
        '<input id="v_recibo" class="mono" value="'+esc(v.recibo||"")+'" placeholder="A-2026/0134"></div>'+
    '</div>'+
    '<p class="nota" style="margin:8px 0 0">El número del recibo es lo que te van a pedir '+
    'para devolverte lo de las medicinas.</p>'+
    '<p class="nota" style="margin:16px 0 8px">Lo que te devuelven</p>'+
    '<div class="rejilla3">'+
      '<div class="campo"><label class="lbl" for="v_cass">CASS (€)</label>'+
        '<input type="number" id="v_cass" min="0" step="0.01" value="'+esc(v.cass||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="v_seg">Seguro complementario (€)</label>'+
        '<input type="number" id="v_seg" min="0" step="0.01" value="'+esc(v.seguro||"")+'"></div>'+
    '</div>'+
    '<label class="marca-check" style="margin-top:14px">'+
      '<input type="checkbox" id="v_cobrado"'+(v.cobrado?" checked":"")+'>'+
      '<span>Ya me lo han devuelto todo</span></label>'+
    '<div id="v_calculo" class="nota" style="margin-top:12px"></div>',
    function(){
      v.fecha=valor("v_fecha")||hoyISO();
      v.persona=valor("v_persona");
      v.medico=valor("v_medico");
      v.motivo=valor("v_motivo");
      v.consulta=numero("v_cons");
      v.medicinas=numero("v_medi");
      v.farmacia=valor("v_farmacia");
      v.recibo=valor("v_recibo");
      v.cass=numero("v_cass");
      v.seguro=numero("v_seg");
      v.cobrado=document.getElementById("v_cobrado").checked;
      if(!id) libro.medico.push(v);
      guardar(); pintar(); avisar(id?"Visita actualizada":"Visita anotada");
    });

  /* Cuenta en vivo de lo que queda por recuperar */
  function recalcular(){
    var queda=r2(numero("v_cons")+numero("v_medi")-numero("v_cass")-numero("v_seg"));
    document.getElementById("v_calculo").innerHTML=
      queda>0.004 ? 'Te quedarían por recuperar <strong>'+eur(queda)+'</strong>.'
    : queda<-0.004 ? 'Te han devuelto <strong>'+eur(Math.abs(queda))+'</strong> de más.'
    : 'Cuadra: no queda nada pendiente.';
  }
  ["v_cons","v_medi","v_cass","v_seg"].forEach(function(id2){
    document.getElementById(id2).addEventListener("input", recalcular);
  });
  recalcular();
}

/* ══════════════════════════════════════════════════════════════
   COCHE
   ══════════════════════════════════════════════════════════════ */
function verCoche(main){
  var c=libro.coche||{};
  var repos=(libro.repostajes||[]).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  var revs=(libro.revisiones||[]).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  var anio=ui.mes.slice(0,4);
  var gasolinaAno=suma((libro.repostajes||[]).filter(function(r){ return (r.fecha||"").slice(0,4)===anio; }), "importe");
  var tallerAno=r2((libro.revisiones||[]).filter(function(r){ return (r.fecha||"").slice(0,4)===anio; })
                    .reduce(function(s,r){ return s+costeRevision(r); },0));

  function chapaFecha(fecha){
    var d=diasHasta(fecha);
    if(d===null) return '<span class="chapa neutra">sin fecha</span>';
    if(d<0)      return '<span class="chapa malo">caducó hace '+Math.abs(d)+' d</span>';
    if(d<=45)    return '<span class="chapa aviso">quedan '+d+' d</span>';
    return '<span class="chapa ok">quedan '+d+' d</span>';
  }

  main.innerHTML=
    cabecera("Coche",
      "El seguro y la ITV con sus fechas, la gasolina y lo que se lleva el taller.",
      '<button class="btn" id="editCoche">Datos del coche</button>'+
      '<button class="btn" id="nuevoRepo">Anotar gasolina</button>'+
      '<button class="btn fuerte" id="nuevaRev">Anotar taller</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Gasolina '+anio+'</div><div class="v acento">'+eur(gasolinaAno)+'</div>'+
        '<div class="n">'+((libro.repostajes||[]).filter(function(r){return (r.fecha||"").slice(0,4)===anio;}).length)+' repostajes</div></div>'+
      '<div class="cifra"><div class="k">Taller '+anio+'</div><div class="v">'+eur(tallerAno)+'</div>'+
        '<div class="n">piezas y mano de obra</div></div>'+
      '<div class="cifra"><div class="k">Seguro</div><div class="v" style="font-size:15px">'+
        (c.seguro&&c.seguro.caduca?esc(dmy(c.seguro.caduca)):"—")+'</div>'+
        '<div class="n">'+chapaFecha(c.seguro&&c.seguro.caduca)+'</div></div>'+
      '<div class="cifra"><div class="k">ITV</div><div class="v" style="font-size:15px">'+
        (c.itv&&c.itv.caduca?esc(dmy(c.itv.caduca)):"—")+'</div>'+
        '<div class="n">'+chapaFecha(c.itv&&c.itv.caduca)+'</div></div>'+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px"><div class="tarjeta-cab">'+
      '<h2>Taller</h2><span class="pista">Cada visita con sus piezas y la mano de obra</span></div>'+
      '<div class="tabla-caja" id="tablaRev"></div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Gasolina</h2></div>'+
      '<div class="tabla-caja" id="tablaRepo"></div></div>';

  document.getElementById("editCoche").addEventListener("click", editarCoche);
  document.getElementById("nuevoRepo").addEventListener("click", function(){ editarRepostaje(null); });
  document.getElementById("nuevaRev").addEventListener("click", function(){ editarRevision(null); });

  var cajaRev=document.getElementById("tablaRev");
  cajaRev.innerHTML = !revs.length
    ? '<div class="vacio">Ninguna visita al taller anotada.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Taller</th><th>Motivo</th><th>Piezas</th>'+
      '<th class="num">Piezas</th><th class="num">Mano de obra</th><th class="num">Total</th><th></th></tr></thead><tbody>'+
      revs.map(function(r){
        var piezas=(r.piezas||[]);
        var totalPiezas=r2(piezas.reduce(function(s,p){ return s+(+p.precio||0); },0));
        return "<tr><td>"+esc(dmy(r.fecha))+"</td><td>"+esc(r.taller||"—")+"</td>"+
          "<td>"+esc(r.motivo||"—")+"</td>"+
          '<td style="font-size:12.5px;color:var(--muted)">'+
            (piezas.length?esc(piezas.map(function(p){ return p.nombre; }).join(", ")):"—")+"</td>"+
          '<td class="num">'+eur(totalPiezas)+"</td>"+
          '<td class="num">'+eur(r.manoObra)+"</td>"+
          '<td class="num"><strong>'+eur(costeRevision(r))+"</strong></td>"+
          '<td><div class="acciones-fila">'+
            '<button class="btn suave sm" data-redit="'+r.id+'">Editar</button>'+
            '<button class="btn suave sm malo" data-rdel="'+r.id+'">Borrar</button></div></td></tr>';
      }).join("")+"</tbody></table>";

  cajaRev.querySelectorAll("[data-redit]").forEach(function(b){
    b.addEventListener("click", function(){ editarRevision(b.getAttribute("data-redit")); });
  });
  cajaRev.querySelectorAll("[data-rdel]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmar("Borrar visita al taller", '<p style="margin:0">No se puede deshacer.</p>', function(){
        libro.revisiones=(libro.revisiones||[]).filter(function(r){ return r.id!==b.getAttribute("data-rdel"); });
        guardar(); pintar(); avisar("Borrado");
      }, {aceptar:"Borrar", malo:true});
    });
  });

  var cajaRepo=document.getElementById("tablaRepo");
  cajaRepo.innerHTML = !repos.length
    ? '<div class="vacio">Sin repostajes anotados.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Estación</th><th class="num">Litros</th>'+
      '<th class="num">Importe</th><th class="num">€/litro</th><th class="num">Km</th><th></th></tr></thead><tbody>'+
      repos.map(function(r){
        var porLitro=(+r.litros>0)?r2((+r.importe||0)/(+r.litros)):null;
        return "<tr><td>"+esc(dmy(r.fecha))+"</td><td>"+esc(r.estacion||"—")+"</td>"+
          '<td class="num">'+num(r.litros,2)+"</td>"+
          '<td class="num"><strong>'+eur(r.importe)+"</strong></td>"+
          '<td class="num">'+(porLitro!=null?num(porLitro,3)+" €":"—")+"</td>"+
          '<td class="num">'+(r.km?num(r.km):"—")+"</td>"+
          '<td><div class="acciones-fila">'+
            '<button class="btn suave sm" data-gedit="'+r.id+'">Editar</button>'+
            '<button class="btn suave sm malo" data-gdel="'+r.id+'">Borrar</button></div></td></tr>';
      }).join("")+"</tbody></table>";

  cajaRepo.querySelectorAll("[data-gedit]").forEach(function(b){
    b.addEventListener("click", function(){ editarRepostaje(b.getAttribute("data-gedit")); });
  });
  cajaRepo.querySelectorAll("[data-gdel]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmar("Borrar repostaje", '<p style="margin:0">No se puede deshacer.</p>', function(){
        libro.repostajes=(libro.repostajes||[]).filter(function(r){ return r.id!==b.getAttribute("data-gdel"); });
        guardar(); pintar(); avisar("Borrado");
      }, {aceptar:"Borrar", malo:true});
    });
  });
}

function editarCoche(){
  var c=libro.coche||{seguro:{},itv:{}};
  var s=c.seguro||{}, i=c.itv||{};
  abrirVentana("Datos del coche",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="k_modelo">Modelo</label>'+
        '<input id="k_modelo" value="'+esc(c.modelo||"")+'" placeholder="Seat León"></div>'+
      '<div class="campo"><label class="lbl" for="k_mat">Matrícula</label>'+
        '<input id="k_mat" class="mono" value="'+esc(c.matricula||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:16px 0 8px">Seguro</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="k_comp">Compañía</label>'+
        '<input id="k_comp" value="'+esc(s.compania||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="k_pol">Nº de póliza</label>'+
        '<input id="k_pol" class="mono" value="'+esc(s.poliza||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="k_prima">Prima anual (€)</label>'+
        '<input type="number" id="k_prima" min="0" step="0.01" value="'+esc(s.prima||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="k_scad">Caduca el</label>'+
        '<input type="date" id="k_scad" value="'+esc(s.caduca||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:16px 0 8px">ITV</p>'+
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="k_icad">Caduca el</label>'+
        '<input type="date" id="k_icad" value="'+esc(i.caduca||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="k_icos">Lo que costó (€)</label>'+
        '<input type="number" id="k_icos" min="0" step="0.01" value="'+esc(i.coste||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin-top:14px">Con las fechas puestas, el resumen te avisa 45 días antes.</p>',
    function(){
      libro.coche={
        modelo:valor("k_modelo"), matricula:valor("k_mat"),
        seguro:{compania:valor("k_comp"), poliza:valor("k_pol"),
                prima:numero("k_prima"), caduca:valor("k_scad")},
        itv:{caduca:valor("k_icad"), coste:numero("k_icos")}
      };
      guardar(); pintar(); avisar("Datos del coche guardados");
    });
}

function editarRepostaje(id){
  var r=id?(libro.repostajes||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:hoyISO(), litros:0, importe:0, km:0, estacion:""};
  abrirVentana(id?"Editar repostaje":"Anotar gasolina",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="g_fecha">Fecha</label>'+
        '<input type="date" id="g_fecha" value="'+esc(r.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="g_est">Estación</label>'+
        '<input id="g_est" value="'+esc(r.estacion||"")+'" placeholder="Repsol, Andorra…"></div>'+
      '<div class="campo"><label class="lbl" for="g_lit">Litros</label>'+
        '<input type="number" id="g_lit" min="0" step="0.01" value="'+esc(r.litros||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="g_imp">Importe (€)</label>'+
        '<input type="number" id="g_imp" min="0" step="0.01" value="'+esc(r.importe||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="g_km">Kilómetros</label>'+
        '<input type="number" id="g_km" min="0" step="1" value="'+esc(r.km||"")+'"></div>'+
    '</div>',
    function(){
      r.fecha=valor("g_fecha")||hoyISO();
      r.estacion=valor("g_est");
      r.litros=numero("g_lit"); r.importe=numero("g_imp"); r.km=numero("g_km");
      if(!r.importe){ avisar("Pon el importe.", true); return true; }
      if(!id) libro.repostajes.push(r);
      guardar(); pintar(); avisar(id?"Repostaje actualizado":"Repostaje anotado");
    });
}

function editarRevision(id){
  var r=id?(libro.revisiones||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:hoyISO(), taller:"", motivo:"", piezas:[], manoObra:0, km:0};
  abrirVentana(id?"Editar visita al taller":"Anotar visita al taller",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="t_fecha">Fecha</label>'+
        '<input type="date" id="t_fecha" value="'+esc(r.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="t_taller">Taller</label>'+
        '<input id="t_taller" value="'+esc(r.taller||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="t_motivo">Motivo</label>'+
        '<input id="t_motivo" value="'+esc(r.motivo||"")+'" placeholder="Revisión de los 60.000"></div>'+
      '<div class="campo"><label class="lbl" for="t_km">Kilómetros</label>'+
        '<input type="number" id="t_km" min="0" step="1" value="'+esc(r.km||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:16px 0 8px">Piezas que se han cambiado</p>'+
    '<div id="piezas"></div>'+
    '<button class="btn sm" id="masPieza" style="margin-top:8px">+ Añadir pieza</button>'+
    '<div class="campo" style="margin-top:16px;max-width:220px">'+
      '<label class="lbl" for="t_mano">Mano de obra (€)</label>'+
      '<input type="number" id="t_mano" min="0" step="0.01" value="'+esc(r.manoObra||"")+'"></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;'+
    'padding-top:12px;border-top:1px solid var(--linea)">'+
      '<span class="lbl">Total de la factura</span><strong id="t_total" style="font-size:18px">0,00 €</strong></div>',
    function(){
      var piezas=[];
      document.querySelectorAll("#piezas .pieza").forEach(function(f){
        var n=f.querySelector(".pz_nom").value.trim();
        var p=+f.querySelector(".pz_pre").value||0;
        if(n) piezas.push({nombre:n, precio:p});
      });
      r.fecha=valor("t_fecha")||hoyISO();
      r.taller=valor("t_taller"); r.motivo=valor("t_motivo");
      r.km=numero("t_km"); r.manoObra=numero("t_mano");
      r.piezas=piezas;
      if(!id) libro.revisiones.push(r);
      guardar(); pintar(); avisar(id?"Actualizado":"Visita al taller anotada: "+eur(costeRevision(r)));
    });

  var caja=document.getElementById("piezas");
  function totalTaller(){
    var t=numero("t_mano");
    caja.querySelectorAll(".pieza").forEach(function(f){ t+=+f.querySelector(".pz_pre").value||0; });
    document.getElementById("t_total").textContent=eur(r2(t));
  }
  function añadirPieza(p){
    p=p||{nombre:"", precio:""};
    var f=document.createElement("div");
    f.className="pieza";
    f.style.cssText="display:grid;grid-template-columns:minmax(120px,2fr) 110px auto;gap:8px;margin-top:8px;align-items:end";
    f.innerHTML='<div class="campo"><input class="pz_nom" value="'+esc(p.nombre)+'" placeholder="Filtro de aceite"></div>'+
                '<div class="campo"><input type="number" class="pz_pre" min="0" step="0.01" value="'+esc(p.precio)+'" placeholder="0,00"></div>'+
                '<button class="btn suave sm malo" title="Quitar">✕</button>';
    caja.appendChild(f);
    f.querySelector("button").addEventListener("click", function(){ f.remove(); totalTaller(); });
    f.querySelector(".pz_pre").addEventListener("input", totalTaller);
  }
  (r.piezas||[]).forEach(añadirPieza);
  if(!(r.piezas||[]).length) añadirPieza();
  document.getElementById("masPieza").addEventListener("click", function(){ añadirPieza(); });
  document.getElementById("t_mano").addEventListener("input", totalTaller);
  totalTaller();
}

/* ══════════════════════════════════════════════════════════════
   GASTOS FIJOS
   ══════════════════════════════════════════════════════════════ */
var TIPOS_FIJOS=["Luz","Agua","Internet","Móvil","Teléfono fijo","Seguro del piso",
                 "Comunidad","Alquiler o hipoteca","Gimnasio","Otro"];

function verFijos(main){
  var mes=delMes(libro.fijos, ui.mes).slice().sort(function(a,b){ return (a.concepto||"").localeCompare(b.concepto||""); });
  var total=suma(mes,"importe");
  /* Comparación con el mes anterior, que es lo que de verdad interesa */
  var d=new Date(ui.mes+"-01T12:00:00"); d.setMonth(d.getMonth()-1);
  var mesAnterior=d.getFullYear()+"-"+p2(d.getMonth()+1);
  var anterior=suma(delMes(libro.fijos, mesAnterior),"importe");
  var dif=r2(total-anterior);

  main.innerHTML=
    cabecera("Gastos fijos",
      "Los recibos de cada mes: luz, agua, internet, móviles, seguros… Comparados con el mes anterior.",
      selectorMes("f_mes")+'<button class="btn fuerte" id="nuevoFijo">Anotar recibo</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Total del mes</div><div class="v acento">'+eur(total)+'</div>'+
        '<div class="n">'+mes.length+' recibos</div></div>'+
      '<div class="cifra"><div class="k">Mes anterior</div><div class="v">'+eur(anterior)+'</div>'+
        '<div class="n">'+esc(mesLargo(mesAnterior))+'</div></div>'+
      '<div class="cifra"><div class="k">Diferencia</div>'+
        '<div class="v" style="color:'+(dif>0?"var(--malo)":dif<0?"var(--ok)":"inherit")+'">'+
        (dif>0?"+":"")+eur(dif)+'</div>'+
        '<div class="n">'+(anterior>0?(dif>0?"más caro":dif<0?"más barato":"igual"):"sin comparación")+'</div></div>'+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Recibos de '+esc(mesLargo(ui.mes))+'</h2>'+
      '<span class="pista">Pulsa «repetir» para copiarlo al mes siguiente</span></div>'+
      '<div class="tabla-caja" id="tablaFijos"></div></div>';

  engancharMes("f_mes");
  document.getElementById("nuevoFijo").addEventListener("click", function(){ editarFijo(null); });

  var caja=document.getElementById("tablaFijos");
  if(!mes.length){
    caja.innerHTML='<div class="vacio"><strong>Sin recibos en '+esc(mesLargo(ui.mes))+'</strong>'+
      'Anota el primero, o repite los del mes pasado desde ahí.</div>';
    return;
  }
  caja.innerHTML='<table><thead><tr><th>Concepto</th><th>Tipo</th><th>Fecha</th>'+
    '<th class="num">Importe</th><th></th></tr></thead><tbody>'+
    mes.map(function(f){
      return "<tr><td><strong>"+esc(f.concepto)+"</strong></td>"+
        "<td>"+esc(f.tipo||"—")+"</td><td>"+esc(dmy(f.fecha))+"</td>"+
        '<td class="num">'+eur(f.importe)+"</td>"+
        '<td><div class="acciones-fila">'+
          '<button class="btn suave sm" data-frep="'+f.id+'" title="Copiar al mes siguiente">Repetir</button>'+
          '<button class="btn suave sm" data-fedit="'+f.id+'">Editar</button>'+
          '<button class="btn suave sm malo" data-fdel="'+f.id+'">Borrar</button></div></td></tr>';
    }).join("")+
    '</tbody><tfoot><tr><td colspan="3">'+mes.length+' recibos</td>'+
    '<td class="num">'+eur(total)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-fedit]").forEach(function(b){
    b.addEventListener("click", function(){ editarFijo(b.getAttribute("data-fedit")); });
  });
  caja.querySelectorAll("[data-frep]").forEach(function(b){
    b.addEventListener("click", function(){ repetirFijo(b.getAttribute("data-frep")); });
  });
  caja.querySelectorAll("[data-fdel]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmar("Borrar recibo", '<p style="margin:0">No se puede deshacer.</p>', function(){
        libro.fijos=(libro.fijos||[]).filter(function(f){ return f.id!==b.getAttribute("data-fdel"); });
        guardar(); pintar(); avisar("Recibo borrado");
      }, {aceptar:"Borrar", malo:true});
    });
  });
}

function editarFijo(id){
  var f=id?(libro.fijos||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:ui.mes+"-01", concepto:"", tipo:"Luz", importe:0};
  abrirVentana(id?"Editar recibo":"Anotar recibo",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="fx_tipo">Tipo</label><select id="fx_tipo">'+
        TIPOS_FIJOS.map(function(t){ return '<option'+(f.tipo===t?" selected":"")+">"+esc(t)+"</option>"; }).join("")+
      '</select></div>'+
      '<div class="campo"><label class="lbl" for="fx_conc">Concepto</label>'+
        '<input id="fx_conc" value="'+esc(f.concepto)+'" placeholder="FEDA, Andorra Telecom…"></div>'+
      '<div class="campo"><label class="lbl" for="fx_fecha">Fecha</label>'+
        '<input type="date" id="fx_fecha" value="'+esc(f.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="fx_imp">Importe (€)</label>'+
        '<input type="number" id="fx_imp" min="0" step="0.01" value="'+esc(f.importe||"")+'"></div>'+
    '</div>',
    function(){
      f.tipo=valor("fx_tipo");
      f.concepto=valor("fx_conc")||f.tipo;
      f.fecha=valor("fx_fecha")||hoyISO();
      f.importe=numero("fx_imp");
      if(!f.importe){ avisar("Pon el importe.", true); return true; }
      if(!id) libro.fijos.push(f);
      guardar(); pintar(); avisar(id?"Recibo actualizado":"Recibo anotado");
    });
}

function repetirFijo(id){
  var f=(libro.fijos||[]).filter(function(x){return x.id===id;})[0];
  if(!f) return;
  var d=new Date(f.fecha+"T12:00:00"); d.setMonth(d.getMonth()+1);
  var nueva=d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  var copia={id:uid(), fecha:nueva, concepto:f.concepto, tipo:f.tipo, importe:f.importe};
  libro.fijos.push(copia);
  guardar();
  ui.mes=nueva.slice(0,7);
  pintar();
  avisar("Copiado a "+mesLargo(ui.mes)+". Ajusta el importe si cambió.");
}

/* ══════════════════════════════════════════════════════════════
   VIAJES
   ══════════════════════════════════════════════════════════════ */
var TIPOS_VIAJE=["Hotel","Restaurante","Comida","Bebida","Gasolina","Entradas","Transporte","Otro"];

function verViajes(main){
  var viajes=(libro.viajes||[]).slice().sort(function(a,b){ return (b.desde||"").localeCompare(a.desde||""); });

  if(ui.viaje){
    var v=viajes.filter(function(x){ return x.id===ui.viaje; })[0];
    if(v){ verUnViaje(main, v); return; }
    ui.viaje=null;
  }

  main.innerHTML=
    cabecera("Viajes",
      "Cada viaje con lo suyo: hoteles, restaurantes, gasolina… Así sabes lo que costó de verdad.",
      '<button class="btn fuerte" id="nuevoViaje">Nuevo viaje</button>')+
    '<div class="tarjeta"><div class="tabla-caja" id="tablaViajes"></div></div>';

  document.getElementById("nuevoViaje").addEventListener("click", function(){ editarViaje(null); });

  var caja=document.getElementById("tablaViajes");
  if(!viajes.length){
    caja.innerHTML='<div class="vacio"><strong>Ningún viaje anotado</strong>'+
      'Crea uno y ve metiendo los gastos según pasen.</div>';
    return;
  }
  caja.innerHTML='<table><thead><tr><th>Viaje</th><th>Fechas</th><th class="num">Gastos</th>'+
    '<th class="num">Total</th><th></th></tr></thead><tbody>'+
    viajes.map(function(v){
      return '<tr><td><strong>'+esc(v.nombre)+"</strong></td>"+
        "<td>"+(v.desde?esc(dmy(v.desde)):"—")+(v.hasta?" – "+esc(dmy(v.hasta)):"")+"</td>"+
        '<td class="num">'+((v.gastos||[]).length)+"</td>"+
        '<td class="num"><strong>'+eur(totalViaje(v))+"</strong></td>"+
        '<td><div class="acciones-fila">'+
          '<button class="btn sm" data-vabrir="'+v.id+'">Abrir</button>'+
          '<button class="btn suave sm" data-vedit="'+v.id+'">Editar</button>'+
          '<button class="btn suave sm malo" data-vdel="'+v.id+'">Borrar</button></div></td></tr>';
    }).join("")+"</tbody></table>";

  caja.querySelectorAll("[data-vabrir]").forEach(function(b){
    b.addEventListener("click", function(){ ui.viaje=b.getAttribute("data-vabrir"); pintar(); });
  });
  caja.querySelectorAll("[data-vedit]").forEach(function(b){
    b.addEventListener("click", function(){ editarViaje(b.getAttribute("data-vedit")); });
  });
  caja.querySelectorAll("[data-vdel]").forEach(function(b){
    b.addEventListener("click", function(){
      var id=b.getAttribute("data-vdel");
      var v=(libro.viajes||[]).filter(function(x){return x.id===id;})[0];
      confirmar("Borrar viaje",
        '<p style="margin:0">Se borra <strong>'+esc(v?v.nombre:"")+'</strong> con sus '+
        ((v&&v.gastos||[]).length)+' gastos.</p>', function(){
        libro.viajes=(libro.viajes||[]).filter(function(x){ return x.id!==id; });
        guardar(); pintar(); avisar("Viaje borrado");
      }, {aceptar:"Borrar", malo:true});
    });
  });
}

function verUnViaje(main, v){
  var gastos=(v.gastos||[]).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  var porTipo={};
  gastos.forEach(function(g){ porTipo[g.tipo]=r2((porTipo[g.tipo]||0)+(+g.importe||0)); });
  var total=totalViaje(v);

  main.innerHTML=
    cabecera(v.nombre,
      (v.desde?dmy(v.desde):"")+(v.hasta?" – "+dmy(v.hasta):"")+" · "+eur(total)+" en total",
      '<button class="btn" id="volverViajes">← Todos los viajes</button>'+
      '<button class="btn fuerte" id="nuevoGasto">Añadir gasto</button>')+
    '<div class="cifras">'+
      Object.keys(porTipo).sort(function(a,b){ return porTipo[b]-porTipo[a]; }).slice(0,5).map(function(t){
        return '<div class="cifra"><div class="k">'+esc(t)+'</div><div class="v">'+eur(porTipo[t])+'</div>'+
               '<div class="n">'+num(total>0?porTipo[t]/total*100:0,0)+'% del viaje</div></div>';
      }).join("")+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Gastos del viaje</h2></div>'+
      '<div class="tabla-caja" id="tablaGastosViaje"></div></div>';

  document.getElementById("volverViajes").addEventListener("click", function(){ ui.viaje=null; pintar(); });
  document.getElementById("nuevoGasto").addEventListener("click", function(){ editarGastoViaje(v, null); });

  var caja=document.getElementById("tablaGastosViaje");
  caja.innerHTML = !gastos.length
    ? '<div class="vacio">Aún no hay gastos en este viaje.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="num">Importe</th><th></th></tr></thead><tbody>'+
      gastos.map(function(g){
        return "<tr><td>"+esc(dmy(g.fecha))+"</td><td>"+esc(g.tipo)+"</td>"+
          "<td>"+esc(g.concepto||"—")+'</td><td class="num">'+eur(g.importe)+"</td>"+
          '<td><div class="acciones-fila">'+
            '<button class="btn suave sm" data-ged="'+g.id+'">Editar</button>'+
            '<button class="btn suave sm malo" data-gde="'+g.id+'">Borrar</button></div></td></tr>';
      }).join("")+
      '</tbody><tfoot><tr><td colspan="3">'+gastos.length+' gastos</td>'+
      '<td class="num">'+eur(total)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-ged]").forEach(function(b){
    b.addEventListener("click", function(){ editarGastoViaje(v, b.getAttribute("data-ged")); });
  });
  caja.querySelectorAll("[data-gde]").forEach(function(b){
    b.addEventListener("click", function(){
      v.gastos=(v.gastos||[]).filter(function(g){ return g.id!==b.getAttribute("data-gde"); });
      guardar(); pintar(); avisar("Gasto borrado");
    });
  });
}

function editarViaje(id){
  var v=id?(libro.viajes||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), nombre:"", desde:hoyISO(), hasta:"", gastos:[]};
  abrirVentana(id?"Editar viaje":"Nuevo viaje",
    '<div class="rejilla">'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="vj_nom">Nombre</label>'+
        '<input id="vj_nom" value="'+esc(v.nombre)+'" placeholder="Portugal, julio"></div>'+
      '<div class="campo"><label class="lbl" for="vj_des">Desde</label>'+
        '<input type="date" id="vj_des" value="'+esc(v.desde||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="vj_has">Hasta</label>'+
        '<input type="date" id="vj_has" value="'+esc(v.hasta||"")+'"></div>'+
    '</div>',
    function(){
      var n=valor("vj_nom");
      if(!n){ avisar("Ponle nombre al viaje.", true); return true; }
      v.nombre=n; v.desde=valor("vj_des"); v.hasta=valor("vj_has");
      if(!id){ libro.viajes.push(v); ui.viaje=v.id; }
      guardar(); pintar(); avisar(id?"Viaje actualizado":"Viaje creado");
    });
}

function editarGastoViaje(v, id){
  var g=id?(v.gastos||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:v.desde||hoyISO(), tipo:"Restaurante", concepto:"", importe:0};
  abrirVentana(id?"Editar gasto":"Añadir gasto al viaje",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="gv_fecha">Fecha</label>'+
        '<input type="date" id="gv_fecha" value="'+esc(g.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="gv_tipo">Tipo</label><select id="gv_tipo">'+
        TIPOS_VIAJE.map(function(t){ return '<option'+(g.tipo===t?" selected":"")+">"+esc(t)+"</option>"; }).join("")+
      '</select></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="gv_conc">Concepto</label>'+
        '<input id="gv_conc" value="'+esc(g.concepto||"")+'" placeholder="Hotel Mar, cena del sábado…"></div>'+
      '<div class="campo"><label class="lbl" for="gv_imp">Importe (€)</label>'+
        '<input type="number" id="gv_imp" min="0" step="0.01" value="'+esc(g.importe||"")+'"></div>'+
    '</div>',
    function(){
      g.fecha=valor("gv_fecha")||hoyISO();
      g.tipo=valor("gv_tipo"); g.concepto=valor("gv_conc"); g.importe=numero("gv_imp");
      if(!g.importe){ avisar("Pon el importe.", true); return true; }
      if(!id){ v.gastos=v.gastos||[]; v.gastos.push(g); }
      guardar(); pintar(); avisar(id?"Gasto actualizado":"Gasto añadido");
    });
}

/* ══════════════════════════════════════════════════════════════
   OTROS
   ══════════════════════════════════════════════════════════════ */
var TIPOS_OTROS=["Gimnasio","Negocio","Ropa","Ocio","Regalos","Casa","Otro"];

function verOtros(main){
  var mes=delMes(libro.otros, ui.mes).slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); });
  var total=suma(mes,"importe");
  var porTipo={};
  mes.forEach(function(o){ porTipo[o.tipo]=r2((porTipo[o.tipo]||0)+(+o.importe||0)); });

  main.innerHTML=
    cabecera("Otros gastos",
      "Gimnasio, negocio y todo lo que no cabe en los demás apartados.",
      selectorMes("o_mes")+'<button class="btn fuerte" id="nuevoOtro">Anotar gasto</button>')+
    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Total del mes</div><div class="v acento">'+eur(total)+'</div>'+
        '<div class="n">'+mes.length+' apuntes</div></div>'+
      Object.keys(porTipo).sort(function(a,b){ return porTipo[b]-porTipo[a]; }).slice(0,4).map(function(t){
        return '<div class="cifra"><div class="k">'+esc(t)+'</div><div class="v">'+eur(porTipo[t])+'</div></div>';
      }).join("")+
    '</div>'+
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>'+esc(mesLargo(ui.mes))+'</h2></div>'+
      '<div class="tabla-caja" id="tablaOtros"></div></div>';

  engancharMes("o_mes");
  document.getElementById("nuevoOtro").addEventListener("click", function(){ editarOtro(null); });

  var caja=document.getElementById("tablaOtros");
  caja.innerHTML = !mes.length
    ? '<div class="vacio">Sin gastos anotados en '+esc(mesLargo(ui.mes))+'.</div>'
    : '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="num">Importe</th><th></th></tr></thead><tbody>'+
      mes.map(function(o){
        return "<tr><td>"+esc(dmy(o.fecha))+"</td><td>"+esc(o.tipo)+"</td>"+
          "<td>"+esc(o.concepto||"—")+'</td><td class="num">'+eur(o.importe)+"</td>"+
          '<td><div class="acciones-fila">'+
            '<button class="btn suave sm" data-oedit="'+o.id+'">Editar</button>'+
            '<button class="btn suave sm malo" data-odel="'+o.id+'">Borrar</button></div></td></tr>';
      }).join("")+
      '</tbody><tfoot><tr><td colspan="3">'+mes.length+' apuntes</td>'+
      '<td class="num">'+eur(total)+'</td><td></td></tr></tfoot></table>';

  caja.querySelectorAll("[data-oedit]").forEach(function(b){
    b.addEventListener("click", function(){ editarOtro(b.getAttribute("data-oedit")); });
  });
  caja.querySelectorAll("[data-odel]").forEach(function(b){
    b.addEventListener("click", function(){
      libro.otros=(libro.otros||[]).filter(function(o){ return o.id!==b.getAttribute("data-odel"); });
      guardar(); pintar(); avisar("Gasto borrado");
    });
  });
}

function editarOtro(id){
  var o=id?(libro.otros||[]).filter(function(x){return x.id===id;})[0]
          :{id:uid(), fecha:hoyISO(), tipo:"Gimnasio", concepto:"", importe:0};
  abrirVentana(id?"Editar gasto":"Anotar gasto",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="ot_fecha">Fecha</label>'+
        '<input type="date" id="ot_fecha" value="'+esc(o.fecha)+'"></div>'+
      '<div class="campo"><label class="lbl" for="ot_tipo">Tipo</label><select id="ot_tipo">'+
        TIPOS_OTROS.map(function(t){ return '<option'+(o.tipo===t?" selected":"")+">"+esc(t)+"</option>"; }).join("")+
      '</select></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="ot_conc">Concepto</label>'+
        '<input id="ot_conc" value="'+esc(o.concepto||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="ot_imp">Importe (€)</label>'+
        '<input type="number" id="ot_imp" min="0" step="0.01" value="'+esc(o.importe||"")+'"></div>'+
    '</div>',
    function(){
      o.fecha=valor("ot_fecha")||hoyISO();
      o.tipo=valor("ot_tipo"); o.concepto=valor("ot_conc"); o.importe=numero("ot_imp");
      if(!o.importe){ avisar("Pon el importe.", true); return true; }
      if(!id) libro.otros.push(o);
      guardar(); pintar(); avisar(id?"Gasto actualizado":"Gasto anotado");
    });
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
