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
   menos que mantener. Los productos siguen todos, marcados como del día
   y con su unidad —kilos, cajas—, que eso es del producto y no de la
   pantalla que se borró.

   Y LO DE SIEMPRE. Un pedido de la semana se parece mucho al de la
   semana pasada: las mismas cosas y casi las mismas cantidades. Escribir
   eso entero cada vez es copiarse a uno mismo. Así que cada producto
   puede llevar apuntado lo que quieres tener cada semana, y un botón lo
   pone todo de golpe; luego se baja lo que aún te quede y se manda.

   Lo de siempre no se teclea aparte: se hace un pedido bueno de la
   manera normal y se pulsa «Guardar como lo de siempre». La plantilla
   sale del trabajo ya hecho, que es la única forma de que alguien la
   mantenga al día.

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
    proveedores:{},   /* "INTERPESCA": {telefono, contacto, nota} */
    pedido:{},        /* id del producto -> {uds, cajas} */
    enviados:[]       /* {id, fecha, proveedor, lineas:[{nombre,uds,cajas,importe}], total} */
  };
}

var libro = libroVacio();
var ui = { vista:"precios", q:"", seccion:"", soloPedido:false, soloBaratos:false,
           qStock:"", secStock:"", qApunte:"", prov:null };

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

/* La verdura no se pide toda igual: el tomate en kilos, la lechuga en
   cajas y los huevos a unidades. La unidad se guarda EN EL PRODUCTO, no
   en el pedido de hoy: cada cosa se pide siempre igual, y así no hay que
   volver a decirlo todas las mañanas. */
var UNIDADES=["kg","cajas","un",""];
function unidadDe(p){
  var u=(p&&p.ud)||"";
  return UNIDADES.indexOf(u)>=0 ? u : "";
}
function siguienteUnidad(u){
  var i=UNIDADES.indexOf(u);
  return UNIDADES[(i<0?UNIDADES.length-1:i+1)%UNIDADES.length];
}
function etiquetaUnidad(u){ return u || "—"; }
/* "3 kg", "2 cajas", "4 un" o "4" a secas. En singular, una caja. */
function cantidadConUnidad(n, u){
  if(!u) return String(n);
  if(u==="cajas") return n+(n===1?" caja":" cajas");
  return n+" "+u;
}
function productoPorId(id){
  return libro.productos.filter(function(p){ return p.id===id; })[0] || null;
}

/* ── Lo de siempre: el pedido de la semana ────────────────────────
   Lo que quieres que haya cada semana, apuntado en el producto. Se
   guarda tal y como se pidió —unidades o cajas—, que no es lo mismo
   pedir 2 cajas de alitas que 2 alitas. */
function semanalDe(p){
  var s=(p && p.semanal) || null;
  if(!s) return null;
  var uds=+s.uds||0, cajas=+s.cajas||0;
  return (uds||cajas) ? {uds:uds, cajas:cajas} : null;
}
function conSemanal(){ return libro.productos.filter(semanalDe); }
function hayPlantilla(){ return libro.productos.some(semanalDe); }
/* Lo de siempre, puesto en el pedido. No borra lo que ya hubiera
   escrito a mano: si hoy ya habías apuntado algo de una cosa, manda lo
   tuyo — lo de siempre es un punto de partida, no una orden. */
function ponerPlantilla(){
  var puestos=0, respetados=0;
  conSemanal().forEach(function(p){
    var l=delPedido(p.id);
    if(l.uds || l.cajas){ respetados++; return; }
    var s=semanalDe(p);
    libro.pedido[p.id]={uds:s.uds, cajas:s.cajas};
    puestos++;
  });
  guardar(); pintar();
  avisar(puestos
    ? "Puesto lo de siempre: "+plural(puestos,"cosa","cosas")+
      (respetados?" ("+plural(respetados,"ya la tenías puesta","ya las tenías puestas")+")":"")
    : "Ya lo tenías todo puesto");
}
/* Al revés: lo que hay escrito hoy pasa a ser lo de siempre. Lo que no
   está en el pedido deja de estarlo, porque «lo de siempre» es este
   pedido, no éste más lo que hubiera antes. */
function guardarPlantilla(){
  var n=0;
  libro.productos.forEach(function(p){
    var l=delPedido(p.id);
    if(l.uds || l.cajas){ p.semanal={uds:l.uds, cajas:l.cajas}; n++; }
    else if(p.semanal) delete p.semanal;
  });
  guardar(); pintar();
  avisar("Stock semanal guardado: "+plural(n,"cosa","cosas"));
}
function textoSemanal(p){
  var s=semanalDe(p);
  if(!s) return "";
  var t=[];
  if(s.cajas) t.push(s.cajas+(s.cajas===1?" caja":" cajas"));
  if(s.uds) t.push(esDiario(p) ? cantidadConUnidad(s.uds, unidadDe(p))
                               : s.uds+(s.uds===1?" unidad":" unidades"));
  return t.join(" + ");
}

