/* ══════════════════════════════════════════════════════════════════
   PEDIDOS — la lista de precios de los proveedores, y el pedido
   ══════════════════════════════════════════════════════════════════
   Viene de una hoja de cálculo con una columna por cada cosa: precio,
   IGI, neto, unidades por caja, precio de la caja, precio del pedido en
   cajas, precio del pedido en unidades… La mitad de esas columnas eran
   cuentas, y las cuentas las hace la app. Aquí sólo se guarda lo que
   alguien tiene que escribir:

     producto · proveedor · precio · fecha de ese precio · uds. por caja

   Todo lo demás sale solo: el neto es el precio con su IGI, el precio
   de la caja es el neto por las unidades que trae, y el del pedido es
   lo que se pida por lo que valga.

   Lo que la hoja no podía hacer y aquí es el motivo de todo: el MISMO
   producto lo venden varios proveedores a precios distintos —hay 62
   así—, y al lado del nombre se ve cuál es el más barato hoy. Eso en
   una hoja de 573 filas ordenada por nombre no se ve; aquí sí.

   El buscador es la puerta de entrada: se escribe media palabra y
   quedan cuatro fichas en pantalla. Sin él, esto es un listín.

   La verdura y la carne llegaron a tener pantalla propia, «Cada día»,
   con la lista entera a la vista. Se quitó: con el buscador y la chapa
   «Del día» de aquí se llega igual, y una pantalla menos es una pantalla
   menos que mantener. Los productos siguen todos, marcados como del día.

   Todo se puede pedir de cuatro maneras —cajas, kilos, litros y
   unidades— y las cuatro están en todos los artículos. La unidad que
   lleva escrita cada producto ya no manda: dice a qué se refiere el
   precio y cuál es la casilla que se rellena sola al apuntar.

   Hubo un «stock semanal» —lo que quieres tener de cada cosa, y un
   botón que lo volcaba entero en el pedido—. Se quitó. Lo que sí se
   quedó es lo que ya tuviera apuntado cada producto: está en el dato,
   dormido, por si algún día vuelve.

   Los datos los guarda sync.js en el repositorio privado, que los
   precios de los proveedores no son cosa de nadie más.
   ══════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var CLAVE = "pedidos.libro.v1";

function p2(n){ return (n<10?"0":"")+n; }
function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function libroVacio(){
  return {
    v:1, actualizado:new Date().toISOString(),
    ajustes:{ nombre:"", conImportes:false, mesesViejo:24 },
    productos:[],     /* {id, seccion, nombre, proveedor, precio, fecha, igi, udsCaja} */
    proveedores:{},   /* "INTERPESCA": {movil, telefono, contacto, nota} */
    pedido:{},        /* id del producto -> {cajas, kg, litros, uds} */
    enviados:[]       /* {id, fecha, proveedor, lineas:[{nombre,pedido,texto,importe}], total} */
  };
}

var libro = libroVacio();
var ui = { vista:"precios", q:"", seccion:"", soloPedido:false, soloBaratos:false,
           qApunte:"", prov:null, qTel:"" };