/* ── El pedido ────────────────────────────────────────────────── */
function delPedido(id){
  var l=libro.pedido[id];
  return { uds:(l&&+l.uds)||0, cajas:(l&&+l.cajas)||0 };
}
function ponerEnPedido(id, campo, n){
  n=Math.max(0, Math.round(+n||0));
  var l=libro.pedido[id] || {uds:0, cajas:0};
  l[campo]=n;
  if(!l.uds && !l.cajas) delete libro.pedido[id]; else libro.pedido[id]=l;
  guardar();
}
function importeLinea(p){
  var l=delPedido(p.id);
  return r2(l.uds*conIgi(p) + l.cajas*precioCaja(p));
}
/* El pedido, repartido por proveedor: a cada uno se le manda el suyo. */
function pedidoPorProveedor(){
  var por={};
  Object.keys(libro.pedido).forEach(function(id){
    var p=productoPorId(id); if(!p) return;
    var l=delPedido(id);
    if(!l.uds && !l.cajas) return;
    var prov=p.proveedor||"Sin proveedor";
    if(!por[prov]) por[prov]={proveedor:prov, lineas:[], total:0};
    por[prov].lineas.push({p:p, uds:l.uds, cajas:l.cajas, importe:importeLinea(p)});
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
    var l=delPedido(id); return l.uds||l.cajas;
  }).length;
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
var APARTADOS=[
  {id:"precios",     nombre:"Precios"},
  {id:"stock",       nombre:"Stock semanal", cuenta:function(){ return conSemanal().length; }},
  {id:"pedido",      nombre:"El pedido", cuenta:function(){ return lineasPedido(); }},
  {id:"proveedores", nombre:"Proveedores"},
  {id:"ajustes",     nombre:"Ajustes"}
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

  ({precios:verPrecios, stock:verStock, pedido:verPedido, proveedores:verProveedores,
    proveedor:verProveedor, ajustes:verAjustes})[ui.vista](document.getElementById("main"));

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
    if(ui.soloPedido){ var l=delPedido(p.id); if(!l.uds && !l.cajas) return false; }
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
      (hayPlantilla() ? '<button class="btn" id="pr_siempre">↺ Poner el stock semanal</button>' : "")+
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
  var bs2=document.getElementById("pr_siempre");
  if(bs2) bs2.addEventListener("click", ponerPlantilla);
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
  var enPedido=g.ofertas.some(function(o){ var l=delPedido(o.id); return l.uds||l.cajas; });
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
  var pedida=(l.uds||l.cajas);
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
  if(caja>0) info.push('<span>caja de '+num(caja, caja%1?1:0)+' · '+eur(precioCaja(o))+'</span>');
  var sem=textoSemanal(o);
  if(sem) info.push('<span style="color:var(--acento);font-weight:600">cada semana, '+esc(sem)+'</span>');

  return '<div class="oferta'+(esMejor?" mejor":"")+(pedida?" encargada":"")+'" data-of="'+esc(o.id)+'">'+
    '<div class="of-quien">'+
      '<div class="of-prov">'+esc(o.proveedor||"— sin proveedor —")+
        (esMejor?' <span class="chapa ok" style="font-size:10.5px">más barato</span>':"")+'</div>'+
      '<div class="of-precio'+(esMejor?" mejor":"")+(neto?"":" sin")+'">'+
        (neto?eur(neto):"sin precio")+'</div>'+
      '<div class="of-info">'+info.join("")+
        ' <button class="btn suave sm" data-editar="'+esc(o.id)+'" '+
        'style="padding:0 4px;font-size:11.5px;text-decoration:underline">cambiar</button></div>'+
    '</div>'+
    '<div class="of-acciones">'+
      contador(o.id, "uds", l.uds, "un")+
      (caja>0 ? contador(o.id, "cajas", l.cajas, "caj") : "")+
    '</div>'+
  '</div>';
}

function contador(id, campo, valor, etiqueta){
  return '<div class="contador'+(valor?" activo":"")+'" data-cnt="'+esc(id)+'|'+campo+'">'+
    '<button type="button" data-paso="-1" aria-label="Quitar uno">−</button>'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="0" '+
      'inputmode="numeric" aria-label="Cantidad">'+
    '<button type="button" data-paso="1" aria-label="Añadir uno">+</button>'+
    '<span class="ud">'+etiqueta+'</span>'+
  '</div>';
}

/* Tocar una cantidad no repinta la lista entera: se cambia lo justo —el
   número, el color de la línea y la barra de abajo— porque con 573
   fichas un repintado se nota y, peor, se lleva el foco del buscador. */
function engancharFichas(caja){
  caja.querySelectorAll("[data-cnt]").forEach(function(c){
    var partes=c.getAttribute("data-cnt").split("|");
    var id=partes[0], campo=partes[1];
    var input=c.querySelector("input");
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
  linea.classList.toggle("encargada", !!(l.uds||l.cajas));
  linea.classList.toggle("puesta", !!(l.uds||l.cajas));
  var ficha=linea.closest(".prod"); if(!ficha) return;
  var ids=[].slice.call(ficha.querySelectorAll("[data-of]"))
             .map(function(x){ return x.getAttribute("data-of"); });
  var total=r2(ids.reduce(function(s,x){
    var p=productoPorId(x); return s+(p?importeLinea(p):0); },0));
  ficha.classList.toggle("pedido", total>0 || ids.some(function(x){
    var q=delPedido(x); return q.uds||q.cajas; }));
  var pie=ficha.querySelector(".linea-total");
  if(total>0){
    if(!pie){ pie=document.createElement("div"); pie.className="linea-total"; ficha.appendChild(pie); }
    pie.innerHTML='<span>En el pedido</span><b>'+eur(total)+'</b>';
  } else if(pie) pie.remove();
}

/* ══════════════════════════════════════════════════════════════
   STOCK SEMANAL
   ══════════════════════════════════════════════════════════════
   Lo que quieres que haya cada semana, producto por producto. Es una
   lista que se escribe una vez y luego se usa todas las semanas: el
   botón de arriba pone ese stock entero en el pedido, y desde ahí se
   baja lo que aún te quede y se manda.

   El botón que había antes sólo salía si ya tenías un stock guardado, y
   guardarlo era pulsar otro botón escondido en El pedido. O sea que
   quien no lo tenía no podía verlo: no se podía llegar a usar. Ahora es
   un apartado, está siempre, y vacío te dice para qué es. */
function verStock(main){
  var conNivel=conSemanal();

  main.innerHTML=
    cabecera("Stock semanal",
      "Lo que quieres tener cada semana de cada cosa. Se pone una vez y "+
      "luego el pedido entero sale de aquí con un botón.",
      '<button class="btn fuerte" id="st_poner"'+(conNivel.length?"":" disabled")+'>'+
        '↺ Poner el pedido de la semana</button>'+
      (lineasPedido()
        ? '<button class="btn" id="st_coger">Cogerlo del pedido de ahora</button>' : "")+
      (conNivel.length ? '<button class="btn malo" id="st_vaciar">Vaciar el stock</button>' : ""))+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Con stock puesto</div>'+
        '<div class="v'+(conNivel.length?" acento":"")+'">'+conNivel.length+'</div>'+
        '<div class="n">de '+libro.productos.length+' productos</div></div>'+
      '<div class="cifra"><div class="k">Lo que costaría</div>'+
        '<div class="v">'+(costeSemanal()>0?eur(costeSemanal()):"—")+'</div>'+
        '<div class="n">'+(costeSemanal()>0?"a los precios de hoy":"nada con precio todavía")+'</div></div>'+
      '<div class="cifra"><div class="k">Proveedores</div>'+
        '<div class="v">'+proveedoresSemanal().length+'</div>'+
        '<div class="n">a los que les pedirías</div></div>'+
    '</div>'+

    '<div class="buscar">'+
      '<div class="buscar-caja">'+
        '<span class="lupa">⌕</span>'+
        '<input id="qs" type="search" autocomplete="off" spellcheck="false" '+
        'placeholder="Busca el producto al que ponerle stock…" value="'+esc(ui.qStock)+'">'+
        '<button class="limpiar'+(ui.qStock?" hay":"")+'" id="qs_limpiar" title="Limpiar">✕</button>'+
      '</div>'+
      '<div class="chips">'+
        '<button class="chip" data-secst="__puestos" aria-pressed="'+(ui.secStock==="__puestos")+'">'+
          'Con stock<span class="n">'+conNivel.length+'</span></button>'+
        '<button class="chip" data-secst="" aria-pressed="'+(!ui.secStock)+'">Todo'+
          '<span class="n">'+libro.productos.length+'</span></button>'+
        secciones().map(function(x){
          return '<button class="chip" data-secst="'+esc(x.nombre)+'" aria-pressed="'+
            (ui.secStock===x.nombre)+'">'+esc(x.nombre.charAt(0)+x.nombre.slice(1).toLowerCase())+
            '<span class="n">'+x.n+'</span></button>';
        }).join("")+
      '</div>'+
    '</div>'+
    '<div id="listaStock"></div>';

  var campo=document.getElementById("qs");
  campo.addEventListener("input", function(){
    ui.qStock=this.value;
    document.getElementById("qs_limpiar").classList.toggle("hay", !!this.value);
    pintarStock();
  });
  campo.addEventListener("keydown", function(e){
    if(e.key==="Escape" && this.value){ e.preventDefault(); this.value=""; ui.qStock="";
      document.getElementById("qs_limpiar").classList.remove("hay"); pintarStock(); }
  });
  document.getElementById("qs_limpiar").addEventListener("click", function(){
    ui.qStock=""; campo.value=""; this.classList.remove("hay"); pintarStock(); campo.focus();
  });
  main.querySelectorAll("[data-secst]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.secStock=b.getAttribute("data-secst");
      if(ui.qStock){ ui.qStock=""; campo.value="";
                     document.getElementById("qs_limpiar").classList.remove("hay"); }
      main.querySelectorAll("[data-secst]").forEach(function(x){ x.setAttribute("aria-pressed", x===b); });
      pintarStock();
    });
  });
  var bp=document.getElementById("st_poner");
  if(bp && !bp.disabled) bp.addEventListener("click", function(){
    ponerPlantilla(); ui.vista="pedido"; pintar(); window.scrollTo(0,0);
  });
  var bv=document.getElementById("st_vaciar");
  if(bv) bv.addEventListener("click", vaciarStock);
  /* Al revés: el pedido que tengas montado ahora pasa a ser el stock. Es
     la forma más rápida de llenar esta hoja la primera vez, porque el
     trabajo ya está hecho en El pedido. */
  var bc=document.getElementById("st_coger");
  if(bc) bc.addEventListener("click", function(){
    confirmar("Coger el stock del pedido de ahora",
      '<p style="margin:0 0 10px">'+(lineasPedido()===1
        ? "La cosa que tienes apuntada ahora en el pedido, con su cantidad, pasa"
        : "Las "+lineasPedido()+" cosas que tienes apuntadas ahora en el pedido, con sus "+
          "cantidades, pasan")+' a ser tu stock semanal.</p>'+
      (hayPlantilla()
        ? '<p class="nota" style="margin:0">Se sustituye el que ya tenías ('+
          plural(conSemanal().length,"producto","productos")+'): lo que no esté en el pedido '+
          'de ahora se queda sin stock.</p>'
        : '<p class="nota" style="margin:0">El pedido no se toca; sólo se copia.</p>'),
      guardarPlantilla, {aceptar:"Cogerlo"});
  });

  pintarStock();
  if(!("ontouchstart" in window)) campo.focus();
}

/* Quitarle el stock a todo de una vez, que ponerle un cero a ciento y
   pico productos uno por uno no lo hace nadie. Si estás mirando una
   sección, se puede vaciar sólo ésa: es lo que se querrá casi siempre
   —cambia el proveedor de la verdura y hay que rehacer esa parte— y
   vaciarlo todo por no tener la opción sería perder el resto. */
function vaciarStock(){
  var todos=conSemanal();
  if(!todos.length) return;
  var seccion=(ui.secStock && ui.secStock!=="__puestos") ? ui.secStock : null;
  var deLaSeccion=seccion
    ? todos.filter(function(p){ return p.seccion===seccion; }) : [];

  function limpiar(lista, dicho){
    lista.forEach(function(p){ delete p.semanal; });
    guardar(); pintar();
    avisar(dicho);
  }

  confirmar("Vaciar el stock semanal",
    '<p style="margin:0 0 10px">Se le quita el stock a '+
      plural(todos.length,"producto","productos")+'. Los productos y sus precios no se tocan: '+
      'lo único que se borra es cuánto querías tener de cada cosa.</p>'+
    (seccion && deLaSeccion.length && deLaSeccion.length<todos.length
      ? '<p class="nota" style="margin:0">Estás mirando <strong>'+esc(seccion.toLowerCase())+
        '</strong>, que tiene '+plural(deLaSeccion.length,"producto","productos")+
        ' con stock. Con el otro botón vacías sólo ésos.</p>'
      : "")+
    '<p class="nota" style="margin:10px 0 0">El pedido que tengas apuntado ahora mismo se '+
    'queda como está; esto es sólo la plantilla.</p>',
    function(){ limpiar(todos, "Stock vaciado"); },
    {aceptar:"Vaciarlo todo", malo:true,
     extra:(seccion && deLaSeccion.length && deLaSeccion.length<todos.length
       ? '<button class="btn" data-solo-sec>Sólo '+esc(seccion.toLowerCase())+'</button>' : ""),
     alAbrir:function(){
       var b=document.querySelector("#dlg [data-solo-sec]");
       if(b) b.addEventListener("click", function(){
         cerrarVentana();
         limpiar(deLaSeccion, "Vaciado el stock de "+seccion.toLowerCase());
       });
     }});
}