/* ── Dinero, fechas y texto ───────────────────────────────────── */
function r2(n){ return Math.round(((+n||0)+Number.EPSILON)*100)/100; }
function eur(n){ return (+n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
function num(n,d){ d=d||0; return (+n||0).toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function dmy(iso){ if(!iso) return ""; var a=String(iso).split("-"); return a.length===3?a[2]+"/"+a[1]+"/"+a[0]:iso; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function plural(n, uno, varios){ return n+" "+(n===1?uno:varios); }
/* El buscador tiene que encontrar "jalapeños" escribiendo "jalapenos",
   y "PIÑA" escribiendo "pina": se quitan tildes y se baja todo. */
function norm(t){
  return String(t||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim();
}
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
  if(!libro.productos) libro.productos=[];
  if(!libro.proveedores) libro.proveedores={};
  if(!libro.pedido) libro.pedido={};
  if(!libro.enviados) libro.enviados=[];
  if(libro.ajustes.mesesViejo==null) libro.ajustes.mesesViejo=24;
  /* Un producto sin id no se puede pedir ni editar. */
  libro.productos.forEach(function(p){ if(!p.id) p.id=uid(); });
  /* «Cajas» estaba a la vez como unidad del producto y como columna
     propia: escribías 3 en Unidades y el pedido salía «3 cajas». Se
     quita de las unidades —las cajas ya tienen su casilla— y al que
     estuviera puesto así se le deja su caja para que no pierda nada. */
  var tocado=false;
  libro.productos.forEach(function(p){
    if(p.ud==="cajas"){ if(!(+p.udsCaja>0)) p.udsCaja=1; p.ud=""; tocado=true; }
    /* Y «un» sobraba: sin unidad ya son unidades. */
    if(p.ud==="un"){ p.ud=""; tocado=true; }
  });
  /* Hasta hoy el pedido guardaba una cantidad suelta y las cajas, y esa
     cantidad iba en la unidad del producto: si el tomate era de kilos,
     un 3 ahí eran tres kilos. Ahora cada unidad tiene su casilla, así
     que lo que estuviera a medias se pasa a la suya y nadie se queda
     pidiendo tres de nada. */
  if(libro.v!==2){
    Object.keys(libro.pedido).forEach(function(id){
      var l=libro.pedido[id]; if(!l) return;
      var sueltas=+l.uds||0;
      if(sueltas>0){
        var u=unidadDe(productoPorId(id));
        if(u==="kg"){ l.kg=sueltas; l.uds=0; }
        else if(u==="L"){ l.litros=sueltas; l.uds=0; }
      }
    });
    libro.v=2; tocado=true;
  }
  if(tocado) guardar();
}

var elAviso=null;
function avisar(mensaje, malo){
  if(elAviso) elAviso.remove();
  var d=document.createElement("div");
  d.className="aviso-flotante"+(malo?" malo":"");
  d.textContent=mensaje;
  document.body.appendChild(d); elAviso=d;
  setTimeout(function(){ if(d===elAviso){ d.remove(); elAviso=null; } }, malo?4200:2400);
}

/* ── Las cuentas de un producto ───────────────────────────────── */
/* El precio que hay que mirar es el neto: el del proveedor con su IGI
   encima. Comparar precios sin el impuesto engaña, porque no todas las
   secciones llevan el mismo: la comida va al 1 % y la bebida al 4,5 %. */
function conIgi(p){
  if(!p || !p.precio) return 0;
  return r2(p.precio * (1 + (+p.igi||0)/100));
}
function precioCaja(p){
  var u=+p.udsCaja||0;
  return u>0 ? r2(conIgi(p)*u) : 0;
}
/* Cuánto hace de ese precio. Un precio de 2023 en una lista de
   proveedores no es un precio, es un recuerdo. */
function mesesDe(iso){
  if(!iso) return null;
  var d=new Date(iso+"T12:00:00");
  if(isNaN(d)) return null;
  return Math.max(0, Math.round((Date.now()-d.getTime())/(1000*60*60*24*30.44)));
}
function esViejo(p){
  var m=mesesDe(p.fecha);
  return m==null || m>=(+libro.ajustes.mesesViejo||24);
}

/* ── Agrupar por producto ─────────────────────────────────────── */
/* Cada ficha es un producto, y dentro van todos los proveedores que lo
   traen, del más barato al más caro. Agrupar por nombre a secas juntaría
   el CROISSANT de congelados con el de comidas, que son cosas distintas
   en la hoja; por eso la sección entra en la llave. */
function llaveDe(p){ return (p.seccion||"")+" · "+norm(p.nombre); }
function agrupar(lista){
  var mapa={}, orden=[];
  lista.forEach(function(p){
    var k=llaveDe(p);
    if(!mapa[k]){ mapa[k]={llave:k, seccion:p.seccion, nombre:p.nombre, ofertas:[]}; orden.push(mapa[k]); }
    mapa[k].ofertas.push(p);
  });
  orden.forEach(function(g){
    /* Los que no tienen precio puesto van al final: no compiten. */
    g.ofertas.sort(function(a,b){
      var pa=conIgi(a), pb=conIgi(b);
      if(!pa && !pb) return String(a.proveedor).localeCompare(b.proveedor);
      if(!pa) return 1;
      if(!pb) return -1;
      return pa-pb;
    });
    var conPrecio=g.ofertas.filter(function(o){ return conIgi(o)>0; });
    g.mejor = conPrecio.length>1 ? conPrecio[0] : null;   /* con uno solo no hay "el más barato" */
    g.ahorro = conPrecio.length>1
      ? r2(conIgi(conPrecio[conPrecio.length-1])-conIgi(conPrecio[0])) : 0;
  });
  orden.sort(function(a,b){ return norm(a.nombre).localeCompare(norm(b.nombre)); });
  return orden;
}
function secciones(){
  var vistas=[], hay={};
  libro.productos.forEach(function(p){
    if(p.seccion && !hay[p.seccion]){ hay[p.seccion]=0; vistas.push(p.seccion); }
    if(p.seccion) hay[p.seccion]++;
  });
  return vistas.map(function(s){ return {nombre:s, n:hay[s]}; });
}
/* La lista sale de los productos, pero también de las fichas sueltas:
   un proveedor al que le has puesto el teléfono y todavía no le has
   colgado nada, o el que queda tras borrarle los productos. Si sólo
   mirara los productos, esas fichas no saldrían en ningún sitio y no
   habría forma de quitarlas. */
function listaProveedores(){
  var hay={};
  libro.productos.forEach(function(p){ if(p.proveedor) hay[p.proveedor]=(hay[p.proveedor]||0)+1; });
  Object.keys(libro.proveedores||{}).forEach(function(n){ if(n && hay[n]==null) hay[n]=0; });
  return Object.keys(hay).sort(function(a,b){ return a.localeCompare(b); })
               .map(function(n){ return {nombre:n, n:hay[n]}; });
}
/* Lo de cada día. No es una sección: es una marca, porque mañana puede
   entrar el pescado o el pan sin tocar nada. */
function esDiario(p){ return !!(p && p.diario); }

/* ── Las cuatro maneras de pedir una cosa ─────────────────────────
   Cajas, kilos, litros y unidades, y las cuatro en TODOS los artículos.

   Antes cada producto llevaba su unidad escrita —el tomate en kilos, la
   leche en litros— y en el pedido salían sólo ésa y las cajas, y las
   cajas sólo si el producto tenía puesto cuántas unidades trae. Pero un
   día el tomate se pide por cajas y otro por kilos, y eso no se sabe
   cuando se escribe la lista de precios: se sabe por la mañana. Así que
   ahora las cuatro casillas están en todas las líneas y se escribe en la
   que haga falta ese día. Las que no se usan se quedan en blanco y no
   salen en el pedido.

   Pero una casilla por unidad son cuatro casillas en cada línea, y eso
   no es más fácil: es lo mismo cuatro veces. Me lo dijo él. Así que la
   casilla es UNA y la unidad se elige al lado, en un desplegable. Lo
   que se escribe va a la unidad elegida, y al cambiar de unidad la
   cantidad se muda con ella: no se queda un 3 olvidado en los kilos.

   El orden es el de la cabeza: primero las cajas, que es lo que más se
   pide, y las unidades sueltas al final. */
var MODOS=[
  { campo:"cajas",  corto:"caj", uno:"caja",   varios:"cajas"    },
  { campo:"kg",     corto:"kg",  uno:"kg",     varios:"kg"       },
  { campo:"litros", corto:"L",   uno:"L",      varios:"L"        },
  { campo:"uds",    corto:"un",  uno:"unidad", varios:"unidades" }
];
function modoDe(campo){
  for(var i=0;i<MODOS.length;i++) if(MODOS[i].campo===campo) return MODOS[i];
  return null;
}

/* La unidad del producto ya no manda en el pedido, pero sigue diciendo a
   qué se refiere el precio —2,40 € el kilo, 0,68 € el litro— y cuál es
   la casilla que se rellena sola al apuntar sobre la marcha. */
var UNIDADES=["kg","L",""];
function unidadDe(p){
  var u=(p&&p.ud)||"";
  return UNIDADES.indexOf(u)>=0 ? u : "";
}
/* La unidad que lleva puesta una línea del pedido: aquella en la que
   hay algo escrito. Si no hay nada, la que le pega al producto.

   Cuando esto llevaba cuatro casillas se podían llenar dos a la vez, y
   alguna línea vieja puede venir así. En ese caso manda la mayor, y lo
   otro se dice al lado para que no se quede escondido. */
function unidadPuesta(p, l){
  var mejor=null;
  MODOS.forEach(function(m){
    if(l[m.campo]>0 && (!mejor || l[m.campo]>l[mejor])) mejor=m.campo;
  });
  return mejor || campoNatural(p);
}
/* Lo que lleve la línea aparte de su unidad principal. */
function loOtroQueLleva(p, l){
  var principal=unidadPuesta(p, l), fuera=[];
  MODOS.forEach(function(m){
    if(m.campo!==principal && l[m.campo]>0)
      fuera.push(num(l[m.campo], l[m.campo]%1?1:0)+" "+
                 (l[m.campo]===1?m.uno:m.varios));
  });
  return fuera;
}
/* Cambiar de unidad se lleva la cantidad consigo. */
function cambiarUnidad(id, campoNuevo){
  var l=delPedido(id), p=productoPorId(id);
  var cuanto=l[unidadPuesta(p, l)]||0;
  MODOS.forEach(function(m){ l[m.campo]=0; });
  l[campoNuevo]=cuanto;
  if(!hayPedido(l)) delete libro.pedido[id]; else libro.pedido[id]=l;
  guardar();
}

/* La casilla que le toca a un producto cuando no se dice otra cosa: la
   caja si viene en cajas, y si no, la de su unidad. */
function campoNatural(p){
  /* Lo primero, lo que diga su ficha en "Como se pide". */
  if(p && p.pedirEn && modoDe(p.pedirEn)) return p.pedirEn;
  if((+(p&&p.udsCaja)||0)>0) return "cajas";
  var u=unidadDe(p);
  return u==="kg" ? "kg" : u==="L" ? "litros" : "uds";
}
/* "3 kg", "2 L", "4 un" o, si no tiene unidad, "4 unidades". */
function cantidadConUnidad(n, u){
  if(!u) return n+(n===1?" unidad":" unidades");
  return n+" "+u;
}
/* "caja de 12". Una caja de una unidad no es una caja de nada: se calla. */
function deCaja(p){
  var c=+(p&&p.udsCaja)||0;
  return c>1 ? "caja de "+num(c, c%1?1:0) : (c>0 ? "caja" : "");
}
function productoPorId(id){
  return libro.productos.filter(function(p){ return p.id===id; })[0] || null;
}

/* ── El pedido ────────────────────────────────────────────────── */
function delPedido(id){
  var l=libro.pedido[id], r={};
  MODOS.forEach(function(m){ r[m.campo]=(l && +l[m.campo])||0; });
  return r;
}
/* Si se queda todo a cero, la línea se va del pedido entera: una línea
   con cuatro ceros no es una línea, es basura que luego hay que contar. */
function hayPedido(l){
  for(var i=0;i<MODOS.length;i++) if(l[MODOS[i].campo]>0) return true;
  return false;
}
function ponerEnPedido(id, campo, n){
  n=Math.max(0, Math.round(+n||0));
  var l=delPedido(id);
  l[campo]=n;
  if(!hayPedido(l)) delete libro.pedido[id]; else libro.pedido[id]=l;
  guardar();
}
/* Kilos, litros y unidades van al precio de siempre, que es por unidad
   de lo que sea; las cajas, al precio de la caja. Si a un producto no se
   le ha puesto cuántas unidades trae la caja, su precio de caja es cero
   y esas cajas no suman: se piden igual, pero el importe se queda corto
   y por eso la línea lo dice. */
function importeLinea(p){
  var l=delPedido(p.id);
  return r2((l.kg+l.litros+l.uds)*conIgi(p) + l.cajas*precioCaja(p));
}
/* Lo que se le escribe al proveedor de una línea: «3 cajas de 12 + 2 kg». */
function trozosPedidos(p, l){
  var fuera=[];
  MODOS.forEach(function(m){
    var n=l[m.campo]; if(!n) return;
    var t=num(n, n%1?1:0)+" "+(n===1?m.uno:m.varios);
    if(m.campo==="cajas" && (+p.udsCaja||0)>1)
      t+=" de "+num(+p.udsCaja, (+p.udsCaja)%1?1:0);
    fuera.push(t);
  });
  return fuera;
}
/* El pedido, repartido por proveedor: a cada uno se le manda el suyo. */
function pedidoPorProveedor(){
  var por={};
  Object.keys(libro.pedido).forEach(function(id){
    var p=productoPorId(id); if(!p) return;
    var l=delPedido(id);
    if(!hayPedido(l)) return;
    var prov=p.proveedor||"Sin proveedor";
    if(!por[prov]) por[prov]={proveedor:prov, lineas:[], total:0};
    por[prov].lineas.push({p:p, l:l, importe:importeLinea(p)});
    por[prov].total=r2(por[prov].total+importeLinea(p));
  });
  return Object.keys(por).sort(function(a,b){ return a.localeCompare(b); })
                         .map(function(k){ return por[k]; });
}
function totalPedido(){
  return r2(pedidoPorProveedor().reduce(function(s,g){ return s+g.total; },0));
}
function lineasPedido(){
  return Object.keys(libro.pedido).filter(function(id){
    return hayPedido(delPedido(id));
  }).length;
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"precios",     nombre:"Precios"},
  {id:"pedido",      nombre:"El pedido", cuenta:function(){ return lineasPedido(); }},
  {id:"proveedores", nombre:"Proveedores"},
  {id:"ajustes",     nombre:"Ajustes"},
  {id:"telefonos",   nombre:"Teléfonos"}
];
function pintar(){
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Pedidos</span>'+
        '<span class="sub">'+esc(libro.ajustes.nombre||"Restaurante")+'</span></div>'+
      APARTADOS.map(function(a){
        var c=a.cuenta?a.cuenta():0;
        var puesto=(ui.vista===a.id) || (a.id==="proveedores" && ui.vista==="proveedor");
        return '<button class="nav" data-ir="'+a.id+'" aria-current="'+puesto+'">'+
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

  ({precios:verPrecios, pedido:verPedido, proveedores:verProveedores,
    proveedor:verProveedor, ajustes:verAjustes,
    telefonos:verTelefonos})[ui.vista](document.getElementById("main"));

  pintarBarra();
}

function cabecera(titulo, sub, derecha){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         (sub?'<p>'+sub+'</p>':"")+'</div>'+
         '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:end">'+(derecha||"")+'</div></div>';
}

/* La barra de abajo va fuera del repintado de la vista: se actualiza
   sola cada vez que se toca una cantidad, sin redibujar la lista —que
   con 573 fichas se notaría y perdería el foco del buscador. */
function pintarBarra(){
  var vieja=document.getElementById("barraPedido");
  var n=lineasPedido();
  if(!n){ if(vieja) vieja.remove(); return; }
  var provs=pedidoPorProveedor().length;
  var barra=vieja || document.createElement("div");
  barra.id="barraPedido"; barra.className="barra-pedido";
  var total=totalPedido();
  barra.innerHTML=
    '<div class="resumen">'+
      (total>0
        ? '<span class="gordo">'+eur(total)+'</span>'+plural(n,"línea","líneas")
        : '<span class="gordo">'+n+'</span>'+(n===1?" línea":" líneas")+' sin precio')+
      ' · '+plural(provs,"proveedor","proveedores")+'</div>'+
    '<div style="display:flex;gap:9px;flex-wrap:wrap">'+
      '<button class="btn hueco" id="bp_vaciar">Vaciar</button>'+
      '<button class="btn" id="bp_ver">Ver el pedido</button>'+
    '</div>';
  if(!vieja) document.body.appendChild(barra);
  document.getElementById("bp_ver").addEventListener("click", function(){
    ui.vista="pedido"; pintar(); window.scrollTo(0,0);
  });
  document.getElementById("bp_vaciar").addEventListener("click", vaciarPedido);
  /* Actualiza también el número del carril, que está fuera de la barra. */
  var nav=document.querySelector('[data-ir="pedido"]');
  if(nav){
    var c=nav.querySelector(".cuenta");
    if(!c){ c=document.createElement("span"); c.className="cuenta"; nav.appendChild(c); }
    c.textContent=n;
  }
}

/* ══════════════════════════════════════════════════════════════
   PRECIOS — el buscador y las fichas
   ══════════════════════════════════════════════════════════════ */
function filtrados(){
  var q=norm(ui.q);
  var trozos=q?q.split(" "):[];
  return libro.productos.filter(function(p){
    if(ui.seccion==="__diario"){ if(!esDiario(p)) return false; }
    else if(ui.seccion && p.seccion!==ui.seccion) return false;
    if(ui.soloPedido && !hayPedido(delPedido(p.id))) return false;
    if(!trozos.length) return true;
    /* Se busca por producto y por proveedor a la vez, y cada palabra
       tiene que estar en alguno de los dos: así "alitas inter" cae en
       las alitas de INTERPESCA y en nada más. */
    var heno=norm(p.nombre)+" "+norm(p.proveedor)+" "+norm(p.seccion);
    return trozos.every(function(t){ return heno.indexOf(t)>=0; });
  });
}

function verPrecios(main){
  var secs=secciones();
  var hay=libro.productos.length;

  main.innerHTML=
    cabecera("Lista de precios",
      hay ? "Escribe media palabra y quedan las fichas que buscas. Dentro de cada una, "+
            "los proveedores que la traen, del más barato al más caro."
          : "Todavía no hay ningún producto.",
      '<button class="btn" id="pr_nuevo">+ Producto</button>')+

    '<div class="buscar">'+
      '<div class="buscar-caja">'+
        '<span class="lupa">⌕</span>'+
        '<input id="q" type="search" autocomplete="off" spellcheck="false" '+
        'placeholder="Busca un producto o un proveedor…" value="'+esc(ui.q)+'">'+
        '<button class="limpiar'+(ui.q?" hay":"")+'" id="q_limpiar" title="Limpiar">✕</button>'+
      '</div>'+
      '<div class="chips">'+
        '<button class="chip" data-sec="" aria-pressed="'+(!ui.seccion)+'">Todo'+
          '<span class="n">'+hay+'</span></button>'+
        secs.map(function(s){
          return '<button class="chip" data-sec="'+esc(s.nombre)+'" aria-pressed="'+
                 (ui.seccion===s.nombre)+'">'+esc(s.nombre.charAt(0)+s.nombre.slice(1).toLowerCase())+
                 '<span class="n">'+s.n+'</span></button>';
        }).join("")+
        (libro.productos.some(esDiario)
          ? '<button class="chip" id="ch_diario" aria-pressed="'+(ui.seccion==="__diario")+'">Del día'+
            '<span class="n">'+libro.productos.filter(esDiario).length+'</span></button>'
          : "")+
        '<button class="chip" id="ch_pedido" aria-pressed="'+ui.soloPedido+'">En el pedido'+
          '<span class="n">'+lineasPedido()+'</span></button>'+
      '</div>'+
    '</div>'+
    '<div id="resultado"></div>';

  var campo=document.getElementById("q");
  campo.addEventListener("input", function(){
    ui.q=this.value;
    document.getElementById("q_limpiar").classList.toggle("hay", !!this.value);
    pintarResultado();
  });
  /* Escape limpia sin levantar la mano del teclado. */
  campo.addEventListener("keydown", function(e){
    if(e.key==="Escape" && this.value){ e.preventDefault(); this.value=""; ui.q="";
      document.getElementById("q_limpiar").classList.remove("hay"); pintarResultado(); }
  });
  document.getElementById("q_limpiar").addEventListener("click", function(){
    ui.q=""; campo.value=""; this.classList.remove("hay"); pintarResultado(); campo.focus();
  });
  main.querySelectorAll("[data-sec]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.seccion=b.getAttribute("data-sec"); ui.soloPedido=false; pintar();
    });
  });
  var chd=document.getElementById("ch_diario");
  if(chd) chd.addEventListener("click", function(){
    ui.seccion = ui.seccion==="__diario" ? "" : "__diario";
    ui.soloPedido=false; pintar();
  });
  document.getElementById("ch_pedido").addEventListener("click", function(){
    ui.soloPedido=!ui.soloPedido; if(ui.soloPedido) ui.seccion=""; pintar();
  });
  var bn=document.getElementById("pr_nuevo");
  if(bn) bn.addEventListener("click", function(){ editarProducto(null); });

  pintarResultado();
  /* En el ordenador el cursor ya está en el buscador; en el móvil no,
     que si no salta el teclado y se come media pantalla. */
  if(!("ontouchstart" in window)) campo.focus();
}

function pintarResultado(){
  var caja=document.getElementById("resultado"); if(!caja) return;
  var lista=filtrados();
  var grupos=agrupar(lista);

  if(!libro.productos.length){
    caja.innerHTML='<div class="tarjeta"><div class="vacio"><strong>La lista está vacía</strong>'+
      'Añade el primer producto con el botón de arriba.</div></div>';
    return;
  }
  if(!grupos.length){
    caja.innerHTML='<div class="tarjeta"><div class="vacio"><strong>Nada con «'+esc(ui.q)+'»</strong>'+
      'Prueba con menos letras, o con el nombre del proveedor.</div></div>';
    return;
  }
  caja.innerHTML=
    '<div class="recuento">'+plural(grupos.length,"producto","productos")+' · '+
      plural(lista.length,"precio","precios")+
      (ui.q?' con «'+esc(ui.q)+'»':"")+'</div>'+
    '<div class="reja">'+grupos.map(fichaProducto).join("")+'</div>';
  engancharFichas(caja);
}

/* Todos los proveedores de cada producto, siempre a la vista y ordenados
   del más barato al más caro. Hubo un rato en que sólo salía el más
   barato y los demás quedaban detrás de un desplegable, para que cupiera
   más en pantalla; se quitó, porque comparar precios es justo para lo
   que se abre esta pantalla y esconderlos era esconder el trabajo. Si
   hace falta ver más productos de golpe, para eso está el buscador. */
function fichaProducto(g){
  var enPedido=g.ofertas.some(function(o){ return hayPedido(delPedido(o.id)); });
  var total=r2(g.ofertas.reduce(function(s,o){ return s+importeLinea(o); },0));
  return '<article class="prod'+(enPedido?" pedido":"")+'">'+
    '<div class="prod-cab"><h3>'+esc(g.nombre)+'</h3>'+
      '<span class="sec">'+esc((g.seccion||"").toLowerCase())+'</span></div>'+
    g.ofertas.map(function(o){ return lineaOferta(o, g); }).join("")+
    (total>0
      ? '<div class="linea-total"><span>En el pedido</span><b>'+eur(total)+'</b></div>'
      : "")+
  '</article>';
}

function lineaOferta(o, g){
  var l=delPedido(o.id);
  var pedida=hayPedido(l);
  var neto=conIgi(o);
  var esMejor=(g.mejor && g.mejor.id===o.id);
  var meses=mesesDe(o.fecha);
  var caja=+o.udsCaja||0;

  var info=[];
  if(o.fecha) info.push('<span'+(esViejo(o)?' class="viejo"':"")+'>'+esc(dmy(o.fecha))+
                        (meses!=null && meses>=12 ? ' · hace '+Math.floor(meses/12)+' año'+(meses>=24?"s":"") : "")+
                        '</span>');
  else info.push('<span class="viejo">sin fecha</span>');
  if(neto) info.push('<span>'+num(o.igi,1)+' % IGI</span>');
  if(caja>0) info.push('<span>'+esc(deCaja(o))+' · '+eur(precioCaja(o))+'</span>');
  /* Las cajas se pueden pedir siempre, pero si nadie ha dicho cuántas
     unidades trae la caja no hay precio que ponerle: se avisa aquí, que
     es donde está el botón de arreglarlo. */
  else if(l.cajas) info.push('<span class="viejo">caja sin tamaño: no suma</span>');

  return '<div class="oferta'+(esMejor?" mejor":"")+(pedida?" encargada":"")+'" data-of="'+esc(o.id)+'">'+
    '<div class="of-quien">'+
      '<div class="of-prov">'+esc(o.proveedor||"— sin proveedor —")+
        (esMejor?' <span class="chapa ok" style="font-size:10.5px">más barato</span>':"")+'</div>'+
      '<div class="of-precio'+(esMejor?" mejor":"")+(neto?"":" sin")+'">'+
        (neto?eur(neto):"sin precio")+
        (neto?'<span class="of-por">/'+esc(unidadDe(o)||"ud")+'</span>':"")+'</div>'+
      '<div class="of-info">'+info.join("")+
        ' <button class="btn suave sm" data-editar="'+esc(o.id)+'" '+
        'style="padding:0 4px;font-size:11.5px;text-decoration:underline">cambiar</button></div>'+
    '</div>'+
    '<div class="of-acciones">'+
      (function(){
        var campo=unidadPuesta(o, l);
        var otros=loOtroQueLleva(o, l);
        return contador(o.id, campo, l[campo], caja>1 ? "caj "+num(caja, caja%1?1:0) : "")+
          (otros.length
            ? '<span class="nota" style="align-self:center;margin:0">y '+
              esc(otros.join(" y "))+'</span>'
            : "");
      })()+
    '</div>'+
  '</div>';
}

function contador(id, campo, valor, etiquetaCaja){
  return '<div class="contador'+(valor?" activo":"")+'" data-cnt="'+esc(id)+'|'+campo+'">'+
    '<button type="button" data-paso="-1" aria-label="Quitar uno">−</button>'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="0" '+
      'inputmode="numeric" aria-label="Cantidad">'+
    '<button type="button" data-paso="1" aria-label="Añadir uno">+</button>'+
    selectorUnidad(id, campo, etiquetaCaja)+
  '</div>';
}
/* El desplegable de la unidad. La caja dice de cuántas es cuando se
   sabe: «caj 12» le ahorra ir a mirarlo. */
function selectorUnidad(id, campo, etiquetaCaja){
  return '<select class="ud" data-ud="'+esc(id)+'" aria-label="En qué se pide">'+
    MODOS.map(function(m){
      var texto=(m.campo==="cajas" && etiquetaCaja) ? etiquetaCaja : m.corto;
      return '<option value="'+m.campo+'"'+(m.campo===campo?" selected":"")+'>'+
             esc(texto)+'</option>';
    }).join("")+
  '</select>';
}

/* Tocar una cantidad no repinta la lista entera: se cambia lo justo —el
   número, el color de la línea y la barra de abajo— porque con 573
   fichas un repintado se nota y, peor, se lleva el foco del buscador. */
function engancharFichas(caja){
  caja.querySelectorAll("[data-cnt]").forEach(function(c){
    var partes=c.getAttribute("data-cnt").split("|");
    var id=partes[0], campo=partes[1];
    var input=c.querySelector("input");
    var elige=c.querySelector("[data-ud]");
    function aplicar(n){
      ponerEnPedido(id, campo, n);
      var l=delPedido(id);
      input.value=l[campo]||"";
      c.classList.toggle("activo", !!l[campo]);
      refrescarFicha(id);
      pintarBarra();
    }
    c.querySelectorAll("[data-paso]").forEach(function(b){
      b.addEventListener("click", function(){
        aplicar((+input.value||0) + (+b.getAttribute("data-paso")));
      });
    });
    input.addEventListener("input", function(){ aplicar(input.value); });
    /* Cambiar de unidad se lleva la cantidad: si había 3 cajas y pasas
       a kilos, quedan 3 kilos y ninguna caja. */
    if(elige) elige.addEventListener("change", function(){
      cambiarUnidad(id, elige.value);
      campo=elige.value;
      c.setAttribute("data-cnt", id+"|"+campo);
      var l=delPedido(id);
      input.value=l[campo]||"";
      c.classList.toggle("activo", !!l[campo]);
      refrescarFicha(id);
      pintarBarra();
    });
  });
  caja.querySelectorAll("[data-editar]").forEach(function(b){
    b.addEventListener("click", function(e){
      e.stopPropagation();
      editarProducto(productoPorId(b.getAttribute("data-editar")));
    });
  });
}

/* Del producto tocado sólo cambian dos cosas a la vista: si la línea va
   resaltada y el pie con lo que suma. */
function refrescarFicha(id){
  var linea=document.querySelector('[data-of="'+id+'"]');
  if(!linea) return;
  var l=delPedido(id);
  linea.classList.toggle("encargada", hayPedido(l));
  linea.classList.toggle("puesta", hayPedido(l));
  var ficha=linea.closest(".prod"); if(!ficha) return;
  var ids=[].slice.call(ficha.querySelectorAll("[data-of]"))
             .map(function(x){ return x.getAttribute("data-of"); });
  var total=r2(ids.reduce(function(s,x){
    var p=productoPorId(x); return s+(p?importeLinea(p):0); },0));
  ficha.classList.toggle("pedido", total>0 || ids.some(function(x){
    return hayPedido(delPedido(x)); }));
  var pie=ficha.querySelector(".linea-total");
  if(total>0){
    if(!pie){ pie=document.createElement("div"); pie.className="linea-total"; ficha.appendChild(pie); }
    pie.innerHTML='<span>En el pedido</span><b>'+eur(total)+'</b>';
  } else if(pie) pie.remove();
}

/* ══════════════════════════════════════════════════════════════
   EL PEDIDO
   ══════════════════════════════════════════════════════════════ */
function verPedido(main){
  var grupos=pedidoPorProveedor();

  main.innerHTML=
    cabecera("El pedido",
      grupos.length
        ? (grupos.length>1 && miMovil()
            ? "Lo que vas apuntando se queda aquí hasta que lo mandes. Cada pedido se puede "+
              "mandar <strong>a ti</strong> o <strong>al proveedor</strong>, y si los quieres "+
              "todos de una para reenviarlos tú, ahí arriba."
            : "Lo que vas apuntando se queda aquí hasta que lo mandes. El día del pedido, "+
              "cada proveedor lleva el suyo.")
        : "Ve apuntando aquí lo que haga falta según lo veas. El día del pedido, "+
          "sale repartido por proveedor.",
      /* Un solo sitio para mandarlos todos: dentro se elige si va el
         mensaje entero a su movil o si se le manda a cada empresa la
         suya, de una en una. */
      (grupos.length>1
        ? '<button class="btn wa" id="pd_todo">📱 Mandarlos todos</button>' : "")+
      (grupos.length ? '<button class="btn malo" id="pd_vaciar">Vaciar el pedido</button>' : ""))+

    '<div class="apuntar">'+
      '<div class="buscar-caja">'+
        '<span class="lupa">⌕</span>'+
        '<input id="qa" type="search" autocomplete="off" spellcheck="false" '+
        'placeholder="Apunta lo que haga falta: escribe tres letras…" value="'+esc(ui.qApunte)+'">'+
        '<button class="limpiar'+(ui.qApunte?" hay":"")+'" id="qa_limpiar" title="Limpiar">✕</button>'+
      '</div>'+
      '<div id="sugerencias"></div>'+
    '</div>'+

    (grupos.length
      ? '<div class="cifras">'+
          '<div class="cifra"><div class="k">Total del pedido</div>'+
            '<div class="v acento">'+(totalPedido()>0?eur(totalPedido()):"—")+'</div>'+
            '<div class="n">'+(totalPedido()>0
              ? "con el IGI de cada cosa"
              : "lo que has pedido no lleva precio")+'</div></div>'+
          '<div class="cifra"><div class="k">Proveedores</div><div class="v">'+grupos.length+'</div>'+
            '<div class="n">'+plural(lineasPedido(),"línea","líneas")+' en total</div></div>'+
          (totalPedido()>0
            ? '<div class="cifra"><div class="k">El más gordo</div>'+
              '<div class="v">'+eur(Math.max.apply(null, grupos.map(function(g){ return g.total; })))+'</div>'+
              '<div class="n">'+esc(grupos.slice().sort(function(a,b){ return b.total-a.total; })[0].proveedor)+
              '</div></div>'
            : "")+
        '</div>'+
        grupos.map(tarjetaProveedorPedido).join("")
      : '<div class="tarjeta"><div class="vacio"><strong>El pedido está vacío</strong>'+
        'Escribe arriba tres letras de lo que haga falta y queda apuntado. El día del pedido, '+
        'sale repartido por proveedor.</div></div>')+

    (libro.enviados.length ? historialEnviados() : "");

  engancharApuntar();

  var bv=document.getElementById("pd_vaciar");
  if(bv) bv.addEventListener("click", vaciarPedido);
  var bt=document.getElementById("pd_todo");
  if(bt) bt.addEventListener("click", mandarTodos);

  main.querySelectorAll("[data-mandar]").forEach(function(b){
    b.addEventListener("click", function(){ mandarPedido(b.getAttribute("data-mandar")); });
  });
  main.querySelectorAll("input[data-cpd]").forEach(function(input){
    var partes=input.getAttribute("data-cpd").split("|");
    var id=partes[0], campo=partes[1];
    input.addEventListener("input", function(){
      ponerEnPedido(id, campo, input.value);
      /* Si se queda a cero, la línea desaparece: hay que repintar, pero
         sólo entonces, para no perder el cursor mientras se escribe. */
      var l=delPedido(id);
      if(!hayPedido(l)) pintar(); else refrescarTotales();
    });
  });
  /* El desplegable de la unidad, en la tabla del pedido. */
  main.querySelectorAll("select[data-ud]").forEach(function(sel){
    sel.addEventListener("change", function(){
      cambiarUnidad(sel.getAttribute("data-ud"), sel.value);
      pintar();
    });
  });
  main.querySelectorAll("[data-quitar]").forEach(function(b){
    b.addEventListener("click", function(){
      delete libro.pedido[b.getAttribute("data-quitar")];
      guardar(); pintar();
    });
  });
  main.querySelectorAll("[data-borrar-env]").forEach(function(b){
    b.addEventListener("click", function(){
      var id=b.getAttribute("data-borrar-env");
      libro.enviados=libro.enviados.filter(function(e){ return e.id!==id; });
      guardar(); pintar(); avisar("Borrado del historial");
    });
  });
}

function tarjetaProveedorPedido(g){
  var datos=libro.proveedores[g.proveedor]||{};
  return '<div class="tarjeta" style="margin-bottom:14px">'+
    '<div class="tarjeta-cab">'+
      '<h2>'+esc(g.proveedor)+'</h2>'+
      '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'+
        '<span class="pista">'+plural(g.lineas.length,"línea","líneas")+
          (g.total?' · <b>'+eur(g.total)+'</b>':"")+'</span>'+
        '<button class="btn wa" data-mandar="'+esc(g.proveedor)+'">📱 Mandar el pedido</button>'+
      '</div>'+
    '</div>'+
    /* El aviso sólo cuando no hay a dónde mandarlo: con su móvil puesto
       siempre se puede mandar a sí mismo y reenviarlo. */
    (telWhatsApp(g.proveedor) || miMovil() ? "" :
      '<div class="tarjeta-cuerpo" style="padding-bottom:0">'+
      '<div class="aviso-caja">A '+esc(g.proveedor)+' no le has puesto ningún teléfono. '+
      'Ponle el móvil del comercial en <strong>Proveedores</strong> y el pedido se le manda '+
      'de una.</div></div>')+
    '<div class="tabla-caja pegada"><table><thead><tr>'+
      '<th>Producto</th><th class="num">Cuánto</th>'+
      '<th class="num">Precio</th><th class="num">Importe</th><th></th>'+
    '</tr></thead><tbody>'+
    g.lineas.map(function(l){
      return '<tr>'+
        '<td><strong>'+esc(l.p.nombre)+'</strong>'+
          '<div style="font-size:11.5px;color:var(--muted)">'+esc((l.p.seccion||"").toLowerCase())+'</div></td>'+
        /* Editables aquí mismo: esto es la lista que se va llenando
           durante la semana, así que hay que poder subir una cantidad
           sin ir a buscar el producto a otra pantalla. */
        (function(){
          var campo=unidadPuesta(l.p, l.l);
          var caja=+l.p.udsCaja||0;
          var otros=loOtroQueLleva(l.p, l.l);
          return '<td class="num">'+casillaPedido(l.p.id, campo, l.l[campo],
                   caja>1 ? "caj "+num(caja, caja%1?1:0) : "")+
                 (otros.length?'<div style="font-size:11px;color:var(--muted)">y '+
                   esc(otros.join(" y "))+'</div>':"")+'</td>';
        })()+
        '<td class="num">'+(conIgi(l.p)?eur(conIgi(l.p)):
          '<span style="color:var(--muted)">sin precio</span>')+'</td>'+
        '<td class="num">'+(l.importe?"<strong>"+eur(l.importe)+"</strong>":
          '<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td class="num"><button class="btn suave sm malo" data-quitar="'+esc(l.p.id)+'" '+
          'title="Quitar del pedido">✕</button></td>'+
      '</tr>';
    }).join("")+
    '</tbody><tfoot><tr><td colspan="3">Total</td>'+
      '<td class="num" data-total-prov="'+esc(g.proveedor)+'">'+
        (g.total?eur(g.total):"—")+'</td><td></td></tr></tfoot></table></div>'+
  '</div>';
}

function casillaPedido(id, campo, valor, etiquetaCaja){
  return '<span class="st-casilla">'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="—" '+
      'inputmode="numeric" data-cpd="'+esc(id)+'|'+campo+'" aria-label="Cantidad">'+
    selectorUnidad(id, campo, etiquetaCaja)+
  '</span>';
}

/* Una línea de la búsqueda de apuntar: un proveedor concreto de una
   cosa concreta. Dice lo que cuesta y, si no es el más barato, cuánto
   más caro es, que es lo que hay que saber para pagarlo a sabiendas. */
function filaSugerencia(o, barato){
  var l=delPedido(o.id);
  var caj=+o.udsCaja||0, udp=unidadDe(o), p=conIgi(o);
  var esBarato=(barato && barato.id===o.id);
  var demas=(barato && !esBarato && p>0) ? r2(p-conIgi(barato)) : 0;
  var detalle=[];
  if(caj>0) detalle.push(deCaja(o)+(p?" · "+eur(precioCaja(o)):""));
  if(o.fecha) detalle.push(dmy(o.fecha));
  var ya=hayPedido(l);
  return '<button type="button" class="sug'+(ya?" ya":"")+'" '+
    'data-apunta="'+esc(o.id)+'">'+
    '<span class="sug-nom">'+esc(o.proveedor||"sin proveedor")+
      (esBarato?' <span class="chapa ok" style="font-size:10px">más barato</span>':"")+
      (ya?' <span class="chapa" style="font-size:10px">ya apuntado</span>':"")+
    '</span>'+
    '<span class="sug-precio'+(p?"":" sin")+'">'+(p?eur(p):"sin precio")+
      (demas>0?'<span class="sug-demas">+'+eur(demas)+'</span>':"")+
    '</span>'+
    (detalle.length?'<span class="sug-info">'+esc(detalle.join(" · "))+'</span>':"")+
    '<span class="sug-mas">+ '+(caj>0?"1 caja":cantidadConUnidad(1,udp))+'</span>'+
  '</button>';
}

/* ── Apuntar sobre la marcha ──────────────────────────────────────
   «Durante el día vamos viendo productos que nos van a hacer falta.» Esa
   es la frase, y esto es el sitio: se escriben tres letras, sale lo que
   hay, se toca y queda apuntado. Sin cambiar de pantalla, sin perder lo
   que llevabas, y volviendo a dejar el cursor listo para lo siguiente,
   que rara vez te acuerdas de una sola cosa. */
function engancharApuntar(){
  var campo=document.getElementById("qa"); if(!campo) return;
  var caja=document.getElementById("sugerencias");

  function pintarSugerencias(){
    var q=norm(ui.qApunte);
    if(q.length<2){ caja.innerHTML=""; return; }
    var trozos=q.split(" ");
    var hallados=libro.productos.filter(function(p){
      var heno=norm(p.nombre)+" "+norm(p.proveedor)+" "+norm(p.seccion);
      return trozos.every(function(t){ return heno.indexOf(t)>=0; });
    });
    /* Los proveedores salen TODOS, del más barato al más caro, y cada
       uno con su botón. El más barato va arriba porque casi siempre es
       el que se quiere, pero el caro tiene que estar a la vista: «aunque
       sea más caro quiero comprar el mejor». Esconderlo detrás de un
       despliegue es decidir por él. */
    var grupos=agrupar(hallados).slice(0,6);
    if(!grupos.length){
      caja.innerHTML='<div class="sug-vacio">Nada con «'+esc(ui.qApunte)+'»</div>';
      return;
    }
    caja.innerHTML=grupos.map(function(g){
      var barato=conIgi(g.ofertas[0])>0 ? g.ofertas[0] : null;
      return '<div class="sug-grupo">'+
        '<div class="sug-cab"><span class="sug-tit">'+esc(g.nombre)+'</span>'+
          '<span class="sug-sec">'+esc((g.seccion||"").toLowerCase())+'</span>'+
          (g.ofertas.length>1
            ? '<span class="sug-cuantos">'+plural(g.ofertas.length,"proveedor","proveedores")+'</span>'
            : "")+
        '</div>'+
        g.ofertas.map(function(o){ return filaSugerencia(o, barato); }).join("")+
      '</div>';
    }).join("");
    caja.querySelectorAll("[data-apunta]").forEach(function(b){
      b.addEventListener("click", function(){ apuntar(b.getAttribute("data-apunta")); });
    });
  }

  function apuntar(id){
    var p=productoPorId(id); if(!p) return;
    var l=delPedido(id);
    /* Se suma en la casilla que le pega: la caja si viene en cajas, y
       si no la de su unidad. Las otras tres siguen ahí para cambiarlo a
       mano, que es de lo que se trata. */
    var campoN=campoNatural(p);
    var cuantas=(l[campoN]||0)+1;
    var m=modoDe(campoN);
    ponerEnPedido(id, campoN, cuantas);
    avisar("Apuntado: "+p.nombre+" · "+cuantas+" "+(cuantas===1?m.uno:m.varios));
    ui.qApunte=""; pintar();
    var nuevo=document.getElementById("qa");
    if(nuevo && !("ontouchstart" in window)) nuevo.focus();
  }

  campo.addEventListener("input", function(){
    ui.qApunte=this.value;
    document.getElementById("qa_limpiar").classList.toggle("hay", !!this.value);
    pintarSugerencias();
  });
  campo.addEventListener("keydown", function(e){
    if(e.key==="Escape" && this.value){ e.preventDefault(); this.value=""; ui.qApunte="";
      document.getElementById("qa_limpiar").classList.remove("hay"); pintarSugerencias(); }
    /* Enter apunta lo primero de la lista: escribir y darle, sin buscar
       con el dedo cuál era. */
    if(e.key==="Enter"){
      var primero=caja.querySelector("[data-apunta]");
      if(primero){ e.preventDefault(); primero.click(); }
    }
  });
  document.getElementById("qa_limpiar").addEventListener("click", function(){
    ui.qApunte=""; campo.value=""; this.classList.remove("hay"); pintarSugerencias(); campo.focus();
  });
  pintarSugerencias();
}

function historialEnviados() {
  var ult=libro.enviados.slice().sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||""); }).slice(0,25);
  return '<div class="tarjeta" style="margin-top:22px">'+
    '<div class="tarjeta-cab"><h2>Pedidos mandados</h2>'+
      '<span class="pista">los 25 últimos</span></div>'+
    '<div class="tabla-caja"><table><thead><tr><th>Día</th><th>Proveedor</th>'+
      '<th class="num">Líneas</th><th class="num">Importe</th><th></th></tr></thead><tbody>'+
    ult.map(function(e){
      return '<tr><td>'+esc(dmy(e.fecha))+'</td><td><strong>'+esc(e.proveedor)+'</strong></td>'+
        '<td class="num">'+(e.lineas||[]).length+'</td>'+
        '<td class="num">'+eur(e.total)+'</td>'+
        '<td class="num"><button class="btn suave sm malo" data-borrar-env="'+esc(e.id)+'">✕</button></td></tr>';
    }).join("")+
    '</tbody></table></div></div>';
}