function costeSemanal(){
  return r2(conSemanal().reduce(function(t,p){
    var s=semanalDe(p);
    return t + s.uds*conIgi(p) + s.cajas*precioCaja(p);
  },0));
}
function proveedoresSemanal(){
  var hay={};
  conSemanal().forEach(function(p){ hay[p.proveedor||"Sin proveedor"]=1; });
  return Object.keys(hay);
}

function pintarStock(){
  var caja=document.getElementById("listaStock"); if(!caja) return;
  var q=norm(ui.qStock), trozos=q?q.split(" "):[];
  var lista=libro.productos.filter(function(p){
    if(ui.secStock==="__puestos"){ if(!semanalDe(p)) return false; }
    else if(ui.secStock && p.seccion!==ui.secStock) return false;
    if(!trozos.length) return true;
    var heno=norm(p.nombre)+" "+norm(p.proveedor)+" "+norm(p.seccion);
    return trozos.every(function(t){ return heno.indexOf(t)>=0; });
  }).sort(function(a,b){
    return norm(a.nombre).localeCompare(norm(b.nombre)) ||
           String(a.proveedor).localeCompare(String(b.proveedor));
  });

  if(!lista.length){
    caja.innerHTML='<div class="tarjeta"><div class="vacio"><strong>'+
      (ui.qStock ? 'Nada con «'+esc(ui.qStock)+'»'
                 : ui.secStock==="__puestos" ? 'Todavía no le has puesto stock a nada'
                                             : 'Aquí no hay nada')+'</strong>'+
      (ui.secStock==="__puestos" && !ui.qStock
        ? 'Ve a <b>Todo</b>, busca lo que pidas cada semana y ponle cuánto quieres tener. '+
          'Con eso, el pedido de la semana te sale con un botón.'
        : 'Prueba con menos letras.')+'</div></div>';
    return;
  }

  /* Una hoja de pedido, no una fila de botones por producto: los
     nombres uno debajo de otro y una casilla al lado donde se escribe el
     número. Se lee de un vistazo, como el papel de siempre, y se rellena
     con el teclado sin ir dando toques de uno en uno. */
  caja.innerHTML='<div class="tarjeta"><div class="tabla-caja">'+
    '<table class="hoja"><thead><tr>'+
      '<th>Producto</th>'+
      '<th class="num">Unidades</th>'+
      '<th class="num">Cajas</th>'+
    '</tr></thead><tbody>'+lista.map(filaStock).join("")+'</tbody></table>'+
  '</div></div>';
  engancharStock(caja);
}

function filaStock(p){
  var s=semanalDe(p) || {uds:0, cajas:0};
  var caja=+p.udsCaja||0;
  var precio=conIgi(p);
  var ud=unidadDe(p);
  return '<tr class="st-fila'+((s.uds||s.cajas)?" puesta":"")+'" data-st="'+esc(p.id)+'">'+
    '<td><div class="st-nom">'+esc(p.nombre)+'</div>'+
      '<div class="st-info">'+esc(p.proveedor||"sin proveedor")+
        (precio?' · '+eur(precio):' · sin precio')+
        (caja>0?' · caja de '+num(caja, caja%1?1:0):"")+'</div></td>'+
    '<td class="num">'+casillaStock(p.id, "uds", s.uds, ud||"")+'</td>'+
    '<td class="num">'+(caja>0 ? casillaStock(p.id, "cajas", s.cajas, "")
                               : '<span style="color:var(--muted)">—</span>')+'</td>'+
  '</tr>';
}

/* Una casilla y ya: se escribe el número como en el papel. */
function casillaStock(id, campo, valor, etiqueta){
  return '<span class="st-casilla">'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="—" '+
      'inputmode="numeric" data-cst="'+esc(id)+'|'+campo+'" '+
      'aria-label="Cuánto quiero cada semana">'+
    (etiqueta?'<span class="st-ud">'+esc(etiqueta)+'</span>':"")+
  '</span>';
}

/* Igual que en el pedido: se toca lo justo y no se repinta la lista, que
   si no el buscador pierde el foco a cada número. */