/* Los totales se tocan a mano al cambiar una cantidad, que repintar la
   pantalla entera se llevaría el cursor de la casilla. */
function refrescarTotales(){
  var grupos=pedidoPorProveedor();
  document.querySelectorAll("[data-total-prov]").forEach(function(el){
    var g=grupos.filter(function(x){ return x.proveedor===el.getAttribute("data-total-prov"); })[0];
    el.textContent=g && g.total ? eur(g.total) : "—";
  });
  pintarBarra();
}

function vaciarPedido(){
  if(!lineasPedido()) return;
  confirmar("Vaciar el pedido",
    '<p style="margin:0">Se quitan las '+plural(lineasPedido(),"línea","líneas")+' del pedido. '+
    'Los precios y los productos no se tocan.</p>',
    function(){ libro.pedido={}; guardar(); pintar(); avisar("Pedido vaciado"); },
    {aceptar:"Vaciar", malo:true});
}

/* ── ¿A quién se le manda? ────────────────────────────────────────
   De momento, a él. Los pedidos no salen todavía de la app al
   proveedor: se mandan a su propio móvil, los mira, y los reenvía él a
   quien toque. Así el día que uno salga mal no se entera el proveedor.

   Por eso el pedido que va a su móvil lleva escrito arriba PARA QUIÉN
   es: llegan cuatro seguidos al mismo chat y, sin esa línea, no se sabe
   cuál es de cuál.

   El teléfono se guarda en los ajustes, no aquí: este archivo es
   público y un móvil no pinta nada en él. Cuando quiera que los pedidos
   salgan directos al proveedor, sólo hay que quitar la marca. */