function engancharStock(caja){
  var filas=[].slice.call(caja.querySelectorAll(".st-fila"));
  var casillas=[].slice.call(caja.querySelectorAll("input[data-cst]"));
  casillas.forEach(function(input, i){
    var partes=input.getAttribute("data-cst").split("|");
    var id=partes[0], campo=partes[1];
    input.addEventListener("input", function(){
      var n=Math.max(0, Math.round(+input.value||0));
      var p=productoPorId(id); if(!p) return;
      var s=(p.semanal && {uds:+p.semanal.uds||0, cajas:+p.semanal.cajas||0}) || {uds:0, cajas:0};
      s[campo]=n;
      if(!s.uds && !s.cajas) delete p.semanal; else p.semanal=s;
      guardar();
      var fila=input.closest(".st-fila");
      if(fila) fila.classList.toggle("puesta", !!(s.uds||s.cajas));
      refrescarCuentaStock();
    });
    /* Enter y las flechas bajan a la casilla de la fila siguiente, en la
       misma columna: la hoja se rellena de arriba abajo sin soltar el
       teclado. Se va por filas y no contando casillas, porque no todas
       tienen las mismas: el producto que no viene en caja sólo tiene una,
       y contando de dos en dos se saltaba una fila. */
    input.addEventListener("keydown", function(e){
      var salto=(e.key==="Enter"||e.key==="ArrowDown") ? 1
              : (e.key==="ArrowUp") ? -1 : 0;
      if(!salto) return;
      var fila=input.closest(".st-fila");
      var destino=filas[filas.indexOf(fila)+salto];
      if(!destino) return;
      var meta=destino.querySelector('input[data-cst$="|'+campo+'"]')
            || destino.querySelector("input[data-cst]");
      if(meta){ e.preventDefault(); meta.focus(); meta.select(); }
    });
  });
}
function refrescarCuentaStock(){
  var n=conSemanal().length, coste=costeSemanal();
  var chapa=document.querySelector('[data-secst="__puestos"] .n');
  if(chapa) chapa.textContent=n;
  /* El número del carril no existe hasta que hay algo que contar, así que
     la primera vez hay que crearlo o no aparece hasta el siguiente
     repintado entero. */
  var boton2=document.querySelector('[data-ir="stock"]');
  if(boton2){
    var cuenta=boton2.querySelector(".cuenta");
    if(n && !cuenta){ cuenta=document.createElement("span"); cuenta.className="cuenta";
                      boton2.appendChild(cuenta); }
    if(cuenta){ if(n) cuenta.textContent=n; else cuenta.remove(); }
  }
  var cifras=document.querySelectorAll(".cifra");
  if(cifras[0]){
    cifras[0].querySelector(".v").textContent=n;
    cifras[0].querySelector(".v").className="v"+(n?" acento":"");
  }
  if(cifras[1]){
    cifras[1].querySelector(".v").textContent=coste>0?eur(coste):"—";
    cifras[1].querySelector(".n").textContent=coste>0
      ? "a los precios de hoy" : "nada con precio todavía";
  }
  if(cifras[2]) cifras[2].querySelector(".v").textContent=proveedoresSemanal().length;
  var boton=document.getElementById("st_poner");
  if(boton && n && boton.disabled){ boton.disabled=false;
    boton.addEventListener("click", function(){
      ponerPlantilla(); ui.vista="pedido"; pintar(); window.scrollTo(0,0); }); }
  if(boton && !n) boton.disabled=true;
}

/* ══════════════════════════════════════════════════════════════
   EL PEDIDO
   ══════════════════════════════════════════════════════════════ */