function miMovil(){ return soloNumero(libro.ajustes.miMovil); }
/* La marca de Ajustes ya no decide a dónde va el pedido —para eso están
   los dos botones—, sólo cuál de los dos sale destacado. */
function vaAMi(){ return !!(libro.ajustes.aMi && miMovil()); }

/* ── Mandarlo por WhatsApp ────────────────────────────────────── */
/* Mismo apaño que en Caja: la aplicación de escritorio rechaza los
   enlaces wa.me con texto, así que se enseña el pedido, se puede copiar,
   y el enlace es un enlace de verdad —que pulsar un enlace no lo bloquea
   ningún navegador, y abrir una ventana a ciegas sí. */
/* El mismo pedido escrito de dos maneras: el que va a su móvil lleva
   arriba PARA QUIÉN es —al chat llegan cuatro seguidos y sin esa línea
   no se sabe cuál es cuál— y el que va al proveedor, no, que ya sabe
   quién es él. */
function textoPedido(prov, paraMi){
  var g=pedidoPorProveedor().filter(function(x){ return x.proveedor===prov; })[0];
  if(!g) return "";
  var l=[];
  if(libro.ajustes.nombre) l.push(libro.ajustes.nombre);
  l.push("Pedido del "+dmy(hoyISO()));
  if(paraMi) l.push("Para: "+prov);
  l.push("");
  g.lineas.forEach(function(x){
    /* Cada casilla que lleve algo, con su nombre entero: «3 cajas de 12
       + 2 kg». El que lo lee al otro lado no tiene la pantalla delante. */
    var trozos=trozosPedidos(x.p, x.l);
    l.push("- "+x.p.nombre+": "+trozos.join(" + ")+
           (libro.ajustes.conImportes && x.importe ? "  ("+eur(x.importe)+")" : ""));
  });
  if(libro.ajustes.conImportes){ l.push(""); l.push("Total: "+eur(g.total)); }
  l.push("");
  l.push("Gracias.");
  return l.join("\n");
}
/* Todos los pedidos en un mensaje, uno detrás de otro y con el nombre
   de cada proveedor por delante. Va a su móvil, así que lo que hace
   falta es que se distinga bien dónde acaba uno y empieza el otro para
   poder reenviar cada trozo. */
function textoDeTodos(){
  var grupos=pedidoPorProveedor();
  if(!grupos.length) return "";
  var l=[];
  if(libro.ajustes.nombre) l.push(libro.ajustes.nombre);
  l.push("Pedidos del "+dmy(hoyISO()));
  grupos.forEach(function(g){
    l.push("");
    l.push("── "+g.proveedor+" ──");
    g.lineas.forEach(function(x){
      l.push("- "+x.p.nombre+": "+trozosPedidos(x.p, x.l).join(" + ")+
             (libro.ajustes.conImportes && x.importe ? "  ("+eur(x.importe)+")" : ""));
    });
    if(libro.ajustes.conImportes && g.total) l.push("Total "+g.proveedor+": "+eur(g.total));
  });
  if(libro.ajustes.conImportes && totalPedido()){
    l.push("");
    l.push("Total de todo: "+eur(totalPedido()));
  }
  return l.join("\n");
}

/* ── Mandarlos todos de una ───────────────────────────────────────
   La ventana enseña el mensaje entero y, debajo, un botón por
   proveedor para copiar sólo su trozo: reenviar es lo que va a hacer
   después, y así no tiene que ir seleccionando a mano.
   ══════════════════════════════════════════════════════════════ */
function mandarTodos(){
  var grupos=pedidoPorProveedor();
  if(!grupos.length){ avisar("El pedido está vacío.", true); return; }
  var texto=textoDeTodos();
  var tel=miMovil();

  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Los '+grupos.length+' pedidos, en un mensaje</h3>'+
      '<button class="btn suave" data-cerrar>✕</button></div>'+
    '<div class="dlg-cuerpo">'+
      '<div class="parte" id="elPedido">'+esc(texto)+'</div>'+
      (tel
        ? '<p class="nota" style="margin:14px 0 8px">El botón verde manda el mensaje entero a tu móvil, '+
          '<strong>+'+esc(tel)+'</strong>. O manda a cada empresa la suya, de una en una:</p>'
        : '<p class="nota" style="margin:14px 0 8px">Manda a cada empresa la suya, de una en una. '+
          '(Si te pones tu móvil en Ajustes, también puedes mandártelos todos de golpe.)</p>')+
      '<div style="display:grid;gap:6px">'+
        grupos.map(function(g,i){
          var suyo=telWhatsApp(g.proveedor);
          var soloFijo=esSoloFijo(g.proveedor);
          return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap" data-fila="'+i+'">'+
            '<span style="min-width:120px;font-weight:600;font-size:13.5px">'+esc(g.proveedor)+'</span>'+
            (suyo
              ? '<a class="btn wa sm" href="'+esc(enlaceWhatsApp(suyo, textoPedido(g.proveedor, false)))+'" '+
                'target="_blank" rel="noopener" style="text-decoration:none" data-mandauno="'+i+'">'+
                '📱 Mandar a '+esc(g.proveedor)+(soloFijo?' (fijo)':'')+'</a>'
              : '<span class="nota" style="margin:0">sin teléfono: ponlo en Teléfonos</span>')+
            '<button class="btn suave sm" data-copiauno="'+i+'">Copiar</button>'+
            '<span class="nota" style="margin:0;display:none" data-hecho="'+i+'">✓ mandado</span>'+
          '</div>';
        }).join("")+
      '</div>'+
    '</div>'+
    '<div class="dlg-pie">'+
      '<button class="btn" id="pd_copiar">Copiar todo</button>'+
      '<button class="btn" id="pd_hecho">Darlos por mandados</button>'+
      (tel
        ? '<a class="btn wa" href="'+esc(enlaceWhatsApp(tel, texto))+'" target="_blank" '+
          'rel="noopener" style="text-decoration:none">Mandármelos a mí</a>'
        : "")+
    '</div>';
  document.body.appendChild(d);
  d.showModal();
  d.querySelector("[data-cerrar]").addEventListener("click", function(){ d.close(); d.remove(); });

  function copiar(t, dicho){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){ avisar(dicho); },
                                           function(){ avisar("No he podido copiarlo.", true); });
    } else avisar("Este navegador no deja copiar solo: selecciónalo y usa Cmd+C.", true);
  }
  document.getElementById("pd_copiar").addEventListener("click", function(){
    copiar(texto, "Copiado el mensaje entero");
  });
  d.querySelectorAll("[data-copiauno]").forEach(function(b){
    b.addEventListener("click", function(){
      var g=grupos[+b.getAttribute("data-copiauno")];
      copiar(textoPedido(g.proveedor), "Copiado el de "+g.proveedor);
    });
  });
  /* Con seis proveedores es facil perder la cuenta de a quien le has
     dado ya: el que se abre se queda marcado. */
  d.querySelectorAll("[data-mandauno]").forEach(function(a){
    a.addEventListener("click", function(){
      var i=a.getAttribute("data-mandauno");
      var marca=d.querySelector('[data-hecho="'+i+'"]');
      if(marca) marca.style.display="inline";
      a.classList.add("suave");
    });
  });

  /* Darlos por mandados: cada proveedor va al historial por su cuenta,
     que es como se mira luego. */
  document.getElementById("pd_hecho").addEventListener("click", function(){
    grupos.forEach(function(g){
      libro.enviados.push({
        id:uid(), fecha:hoyISO(), proveedor:g.proveedor, total:g.total,
        lineas:g.lineas.map(function(x){
          return {nombre:x.p.nombre, pedido:x.l, texto:trozosPedidos(x.p, x.l).join(" + "),
                  importe:x.importe};
        })
      });
      g.lineas.forEach(function(x){ delete libro.pedido[x.p.id]; });
    });
    guardar(); d.close(); d.remove(); pintar();
    avisar("Apuntados "+plural(grupos.length,"pedido","pedidos")+" como mandados");
  });
}

/* ── Los dos teléfonos de un proveedor ────────────────────────────
   En la empresa sólo dan un número y casi siempre es un fijo, que no
   tiene WhatsApp. El que lo lleva es el comercial, en su móvil. Así
   que cada proveedor tiene los dos: el móvil del comercial, que es al
   que se le manda el pedido, y el fijo de la empresa, que es para
   llamar cuando hace falta hablar.

   Si sólo hay fijo, se ofrece igual pero avisando: hay fijos con
   WhatsApp Business y no voy a decidir yo por él.
   ══════════════════════════════════════════════════════════════ */
function movilDe(prov){
  return soloNumero((libro.proveedores[prov]||{}).movil);
}
function fijoDe(prov){
  return soloNumero((libro.proveedores[prov]||{}).telefono);
}
/* A dónde se le manda el WhatsApp: al móvil del comercial, y si no lo
   tienes, al que haya. */
function telWhatsApp(prov){
  return movilDe(prov) || fijoDe(prov);
}
/* Para decirlo en la pantalla sin mentir: no sé si ese número es fijo o
   móvil, sólo sé que no me ha dicho cuál es el del comercial. */
function esSoloFijo(prov){
  return !movilDe(prov) && !!fijoDe(prov);
}

/* El enlace que abre el chat con el pedido ya escrito. En el ordenador
   tiene que ser WhatsApp Web: la aplicación de escritorio rechaza los
   enlaces que llevan texto dentro. */
function enlaceWhatsApp(tel, texto){
  var t=encodeURIComponent(texto);
  return enOrdenador()
    ? "https://web.whatsapp.com/send?phone="+tel+"&text="+t
    : "https://wa.me/"+tel+"?text="+t;
}

function soloNumero(bruto){
  var t=String(bruto||"").replace(/[^\d+]/g,"");
  if(!t) return "";
  if(t.charAt(0)==="+") return t.slice(1).replace(/\D/g,"");
  t=t.replace(/\D/g,"");
  if(t.indexOf("00")===0 && t.length>4) return t.slice(2);
  return t;
}
function enOrdenador(){
  try{
    return !((navigator.maxTouchPoints||0) > 1 &&
             window.matchMedia("(pointer: coarse)").matches);
  }catch(e){ return true; }
}

/* ── Mandar un pedido ─────────────────────────────────────────────
   Dos botones, no uno: **A mí** y **A ellos**. Hasta ahora lo decidía
   una marca de Ajustes y había que ir a cambiarla para mandar uno
   directo; ahora están los dos a la vez y se elige en el momento, que
   hay días de las dos cosas. El destacado es el que diga Ajustes.
   ══════════════════════════════════════════════════════════════ */
function mandarPedido(prov){
  var texto=textoPedido(prov, true);          /* el que va a su móvil */
  if(!texto){ avisar("Ese proveedor ya no tiene nada en el pedido.", true); return; }
  var textoDirecto=textoPedido(prov, false);  /* el que va al proveedor */
  var g=pedidoPorProveedor().filter(function(x){ return x.proveedor===prov; })[0];
  var mio=miMovil();
  var suyo=telWhatsApp(prov);
  var soloFijo=esSoloFijo(prov);
  var quien=(libro.proveedores[prov]||{}).contacto;
  var mioPrimero=!!libro.ajustes.aMi;

  var botonMio = mio
    ? '<a class="btn wa'+(mioPrimero?"":" suave")+'" href="'+esc(enlaceWhatsApp(mio, texto))+'" '+
      'target="_blank" rel="noopener" style="text-decoration:none" data-abrir>📱 A mí</a>'
    : "";
  var botonSuyo = suyo
    ? '<a class="btn wa'+(mioPrimero?" suave":"")+'" href="'+esc(enlaceWhatsApp(suyo, textoDirecto))+'" '+
      'target="_blank" rel="noopener" style="text-decoration:none" data-abrir>📱 A '+esc(prov)+'</a>'
    : "";

  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Pedido a '+esc(prov)+'</h3>'+
      '<button class="btn suave" data-cerrar>✕</button></div>'+
    '<div class="dlg-cuerpo">'+
      '<div class="parte" id="elPedido">'+esc(texto)+'</div>'+
      '<p class="nota" style="margin:14px 0 0">'+
        (mio
          ? '<strong>A mí</strong> lo manda a tu móvil, +'+esc(mio)+', con el «Para: '+esc(prov)+
            '» escrito arriba, y se lo reenvías tú. '
          : '')+
        (suyo
          ? '<strong>A '+esc(prov)+'</strong> abre el chat del +'+esc(suyo)+
            (quien && !soloFijo ? ', el móvil de '+esc(quien) : "")+', con el pedido puesto.'+
            (soloFijo
              ? ' Ése es el teléfono de la empresa: no le has puesto el móvil del comercial. '+
                'Si resulta ser un fijo, no tendrá WhatsApp y no le llegará; ponle el móvil en '+
                'Proveedores y vas seguro.'
              : "")
          : (mio ? 'A '+esc(prov)+' no se le puede mandar directo: no tiene ningún teléfono '+
                   'guardado. Ponle el móvil del comercial en <strong>Proveedores</strong>.' : ""))+
      '</p>'+
      (!mio && !suyo
        ? '<div class="aviso-caja" style="margin:10px 0 0">No hay ningún teléfono a donde '+
          'mandarlo: ponte el tuyo en <strong>Ajustes</strong> o el del comercial en '+
          '<strong>Proveedores</strong>. Mientras tanto, cópialo y pégalo tú.</div>'
        : "")+
      '<p class="nota" style="margin:10px 0 0">Ninguno de los dos lo manda solo: te lo deja '+
      'escrito en el chat y le das a enviar tú.'+
      (enOrdenador()
        ? ' Y en el ordenador abre WhatsApp Web, porque la aplicación de escritorio rechaza '+
          'los enlaces que llevan el texto dentro.'
        : "")+'</p>'+
    '</div>'+
    '<div class="dlg-pie">'+
      '<button class="btn" id="pd_copiar">Copiar</button>'+
      '<button class="btn" id="pd_hecho">Darlo por mandado</button>'+
      (mioPrimero ? botonSuyo+botonMio : botonMio+botonSuyo)+
    '</div>';
  document.body.appendChild(d);
  d.showModal();
  d.querySelector("[data-cerrar]").addEventListener("click", function(){ d.close(); d.remove(); });

  document.getElementById("pd_copiar").addEventListener("click", function(){
    var ok=function(){ avisar("Pedido copiado"); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(texto).then(ok, function(){ seleccionar(); });
    } else seleccionar();
    function seleccionar(){
      var r=document.createRange(); r.selectNodeContents(document.getElementById("elPedido"));
      var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      avisar("Seleccionado: cópialo con Cmd+C");
    }
  });
  /* Apuntarlo como mandado quita esas líneas del pedido y las guarda en
     el historial: si no, la vuelta siguiente se pide dos veces. */
  document.getElementById("pd_hecho").addEventListener("click", function(){
    libro.enviados.push({
      id:uid(), fecha:hoyISO(), proveedor:prov, total:g.total,
      lineas:g.lineas.map(function(x){
        return {nombre:x.p.nombre, pedido:x.l, texto:trozosPedidos(x.p, x.l).join(" + "),
                importe:x.importe};
      })
    });
    g.lineas.forEach(function(x){ delete libro.pedido[x.p.id]; });
    guardar(); d.close(); d.remove(); pintar();
    avisar("Apuntado: pedido a "+prov+" de "+eur(g.total));
  });
}

/* ══════════════════════════════════════════════════════════════
   PROVEEDORES
   ══════════════════════════════════════════════════════════════ */