function verPedido(main){
  var grupos=pedidoPorProveedor();

  main.innerHTML=
    cabecera("El pedido",
      grupos.length
        ? "Lo que vas apuntando se queda aquí hasta que lo mandes. El día del pedido, "+
          "cada proveedor lleva el suyo: se manda uno, se vuelve y se manda el siguiente."
        : "Ve apuntando aquí lo que haga falta según lo veas. El día del pedido, "+
          "sale repartido por proveedor.",
      (grupos.length
        ? '<button class="btn" id="pd_guardarSiempre">Guardar como stock semanal</button>'+
          '<button class="btn malo" id="pd_vaciar">Vaciar el pedido</button>'
        : (hayPlantilla()
            ? '<button class="btn fuerte" id="pd_siempre">↺ Poner el stock semanal</button>' : "")))+

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
        (hayPlantilla()
          ? 'Pulsa <b>↺ Poner el stock semanal</b> ahí arriba y te salen las '+
            plural(conSemanal().length,"cosa","cosas")+' de cada semana con sus cantidades. '+
            'Luego bajas lo que te quede y lo mandas.'
          : 'Ve a <b>Stock semanal</b> y ponle a cada cosa cuánto quieres tener. A partir de '+
            'ahí, el pedido entero te sale con un botón.')+'</div></div>')+

    (libro.enviados.length ? historialEnviados() : "");

  engancharApuntar();

  var bv=document.getElementById("pd_vaciar");
  if(bv) bv.addEventListener("click", vaciarPedido);
  var bp=document.getElementById("pd_siempre");
  if(bp) bp.addEventListener("click", ponerPlantilla);
  var bg=document.getElementById("pd_guardarSiempre");
  if(bg) bg.addEventListener("click", function(){
    confirmar("Guardar como stock semanal",
      '<p style="margin:0 0 10px">'+(lineasPedido()===1
        ? "La cosa que hay ahora en el pedido, con su cantidad, pasa"
        : "Las "+lineasPedido()+" cosas que hay ahora en el pedido, con sus cantidades, pasan")+
        ' a ser tu <strong>stock semanal</strong>.</p>'+
      (hayPlantilla()
        ? '<p class="nota" style="margin:0">Ya tenías uno con '+
          plural(conSemanal().length,"cosa","cosas")+'. Se sustituye entero: lo que no esté en el '+
          'pedido de ahora se queda sin stock semanal.</p>'
        : '<p class="nota" style="margin:0">Luego, desde <strong>Stock semanal</strong>, '+
          'te vuelve todo puesto de una vez y sólo tienes que bajar lo que te quede.</p>'),
      guardarPlantilla, {aceptar:"Guardarlo"});
  });

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
      if(!l.uds && !l.cajas) pintar(); else refrescarTotales();
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
    (datos.telefono ? "" :
      '<div class="tarjeta-cuerpo" style="padding-bottom:0">'+
      '<div class="aviso-caja">A '+esc(g.proveedor)+' no le has puesto teléfono. '+
      'Ponlo en <strong>Proveedores</strong> y el pedido se manda de una.</div></div>')+
    '<div class="tabla-caja"><table><thead><tr>'+
      '<th>Producto</th><th class="num">Unidades</th><th class="num">Cajas</th>'+
      '<th class="num">Precio</th><th class="num">Importe</th><th></th>'+
    '</tr></thead><tbody>'+
    g.lineas.map(function(l){
      return '<tr>'+
        '<td><strong>'+esc(l.p.nombre)+'</strong>'+
          '<div style="font-size:11.5px;color:var(--muted)">'+esc((l.p.seccion||"").toLowerCase())+'</div></td>'+
        /* Editables aquí mismo: esto es la lista que se va llenando
           durante la semana, así que hay que poder subir una cantidad
           sin ir a buscar el producto a otra pantalla. */
        '<td class="num">'+casillaPedido(l.p.id, "uds", l.uds, unidadDe(l.p)||"")+'</td>'+
        '<td class="num">'+((+l.p.udsCaja||0)>0
          ? casillaPedido(l.p.id, "cajas", l.cajas,
                          "de "+num(+l.p.udsCaja||0, (+l.p.udsCaja||0)%1?1:0))
          : '<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td class="num">'+(conIgi(l.p)?eur(conIgi(l.p)):
          '<span style="color:var(--muted)">sin precio</span>')+'</td>'+
        '<td class="num">'+(l.importe?"<strong>"+eur(l.importe)+"</strong>":
          '<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td class="num"><button class="btn suave sm malo" data-quitar="'+esc(l.p.id)+'" '+
          'title="Quitar del pedido">✕</button></td>'+
      '</tr>';
    }).join("")+
    '</tbody><tfoot><tr><td colspan="4">Total</td>'+
      '<td class="num" data-total-prov="'+esc(g.proveedor)+'">'+
        (g.total?eur(g.total):"—")+'</td><td></td></tr></tfoot></table></div>'+
  '</div>';
}

function casillaPedido(id, campo, valor, etiqueta){
  return '<span class="st-casilla">'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="—" '+
      'inputmode="numeric" data-cpd="'+esc(id)+'|'+campo+'" aria-label="Cantidad">'+
    (etiqueta?'<span class="st-ud">'+esc(etiqueta)+'</span>':"")+
  '</span>';
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
    /* De cada producto, el proveedor más barato primero: apuntando
       deprisa, lo que quieres es el mejor precio sin pensarlo. */
    var grupos=agrupar(hallados).slice(0,9);
    if(!grupos.length){
      caja.innerHTML='<div class="sug-vacio">Nada con «'+esc(ui.qApunte)+'»</div>';
      return;
    }
    caja.innerHTML=grupos.map(function(g){
      var o=g.ofertas[0];
      var l=delPedido(o.id);
      var caj=+o.udsCaja||0;
      return '<button type="button" class="sug'+((l.uds||l.cajas)?" ya":"")+'" '+
        'data-apunta="'+esc(o.id)+'">'+
        '<span class="sug-nom">'+esc(g.nombre)+
          ((l.uds||l.cajas)?' <span class="chapa ok" style="font-size:10.5px">ya apuntado</span>':"")+
        '</span>'+
        '<span class="sug-info">'+esc(o.proveedor||"sin proveedor")+
          (conIgi(o)?' · '+eur(conIgi(o)):' · sin precio')+
          (g.ofertas.length>1?' · '+plural(g.ofertas.length,"proveedor","proveedores"):"")+
          (caj>0?' · caja de '+num(caj, caj%1?1:0):"")+'</span>'+
        '<span class="sug-mas">+ '+(caj>0?"1 caja":"1")+'</span>'+
      '</button>';
    }).join("");
    caja.querySelectorAll("[data-apunta]").forEach(function(b){
      b.addEventListener("click", function(){ apuntar(b.getAttribute("data-apunta")); });
    });
  }

  function apuntar(id){
    var p=productoPorId(id); if(!p) return;
    var l=delPedido(id);
    /* Si viene en caja, se pide por cajas; si no, por unidades. Es lo
       que se haría a mano, y así no hay que corregirlo después. */
    var campoN=(+p.udsCaja||0)>0 ? "cajas" : "uds";
    var cuantas=(l[campoN]||0)+1;
    ponerEnPedido(id, campoN, cuantas);
    avisar("Apuntado: "+p.nombre+" · "+
           (campoN==="cajas" ? plural(cuantas,"caja","cajas") : String(cuantas)));
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

/* ── Mandarlo por WhatsApp ────────────────────────────────────── */
/* Mismo apaño que en Caja: la aplicación de escritorio rechaza los
   enlaces wa.me con texto, así que se enseña el pedido, se puede copiar,
   y el enlace es un enlace de verdad —que pulsar un enlace no lo bloquea
   ningún navegador, y abrir una ventana a ciegas sí. */
function textoPedido(prov){
  var g=pedidoPorProveedor().filter(function(x){ return x.proveedor===prov; })[0];
  if(!g) return "";
  var l=[];
  if(libro.ajustes.nombre) l.push(libro.ajustes.nombre);
  l.push("Pedido del "+dmy(hoyISO()));
  l.push("");
  g.lineas.forEach(function(x){
    var trozos=[];
    if(x.cajas) trozos.push(x.cajas+(x.cajas===1?" caja":" cajas")+
      ((+x.p.udsCaja||0)>0 ? " de "+num(+x.p.udsCaja, (+x.p.udsCaja)%1?1:0) : ""));
    /* La verdura y la carne van con la unidad que tenga cada una —«3 kg»,
       «2 cajas»— o con el número a secas si no se le ha puesto ninguna,
       que es como se piden de siempre. */
    if(x.uds) trozos.push(esDiario(x.p) ? cantidadConUnidad(x.uds, unidadDe(x.p))
                                        : x.uds+(x.uds===1?" unidad":" unidades"));
    l.push("- "+x.p.nombre+": "+trozos.join(" + ")+
           (libro.ajustes.conImportes && x.importe ? "  ("+eur(x.importe)+")" : ""));
  });
  if(libro.ajustes.conImportes){ l.push(""); l.push("Total: "+eur(g.total)); }
  l.push("");
  l.push("Gracias.");
  return l.join("\n");
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

function mandarPedido(prov){
  var texto=textoPedido(prov);
  if(!texto){ avisar("Ese proveedor ya no tiene nada en el pedido.", true); return; }
  var g=pedidoPorProveedor().filter(function(x){ return x.proveedor===prov; })[0];
  var tel=soloNumero((libro.proveedores[prov]||{}).telefono);
  var enlaceApp="https://wa.me/"+tel+"?text="+encodeURIComponent(texto);
  var enlaceWeb="https://web.whatsapp.com/send?phone="+tel+"&text="+encodeURIComponent(texto);
  var primero=enOrdenador()?enlaceWeb:enlaceApp;

  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML=
    '<div class="dlg-cab"><h3>Pedido a '+esc(prov)+'</h3>'+
      '<button class="btn suave" data-cerrar>✕</button></div>'+
    '<div class="dlg-cuerpo">'+
      '<div class="parte" id="elPedido">'+esc(texto)+'</div>'+
      (tel
        ? '<p class="nota" style="margin:14px 0 0">Se abrirá el chat de <strong>+'+esc(tel)+
          '</strong> con el pedido escrito. Revísalo antes de darle a enviar: esto lo deja puesto, '+
          'no lo manda solo.</p>'
        : '<div class="aviso-caja" style="margin:14px 0 0">Este proveedor no tiene teléfono guardado. '+
          'Copia el pedido y pégalo tú, o ponle el teléfono en <strong>Proveedores</strong>.</div>')+
      (enOrdenador()
        ? '<p class="nota" style="margin:10px 0 0">En el ordenador, la aplicación de WhatsApp rechaza '+
          'estos enlaces con texto dentro, así que el botón abre WhatsApp Web.</p>'
        : "")+
    '</div>'+
    '<div class="dlg-pie">'+
      '<button class="btn" id="pd_copiar">Copiar</button>'+
      '<button class="btn" id="pd_hecho">Darlo por mandado</button>'+
      (tel ? '<a class="btn wa" href="'+esc(primero)+'" target="_blank" rel="noopener" '+
             'style="text-decoration:none" data-abrir>Abrir WhatsApp</a>' : "")+
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
        return {nombre:x.p.nombre, uds:x.uds, cajas:x.cajas, importe:x.importe};
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
  var conTel=lista.filter(function(p){ return soloNumero((libro.proveedores[p.nombre]||{}).telefono); }).length;

  main.innerHTML=
    cabecera("Proveedores",
      "El teléfono de cada uno, para que el pedido se mande de una. Es el mismo número que "+
      "ves en su ficha de WhatsApp, con el país delante.")+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Proveedores</div><div class="v">'+lista.length+'</div>'+
        '<div class="n">en la lista de precios</div></div>'+
      '<div class="cifra"><div class="k">Con teléfono</div>'+
        '<div class="v'+(conTel<lista.length?"":" acento")+'">'+conTel+'</div>'+
        '<div class="n">'+(conTel<lista.length
          ? "a "+(lista.length-conTel)+" les falta" : "todos puestos")+'</div></div>'+
      '<div class="cifra"><div class="k">Precios viejos</div>'+
        '<div class="v'+(libro.productos.filter(esViejo).length?" malo":"")+'">'+
        libro.productos.filter(esViejo).length+'</div>'+
        '<div class="n">de más de un año o sin fecha</div></div>'+
    '</div>'+

    '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr>'+
      '<th>Proveedor</th><th class="num">Productos</th><th class="num">Precios viejos</th>'+
      '<th>Teléfono</th><th>Contacto</th><th></th></tr></thead><tbody>'+
    lista.map(function(p){
      var d=libro.proveedores[p.nombre]||{};
      var viejos=libro.productos.filter(function(x){ return x.proveedor===p.nombre && esViejo(x); }).length;
      var tel=soloNumero(d.telefono);
      return '<tr><td>'+
          (p.n ? '<button class="enlace-prov" data-abrir-prov="'+esc(p.nombre)+'">'+
                 esc(p.nombre)+'</button>'
               : '<strong>'+esc(p.nombre)+'</strong>'+
                 ' <span class="chapa neutra" style="font-size:10.5px">sólo la ficha</span>')+'</td>'+
        '<td class="num">'+(p.n||"—")+'</td>'+
        '<td class="num"'+(viejos?' style="color:var(--aviso)"':"")+'>'+(viejos||"—")+'</td>'+
        '<td class="mono">'+(tel?"+"+esc(tel):'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td>'+esc(d.contacto||"")+'</td>'+
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
  var tel=soloNumero(datos.telefono);
  var enPedido=suyos.filter(function(p){ var l=delPedido(p.id); return l.uds||l.cajas; });
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
      (enPedido.length && tel
        ? '<button class="btn wa" id="pv_mandar">📱 Mandar el pedido</button>' : "")+
      '<button class="btn" id="pv_ficha">Teléfono y contacto</button>')+

    (tel ? "" :
      '<div class="aviso-caja">No tiene teléfono guardado, así que no se le puede mandar el '+
      'pedido de una. Pónselo con <strong>Teléfono y contacto</strong>.</div>')+

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
      '<div class="tabla-caja"><table class="hoja"><thead><tr>'+
        '<th>Producto</th><th class="num">Precio</th>'+
        '<th class="num">Unidades</th><th class="num">Cajas</th>'+
      '</tr></thead><tbody>'+
      suyos.sort(function(a,b){
        return (a.seccion||"").localeCompare(b.seccion||"") ||
               norm(a.nombre).localeCompare(norm(b.nombre));
      }).map(function(p){
        var l=delPedido(p.id), caja=+p.udsCaja||0;
        var caro=caros.filter(function(c){ return c.p===p; })[0];
        return '<tr class="st-fila'+((l.uds||l.cajas)?" puesta":"")+'" data-of="'+esc(p.id)+'">'+
          '<td><div class="st-nom">'+esc(p.nombre)+'</div>'+
            '<div class="st-info">'+esc((p.seccion||"").toLowerCase())+
              (p.fecha?' · '+esc(dmy(p.fecha)):' · sin fecha')+
              (caja>0?' · caja de '+num(caja, caja%1?1:0):"")+
              (caro?' · <span style="color:var(--malo);font-weight:600">'+
                    esc(caro.mejor.proveedor)+' lo tiene a '+eur(conIgi(caro.mejor))+'</span>':"")+
            '</div></td>'+
          '<td class="num">'+(conIgi(p)
            ? '<strong>'+eur(conIgi(p))+'</strong>'
            : '<span style="color:var(--muted)">sin precio</span>')+
            (caja>0&&conIgi(p)?'<div style="font-size:11px;color:var(--muted)">caja '+
              eur(precioCaja(p))+'</div>':"")+'</td>'+
          '<td class="num">'+casillaProv(p.id,"uds",l.uds,unidadDe(p)||"")+'</td>'+
          '<td class="num">'+(caja>0 ? casillaProv(p.id,"cajas",l.cajas,"")
                                     : '<span style="color:var(--muted)">—</span>')+'</td>'+
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
      if(fila) fila.classList.toggle("puesta", !!(l.uds||l.cajas));
      refrescarCabeceraProv(nombre, tel);
      pintarBarra();
    });
  });
}

/* Lo de arriba se toca a mano al escribir una cantidad: repintar la
   pantalla entera se llevaría el cursor de la casilla, y el botón de
   mandar tiene que aparecer en cuanto haya algo que mandar. */
function refrescarCabeceraProv(nombre, tel){
  var suyos=libro.productos.filter(function(p){ return p.proveedor===nombre; });
  var enPedido=suyos.filter(function(p){ var l=delPedido(p.id); return l.uds||l.cajas; });
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

function casillaProv(id, campo, valor, etiqueta){
  return '<span class="st-casilla">'+
    '<input type="number" min="0" step="1" value="'+(valor||"")+'" placeholder="—" '+
      'inputmode="numeric" data-cpv="'+esc(id)+'|'+campo+'" aria-label="Cantidad">'+
    (etiqueta?'<span class="st-ud">'+esc(etiqueta)+'</span>':"")+
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
  var enPedido=suyos.filter(function(p){ var l=delPedido(p.id); return l.uds||l.cajas; }).length;
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
      '<div class="campo"><label class="lbl" for="pv_tel">Teléfono</label>'+
        '<input id="pv_tel" value="'+esc(d.telefono||"")+'" placeholder="+376 800000"></div>'+
      '<div class="campo"><label class="lbl" for="pv_con">Persona de contacto</label>'+
        '<input id="pv_con" value="'+esc(d.contacto||"")+'" placeholder="Nombre"></div>'+
    '</div>'+
    '<div class="campo" style="margin-top:12px"><label class="lbl" for="pv_nota">Nota</label>'+
      '<input id="pv_nota" value="'+esc(d.nota||"")+'" placeholder="Reparte los martes, pedido antes de las 10…"></div>'+
    '<p class="nota" style="margin:12px 0 0">Escribe el número entero, empezando por el país: '+
    '<span class="mono">+376</span> Andorra, <span class="mono">+34</span> España.</p>',
    function(){
      libro.proveedores[nombre]={ telefono:valor("pv_tel"), contacto:valor("pv_con"), nota:valor("pv_nota") };
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
      '<div class="campo"><label class="lbl" for="ep_ud">Cómo se pide</label>'+
        '<select id="ep_ud">'+
        [["","a números, sin unidad"],["kg","en kilos"],["cajas","en cajas"],["un","en unidades"]]
          .map(function(o){
            return '<option value="'+o[0]+'"'+(unidadDe(p)===o[0]?" selected":"")+'>'+o[1]+'</option>';
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
      /* La fecha sólo se pone sola si cambió el precio y él no la tocó. */
      if(ahora!==antes && !document.getElementById("ep_fecha").dataset.tocada) p.fecha=hoyISO();
      p.precio=ahora;
      if(!p.id){ p.id=uid(); libro.productos.push(p); }
      guardar(); pintar();
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
        '</div>'+
        '<label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;cursor:pointer">'+
          '<input type="checkbox" id="aj_imp" style="width:auto;margin-top:3px"'+
          (libro.ajustes.conImportes?" checked":"")+'>'+
          '<span><b>Poner los importes en el pedido que se manda</b>'+
          '<div class="nota" style="margin:2px 0 0">Normalmente no: al proveedor se le pide '+
          'cantidad, y el precio ya se lo sabe. Márcalo si quieres que el pedido lleve tus '+
          'cifras para que él las confirme.</div></span></label>'+
        '<div style="margin-top:16px"><button class="btn fuerte" id="aj_guardar">Guardar</button></div>'+
      '</div></div>'+

    /* Lo de siempre, para verlo entero y poder quitarlo. Se hace desde
       el pedido, pero mirarlo hay que poder mirarlo en algún sitio. */
    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Lo de siempre</h2>'+
        '<span class="pista">'+(hayPlantilla()
          ? plural(conSemanal().length,"cosa","cosas")+' en el pedido de la semana'
          : "todavía no has guardado ninguno")+'</span></div>'+
      (hayPlantilla()
        ? '<div class="tabla-caja"><table><thead><tr><th>Producto</th><th>Proveedor</th>'+
          '<th class="num">Cada semana</th><th></th></tr></thead><tbody>'+
          conSemanal().sort(function(a,b){
            return (a.seccion||"").localeCompare(b.seccion||"") ||
                   norm(a.nombre).localeCompare(norm(b.nombre)); }).map(function(p){
            return '<tr><td><strong>'+esc(p.nombre)+'</strong>'+
              '<div style="font-size:11.5px;color:var(--muted)">'+esc((p.seccion||"").toLowerCase())+'</div></td>'+
              '<td>'+esc(p.proveedor||"—")+'</td>'+
              '<td class="num"><strong>'+esc(textoSemanal(p))+'</strong></td>'+
              '<td class="num"><button class="btn suave sm malo" data-quitar-sem="'+esc(p.id)+'" '+
                'title="Quitarlo de lo de siempre">✕</button></td></tr>';
          }).join("")+
          '</tbody></table></div>'+
          '<div class="tarjeta-cuerpo"><p class="nota" style="margin:0">Esto se hace desde '+
          '<strong>El pedido</strong>: montas uno bueno y pulsas «Guardar como lo de siempre». '+
          'Para volver a ponerlo, el botón <strong>↺ Poner lo de siempre</strong>.</p></div>'
        : '<div class="vacio"><strong>Sin pedido de la semana</strong>'+
          'Monta un pedido de los de siempre en <b>El pedido</b> y pulsa «Guardar como lo de '+
          'siempre». A partir de ahí te sale entero con un botón.</div>')+
    '</div>'+

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
    guardar(); pintar(); avisar("Ajustes guardados");
  });
  main.querySelectorAll("[data-editar2]").forEach(function(b){
    b.addEventListener("click", function(){ editarProducto(productoPorId(b.getAttribute("data-editar2"))); });
  });
  main.querySelectorAll("[data-quitar-sem]").forEach(function(b){
    b.addEventListener("click", function(){
      var prod=productoPorId(b.getAttribute("data-quitar-sem")); if(!prod) return;
      delete prod.semanal; guardar(); pintar();
      avisar(prod.nombre+" ya no va en lo de siempre");
    });
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