function verProveedores(main){
  var lista=listaProveedores();
  var conMovil=lista.filter(function(p){ return movilDe(p.nombre); }).length;
  var conAlgo=lista.filter(function(p){ return telWhatsApp(p.nombre); }).length;

  main.innerHTML=
    cabecera("Proveedores",
      "Dos teléfonos por cada uno: el <strong>móvil del comercial</strong>, que es al que se le "+
      "manda el pedido porque es el que lleva WhatsApp, y el <strong>de la empresa</strong>, "+
      "que casi siempre es un fijo y sirve para llamar.")+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Proveedores</div><div class="v">'+lista.length+'</div>'+
        '<div class="n">en la lista de precios</div></div>'+
      '<div class="cifra"><div class="k">Con móvil</div>'+
        '<div class="v'+(conMovil<lista.length?"":" acento")+'">'+conMovil+'</div>'+
        '<div class="n">'+(conMovil<lista.length
          ? "a "+(lista.length-conMovil)+" les falta el del comercial"
          : "todos puestos")+'</div></div>'+
      '<div class="cifra"><div class="k">Se les puede mandar</div>'+
        '<div class="v'+(conAlgo<lista.length?"":" acento")+'">'+conAlgo+'</div>'+
        '<div class="n">contando los que sólo tienen fijo</div></div>'+
      '<div class="cifra"><div class="k">Precios viejos</div>'+
        '<div class="v'+(libro.productos.filter(esViejo).length?" malo":"")+'">'+
        libro.productos.filter(esViejo).length+'</div>'+
        '<div class="n">de más de un año o sin fecha</div></div>'+
    '</div>'+

    '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr>'+
      '<th>Proveedor</th><th class="num">Productos</th><th class="num">Precios viejos</th>'+
      '<th>Comercial</th><th>La empresa</th><th></th></tr></thead><tbody>'+
    lista.map(function(p){
      var d=libro.proveedores[p.nombre]||{};
      var viejos=libro.productos.filter(function(x){ return x.proveedor===p.nombre && esViejo(x); }).length;
      var mov=movilDe(p.nombre), fijo=fijoDe(p.nombre);
      return '<tr><td>'+
          (p.n ? '<button class="enlace-prov" data-abrir-prov="'+esc(p.nombre)+'">'+
                 esc(p.nombre)+'</button>'
               : '<strong>'+esc(p.nombre)+'</strong>'+
                 ' <span class="chapa neutra" style="font-size:10.5px">sólo la ficha</span>')+'</td>'+
        '<td class="num">'+(p.n||"—")+'</td>'+
        '<td class="num"'+(viejos?' style="color:var(--aviso)"':"")+'>'+(viejos||"—")+'</td>'+
        '<td>'+(d.contacto?'<div>'+esc(d.contacto)+'</div>':"")+
          (mov?'<a class="mono" href="tel:+'+esc(mov)+'" style="color:var(--acento)">+'+esc(mov)+'</a>'
              :'<span style="color:var(--muted)">sin móvil</span>')+'</td>'+
        '<td class="mono">'+(fijo?'<a href="tel:+'+esc(fijo)+'" style="color:inherit">+'+esc(fijo)+'</a>'
                                 :'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td class="num"><div class="acciones-fila">'+
          '<button class="btn suave sm" data-prov="'+esc(p.nombre)+'">Cambiar</button>'+
          '<button class="btn suave sm malo" data-borrar-prov="'+esc(p.nombre)+'" '+
          'title="Quitarlo de la lista">✕</button>'+
        '</div></td>'+
      '</tr>';
    }).join("")+
    '</tbody></table></div></div>';

  main.querySelectorAll("[data-prov]").forEach(function(b){
    b.addEventListener("click", function(){ editarProveedor(b.getAttribute("data-prov")); });
  });
  main.querySelectorAll("[data-borrar-prov]").forEach(function(b){
    b.addEventListener("click", function(){ quitarProveedor(b.getAttribute("data-borrar-prov")); });
  });
  main.querySelectorAll("[data-abrir-prov]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.prov=b.getAttribute("data-abrir-prov"); ui.vista="proveedor"; pintar(); window.scrollTo(0,0);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   LO QUE LE COMPRO A UNO
   ══════════════════════════════════════════════════════════════
   Pulsas SUMALISA y sale lo que le compras a SUMALISA, con su precio y
   su casilla para pedir. Es la pantalla que hace falta cuando el que
   llama es él, o cuando toca hacerle el pedido: en Precios están todos
   mezclados y buscarlos de uno en uno para un solo proveedor es
   trabajo inventado.

   Y de paso, lo que no se ve en ningún otro sitio: de esas cosas,
   cuáles le compras más caras que a otro. Es el único sitio donde esa
   pregunta tiene respuesta corta. */
function verProveedor(main){
  var nombre=ui.prov;
  var suyos=libro.productos.filter(function(p){ return p.proveedor===nombre; });
  if(!nombre || !suyos.length){ ui.vista="proveedores"; pintar(); return; }

  var datos=libro.proveedores[nombre]||{};
  var tel=telWhatsApp(nombre);
  var enPedido=suyos.filter(function(p){ return hayPedido(delPedido(p.id)); });
  var total=r2(enPedido.reduce(function(t,p){ return t+importeLinea(p); },0));
  var viejos=suyos.filter(esViejo).length;

  /* Para cada cosa suya, si hay otro que la tenga más barata. */
  var caros=[];
  suyos.forEach(function(p){
    if(!conIgi(p)) return;
    var mismos=libro.productos.filter(function(o){
      return o!==p && llaveDe(o)===llaveDe(p) && conIgi(o)>0; });
    if(!mismos.length) return;
    var mejor=mismos.sort(function(a,b){ return conIgi(a)-conIgi(b); })[0];
    if(conIgi(mejor) < conIgi(p)-0.004) caros.push({p:p, mejor:mejor});
  });

  main.innerHTML=
    '<p class="nota" style="margin:0 0 10px">'+
      '<button class="btn suave sm" id="pv_volver">← Proveedores</button></p>'+
    cabecera(nombre,
      (datos.contacto?esc(datos.contacto)+". ":"")+
      "Lo que le compras a este proveedor. Pon las cantidades aquí mismo y mándaselo.",
      /* Mientras los pedidos vayan a su móvil, el teléfono del
         proveedor no hace falta para nada. */
      (enPedido.length && (tel || miMovil())
        ? '<button class="btn wa" id="pv_mandar">📱 Mandar el pedido</button>' : "")+
      '<button class="btn" id="pv_ficha">Teléfono y contacto</button>')+

    (tel || miMovil() ? "" :
      '<div class="aviso-caja">No tiene ningún teléfono guardado. Ponle el móvil del comercial '+
      'con <strong>Teléfono y contacto</strong> y el pedido se le manda de una.</div>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Le compras</div><div class="v">'+suyos.length+'</div>'+
        '<div class="n">'+plural(suyos.length,"producto","productos")+' a su nombre</div></div>'+
      '<div class="cifra"><div class="k">En el pedido</div>'+
        '<div class="v'+(total?" acento":"")+'">'+(total?eur(total):"—")+'</div>'+
        '<div class="n">'+(enPedido.length
          ? plural(enPedido.length,"cosa apuntada","cosas apuntadas") : "nada apuntado")+'</div></div>'+
      '<div class="cifra"><div class="k">Más caro que otro</div>'+
        '<div class="v'+(caros.length?" malo":"")+'">'+(caros.length||"—")+'</div>'+
        '<div class="n">'+(caros.length
          ? "los tiene más baratos otro" : "nadie se lo mejora")+'</div></div>'+
      '<div class="cifra"><div class="k">Precios viejos</div>'+
        '<div class="v'+(viejos?" malo":"")+'">'+(viejos||"—")+'</div>'+
        '<div class="n">sin tocar desde hace tiempo</div></div>'+
    '</div>'+

    '<div class="tarjeta"><div class="tarjeta-cab">'+
      '<h2>Su lista</h2><span class="pista">escribe la cantidad y ya queda apuntado</span></div>'+
      '<div class="tabla-caja pegada"><table class="hoja"><thead><tr>'+
        '<th>Producto</th><th class="num">Precio</th><th class="num">Cuánto</th>'+
      '</tr></thead><tbody>'+
      suyos.sort(function(a,b){
        return (a.seccion||"").localeCompare(b.seccion||"") ||
               norm(a.nombre).localeCompare(norm(b.nombre));
      }).map(function(p){
        var l=delPedido(p.id), caja=+p.udsCaja||0;
        var caro=caros.filter(function(c){ return c.p===p; })[0];
        return '<tr class="st-fila'+(hayPedido(l)?" puesta":"")+'" data-of="'+esc(p.id)+'">'+
          '<td><div class="st-nom">'+esc(p.nombre)+'</div>'+
            '<div class="st-info">'+esc((p.seccion||"").toLowerCase())+
              (p.fecha?' · '+esc(dmy(p.fecha)):' · sin fecha')+
              (caja>0?' · '+esc(deCaja(p)):"")+
              (caro?' · <span style="color:var(--malo);font-weight:600">'+
                    esc(caro.mejor.proveedor)+' lo tiene a '+eur(conIgi(caro.mejor))+'</span>':"")+
            '</div></td>'+
          '<td class="num">'+(conIgi(p)
            ? '<strong>'+eur(conIgi(p))+'</strong>'
            : '<span style="color:var(--muted)">sin precio</span>')+
            (caja>0&&conIgi(p)?'<div style="font-size:11px;color:var(--muted)">caja '+
              eur(precioCaja(p))+'</div>':"")+'</td>'+
          (function(){
            var campo=unidadPuesta(p, l);
            return '<td class="num">'+casillaProv(p.id, campo, l[campo],
                     caja>1 ? "caj "+num(caja, caja%1?1:0) : "")+'</td>';
          })()+
        '</tr>';
      }).join("")+
      '</tbody></table></div></div>';

  document.getElementById("pv_volver").addEventListener("click", function(){
    ui.vista="proveedores"; pintar();
  });
  document.getElementById("pv_ficha").addEventListener("click", function(){ editarProveedor(nombre); });
  var bm=document.getElementById("pv_mandar");
  if(bm) bm.addEventListener("click", function(){ mandarPedido(nombre); });

  main.querySelectorAll("input[data-cpv]").forEach(function(input){
    var partes=input.getAttribute("data-cpv").split("|");
    var id=partes[0], campo=partes[1];
    input.addEventListener("input", function(){
      ponerEnPedido(id, campo, input.value);
      var l=delPedido(id);
      var fila=input.closest(".st-fila");
      if(fila) fila.classList.toggle("puesta", hayPedido(l));
      refrescarCabeceraProv(nombre, tel);
      pintarBarra();
    });
  });
  main.querySelectorAll("select[data-ud]").forEach(function(sel){
    sel.addEventListener("change", function(){
      cambiarUnidad(sel.getAttribute("data-ud"), sel.value);
      pintar();
    });
  });
}

/* Lo de arriba se toca a mano al escribir una cantidad: repintar la
   pantalla entera se llevaría el cursor de la casilla, y el botón de
   mandar tiene que aparecer en cuanto haya algo que mandar. */
function refrescarCabeceraProv(nombre, tel){
  var suyos=libro.productos.filter(function(p){ return p.proveedor===nombre; });
  var enPedido=suyos.filter(function(p){ return hayPedido(delPedido(p.id)); });
  var total=r2(enPedido.reduce(function(t,p){ return t+importeLinea(p); },0));

  var cifras=document.querySelectorAll(".cifra");
  if(cifras[1]){
    var v=cifras[1].querySelector(".v"), n=cifras[1].querySelector(".n");
    v.textContent=total?eur(total):"—";
    v.className="v"+(total?" acento":"");
    n.textContent=enPedido.length
      ? plural(enPedido.length,"cosa apuntada","cosas apuntadas") : "nada apuntado";
  }
  var cab=document.querySelector(".cabecera > div:last-child");
  var boton=document.getElementById("pv_mandar");
  if(enPedido.length && tel && !boton && cab){
    boton=document.createElement("button");
    boton.className="btn wa"; boton.id="pv_mandar"; boton.textContent="📱 Mandar el pedido";
    boton.addEventListener("click", function(){ mandarPedido(nombre); });
    cab.insertBefore(boton, cab.firstChild);
  } else if((!enPedido.length || !tel) && boton) boton.remove();
}

function casillaProv(id, campo, valor, etiquetaCaja){
  return '<span class="st-casilla">'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="—" '+
      'inputmode="numeric" data-cpv="'+esc(id)+'|'+campo+'" aria-label="Cantidad">'+
    selectorUnidad(id, campo, etiquetaCaja)+
  '</span>';
}

/* ── Quitar un proveedor ──────────────────────────────────────────
   Un proveedor no es una ficha suelta: existe porque hay productos que
   lo nombran. Así que borrarlo a secas no se puede —volvería a salir en
   cuanto se repintara la lista, sacado de sus propios productos—, y hay
   que decir qué pasa con ellos. Tres salidas, y la primera es la que más
   falta hace: en la hoja venían ALIMENTARIA y ALIMENTARIA GRUP, o CAIRAT
   y CAIRAT RIBOT, que son la misma casa escrita de dos maneras. Eso no
   es borrar, es juntar. */
function quitarProveedor(nombre){
  var suyos=libro.productos.filter(function(p){ return p.proveedor===nombre; });
  var enPedido=suyos.filter(function(p){ return hayPedido(delPedido(p.id)); }).length;
  var otros=listaProveedores().map(function(x){ return x.nombre; })
                              .filter(function(x){ return x!==nombre; });

  /* Sin productos que lo nombren, no hay nada que decidir: es sólo una
     ficha con un teléfono. */
  if(!suyos.length){
    confirmar("Quitar a "+nombre,
      '<p style="margin:0">No tiene ningún producto, así que sólo se va su teléfono y su '+
      'contacto.</p>',
      function(){
        delete libro.proveedores[nombre];
        guardar(); pintar(); avisar(nombre+" quitado");
      }, {aceptar:"Quitarlo", malo:true});
    return;
  }

  function opcion(id, titulo, explica, extra){
    return '<label style="display:flex;gap:10px;align-items:flex-start;padding:11px 0;'+
      'border-bottom:1px solid var(--linea-suave);cursor:pointer">'+
      '<input type="radio" name="qp" value="'+id+'" style="width:auto;margin-top:4px"'+
      (id==="pasar"?" checked":"")+'>'+
      '<span style="min-width:0"><b>'+titulo+'</b>'+
      '<div class="nota" style="margin:2px 0 0">'+explica+'</div>'+(extra||"")+'</span></label>';
  }

  abrirVentana("Quitar a "+nombre,
    '<p class="nota"><strong>'+esc(nombre)+'</strong> tiene '+
      plural(suyos.length,"producto","productos")+' a su nombre'+
      (enPedido?', y '+plural(enPedido,"está","están")+' en el pedido de hoy':"")+
      '. Dime qué hago con ellos.</p>'+
    opcion("pasar","Pasárselos a otro proveedor",
      "Para cuando el mismo proveedor está escrito de dos maneras y en realidad es uno solo.",
      '<select id="qp_otro" style="margin-top:8px">'+
        (otros.length
          ? otros.map(function(x){ return '<option>'+esc(x)+'</option>'; }).join("")
          : '<option value="">— no hay ningún otro —</option>')+
      '</select>')+
    opcion("sueltos","Dejarlos sin proveedor",
      "Los productos y sus precios se quedan; sólo pierden el nombre de quien los trae.")+
    opcion("todo","Borrarlos también",
      (suyos.length===1 ? "Se va su producto con su precio."
                        : "Se van sus "+suyos.length+" productos con sus precios.")+
      " Esto no se puede deshacer.")+
    '<p class="nota" style="margin:14px 0 0" id="qp_pista"></p>',
    function(){
      var elegido=(document.querySelector('input[name="qp"]:checked')||{}).value;
      if(elegido==="pasar"){
        var destino=valor("qp_otro");
        if(!destino){ avisar("No hay otro proveedor al que pasárselos.", true); return true; }
        suyos.forEach(function(p){ p.proveedor=destino; });
        delete libro.proveedores[nombre];
        guardar(); pintar();
        avisar(plural(suyos.length,"producto","productos")+" a "+destino);
      } else if(elegido==="sueltos"){
        suyos.forEach(function(p){ p.proveedor=""; });
        delete libro.proveedores[nombre];
        guardar(); pintar();
        avisar(nombre+" quitado; sus productos se quedan sin proveedor");
      } else {
        var ids={};
        suyos.forEach(function(p){ ids[p.id]=1; delete libro.pedido[p.id]; });
        libro.productos=libro.productos.filter(function(p){ return !ids[p.id]; });
        delete libro.proveedores[nombre];
        guardar(); pintar();
        avisar(nombre+" y sus "+plural(suyos.length,"producto","productos")+" borrados");
      }
    },
    {aceptar:"Hacerlo", malo:true, alAbrir:function(){
      var pista=document.getElementById("qp_pista");
      function refrescar(){
        var e=(document.querySelector('input[name="qp"]:checked')||{}).value;
        var destino=valor("qp_otro");
        pista.innerHTML =
          e==="pasar"  ? (destino
                            ? 'Quedará todo a nombre de <strong>'+esc(destino)+'</strong>, y '+
                              esc(nombre)+' desaparecerá de la lista.'
                            : 'Hace falta otro proveedor en la lista para poder pasárselos.')
        : e==="sueltos"? 'Los productos seguirán en <strong>Precios</strong>, sin nombre de '+
                         'proveedor, hasta que les pongas otro.'
        :                '<strong style="color:var(--malo)">'+
                         (suyos.length===1 ? "Se borra 1 producto" : "Se borran "+suyos.length+" productos")+
                         (enPedido?' y '+(enPedido===1?'sale':'salen')+' del pedido de hoy':"")+
                         '. No hay vuelta atrás.</strong>';
      }
      document.querySelectorAll('input[name="qp"]').forEach(function(r){
        r.addEventListener("change", refrescar);
      });
      var sel=document.getElementById("qp_otro");
      if(sel) sel.addEventListener("change", refrescar);
      refrescar();
    }});
}

function editarProveedor(nombre){
  var d=libro.proveedores[nombre]||{};
  abrirVentana("Proveedor: "+nombre,
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="pv_con">Comercial</label>'+
        '<input id="pv_con" value="'+esc(d.contacto||"")+'" placeholder="Nombre"></div>'+
      '<div class="campo"><label class="lbl" for="pv_mov">Su móvil <span class="mono" '+
        'style="text-transform:none">(el del WhatsApp)</span></label>'+
        '<input id="pv_mov" value="'+esc(d.movil||"")+'" placeholder="+376 300000"></div>'+
      '<div class="campo"><label class="lbl" for="pv_tel">Teléfono de la empresa</label>'+
        '<input id="pv_tel" value="'+esc(d.telefono||"")+'" placeholder="+376 800000"></div>'+
    '</div>'+
    '<div class="campo" style="margin-top:12px"><label class="lbl" for="pv_nota">Nota</label>'+
      '<input id="pv_nota" value="'+esc(d.nota||"")+'" placeholder="Reparte los martes, pedido antes de las 10…"></div>'+
    '<p class="nota" style="margin:12px 0 0">El pedido se manda al <strong>móvil del '+
    'comercial</strong>, que es el que lleva WhatsApp. El de la empresa casi siempre es un fijo '+
    'y sirve para llamar, no para mandarle nada. Si sólo tienes uno, ponlo donde sea: se usa el '+
    'móvil si lo hay, y si no, el otro.</p>'+
    '<p class="nota" style="margin:8px 0 0">Los números, enteros y con el país delante: '+
    '<span class="mono">+376</span> Andorra, <span class="mono">+34</span> España.</p>',
    function(){
      libro.proveedores[nombre]={ movil:valor("pv_mov"), telefono:valor("pv_tel"),
                                  contacto:valor("pv_con"), nota:valor("pv_nota") };
      guardar(); pintar(); avisar("Guardado");
    });
}

/* ══════════════════════════════════════════════════════════════
   EDITAR UN PRECIO
   ══════════════════════════════════════════════════════════════ */
/* Cambiar el precio pone la fecha de hoy sola. Es el descuido de
   siempre: se corrige la cifra, no se toca la fecha, y medio año después
   nadie sabe si ese precio es de ahora o del año pasado. */
function editarProducto(p){
  var nuevo=!p;
  var secs=secciones().map(function(s){ return s.nombre; });
  if(!secs.length) secs=["CONGELADOS","BEBIDAS","COMIDAS","LIMPIEZA","TABACO"];
  var provs=listaProveedores().map(function(x){ return x.nombre; });
  p=p||{seccion:secs[0], nombre:"", proveedor:"", precio:null, fecha:hoyISO(), igi:1, udsCaja:null};

  abrirVentana(nuevo?"Producto nuevo":p.nombre,
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="ep_nom">Producto</label>'+
        '<input id="ep_nom" class="grande" value="'+esc(p.nombre)+'" placeholder="ALITAS DE POLLO"></div>'+
      '<div class="campo"><label class="lbl" for="ep_prov">Proveedor</label>'+
        '<input id="ep_prov" class="grande" list="lista_prov" value="'+esc(p.proveedor)+'" '+
        'placeholder="INTERPESCA"><datalist id="lista_prov">'+
        provs.map(function(x){ return '<option value="'+esc(x)+'">'; }).join("")+'</datalist></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-top:12px">'+
      '<div class="campo"><label class="lbl" for="ep_precio">Precio del proveedor (€)</label>'+
        '<input type="number" id="ep_precio" class="grande" min="0" step="0.01" '+
        'value="'+(p.precio!=null?esc(p.precio):"")+'" placeholder="0,00"></div>'+
      '<div class="campo"><label class="lbl" for="ep_igi">IGI (%)</label>'+
        '<input type="number" id="ep_igi" min="0" max="30" step="0.5" value="'+esc(p.igi)+'"></div>'+
      '<div class="campo"><label class="lbl" for="ep_uds">Unidades por caja</label>'+
        '<input type="number" id="ep_uds" min="0" step="0.1" '+
        'value="'+(p.udsCaja!=null?esc(p.udsCaja):"")+'" placeholder="sueltas"></div>'+
      '<div class="campo"><label class="lbl" for="ep_ud">El precio es por</label>'+
        '<select id="ep_ud">'+
        [["","unidad"],["kg","kilo"],["L","litro"]]
          .map(function(o){
            return '<option value="'+o[0]+'"'+(unidadDe(p)===o[0]?" selected":"")+'>'+o[1]+'</option>';
          }).join("")+'</select></div>'+
      '<div class="campo"><label class="lbl" for="ep_pedir">Cómo se pide</label>'+
        '<select id="ep_pedir">'+
        [["cajas","por cajas"],["kg","en kilos"],["litros","en litros"],["uds","en unidades"]]
          .map(function(o){
            return '<option value="'+o[0]+'"'+(campoNatural(p)===o[0]?" selected":"")+'>'+o[1]+'</option>';
          }).join("")+'</select></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-top:12px">'+
      '<div class="campo"><label class="lbl" for="ep_sec">Sección</label>'+
        '<select id="ep_sec">'+secs.map(function(s){
          return '<option'+(s===p.seccion?" selected":"")+'>'+esc(s)+'</option>'; }).join("")+'</select></div>'+
      '<div class="campo"><label class="lbl" for="ep_fecha">Fecha del precio</label>'+
        '<input type="date" id="ep_fecha" value="'+esc(p.fecha||"")+'"></div>'+
    '</div>'+
    '<label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;cursor:pointer">'+
      '<input type="checkbox" id="ep_diario" style="width:auto;margin-top:3px"'+
      (p.diario?" checked":"")+'>'+
      '<span><b>Lo pido cada día</b>'+
      '<div class="nota" style="margin:2px 0 0">Sale en la pantalla de <strong>Cada día</strong>, '+
      'con la verdura y la carne, en vez de haber que buscarlo.</div></span></label>'+
    '<p class="nota" style="margin:14px 0 0" id="ep_cuenta"></p>'+
    (nuevo?"":'<p class="nota" style="margin:10px 0 0">Si le cambias el precio, la fecha se pone '+
      'sola en la de hoy. <button type="button" class="btn suave sm malo" id="ep_borrar" '+
      'style="text-decoration:underline">Borrar este precio</button></p>'),
    function(){
      var nom=valor("ep_nom");
      if(!nom){ avisar("Ponle un nombre al producto.", true); return true; }
      var antes=p.precio;
      var ahora=(document.getElementById("ep_precio").value!=="") ? r2(numero("ep_precio")) : null;
      p.nombre=nom;
      p.proveedor=valor("ep_prov");
      p.seccion=valor("ep_sec");
      p.igi=numero("ep_igi");
      p.udsCaja=(document.getElementById("ep_uds").value!=="") ? +numero("ep_uds") : null;
      p.fecha=valor("ep_fecha");
      p.diario=document.getElementById("ep_diario").checked;
      p.ud=valor("ep_ud");
      p.pedirEn=valor("ep_pedir");
      /* Pedirlo por cajas sin decir cuantas trae deja el importe corto:
         la caja sin unidades no tiene precio. Se guarda igual, pero el
         aviso lo dice al final, que si no lo tapa el "Guardado". */
      var faltaCaja=(p.pedirEn==="cajas" && !(+p.udsCaja>0));
      /* La fecha sólo se pone sola si cambió el precio y él no la tocó. */
      if(ahora!==antes && !document.getElementById("ep_fecha").dataset.tocada) p.fecha=hoyISO();
      p.precio=ahora;
      if(!p.id){ p.id=uid(); libro.productos.push(p); }
      guardar(); pintar();
      if(faltaCaja)
        avisar("Guardado, pero lo pides por cajas y no dice cuantas unidades trae: el importe saldra corto.", true);
      else
        avisar(nuevo?"Producto añadido":"Guardado: "+p.nombre);
    },
    {aceptar:nuevo?"Añadir":"Guardar", alAbrir:function(){
      var fecha=document.getElementById("ep_fecha");
      fecha.addEventListener("input", function(){ this.dataset.tocada="1"; });
      function cuenta(){
        var pr=numero("ep_precio"), igi=numero("ep_igi"), uds=numero("ep_uds");
        var neto=r2(pr*(1+igi/100));
        var t=document.getElementById("ep_cuenta");
        if(!pr){ t.innerHTML="Sin precio, este proveedor no entra en la comparación."; return; }
        t.innerHTML="Con el IGI: <strong>"+eur(neto)+"</strong>"+
          (uds>0 ? ". La caja de "+num(uds, uds%1?1:0)+" sale a <strong>"+eur(r2(neto*uds))+"</strong>." : ".");
      }
      ["ep_precio","ep_igi","ep_uds"].forEach(function(id){
        document.getElementById(id).addEventListener("input", cuenta);
      });
      cuenta();
      var bb=document.getElementById("ep_borrar");
      if(bb) bb.addEventListener("click", function(){
        cerrarVentana();
        confirmar("Borrar el precio de "+(p.proveedor||"este proveedor"),
          '<p style="margin:0">Se quita <strong>'+esc(p.nombre)+'</strong> de '+
          esc(p.proveedor||"ese proveedor")+'. Los demás proveedores del mismo producto se quedan.</p>',
          function(){
            libro.productos=libro.productos.filter(function(x){ return x.id!==p.id; });
            delete libro.pedido[p.id];
            guardar(); pintar(); avisar("Borrado");
          }, {aceptar:"Borrar", malo:true});
      });
    }});
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function verAjustes(main){
  var viejos=libro.productos.filter(esViejo);
  main.innerHTML=
    cabecera("Ajustes", "Cómo se llama la casa y cómo sale el pedido que se manda.")+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>La casa</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div class="rejilla">'+
          '<div class="campo"><label class="lbl" for="aj_nom">Nombre del restaurante</label>'+
            '<input id="aj_nom" value="'+esc(libro.ajustes.nombre||"")+'" '+
            'placeholder="Sale como cabecera del pedido"></div>'+
          '<div class="campo"><label class="lbl" for="aj_meses">Un precio es viejo a los… (meses)</label>'+
            '<input type="number" id="aj_meses" min="1" max="60" step="1" '+
            'value="'+esc(libro.ajustes.mesesViejo||24)+'"></div>'+
          '<div class="campo"><label class="lbl" for="aj_movil">Tu móvil</label>'+
            '<input id="aj_movil" value="'+esc(libro.ajustes.miMovil||"")+'" '+
            'placeholder="00376 341 459"></div>'+
        '</div>'+
        '<label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;cursor:pointer">'+
          '<input type="checkbox" id="aj_ami" style="width:auto;margin-top:3px"'+
          (libro.ajustes.aMi?" checked":"")+'>'+
          '<span><b>Mandármelos a mí, de primeras</b>'+
          '<div class="nota" style="margin:2px 0 0">Al mandar un pedido salen siempre los dos '+
          'botones —<strong>a mí</strong> y <strong>al proveedor</strong>—; esto sólo decide '+
          'cuál va destacado. El que va a tu móvil lleva escrito arriba para quién es, porque '+
          'te llegan varios al mismo chat.</div></span></label>'+
        '<label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;cursor:pointer">'+
          '<input type="checkbox" id="aj_imp" style="width:auto;margin-top:3px"'+
          (libro.ajustes.conImportes?" checked":"")+'>'+
          '<span><b>Poner los importes en el pedido que se manda</b>'+
          '<div class="nota" style="margin:2px 0 0">Normalmente no: al proveedor se le pide '+
          'cantidad, y el precio ya se lo sabe. Márcalo si quieres que el pedido lleve tus '+
          'cifras para que él las confirme.</div></span></label>'+
        '<div style="margin-top:16px"><button class="btn fuerte" id="aj_guardar">Guardar</button></div>'+
      '</div></div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Precios que hay que repasar</h2>'+
        '<span class="pista">'+plural(viejos.length,"precio","precios")+' de más de '+
        num(libro.ajustes.mesesViejo||24,0)+' meses o sin fecha</span></div>'+
      (viejos.length
        ? '<div class="tabla-caja"><table><thead><tr><th>Producto</th><th>Proveedor</th>'+
          '<th class="num">Precio</th><th>Fecha</th><th></th></tr></thead><tbody>'+
          viejos.sort(function(a,b){ return (a.fecha||"").localeCompare(b.fecha||""); })
                .slice(0,60).map(function(p){
            return '<tr><td><strong>'+esc(p.nombre)+'</strong></td><td>'+esc(p.proveedor)+'</td>'+
              '<td class="num">'+(p.precio?eur(conIgi(p)):"—")+'</td>'+
              '<td'+(p.fecha?"":' style="color:var(--aviso)"')+'>'+(p.fecha?esc(dmy(p.fecha)):"sin fecha")+'</td>'+
              '<td class="num"><button class="btn suave sm" data-editar2="'+esc(p.id)+'">Cambiar</button></td></tr>';
          }).join("")+
          '</tbody></table></div>'+
          (viejos.length>60?'<div class="tarjeta-cuerpo"><p class="nota" style="margin:0">Y '+
            (viejos.length-60)+' más.</p></div>':"")
        : '<div class="vacio"><strong>Todos al día</strong>Ningún precio pasa de '+
          num(libro.ajustes.mesesViejo||24,0)+' meses.</div>')+
    '</div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>De dónde sale cada número</h2></div>'+
      '<div class="tarjeta-cuerpo"><div class="nota" style="max-width:78ch">'+
        '<p style="margin:0 0 8px">El <strong style="color:var(--tinta)">precio</strong> es el del '+
        'proveedor, tal cual te lo pasa. Es lo único que se escribe.</p>'+
        '<p style="margin:0 0 8px">El <strong style="color:var(--tinta)">precio con IGI</strong> —el que '+
        'sale gordo en cada ficha— es ése con su impuesto: 1 % la comida, 4,5 % la bebida, la limpieza '+
        'y el tabaco. Es el que hay que comparar, porque sin él dos precios de secciones distintas no '+
        'se pueden poner uno al lado del otro.</p>'+
        '<p style="margin:0 0 8px">El <strong style="color:var(--tinta)">precio de la caja</strong> es el '+
        'precio con IGI por las unidades que trae la caja.</p>'+
        '<p style="margin:0"><strong style="color:var(--tinta)">El más barato</strong> se marca solo, y '+
        'sólo cuando hay más de un proveedor con precio puesto. Ojo: es el más barato <em>según la '+
        'fecha que tenga cada uno</em>; si uno lleva dos años sin actualizar, la comparación no vale '+
        'gran cosa. Por eso los viejos van en ámbar.</p>'+
      '</div></div></div>';

  document.getElementById("aj_guardar").addEventListener("click", function(){
    libro.ajustes.nombre=valor("aj_nom");
    libro.ajustes.mesesViejo=Math.max(1, numero("aj_meses")||12);
    libro.ajustes.conImportes=document.getElementById("aj_imp").checked;
    libro.ajustes.miMovil=valor("aj_movil");
    libro.ajustes.aMi=document.getElementById("aj_ami").checked;
    guardar(); pintar();
    avisar(vaAMi() ? "Ajustes guardados: el botón de tu móvil va primero" : "Ajustes guardados");
  });
  main.querySelectorAll("[data-editar2]").forEach(function(b){
    b.addEventListener("click", function(){ editarProducto(productoPorId(b.getAttribute("data-editar2"))); });
  });
}

/* ══════════════════════════════════════════════════════════════
   LA LISTA DE TELÉFONOS
   ══════════════════════════════════════════════════════════════
   La agenda de los proveedores, de corrido y para llamar: el nombre, el
   comercial con su móvil y el teléfono de la empresa. Los números se
   pulsan y marcan.

   Es lo mismo que hay en Proveedores, pero allí se va a poner precios y
   a cambiar fichas, y esto es para cuando lo que quieres es llamar a
   uno y ya. Por eso va sola, al final, y se puede imprimir para
   dejarla al lado del teléfono.
   ══════════════════════════════════════════════════════════════ */
function verTelefonos(main){
  var lista=listaProveedores().slice().sort(function(a,b){
    return a.nombre.localeCompare(b.nombre,"es");
  });
  var texto=(ui.qTel||"").trim().toLowerCase();
  var salen=lista.filter(function(p){
    if(!texto) return true;
    var d=libro.proveedores[p.nombre]||{};
    return norm(p.nombre+" "+(d.contacto||"")+" "+(d.movil||"")+" "+(d.telefono||"")+" "+(d.nota||""))
           .indexOf(norm(texto))>=0;
  });
  var conMovil=lista.filter(function(p){ return movilDe(p.nombre); }).length;
  var sinNada=lista.filter(function(p){ return !telWhatsApp(p.nombre); });

  main.innerHTML=
    cabecera("Teléfonos",
      "Todos los proveedores, para llamar. Pulsa un número y se marca solo.",
      '<button class="btn" id="tel_copiar">Copiar la lista</button>'+
      '<button class="btn" id="tel_imprimir">Imprimir</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Proveedores</div><div class="v">'+lista.length+'</div>'+
        '<div class="n">en la lista de precios</div></div>'+
      '<div class="cifra"><div class="k">Con móvil</div>'+
        '<div class="v'+(conMovil<lista.length?"":" acento")+'">'+conMovil+'</div>'+
        '<div class="n">el del comercial</div></div>'+
      '<div class="cifra"><div class="k">Sin ningún teléfono</div>'+
        '<div class="v'+(sinNada.length?" malo":"")+'">'+sinNada.length+'</div>'+
        '<div class="n">'+(sinNada.length?"no se les puede llamar":"todos localizables")+'</div></div>'+
    '</div>'+

    '<div class="filtros no-imprimir">'+
      '<input class="buscador" id="tel_busca" placeholder="Buscar por nombre, comercial o número…" '+
        'value="'+esc(ui.qTel||"")+'" style="max-width:340px">'+
    '</div>'+

    (!salen.length
      ? '<div class="tarjeta"><div class="vacio"><strong>Ninguno se llama así</strong>'+
        'Prueba con otra cosa.</div></div>'
      : '<div class="tarjeta"><div class="tabla-caja"><table class="agenda"><tbody>'+
        salen.map(function(p){
          var d=libro.proveedores[p.nombre]||{};
          var mov=movilDe(p.nombre), fijo=fijoDe(p.nombre);
          return '<tr>'+
            '<td><strong>'+esc(p.nombre)+'</strong>'+
              (d.nota?'<div class="tel-nota">'+esc(d.nota)+'</div>':"")+'</td>'+
            '<td>'+(d.contacto?'<div>'+esc(d.contacto)+'</div>':
                    '<div class="tel-nota">sin comercial</div>')+
              (mov?'<a class="tel-num" href="tel:+'+esc(mov)+'">+'+esc(mov)+'</a>'
                  :'<span class="tel-nota">sin móvil</span>')+'</td>'+
            '<td class="num">'+(fijo
              ? '<a class="tel-num flojo" href="tel:+'+esc(fijo)+'">+'+esc(fijo)+'</a>'+
                '<div class="tel-nota">la empresa</div>'
              : '<span class="tel-nota">—</span>')+'</td>'+
            '<td class="num no-imprimir"><button class="btn suave sm" data-teledit="'+
              esc(p.nombre)+'">Cambiar</button></td>'+
          '</tr>';
        }).join("")+
        '</tbody></table></div></div>')+

    (sinNada.length
      ? '<p class="nota no-imprimir" style="margin:12px 0 0">Sin ningún teléfono: '+
        esc(sinNada.map(function(p){ return p.nombre; }).join(", "))+'.</p>'
      : "");

  var busca=document.getElementById("tel_busca");
  busca.addEventListener("input", function(){
    ui.qTel=busca.value;
    verTelefonos(main);
    /* Repintar la pantalla se lleva el cursor del buscador: se devuelve
       al final de lo escrito, que si no hay que volver a pulsar en la
       caja por cada letra. */
    var otra=document.getElementById("tel_busca");
    if(otra){ otra.focus(); otra.setSelectionRange(otra.value.length, otra.value.length); }
  });
  main.querySelectorAll("[data-teledit]").forEach(function(b){
    b.addEventListener("click", function(){ editarProveedor(b.getAttribute("data-teledit")); });
  });
  document.getElementById("tel_imprimir").addEventListener("click", function(){ window.print(); });
  document.getElementById("tel_copiar").addEventListener("click", function(){
    var t=lista.map(function(p){
      var d=libro.proveedores[p.nombre]||{};
      var trozos=[p.nombre];
      if(d.contacto) trozos.push(d.contacto);
      if(movilDe(p.nombre)) trozos.push("+"+movilDe(p.nombre));
      if(fijoDe(p.nombre)) trozos.push("empresa +"+fijoDe(p.nombre));
      return trozos.join(" · ");
    }).join("\n");
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(
        function(){ avisar("Lista copiada: "+plural(lista.length,"proveedor","proveedores")); },
        function(){ avisar("No he podido copiarla.", true); });
    } else avisar("Este navegador no deja copiar solo.", true);
  });
}

/* ══════════════════════════════════════════════════════════════
   VENTANAS
   ══════════════════════════════════════════════════════════════ */
/* Propias, no las del navegador: en el visor de artefactos y en algunos
   móviles, confirm() y alert() se ignoran sin decir nada. */
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
      '<button class="btn" data-cerrar>Cancelar</button>'+
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
       queda abierta para que se pueda arreglar sin volver a escribirlo. */
    if(alAceptar && alAceptar()===true) return;
    cerrarVentana();
  });
  if(opciones.alAbrir) opciones.alAbrir();
  var primero=d.querySelector(".dlg-cuerpo input,.dlg-cuerpo select,.dlg-cuerpo textarea");
  if(primero && !("ontouchstart" in window)) primero.focus();
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  abrirVentana(titulo, cuerpo, alAceptar, opciones||{aceptar:"Aceptar"});
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
