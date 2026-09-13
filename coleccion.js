/* ══════════════════════════════════════════════════════════════════
   COLECCIÓN — el álbum de monedas y billetes
   ══════════════════════════════════════════════════════════════════
   Tres apartados, que es como se guardan de verdad:

     España        pesetas, reales, escudos… lo de aquí de siempre
     Euros         por país y año, con las conmemorativas aparte
     Resto         todo lo demás, agrupado por país

   Y aparte, el Catálogo: la lista fija de todas las conmemorativas de
   2 € que se han emitido (catalogo2e.js), con su foto oficial, para ir
   marcando cuáles tienes sin escribir cada ficha a mano.

   Dentro de cada uno, monedas y billetes por separado.

   Una pieza puede estar en el álbum o estar en la lista de las que
   faltan: es la misma ficha con la casilla «la tengo» sin marcar, para
   poder llevar encima lo que buscas sin apuntarlo en otro sitio.

   Las fotos se guardan reducidas a 320 px. El álbum entero viaja a
   GitHub en cada cambio, así que en Ajustes se ve cuánto ocupa. Las del
   iPhone vienen en HEIC, que el navegador no sabe abrir: esas se
   convierten aquí mismo antes de guardarlas.
   ══════════════════════════════════════════════════════════════════ */
(function(){

var CLAVE = "coleccion.libro.v1";

var VACIO = {
  piezas: [],
  ajustes: { moneda:"EUR" }
};

var AMBITOS = {
  espana: { nombre:"España",         corto:"España" },
  euro:   { nombre:"Euros",          corto:"Euros"  },
  mundo:  { nombre:"Resto del mundo", corto:"Mundo" }
};

/* La escala española de conservación, de mejor a peor. */
var ESTADOS = [
  ["FDC", "Flor de cuño"],
  ["SC",  "Sin circular"],
  ["EBC", "Extraordinariamente bien conservada"],
  ["MBC", "Muy bien conservada"],
  ["BC",  "Bien conservada"],
  ["RC",  "Regular"],
  ["",    "Sin clasificar"]
];

/* Los que usan el euro, para no escribirlos a mano cada vez. */
var PAISES_EURO = ["Alemania","Andorra","Austria","Bélgica","Chipre","Croacia","Eslovaquia",
  "Eslovenia","España","Estonia","Finlandia","Francia","Grecia","Irlanda","Italia","Letonia",
  "Lituania","Luxemburgo","Malta","Mónaco","Países Bajos","Portugal","San Marino","Vaticano"];

var DIVISAS_ESPANA = ["Peseta","Euro","Real","Escudo","Céntimo","Maravedí"];

var libro = null;
var ui = { vista:"resumen", tipo:"todo", busca:"", soloFaltan:false, orden:"pais",
           catAgrupa:"pais", catFiltro:"todas", catBusca:"",
           esBloque:"todo", esFiltro:"todas", esBusca:"", esAgrupa:"epoca" };

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function r2(n){ return Math.round((+n||0)*100)/100; }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function esc(t){
  return String(t==null?"":t).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function num(n, dec){
  return (+n||0).toLocaleString("es-ES",{minimumFractionDigits:dec==null?2:dec,
                                        maximumFractionDigits:dec==null?2:dec});
}
function eur(n){ return num(n)+" €"; }
/* Un valor facial se lee mejor sin decimales cuando es redondo */
function facial(v){
  var n=+v||0;
  return (n===Math.round(n)) ? n.toLocaleString("es-ES") : num(n);
}
function plural(n, uno, varios){ return n+" "+(n===1?uno:varios); }
/* elige la frase entera, para que concuerden el verbo y el artículo */
function segunCuantos(n, uno, varios){ return n===1 ? uno : varios; }
function hoyISO(){
  var d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():""; }
function numero(id){ var e=document.getElementById(id); return e?(+e.value||0):0; }
function marcado(id){ var e=document.getElementById(id); return e?!!e.checked:false; }

function avisar(texto, malo){
  var v=document.getElementById("avisoFlot"); if(v) v.remove();
  var d=document.createElement("div");
  d.id="avisoFlot"; d.className="aviso-flotante"+(malo?" malo":"");
  d.textContent=texto;
  document.body.appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.remove(); }, 3200);
}

function abrirVentana(titulo, cuerpoHTML, alGuardar, opciones){
  opciones=opciones||{};
  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3>'+
              '<button class="btn suave" data-x>Cerrar</button></div>'+
              '<div class="dlg-cuerpo">'+cuerpoHTML+'</div>'+
              '<div class="dlg-pie">'+(opciones.extra||"")+
              '<button class="btn" data-x>Cancelar</button>'+
              '<button class="btn '+(opciones.malo?"malo":"fuerte")+'" data-ok>'+
              esc(opciones.aceptar||"Guardar")+'</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    if(alGuardar()===true) return;   /* true = dejar la ventana abierta */
    d.close(); d.remove();
  });
  d.showModal();
  var primero=d.querySelector("input,select,textarea"); if(primero) primero.focus();
  return d;
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  opciones=opciones||{};
  abrirVentana(titulo, cuerpo, function(){ alAceptar(); },
               {aceptar:opciones.aceptar||"Aceptar", malo:opciones.malo});
}

/* ══════════════════════════════════════════════════════════════
   GUARDAR Y CARGAR
   ══════════════════════════════════════════════════════════════ */
function cargar(){
  try{
    var crudo=localStorage.getItem(CLAVE);
    libro = crudo ? JSON.parse(crudo) : JSON.parse(JSON.stringify(VACIO));
  }catch(e){ libro=JSON.parse(JSON.stringify(VACIO)); }
  if(!libro.piezas) libro.piezas=[];
  if(!libro.ajustes) libro.ajustes={};
}
function guardar(){
  localStorage.setItem(CLAVE, JSON.stringify(libro));
}

/* ══════════════════════════════════════════════════════════════
   CUENTAS
   ══════════════════════════════════════════════════════════════ */
function todas(){ return libro.piezas||[]; }
function delAmbito(ambito){
  return todas().filter(function(p){ return p.ambito===ambito; });
}
function tengo(p){ return p.tengo!==false; }
function cuantas(p){ return tengo(p) ? Math.max(1, +p.cantidad||1) : 0; }

function resumenDe(lista){
  var t={fichas:lista.length, piezas:0, faltan:0, estimado:0, monedas:0, billetes:0};
  lista.forEach(function(p){
    if(tengo(p)){
      t.piezas+=cuantas(p);
      t.estimado=r2(t.estimado+(+p.estimado||0)*cuantas(p));
      if(p.tipo==="billete") t.billetes+=cuantas(p); else t.monedas+=cuantas(p);
    } else t.faltan++;
  });
  return t;
}

/* El valor facial no se puede sumar entre divisas distintas: 100 pesetas
   y 100 dólares no son 200 de nada. Se agrupa por divisa. */
function facialPorDivisa(lista){
  var mapa={};
  lista.forEach(function(p){
    if(!tengo(p)) return;
    var d=(p.divisa||"").trim() || "sin divisa";
    mapa[d]=r2((mapa[d]||0)+(+p.valor||0)*cuantas(p));
  });
  return Object.keys(mapa).sort().map(function(d){ return {divisa:d, total:mapa[d]}; });
}

function paisDe(p){
  if(p.ambito==="espana") return "España";
  return (p.pais||"").trim() || "Sin país";
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Colección</span>'+
        '<span class="sub">Monedas y billetes</span></div>'+
      boton("resumen","Resumen", todas().length)+
      boton("espana", "España",  delAmbito("espana").length)+
      boton("euro",   "Euros",   delAmbito("euro").length)+
      boton("mundo",  "Resto del mundo", delAmbito("mundo").length)+
      boton("catalogo","Catálogo 2 €", hayCatalogo()?tengoDelCatalogo():null)+
      boton("catalogoes","Catálogo España", hayCatalogoES()?tengoDeES():null)+
      boton("ajustes","Ajustes", null)+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)" id="estadoSync">Guardado en GitHub</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll("[data-vista]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.vista=b.dataset.vista; ui.busca=""; pintar();
    });
  });

  if(ui.vista==="resumen") pintarResumen();
  else if(ui.vista==="ajustes") pintarAjustes();
  else if(ui.vista==="catalogo") pintarCatalogo();
  else if(ui.vista==="catalogoes") pintarCatalogoES();
  else pintarAmbito(ui.vista);
}

function boton(vista, texto, cuenta){
  return '<button class="nav" data-vista="'+vista+'"'+
         (ui.vista===vista?' aria-current="true"':'')+'>'+
         '<span>'+esc(texto)+'</span>'+
         (cuenta!=null?'<span class="cuenta">'+cuenta+'</span>':'')+'</button>';
}

function cabecera(titulo, texto, botones){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         '<p>'+texto+'</p></div>'+
         '<div style="display:flex;gap:8px;flex-wrap:wrap">'+(botones||"")+'</div></div>';
}

/* ══════════════════════════════════════════════════════════════
   RESUMEN
   ══════════════════════════════════════════════════════════════ */
function pintarResumen(){
  var main=document.getElementById("main");
  var t=resumenDe(todas());
  var faciales=facialPorDivisa(todas());

  var porAmbito=Object.keys(AMBITOS).map(function(k){
    var r=resumenDe(delAmbito(k));
    return '<tr><td><strong>'+esc(AMBITOS[k].nombre)+'</strong></td>'+
      '<td class="num">'+r.monedas+'</td><td class="num">'+r.billetes+'</td>'+
      '<td class="num">'+(r.faltan?r.faltan:"—")+'</td>'+
      '<td class="num">'+(r.estimado?eur(r.estimado):"—")+'</td></tr>';
  }).join("");

  var recientes=todas().filter(tengo).slice().sort(function(a,b){
    return (b.alta||"").localeCompare(a.alta||"");
  }).slice(0,12);

  main.innerHTML=
    cabecera("El álbum",
      "Todo lo que tienes, y lo que te falta, en un sitio. Empieza por el apartado que quieras: "+
      "las de España, las de euro o las del resto del mundo.",
      '<button class="btn" id="descargar">Descargar el álbum</button>'+
      '<button class="btn fuerte" id="nueva">+ Añadir pieza</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Piezas</div><div class="v acento">'+t.piezas+'</div>'+
        '<div class="n">'+plural(t.fichas-t.faltan,"ficha distinta","fichas distintas")+'</div></div>'+
      '<div class="cifra"><div class="k">Monedas</div><div class="v">'+t.monedas+'</div>'+
        '<div class="n">contando repetidas</div></div>'+
      '<div class="cifra"><div class="k">Billetes</div><div class="v">'+t.billetes+'</div>'+
        '<div class="n">contando repetidos</div></div>'+
      '<div class="cifra"><div class="k">Me faltan</div><div class="v'+(t.faltan?' malo':'')+'">'+
        t.faltan+'</div><div class="n">apuntadas para buscar</div></div>'+
      '<div class="cifra"><div class="k">Valor estimado</div><div class="v">'+
        (t.estimado?eur(t.estimado):"—")+'</div><div class="n">lo que tú anotas</div></div>'+
      (hayCatalogo()
        ? '<div class="cifra"><div class="k">Conmemorativas 2 €</div><div class="v">'+
          tengoDelCatalogo()+'</div><div class="n">de '+piezasDelCatalogo()+
          ' que hay en el catálogo</div></div>'
        : "")+
    '</div>'+

    '<div class="tarjeta" style="margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Por apartados</h2></div>'+
      '<div class="tarjeta-cuerpo tabla-caja">'+
        (todas().length
          ? '<table><thead><tr><th>Apartado</th><th class="num">Monedas</th>'+
            '<th class="num">Billetes</th><th class="num">Faltan</th>'+
            '<th class="num">Estimado</th></tr></thead><tbody>'+porAmbito+'</tbody></table>'
          : '<div class="vacio"><strong>El álbum está vacío</strong>'+
            'Añade la primera pieza y aparecerá aquí.</div>')+
      '</div></div>'+

    (faciales.length
      ? '<div class="tarjeta" style="margin-bottom:16px">'+
        '<div class="tarjeta-cab"><h2>Valor facial</h2>'+
        '<span class="pista">Cada divisa por su lado: no se pueden sumar entre sí</span></div>'+
        '<div class="tarjeta-cuerpo tabla-caja"><table><tbody>'+
        faciales.map(function(f){
          return '<tr><td>'+esc(f.divisa)+'</td><td class="num">'+num(f.total)+'</td></tr>';
        }).join("")+'</tbody></table></div></div>'
      : "")+

    (recientes.length
      ? '<h2 style="font-size:16px;margin:22px 0 12px">Las últimas que añadiste</h2>'+
        '<div class="vitrina">'+recientes.map(tarjetaPieza).join("")+'</div>'
      : "");

  document.getElementById("nueva").addEventListener("click", function(){ editarPieza(null); });
  document.getElementById("descargar").addEventListener("click", pedirAlbum);
  engancharVitrina();
}

/* ══════════════════════════════════════════════════════════════
   UN APARTADO
   ══════════════════════════════════════════════════════════════ */
function pintarAmbito(ambito){
  var main=document.getElementById("main");
  var info=AMBITOS[ambito];
  var lista=delAmbito(ambito);
  var t=resumenDe(lista);

  var explica = ambito==="espana"
      ? "Pesetas, euros de aquí, reales, lo que sea: todo lo español junto."
    : ambito==="euro"
      ? "Por país y por año. Marca las conmemorativas y las verás agrupadas aparte."
      : "Agrupadas por país. Escribe el país tal y como quieras verlo en el álbum.";

  main.innerHTML=
    cabecera(info.nombre, explica,
      '<button class="btn fuerte" id="nueva">+ Añadir pieza</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Monedas</div><div class="v acento">'+t.monedas+'</div></div>'+
      '<div class="cifra"><div class="k">Billetes</div><div class="v acento">'+t.billetes+'</div></div>'+
      '<div class="cifra"><div class="k">Me faltan</div><div class="v'+(t.faltan?' malo':'')+'">'+
        t.faltan+'</div></div>'+
      '<div class="cifra"><div class="k">Valor estimado</div><div class="v">'+
        (t.estimado?eur(t.estimado):"—")+'</div></div>'+
    '</div>'+

    '<div class="filtros">'+
      '<div class="grupo">'+
        ['todo','moneda','billete'].map(function(k){
          var etiqueta={todo:"Todo",moneda:"Monedas",billete:"Billetes"}[k];
          return '<button data-tipo="'+k+'" aria-pressed="'+(ui.tipo===k)+'">'+etiqueta+'</button>';
        }).join("")+
      '</div>'+
      '<div class="grupo">'+
        '<button data-faltan="no" aria-pressed="'+(!ui.soloFaltan)+'">Todas</button>'+
        '<button data-faltan="si" aria-pressed="'+(ui.soloFaltan)+'">Sólo las que faltan</button>'+
      '</div>'+
      '<input class="buscador" id="busca" placeholder="Buscar por año, valor, país, notas…" '+
        'value="'+esc(ui.busca)+'">'+
    '</div>'+

    '<div id="vitrina"></div>';

  document.getElementById("nueva").addEventListener("click", function(){ editarPieza(null, ambito); });
  main.querySelectorAll("[data-tipo]").forEach(function(b){
    b.addEventListener("click", function(){ ui.tipo=b.dataset.tipo; pintarAmbito(ambito); });
  });
  main.querySelectorAll("[data-faltan]").forEach(function(b){
    b.addEventListener("click", function(){ ui.soloFaltan=(b.dataset.faltan==="si"); pintarAmbito(ambito); });
  });
  var busca=document.getElementById("busca");
  busca.addEventListener("input", function(){ ui.busca=busca.value; pintarVitrina(ambito); });

  pintarVitrina(ambito);
}

function filtrar(ambito){
  var texto=ui.busca.trim().toLowerCase();
  return delAmbito(ambito).filter(function(p){
    if(ui.tipo!=="todo" && (p.tipo||"moneda")!==ui.tipo) return false;
    if(ui.soloFaltan && tengo(p)) return false;
    if(!texto) return true;
    var paja=[p.pais,p.divisa,p.anio,p.valor,p.ceca,p.material,p.estado,p.notas,p.serie]
             .join(" ").toLowerCase();
    return paja.indexOf(texto)>=0;
  });
}

function pintarVitrina(ambito){
  var caja=document.getElementById("vitrina"); if(!caja) return;
  var lista=filtrar(ambito);

  if(!lista.length){
    caja.innerHTML='<div class="vacio"><strong>'+
      (ui.busca||ui.soloFaltan||ui.tipo!=="todo" ? "Nada con esos filtros" : "Aquí no hay nada todavía")+
      '</strong>'+
      (ui.busca||ui.soloFaltan||ui.tipo!=="todo"
        ? "Prueba a quitar algún filtro."
        : "Pulsa «Añadir pieza» y empieza el álbum.")+'</div>';
    return;
  }

  /* Los euros se agrupan por país, y las conmemorativas aparte, que es
     como se coleccionan. El resto, por país también. España va de
     corrido, ordenada por divisa y año. */
  var grupos={};
  lista.forEach(function(p){
    var clave;
    if(ambito==="euro") clave = (p.conmemorativa?"Conmemorativas · ":"")+paisDe(p);
    else if(ambito==="espana") clave = (p.divisa||"Sin divisa");
    else clave = paisDe(p);
    (grupos[clave]=grupos[clave]||[]).push(p);
  });

  caja.innerHTML=Object.keys(grupos).sort().map(function(clave){
    var piezas=grupos[clave].slice().sort(function(a,b){
      var an=(a.anio||"")+"", bn=(b.anio||"")+"";
      if(an!==bn) return an.localeCompare(bn);
      return (+a.valor||0)-(+b.valor||0);
    });
    return '<div class="grupoTitulo">'+esc(clave)+' · '+plural(piezas.length,"ficha","fichas")+'</div>'+
           '<div class="vitrina">'+piezas.map(tarjetaPieza).join("")+'</div>';
  }).join("");

  engancharVitrina();
}

function tarjetaPieza(p){
  var esBillete=(p.tipo==="billete");
  var falta=!tengo(p);
  var cantidad=cuantas(p);
  /* Si no le has puesto foto y la moneda viene del catálogo, se enseña
     la oficial del BCE: así el álbum se ve lleno desde el primer día
     sin guardar ni una imagen. */
  var suFoto = fotoDePieza(p);
  var lamina = suFoto
    ? '<img src="'+esc(suFoto)+'" alt="" loading="lazy">'
    : (esBillete
        ? '<div class="papel"><span class="n">'+esc(facial(p.valor))+'</span>'+
          '<span class="u">'+esc(p.divisa||"")+'</span></div>'
        : '<div class="disco'+(p.material&&/plata|niquel|níquel|acero/i.test(p.material)?" plateado":"")+'">'+
          '<span class="n">'+esc(facial(p.valor))+'</span>'+
          '<span class="u">'+esc(p.divisa||"")+'</span></div>');

  return '<button class="pieza'+(esBillete?" billete":"")+(falta?" falta":"")+'" data-id="'+esc(p.id)+'">'+
    '<div class="lamina">'+lamina+
      (cantidad>1?'<span class="cantidad">×'+cantidad+'</span>':"")+'</div>'+
    '<div class="datos">'+
      '<div class="cara">'+esc(facial(p.valor))+' '+esc(p.divisa||"")+'</div>'+
      '<div class="sitio">'+esc(paisDe(p))+(p.anio?' · '+esc(p.anio):"")+
        (p.ceca?' · '+esc(p.ceca):"")+'</div>'+
      '<div class="pieMeta">'+
        (falta?'<span class="chapa malo">La busco</span>':"")+
        (p.estado?'<span class="chapa neutra">'+esc(p.estado)+'</span>':"")+
        (p.conmemorativa?'<span class="chapa acento">Conmemorativa</span>':"")+
        (p.estimado?'<span class="chapa ok">'+eur(p.estimado)+'</span>':"")+
      '</div>'+
    '</div></button>';
}

function engancharVitrina(){
  document.querySelectorAll(".pieza").forEach(function(b){
    b.addEventListener("click", function(){
      var p=todas().filter(function(x){ return x.id===b.dataset.id; })[0];
      if(p) verPieza(p);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   VER Y EDITAR UNA PIEZA
   ══════════════════════════════════════════════════════════════ */
function verPieza(p){
  var filas=[
    ["Apartado", AMBITOS[p.ambito] ? AMBITOS[p.ambito].nombre : p.ambito],
    ["Tipo", p.tipo==="billete"?"Billete":"Moneda"],
    ["País", paisDe(p)],
    ["Valor", facial(p.valor)+" "+(p.divisa||"")],
    ["Año", p.anio||"—"],
    ["Ceca o serie", p.ceca||p.serie||"—"],
    ["Material", p.material||"—"],
    ["Conservación", (function(){
      var e=ESTADOS.filter(function(x){ return x[0]===p.estado; })[0];
      return p.estado ? p.estado+(e?" · "+e[1]:"") : "—";
    })()],
    ["Cuántas tengo", tengo(p) ? cuantas(p) : "ninguna, la busco"],
    ["Valor estimado", p.estimado?eur(p.estimado):"—"],
    ["Pagué", p.pagado?eur(p.pagado):"—"],
    ["Dónde la conseguí", p.origen||"—"]
  ];

  var d=abrirVentana(facial(p.valor)+" "+(p.divisa||"")+(p.anio?" · "+p.anio:""),
    (p.foto?'<img src="'+esc(p.foto)+'" alt="" style="width:100%;max-height:260px;'+
      'object-fit:contain;background:var(--sup2);border-radius:8px;margin-bottom:14px">':"")+
    '<div class="tabla-caja"><table><tbody>'+
      filas.map(function(f){
        return '<tr><td style="color:var(--muted);width:44%">'+esc(f[0])+'</td>'+
               '<td><strong>'+esc(f[1])+'</strong></td></tr>';
      }).join("")+
    '</tbody></table></div>'+
    (p.notas?'<p class="nota" style="margin-top:14px;white-space:pre-wrap">'+esc(p.notas)+'</p>':""),
    function(){ d.close(); d.remove(); editarPieza(p); return true; },
    {aceptar:"Editar",
     extra:'<button class="btn malo" id="borrarPieza">Borrar</button>'});

  document.getElementById("borrarPieza").addEventListener("click", function(){
    d.close(); d.remove();
    confirmar("Borrar la pieza",
      '<p style="margin:0">Se va la ficha de <strong>'+esc(facial(p.valor)+" "+(p.divisa||""))+
      (p.anio?" de "+esc(p.anio):"")+'</strong>, con su foto si la tiene.</p>',
      function(){
        libro.piezas=todas().filter(function(x){ return x.id!==p.id; });
        guardar(); pintar(); avisar("Pieza borrada");
      }, {aceptar:"Borrar", malo:true});
  });
}

function editarPieza(p, ambitoPorDefecto){
  var nueva=!p;
  p = p || { id:uid(), ambito:ambitoPorDefecto||"espana", tipo:"moneda",
             tengo:true, cantidad:1, alta:hoyISO() };

  var opcionesAmbito=Object.keys(AMBITOS).map(function(k){
    return '<option value="'+k+'"'+(p.ambito===k?" selected":"")+'>'+esc(AMBITOS[k].nombre)+'</option>';
  }).join("");
  var opcionesEstado=ESTADOS.map(function(e){
    return '<option value="'+e[0]+'"'+(p.estado===e[0]?" selected":"")+'>'+
           esc(e[0]?e[0]+" · "+e[1]:e[1])+'</option>';
  }).join("");

  var d=abrirVentana(nueva?"Añadir una pieza":"Editar la pieza",
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_ambito">Apartado</label>'+
        '<select id="e_ambito">'+opcionesAmbito+'</select></div>'+
      '<div class="campo"><label class="lbl" for="e_tipo">Qué es</label>'+
        '<select id="e_tipo">'+
          '<option value="moneda"'+(p.tipo!=="billete"?" selected":"")+'>Moneda</option>'+
          '<option value="billete"'+(p.tipo==="billete"?" selected":"")+'>Billete</option>'+
        '</select></div>'+
    '</div>'+

    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_valor">Valor</label>'+
        '<input type="number" id="e_valor" step="0.01" value="'+esc(p.valor!=null?p.valor:"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_divisa">Divisa</label>'+
        '<input id="e_divisa" list="listaDivisas" value="'+esc(p.divisa||"")+'" placeholder="Peseta, Euro…">'+
        '<datalist id="listaDivisas">'+
          DIVISAS_ESPANA.map(function(x){ return '<option value="'+esc(x)+'">'; }).join("")+
        '</datalist></div>'+
      '<div class="campo"><label class="lbl" for="e_anio">Año</label>'+
        '<input id="e_anio" inputmode="numeric" value="'+esc(p.anio||"")+'" placeholder="1957"></div>'+
    '</div>'+

    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo" id="cajaPais"><label class="lbl" for="e_pais">País</label>'+
        '<input id="e_pais" list="listaPaises" value="'+esc(p.pais||"")+'">'+
        '<datalist id="listaPaises">'+
          PAISES_EURO.map(function(x){ return '<option value="'+esc(x)+'">'; }).join("")+
        '</datalist></div>'+
      '<div class="campo"><label class="lbl" for="e_ceca">Ceca o serie</label>'+
        '<input id="e_ceca" value="'+esc(p.ceca||p.serie||"")+'" placeholder="Madrid, estrella 74…"></div>'+
      '<div class="campo"><label class="lbl" for="e_material">Material</label>'+
        '<input id="e_material" value="'+esc(p.material||"")+'" placeholder="Cobre, plata, papel…"></div>'+
    '</div>'+

    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_estado">Conservación</label>'+
        '<select id="e_estado">'+opcionesEstado+'</select></div>'+
      '<div class="campo"><label class="lbl" for="e_cant">Cuántas tengo</label>'+
        '<input type="number" id="e_cant" min="0" step="1" value="'+esc(p.cantidad||1)+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_estimado">Valor estimado (€)</label>'+
        '<input type="number" id="e_estimado" step="0.01" value="'+esc(p.estimado||"")+'"></div>'+
    '</div>'+

    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_pagado">Lo que pagué (€)</label>'+
        '<input type="number" id="e_pagado" step="0.01" value="'+esc(p.pagado||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_origen">Dónde la conseguí</label>'+
        '<input id="e_origen" value="'+esc(p.origen||"")+'" placeholder="Rastro, cambio, herencia…"></div>'+
    '</div>'+

    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">'+
      '<label style="display:flex;gap:7px;align-items:center;cursor:pointer">'+
        '<input type="checkbox" id="e_tengo" style="width:auto"'+(tengo(p)?" checked":"")+'>'+
        '<span>La tengo</span></label>'+
      '<label style="display:flex;gap:7px;align-items:center;cursor:pointer" id="cajaConmemo">'+
        '<input type="checkbox" id="e_conmemo" style="width:auto"'+(p.conmemorativa?" checked":"")+'>'+
        '<span>Conmemorativa</span></label>'+
    '</div>'+
    '<p class="nota" style="margin:0 0 12px">Si desmarcas «la tengo», la ficha se queda en la '+
    'lista de las que buscas, con el filtro <strong>Sólo las que faltan</strong>.</p>'+

    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_notas">Notas</label>'+
      '<textarea id="e_notas" placeholder="Rareza, defectos, de quién venía…">'+esc(p.notas||"")+'</textarea></div>'+

    '<div class="campo"><label class="lbl">Foto</label>'+
      '<div id="e_cajaFoto" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;'+
        'border:1px dashed var(--linea);border-radius:9px;padding:9px">'+
        '<img id="e_previa" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;'+
          'background:var(--sup2);border:1px solid var(--linea);'+(p.foto?'" src="'+esc(p.foto):'display:none')+'">'+
        '<input type="file" id="e_foto" accept="image/*" style="width:auto;flex:1;min-width:150px">'+
        '<button type="button" class="btn suave" id="e_quitarFoto"'+
          (p.foto?'':' style="display:none"')+'>Quitar</button>'+
      '</div>'+
      '<p class="nota" id="e_fotoMal" style="margin:7px 0 0;color:var(--malo);display:none"></p>'+
      '<p class="nota" style="margin:6px 0 0">Elígela con el botón, arrástrala hasta el recuadro '+
      'o cópiala y pégala con ⌘V. Las del iPhone (HEIC) se convierten solas, sin salir de tu '+
      'ordenador. Se guarda reducida a 320 px: el álbum entero viaja a GitHub en cada cambio, '+
      'así que conviene no cargarlo de fotos enormes.</p>'+
    '</div>',

    function(){
      var v=document.getElementById("e_valor").value;
      if(v===""){ avisar("Ponle el valor, aunque sea aproximado.", true); return true; }
      /* Guardar con la foto a medio convertir la dejaría fuera sin que
         se note, que es justo lo que pasaba antes. */
      if(fotoCargando){ avisar("Espera un momento, que la foto aún se está preparando.", true); return true; }
      p.ambito=valor("e_ambito"); p.tipo=valor("e_tipo");
      p.valor=r2(+v||0);
      p.divisa=valor("e_divisa");
      p.anio=valor("e_anio");
      p.pais=(p.ambito==="espana") ? "España" : valor("e_pais");
      p.ceca=valor("e_ceca");
      p.material=valor("e_material");
      p.estado=valor("e_estado");
      p.cantidad=Math.max(0, Math.round(numero("e_cant")))||1;
      p.estimado=numero("e_estimado")||null;
      p.pagado=numero("e_pagado")||null;
      p.origen=valor("e_origen");
      p.tengo=marcado("e_tengo");
      p.conmemorativa=marcado("e_conmemo");
      p.notas=valor("e_notas");
      p.foto=fotoPendiente!==undefined ? fotoPendiente : p.foto;
      if(!p.alta) p.alta=hoyISO();
      if(nueva) libro.piezas.push(p);
      guardar(); pintar();
      /* Si la foto se quedó por el camino, se dice al guardar: antes la
         pieza entraba tan tranquila y la foto no aparecía nunca. */
      avisar((nueva?"Pieza añadida":"Pieza guardada")+
             (fotoFallo && !fotoPendiente ? ", pero la foto no ha entrado" : ""), fotoFallo);
    },
    {aceptar:nueva?"Añadir":"Guardar"});

  /* Mientras la ventana está abierta, la foto nueva vive aquí: así se
     puede quitar sin tocar la ficha hasta que se guarde. */
  var fotoPendiente;
  var fotoCargando=false;   /* se está convirtiendo o encogiendo */
  var fotoFallo=false;      /* la última que pusiste no pudo entrar */

  function refrescarCampos(){
    var ambito=valor("e_ambito");
    document.getElementById("cajaPais").style.display = (ambito==="espana") ? "none" : "";
    document.getElementById("cajaConmemo").style.display = (ambito==="euro") ? "" : "none";
  }
  document.getElementById("e_ambito").addEventListener("change", refrescarCampos);
  refrescarCampos();

  /* Poner la foto es donde más se atasca esto. El iPhone las guarda en
     HEIC y el navegador no sabe abrirlas: la foto se quedaba fuera y el
     único aviso era un cartel que se iba solo a los tres segundos, así
     que parecía que la app no guardaba nada. Ahora el motivo se queda
     escrito debajo del recuadro hasta que pongas otra, y la foto se
     puede arrastrar o pegar —lo que se pega llega siempre en PNG, que
     sí se abre, y con eso se sale del atasco sin convertir nada. */
  var aviso=document.getElementById("e_fotoMal");
  var quitar=document.getElementById("e_quitarFoto");
  var previa=document.getElementById("e_previa");

  /* El mismo renglón sirve para el «estoy en ello» y para el motivo del
     fallo: en gris mientras trabaja, en rojo cuando algo no ha podido
     ser, y se queda escrito hasta que pongas otra foto. */
  function decir(texto, tranquilo){
    aviso.textContent=texto||"";
    aviso.style.display=texto?"":"none";
    aviso.style.color=tranquilo?"var(--muted)":"var(--malo)";
    fotoFallo = !!texto && !tranquilo;
  }
  function ponerFoto(archivo){
    if(!archivo) return;
    var nombre=archivo.name||"esa foto";
    fotoCargando=true;
    decir(esHeic(archivo)
      ? "Convirtiendo «"+nombre+"», que viene del iPhone. Tarda unos segundos."
      : "Preparando «"+nombre+"»…", true);

    comoSePuedaAbrir(archivo).then(function(abrible){
      encogerFoto(abrible, function(dataUrl){
        fotoCargando=false;
        fotoPendiente=dataUrl;
        previa.src=dataUrl; previa.style.display="";
        quitar.style.display="";
        decir("");
      }, function(porQue){
        fotoCargando=false;
        decir(porQue+" ("+nombre+")");
      });
    }).catch(function(){
      fotoCargando=false;
      decir("«"+nombre+"» es una foto HEIC, la del iPhone, y no he podido convertirla: la "+
            "primera vez hace falta internet. Ábrela en Vista Previa y usa Archivo › Exportar… "+
            "eligiendo JPEG, o cópiala y pégala aquí con ⌘V.");
    });
  }

  quitar.addEventListener("click", function(){
    fotoPendiente=null;
    previa.style.display="none";
    document.getElementById("e_foto").value="";
    quitar.style.display="none";
    decir("");
  });

  document.getElementById("e_foto").addEventListener("change", function(){
    ponerFoto(this.files && this.files[0]);
  });

  /* Arrastrada desde el Finder o desde Fotos. */
  var cajaFoto=document.getElementById("e_cajaFoto");
  ["dragenter","dragover"].forEach(function(ev){
    cajaFoto.addEventListener(ev, function(e){
      e.preventDefault();
      cajaFoto.style.borderColor="var(--acento)";
    });
  });
  ["dragleave","drop"].forEach(function(ev){
    cajaFoto.addEventListener(ev, function(){ cajaFoto.style.borderColor="var(--linea)"; });
  });
  cajaFoto.addEventListener("drop", function(e){
    e.preventDefault();
    var dt=e.dataTransfer;
    ponerFoto(dt && dt.files && dt.files[0]);
  });

  /* Pegada con ⌘V, con la ventana abierta. */
  d.addEventListener("paste", function(e){
    var trozos=(e.clipboardData||{}).items||[];
    for(var i=0;i<trozos.length;i++){
      if(trozos[i].kind==="file" && /^image\//.test(trozos[i].type)){
        e.preventDefault();
        ponerFoto(trozos[i].getAsFile());
        return;
      }
    }
  });
}

/* Las fotos del iPhone vienen en HEIC y ningún navegador de escritorio
   las abre: hasta ahora se quedaban fuera y parecía que la app no
   guardaba la foto. Como casi todas las monedas se fotografían con el
   móvil, la app se trae un convertidor y las pasa a JPEG. Se pide sólo
   cuando aparece un HEIC, una vez por sesión, y la foto se convierte en
   el propio ordenador: no sale de aquí. Sin internet no hay conversión,
   y entonces se dice con los pasos para hacerlo a mano. */
var CONVERSOR_HEIC = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
var conversorPedido = null;

function esHeic(archivo){
  return /hei[cf]/i.test(archivo.type||"") || /\.hei[cf]$/i.test(archivo.name||"");
}
function traerConversor(){
  if(conversorPedido) return conversorPedido;
  conversorPedido = new Promise(function(bien, mal){
    if(window.heic2any) return bien(window.heic2any);
    var s=document.createElement("script");
    s.src=CONVERSOR_HEIC;
    s.onload=function(){ window.heic2any ? bien(window.heic2any) : mal(new Error("sin conversor")); };
    s.onerror=function(){ conversorPedido=null; mal(new Error("sin conversor")); };
    document.head.appendChild(s);
  });
  return conversorPedido;
}
/* Devuelve algo que el navegador sepa abrir: el mismo archivo si ya lo
   era, o el HEIC pasado a JPEG. Una foto «viva» trae varios cuadros;
   nos quedamos con el primero. */
function comoSePuedaAbrir(archivo){
  if(!esHeic(archivo)) return Promise.resolve(archivo);
  return traerConversor().then(function(convertir){
    return convertir({blob:archivo, toType:"image/jpeg", quality:0.82});
  }).then(function(salida){
    return Array.isArray(salida) ? salida[0] : salida;
  });
}

/* La foto se reduce antes de guardarla: 320 px de lado largo y JPEG,
   que para ver una moneda sobra y deja el archivo en unos pocos kB. */
function encogerFoto(archivo, listo, falla){
  /* Si quien llama sabe dónde enseñar el motivo, se lo damos a él; si
     no, cartel flotante como siempre. */
  function mal(texto){ if(falla) falla(texto); else avisar(texto, true); }
  var lector=new FileReader();
  lector.onload=function(){
    var img=new Image();
    img.onload=function(){
      var max=320;
      var ancho=img.width, alto=img.height;
      if(ancho>alto && ancho>max){ alto=Math.round(alto*max/ancho); ancho=max; }
      else if(alto>=ancho && alto>max){ ancho=Math.round(ancho*max/alto); alto=max; }
      var cv=document.createElement("canvas");
      cv.width=ancho; cv.height=alto;
      cv.getContext("2d").drawImage(img,0,0,ancho,alto);
      listo(cv.toDataURL("image/jpeg", 0.68));
    };
    img.onerror=function(){
      mal("No he podido abrir esa imagen: el navegador no entiende ese formato. "+
          "Guárdala en JPG o en PNG y vuelve a ponerla.");
    };
    img.src=lector.result;
  };
  lector.onerror=function(){ mal("No he podido leer ese archivo."); };
  lector.readAsDataURL(archivo);
}

/* ══════════════════════════════════════════════════════════════
   EL ÁLBUM PARA LLEVAR
   ══════════════════════════════════════════════════════════════
   Un archivo suelto con las fotos dentro. No depende de internet ni
   de esta app: se abre en cualquier navegador, se imprime, o se
   guarda como PDF desde el propio navegador.

   Las que faltan van en su sección, al final, para que se distingan
   de un vistazo de las que ya están.
   ══════════════════════════════════════════════════════════════ */
function pedirAlbum(){
  var t=resumenDe(todas());
  if(!todas().length){ avisar("El álbum está vacío.", true); return; }

  abrirVentana("Descargar el álbum",
    '<p class="nota" style="margin:0 0 14px">Se prepara un archivo con las fichas y sus fotos '+
    'dentro. Se abre en cualquier navegador sin necesitar esta app, y desde ahí lo imprimes '+
    'o lo guardas como PDF.</p>'+
    '<div style="display:flex;flex-direction:column;gap:9px">'+
      Object.keys(AMBITOS).map(function(k){
        var n=delAmbito(k).length;
        return '<label style="display:flex;gap:8px;align-items:center;cursor:pointer'+
          (n?"":";opacity:.45")+'">'+
          '<input type="checkbox" class="al_amb" value="'+k+'" style="width:auto"'+
          (n?" checked":" disabled")+'>'+
          '<span>'+esc(AMBITOS[k].nombre)+' <span style="color:var(--muted)">· '+
          plural(n,"ficha","fichas")+'</span></span></label>';
      }).join("")+
    '</div>'+
    '<div style="border-top:1px solid var(--linea);margin:14px 0;padding-top:14px;'+
      'display:flex;flex-direction:column;gap:9px">'+
      '<label style="display:flex;gap:8px;align-items:center;cursor:pointer">'+
        '<input type="checkbox" id="al_tengo" style="width:auto" checked>'+
        '<span>Las que tengo <span style="color:var(--muted)">· '+
        plural(t.fichas-t.faltan,"ficha","fichas")+'</span></span></label>'+
      '<label style="display:flex;gap:8px;align-items:center;cursor:pointer'+
        (t.faltan?"":";opacity:.45")+'">'+
        '<input type="checkbox" id="al_faltan" style="width:auto"'+
        (t.faltan?" checked":" disabled")+'>'+
        '<span>Las que me faltan <span style="color:var(--muted)">· '+
        plural(t.faltan,"ficha","fichas")+'</span></span></label>'+
    '</div>'+
    '<div class="campo"><label class="lbl" for="al_titulo">Título del álbum</label>'+
      '<input id="al_titulo" value="'+esc(libro.ajustes.tituloAlbum||"Mi colección")+'"></div>',

    function(){
      var ambitos=[];
      document.querySelectorAll(".al_amb:checked").forEach(function(c){ ambitos.push(c.value); });
      var conTengo=marcado("al_tengo"), conFaltan=marcado("al_faltan");
      if(!ambitos.length){ avisar("Elige al menos un apartado.", true); return true; }
      if(!conTengo && !conFaltan){ avisar("Elige si van las que tienes, las que faltan, o las dos.", true); return true; }

      var titulo=valor("al_titulo")||"Mi colección";
      libro.ajustes.tituloAlbum=titulo; guardar();

      var lista=todas().filter(function(p){
        if(ambitos.indexOf(p.ambito)<0) return false;
        return tengo(p) ? conTengo : conFaltan;
      });
      if(!lista.length){ avisar("Con esos filtros no queda ninguna ficha.", true); return true; }

      bajarArchivo(albumHTML(titulo, lista, conTengo, conFaltan),
                   "album-"+hoyISO()+".html");
      avisar("Álbum descargado: "+plural(lista.length,"ficha","fichas"));
    },
    {aceptar:"Descargar"});
}

/* La pieza dibujada, con los estilos metidos a mano: el archivo tiene
   que verse igual sin la hoja de estilos de la app. */
function piezaDibujada(p){
  var esBillete=(p.tipo==="billete");
  if(p.foto) return '<img src="'+esc(p.foto)+'" alt="">';
  if(esBillete){
    return '<div class="papel"><span class="n">'+esc(facial(p.valor))+'</span>'+
           '<span class="u">'+esc(p.divisa||"")+'</span></div>';
  }
  var plateado=(p.material && /plata|niquel|níquel|acero/i.test(p.material));
  return '<div class="disco'+(plateado?" plateado":"")+'">'+
         '<span class="n">'+esc(facial(p.valor))+'</span>'+
         '<span class="u">'+esc(p.divisa||"")+'</span></div>';
}

function fichaAlbum(p){
  var detalles=[];
  if(p.anio) detalles.push(p.anio);
  if(p.ceca) detalles.push(p.ceca);
  if(p.material) detalles.push(p.material);
  var abajo=[];
  if(p.estado) abajo.push(p.estado);
  if(tengo(p) && cuantas(p)>1) abajo.push("×"+cuantas(p));
  if(p.conmemorativa) abajo.push("Conmemorativa");
  if(p.estimado) abajo.push(eur(p.estimado));

  return '<div class="ficha'+(tengo(p)?"":" falta")+'">'+
    '<div class="lamina">'+piezaDibujada(p)+'</div>'+
    '<div class="pie">'+
      '<div class="cara">'+esc(facial(p.valor))+' '+esc(p.divisa||"")+'</div>'+
      '<div class="sitio">'+esc(paisDe(p))+(detalles.length?" · "+esc(detalles.join(" · ")):"")+'</div>'+
      (abajo.length?'<div class="meta">'+esc(abajo.join("  ·  "))+'</div>':"")+
      (tengo(p)?"":'<div class="buscando">La busco</div>')+
    '</div></div>';
}

function bloqueAlbum(titulo, lista){
  if(!lista.length) return "";
  /* Dentro de cada apartado, agrupado como en la app: los euros por
     país, España por divisa, el resto por país. */
  var grupos={};
  lista.forEach(function(p){
    var clave = p.ambito==="euro"  ? (p.conmemorativa?"Conmemorativas · ":"")+paisDe(p)
              : p.ambito==="espana"? (p.divisa||"Sin divisa")
              :                      paisDe(p);
    (grupos[clave]=grupos[clave]||[]).push(p);
  });

  return '<section><h2>'+esc(titulo)+'</h2>'+
    Object.keys(grupos).sort().map(function(clave){
      var piezas=grupos[clave].slice().sort(function(a,b){
        var an=(a.anio||"")+"", bn=(b.anio||"")+"";
        if(an!==bn) return an.localeCompare(bn);
        return (+a.valor||0)-(+b.valor||0);
      });
      return '<h3>'+esc(clave)+' <span>'+plural(piezas.length,"ficha","fichas")+'</span></h3>'+
             '<div class="vitrina">'+piezas.map(fichaAlbum).join("")+'</div>';
    }).join("")+'</section>';
}

function albumHTML(titulo, lista, conTengo, conFaltan){
  var mias=lista.filter(tengo), busco=lista.filter(function(p){ return !tengo(p); });
  var t=resumenDe(lista);
  var faciales=facialPorDivisa(lista);
  var fecha=new Date().toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"});

  var cuerpo="";
  if(conTengo){
    Object.keys(AMBITOS).forEach(function(k){
      cuerpo += bloqueAlbum(AMBITOS[k].nombre, mias.filter(function(p){ return p.ambito===k; }));
    });
  }
  if(conFaltan && busco.length){
    cuerpo += '<div class="corte"></div>'+
      '<section class="pendientes"><h2>Las que me faltan</h2>'+
      '<p class="explica">Fichas apuntadas para buscar. Todavía no están en el álbum.</p>'+
      Object.keys(AMBITOS).map(function(k){
        var trozo=busco.filter(function(p){ return p.ambito===k; });
        if(!trozo.length) return "";
        return '<h3>'+esc(AMBITOS[k].nombre)+' <span>'+plural(trozo.length,"ficha","fichas")+'</span></h3>'+
               '<div class="vitrina">'+trozo.map(fichaAlbum).join("")+'</div>';
      }).join("")+'</section>';
  }

  return '<!DOCTYPE html>\n<html lang="es"><head><meta charset="UTF-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+esc(titulo)+'</title><style>'+
  ':root{--fondo:#f6f4ef;--sup:#fff;--sup2:#f1eee6;--linea:#ddd7ca;--tinta:#181510;'+
  '--muted:#6b6355;--acento:#7c5518;--acento-suave:#f3e8d5;--acento-linea:#e0cfae;'+
  '--plata:#5d6570;--plata-suave:#e8eaed;--malo:#96331f;'+
  "--titulo:Georgia,'Times New Roman',serif;--texto:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}"+
  '*{box-sizing:border-box}'+
  'body{margin:0;background:var(--fondo);color:var(--tinta);font-family:var(--texto);'+
  'font-size:14px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
  '.hoja{max-width:1080px;margin:0 auto;padding:36px 28px 60px}'+
  'header{border-bottom:3px double var(--acento-linea);padding-bottom:20px;margin-bottom:26px}'+
  'h1{font-family:var(--titulo);font-size:38px;margin:0;letter-spacing:-.02em}'+
  '.sub{color:var(--muted);margin-top:6px;font-size:13px}'+
  '.totales{display:flex;gap:26px;flex-wrap:wrap;margin-top:18px}'+
  '.totales div{min-width:88px}'+
  '.totales .k{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}'+
  '.totales .v{font-family:var(--titulo);font-size:24px;font-weight:700;margin-top:1px}'+
  'h2{font-family:var(--titulo);font-size:25px;margin:34px 0 4px;'+
  'border-bottom:1px solid var(--linea);padding-bottom:7px}'+
  'h3{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);'+
  'font-weight:600;margin:24px 0 11px}'+
  'h3 span{font-weight:400;text-transform:none;letter-spacing:0;font-size:11.5px}'+
  '.explica{color:var(--muted);font-size:13px;margin:8px 0 0}'+
  '.vitrina{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:13px}'+
  '.ficha{background:var(--sup);border:1px solid var(--linea);border-radius:9px;overflow:hidden;'+
  'break-inside:avoid;page-break-inside:avoid}'+
  '.ficha.falta{border-style:dashed;background:transparent}'+
  '.lamina{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;'+
  'background:var(--sup2);border-bottom:1px solid var(--linea);overflow:hidden}'+
  '.ficha.falta .lamina{background:transparent}'+
  '.lamina img{width:100%;height:100%;object-fit:cover}'+
  '.disco{width:74%;aspect-ratio:1/1;border-radius:50%;display:flex;align-items:center;'+
  'justify-content:center;flex-direction:column;text-align:center;line-height:1.1;padding:8px;'+
  'background:radial-gradient(circle at 34% 28%,#fff,var(--acento-suave) 74%);'+
  'border:2px solid var(--acento-linea);color:var(--acento)}'+
  '.disco.plateado{background:radial-gradient(circle at 34% 28%,#fff,var(--plata-suave) 74%);'+
  'border-color:var(--plata);color:var(--plata)}'+
  '.disco .n,.papel .n{font-family:var(--titulo);font-size:22px;font-weight:700}'+
  '.disco .u,.papel .u{font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;margin-top:2px}'+
  '.papel{width:86%;aspect-ratio:8/5;border-radius:4px;display:flex;align-items:center;'+
  'justify-content:center;flex-direction:column;background:#fff;border:1px solid var(--acento-linea);'+
  'box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 4px var(--acento-suave);color:var(--acento);padding:8px}'+
  '.pie{padding:9px 11px 11px}'+
  '.cara{font-family:var(--titulo);font-size:16px;font-weight:700;line-height:1.2}'+
  '.sitio{font-size:11.5px;color:var(--muted);margin-top:2px}'+
  '.meta{font-size:11px;color:var(--muted);margin-top:6px}'+
  '.buscando{font-size:11px;color:var(--malo);font-weight:700;margin-top:6px}'+
  '.corte{page-break-before:always;break-before:page;height:0}'+
  'footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--linea);'+
  'color:var(--muted);font-size:12px}'+
  '@media print{body{background:#fff}.hoja{padding:0}h2{page-break-after:avoid}'+
  'h3{page-break-after:avoid}}'+
  '@page{margin:14mm}'+
  '</style></head><body><div class="hoja">'+

  '<header><h1>'+esc(titulo)+'</h1>'+
  '<div class="sub">Álbum de monedas y billetes · '+esc(fecha)+'</div>'+
  '<div class="totales">'+
    '<div><div class="k">Piezas</div><div class="v">'+t.piezas+'</div></div>'+
    '<div><div class="k">Monedas</div><div class="v">'+t.monedas+'</div></div>'+
    '<div><div class="k">Billetes</div><div class="v">'+t.billetes+'</div></div>'+
    (t.faltan?'<div><div class="k">Me faltan</div><div class="v">'+t.faltan+'</div></div>':"")+
    (t.estimado?'<div><div class="k">Estimado</div><div class="v">'+eur(t.estimado)+'</div></div>':"")+
  '</div>'+
  (faciales.length
    ? '<div class="sub" style="margin-top:14px">Valor facial: '+
      faciales.map(function(f){ return esc(num(f.total)+" "+f.divisa); }).join(" · ")+'</div>'
    : "")+
  '</header>'+

  cuerpo+

  '<footer>Sacado del escritorio el '+esc(fecha)+'. '+
  'Para guardarlo en PDF, imprime esta página y elige «Guardar como PDF».</footer>'+
  '</div></body></html>';
}

function bajarArchivo(texto, nombre){
  var blob=new Blob([texto], {type:"text/html;charset=utf-8"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}


/* ══════════════════════════════════════════════════════════════
   EL CATÁLOGO DE LAS CONMEMORATIVAS DE 2 €
   ══════════════════════════════════════════════════════════════
   El catálogo (catalogo2e.js) es una lista fija con todas las que se
   han emitido: no se toca nunca y no es tuya. Tuya es la ficha del
   álbum, que se ata a su hueco del catálogo con `p.cat`.

   Por eso marcar una casilla aquí no «apunta un sí» en ninguna lista
   aparte: crea la ficha de verdad, con el país, el año y el tema ya
   puestos, y a partir de ahí se abre, se le pone tu foto y se edita
   como cualquier otra pieza. Desmarcar borra esa ficha, salvo que le
   hayas añadido algo, que entonces se avisa antes.

   Las alemanas se acuñan en cinco cecas (A Berlín, D Múnich, F
   Stuttgart, G Karlsruhe, J Hamburgo) y cada una es una pieza
   distinta: van con cinco casillas, una por letra, y cada una crea su
   propia ficha.

   Las fotos son las oficiales del Banco Central Europeo y se piden a
   su web según hacen falta: no se guarda ninguna en el álbum, así que
   no engordan lo que viaja a GitHub. Sin internet no se ven, y las
   monedas anunciadas que aún no han salido no tienen. */

var catCache = null;

function hayCatalogo(){ return typeof CATALOGO_2E !== "undefined" && CATALOGO_2E.length>0; }

function catalogo(){
  if(!hayCatalogo()) return [];
  if(!catCache) catCache = CATALOGO_2E.map(function(f){
    return { id:f[0], anio:f[1], pais:f[2], tema:f[3], serie:f[4],
             conjunta:!!f[5], foto:f[6]||"", cecas:f[7]||"" };
  });
  return catCache;
}
function delCatalogo(id){
  var l=catalogo();
  for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i];
  return null;
}
function fotoDelCatalogo(c){
  return (c && c.foto) ? CATALOGO_2E_FOTOS+c.foto : "";
}
/* La foto que le toca a una ficha del álbum: la tuya manda, y si no
   la has puesto se enseña la del BCE. */
function fotoDePieza(p){
  if(p.foto) return p.foto;
  if(!p.cat) return "";
  var it=itemDeCatalogo(String(p.cat).split("-")[0]);
  return it ? it.foto : "";
}

/* Cada moneda es una pieza, menos las alemanas, que son cinco: una
   por ceca. La clave de cada pieza es la que va en `p.cat`. */
function clavesDe(c){
  if(!c.cecas) return [c.id];
  return c.cecas.split("").map(function(x){ return c.id+"-"+x; });
}
function cecaDeClave(clave){
  var p=String(clave).split("-");
  return p.length>1 ? p[1] : "";
}
function nombreCeca(letra){
  var n=(typeof CATALOGO_2E_CECAS!=="undefined") ? CATALOGO_2E_CECAS[letra] : "";
  return n ? letra+" · "+n : letra;
}
function piezasDelCatalogo(){
  var n=0; catalogo().forEach(function(c){ n+=c.cecas?c.cecas.length:1; }); return n;
}

/* Las fichas del álbum que vienen del catálogo, por su clave. */
function fichasDelCatalogo(){
  var mapa={};
  todas().forEach(function(p){ if(p.cat) mapa[p.cat]=p; });
  return mapa;
}
function tengoDelCatalogo(){
  var mapa=fichasDelCatalogo(), n=0;
  catalogo().forEach(function(c){
    clavesDe(c).forEach(function(k){ if(mapa[k] && tengo(mapa[k])) n++; });
  });
  return n;
}
function puestasDe(c, mapa){
  var n=0;
  clavesDe(c).forEach(function(k){ if(mapa[k] && tengo(mapa[k])) n++; });
  return n;
}

/* Una ficha «tal cual salió del catálogo» se puede borrar sin preguntar;
   si le has puesto foto, precio o notas tuyas, ya no. */
function fichaIntacta(p, item){
  return !p.foto && !p.pagado && !p.estimado && !p.origen && !p.estado &&
         (Math.max(1,+p.cantidad||1)===1) &&
         (p.notas||"")===(item?item.notas:"");
}

function nuevaDelCatalogo(item, clave){
  var letra=cecaDeClave(clave);
  var f=item.ficha, p={ id:uid(), cat:clave, tengo:true, cantidad:1, alta:hoyISO(),
                        notas:item.notas };
  Object.keys(f).forEach(function(k){ p[k]=f[k]; });
  if(letra) p.ceca=nombreCeca(letra);
  return p;
}

function catFiltrado(){
  var texto=(ui.catBusca||"").trim().toLowerCase();
  var mapa=fichasDelCatalogo();
  return catalogo().filter(function(c){
    var n=puestasDe(c, mapa), total=c.cecas?c.cecas.length:1;
    if(ui.catFiltro==="faltan" && n>=total) return false;
    if(ui.catFiltro==="tengo"  && n===0)    return false;
    if(!texto) return true;
    return (c.pais+" "+c.anio+" "+c.tema+" "+c.serie).toLowerCase().indexOf(texto)>=0;
  });
}

function pintarCatalogo(){
  var main=document.getElementById("main");

  if(!hayCatalogo()){
    main.innerHTML=cabecera("Conmemorativas de 2 €","")+
      '<div class="vacio"><strong>El catálogo no se ha cargado</strong>'+
      'Falta el archivo catalogo2e.js. Recarga la página.</div>';
    return;
  }

  var total=piezasDelCatalogo(), mios=tengoDelCatalogo();
  var paises=[], aa={};
  catalogo().forEach(function(c){ if(!aa[c.pais]){ aa[c.pais]=1; paises.push(c.pais); } });
  var desde=catalogo()[0].anio, hasta=catalogo()[catalogo().length-1].anio;

  main.innerHTML=
    cabecera("Conmemorativas de 2 €",
      "Todas las que se han emitido desde "+desde+", con su foto, país por país y año por año. "+
      "Marca la casilla de las que tengas y se te crea la ficha en el álbum. "+
      "Las alemanas llevan cinco casillas, una por ceca.",
      '<button class="btn" id="catBajar">Descargar la lista</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Las tengo</div>'+
        '<div class="v acento" id="catTengo">'+mios+'</div>'+
        '<div class="n">de '+total+' que hay</div></div>'+
      '<div class="cifra"><div class="k">Me faltan</div>'+
        '<div class="v'+((total-mios)?' malo':'')+'" id="catFaltan">'+(total-mios)+'</div>'+
        '<div class="n">para tenerlas todas</div></div>'+
      '<div class="cifra"><div class="k">Países</div><div class="v">'+paises.length+'</div>'+
        '<div class="n">los que han emitido</div></div>'+
      '<div class="cifra"><div class="k">Años</div><div class="v">'+desde+'–'+hasta+'</div>'+
        '<div class="n">las de '+hasta+' son las anunciadas</div></div>'+
    '</div>'+

    '<div class="filtros">'+
      '<div class="grupo">'+
        '<button data-cagrupa="pais" aria-pressed="'+(ui.catAgrupa!=="anio")+'">Por país</button>'+
        '<button data-cagrupa="anio" aria-pressed="'+(ui.catAgrupa==="anio")+'">Por año</button>'+
      '</div>'+
      '<div class="grupo">'+
        '<button data-cfil="todas"  aria-pressed="'+(ui.catFiltro==="todas")+'">Todas</button>'+
        '<button data-cfil="faltan" aria-pressed="'+(ui.catFiltro==="faltan")+'">Las que me faltan</button>'+
        '<button data-cfil="tengo"  aria-pressed="'+(ui.catFiltro==="tengo")+'">Las que tengo</button>'+
      '</div>'+
      '<input class="buscador" id="catBusca" placeholder="Buscar por país, año o tema…" '+
        'value="'+esc(ui.catBusca||"")+'">'+
    '</div>'+

    '<div id="catLista"></div>';

  main.querySelectorAll("[data-cagrupa]").forEach(function(b){
    b.addEventListener("click", function(){ ui.catAgrupa=b.dataset.cagrupa; pintarCatalogo(); });
  });
  main.querySelectorAll("[data-cfil]").forEach(function(b){
    b.addEventListener("click", function(){ ui.catFiltro=b.dataset.cfil; pintarCatalogo(); });
  });
  var bus=document.getElementById("catBusca");
  bus.addEventListener("input", function(){ ui.catBusca=bus.value; pintarListaCatalogo(); });
  document.getElementById("catBajar").addEventListener("click", bajarCatalogo);

  pintarListaCatalogo();
}

function laminaCatalogo(c){
  var u=fotoDelCatalogo(c);
  if(u) return '<img src="'+esc(u)+'" alt="" loading="lazy" '+
    'style="width:46px;height:46px;border-radius:50%;object-fit:cover;'+
    'background:var(--sup2);border:1px solid var(--linea);display:block">';
  return '<div style="width:46px;height:46px;border-radius:50%;background:var(--sup2);'+
    'border:1px dashed var(--linea);display:flex;align-items:center;justify-content:center;'+
    'font-family:var(--mono);font-size:9px;color:var(--muted);text-align:center;'+
    'line-height:1.1">sin<br>foto</div>';
}

function casillasCatalogo(c, mapa){
  if(!c.cecas){
    var k=c.id, puesta=!!(mapa[k] && tengo(mapa[k]));
    return '<input type="checkbox" style="width:auto;margin:0" data-marca="'+esc(k)+'"'+
           (puesta?" checked":"")+' aria-label="La tengo">';
  }
  /* Cinco cecas, cinco piezas: una casilla por letra, con la letra
     escrita al lado para no tener que adivinar cuál es cuál. */
  return '<div style="display:inline-flex;gap:10px;white-space:nowrap">'+
    c.cecas.split("").map(function(l){
      var k=c.id+"-"+l, puesta=!!(mapa[k] && tengo(mapa[k]));
      return '<label title="'+esc(nombreCeca(l))+'" style="display:inline-flex;gap:3px;'+
        'align-items:center;cursor:pointer;font-family:var(--mono);font-size:11px;'+
        (puesta?'color:var(--acento);font-weight:600':'color:var(--muted)')+'">'+
        '<input type="checkbox" style="width:auto;margin:0" data-marca="'+esc(k)+'"'+
        (puesta?" checked":"")+'>'+l+'</label>';
    }).join("")+'</div>';
}

function pintarListaCatalogo(){
  var caja=document.getElementById("catLista"); if(!caja) return;
  var lista=catFiltrado(), mapa=fichasDelCatalogo();

  if(!lista.length){
    caja.innerHTML='<div class="vacio"><strong>Nada que enseñar</strong>'+
      'Con lo que has escrito no sale ninguna. Prueba con otra cosa.</div>';
    return;
  }

  /* Por país van ordenadas por año, y por año van ordenadas por país:
     en los dos casos, lo que no es el título del grupo. */
  var porAnio = (ui.catAgrupa==="anio");
  var grupos=[], indice={};
  lista.slice().sort(function(a,b){
    return porAnio ? (a.anio-b.anio) || a.pais.localeCompare(b.pais,"es")
                   : a.pais.localeCompare(b.pais,"es") || (a.anio-b.anio);
  }).forEach(function(c){
    var clave = porAnio ? String(c.anio) : c.pais;
    if(!indice[clave]){ indice[clave]={clave:clave, monedas:[]}; grupos.push(indice[clave]); }
    indice[clave].monedas.push(c);
  });

  caja.innerHTML=grupos.map(function(g){
    var suyas=catalogo().filter(function(c){
      return (porAnio ? String(c.anio) : c.pais)===g.clave;
    });
    var hay=0, tengoAqui=0;
    suyas.forEach(function(c){ hay+=c.cecas?c.cecas.length:1; tengoAqui+=puestasDe(c,mapa); });

    return '<div class="grupoTitulo">'+esc(g.clave)+
      '<span class="mono" style="text-transform:none;letter-spacing:0" '+
      'data-marcador="'+esc(g.clave)+'">'+tengoAqui+' de '+hay+'</span></div>'+
      '<div class="tarjeta" style="margin-bottom:14px"><div class="tarjeta-cuerpo tabla-caja" '+
      'style="padding:0"><table><tbody>'+
      g.monedas.map(function(c){
        var n=puestasDe(c,mapa), total=c.cecas?c.cecas.length:1;
        return '<tr data-cat="'+esc(c.id)+'"'+(n?'':' style="color:var(--muted)"')+'>'+
          '<td style="width:58px;padding-right:0">'+laminaCatalogo(c)+'</td>'+
          '<td class="mono" style="width:52px">'+(porAnio?esc(c.pais).slice(0,3).toUpperCase():c.anio)+'</td>'+
          '<td><strong>'+esc(c.tema)+'</strong>'+
            (porAnio?'<div style="font-size:11.5px;color:var(--muted)">'+esc(c.pais)+'</div>':'')+
            (c.serie?'<div style="font-size:11.5px;color:var(--muted)">Serie: '+esc(c.serie)+'</div>':'')+
          '</td>'+
          '<td style="width:1%;white-space:nowrap">'+
            (c.conjunta?'<span class="chapa neutra">Conjunta</span>':'')+'</td>'+
          '<td style="width:1%;white-space:nowrap">'+casillasCatalogo(c, mapa)+'</td>'+
        '</tr>';
      }).join("")+
      '</tbody></table></div></div>';
  }).join("");

  caja.querySelectorAll("[data-marca]").forEach(function(casilla){
    casilla.addEventListener("change", function(){
      marcarDelCatalogo(casilla.dataset.marca, casilla.checked, casilla);
    });
  });
}

function marcarDelCatalogo(clave, quiero, casilla){
  var item=itemDeCatalogo(String(clave).split("-")[0]); if(!item) return;
  var p=fichasDelCatalogo()[clave];
  var letra=cecaDeClave(clave);
  var comoSeLlama=item.comoSeLlama+(letra?" ("+letra+")":"");

  if(quiero){
    if(p){ p.tengo=true; } else { libro.piezas.push(nuevaDelCatalogo(item, clave)); }
    guardar(); refrescarTodo();
    avisar(comoSeLlama+": ficha creada en el álbum");
    return;
  }

  if(!p){ refrescarTodo(); return; }

  if(fichaIntacta(p, item)){
    libro.piezas=todas().filter(function(x){ return x!==p; });
    guardar(); refrescarTodo();
    avisar(comoSeLlama+": fuera del álbum");
    return;
  }

  /* Esta ya no es la ficha que salió del catálogo: tiene cosas tuyas
     dentro, así que borrarla sin avisar sería perderlas. */
  if(casilla) casilla.checked=true;
  confirmar("Quitar "+comoSeLlama,
    '<p class="nota">A esta ficha le has puesto cosas tuyas'+
    (p.foto?", la foto entre ellas":"")+'. Si la quitas del álbum, se borra con todo '+
    'lo que tenga dentro.</p>'+
    '<p class="nota">Si sólo quieres apuntarla como pendiente, déjala y desmarca '+
    '«la tengo» al abrirla: así se queda en la lista de las que buscas.</p>',
    function(){
      libro.piezas=todas().filter(function(x){ return x!==p; });
      guardar(); refrescarTodo();
      avisar(comoSeLlama+": borrada");
    },
    {aceptar:"Borrarla", malo:true});
}

/* Repintar entero mandaría la página otra vez arriba del todo, y con
   seiscientas monedas eso es insufrible: se tocan sólo las cifras y
   la fila. */
function refrescarCatalogo(){
  var total=piezasDelCatalogo(), mios=tengoDelCatalogo(), mapa=fichasDelCatalogo();
  var a=document.getElementById("catTengo"), b=document.getElementById("catFaltan");
  if(a) a.textContent=mios;
  if(b){ b.textContent=total-mios; b.className="v"+((total-mios)?" malo":""); }

  var porAnio=(ui.catAgrupa==="anio");
  document.querySelectorAll("[data-marcador]").forEach(function(e){
    var clave=e.dataset.marcador, hay=0, n=0;
    catalogo().forEach(function(c){
      if((porAnio?String(c.anio):c.pais)!==clave) return;
      hay+=c.cecas?c.cecas.length:1; n+=puestasDe(c,mapa);
    });
    e.textContent=n+" de "+hay;
  });
  document.querySelectorAll("[data-cat]").forEach(function(fila){
    var c=delCatalogo(fila.dataset.cat); if(!c) return;
    fila.style.color = puestasDe(c,mapa) ? "" : "var(--muted)";
    fila.querySelectorAll("[data-marca]").forEach(function(casilla){
      var k=casilla.dataset.marca, puesta=!!(mapa[k] && tengo(mapa[k]));
      casilla.checked=puesta;
      var et=casilla.parentNode;
      if(et && et.tagName==="LABEL"){
        et.style.color = puesta ? "var(--acento)" : "var(--muted)";
        et.style.fontWeight = puesta ? "600" : "";
      }
    });
  });
  /* Con un filtro puesto, la fila que acabas de cambiar ya no pinta
     nada en la lista: se rehace. */
  if(ui.catFiltro!=="todas") pintarListaCatalogo();
  var nav=document.querySelector('[data-vista="catalogo"] .cuenta');
  if(nav) nav.textContent=mios;
  var navE=document.querySelector('[data-vista="euro"] .cuenta');
  if(navE) navE.textContent=delAmbito("euro").length;
}

/* Marcar se hace desde cualquiera de los dos catálogos, así que se
   refresca el que esté en pantalla. */
function refrescarTodo(){
  if(document.getElementById("catLista")) refrescarCatalogo();
  if(document.getElementById("esLista"))  refrescarCatalogoES();
}

function bajarCatalogo(){
  var mapa=fichasDelCatalogo();
  var lineas=["Año\tPaís\tTema\tSerie\tCeca\tConjunta\t¿La tengo?"];
  catalogo().forEach(function(c){
    clavesDe(c).forEach(function(k){
      lineas.push([c.anio, c.pais, c.tema, c.serie||"", cecaDeClave(k),
                   c.conjunta?"sí":"", (mapa[k] && tengo(mapa[k]))?"sí":"no"].join("\t"));
    });
  });
  bajarArchivo(lineas.join("\n"), "conmemorativas-2-euros.txt");
}


/* ══════════════════════════════════════════════════════════════
   EL CATÁLOGO DE ESPAÑA
   ══════════════════════════════════════════════════════════════
   Lo mismo que el de las conmemorativas, pero con lo de aquí: las
   monedas de peseta desde 1869, las de euro año por año y los
   billetes desde 1783. Comparte con él la maquinaria de marcar: una
   casilla crea la ficha de verdad en el álbum y desmarcarla la quita.

   La diferencia está en lo que hay detrás. El anexo de la peseta va
   por TIPO de moneda, no por año: «1 Peseta · 1966-1975» es el cuño
   entero, con todas sus estrellas. Por eso aquí no se puede contar
   pieza por pieza como en las alemanas, y la cuenta que sale es de
   tipos, no de monedas. */

var catEsCache = null;

function hayCatalogoES(){ return typeof CATALOGO_ES !== "undefined" && CATALOGO_ES.length>0; }

function catalogoES(){
  if(!hayCatalogoES()) return [];
  if(!catEsCache) catEsCache = CATALOGO_ES.map(function(f){
    return { id:f[0], bloque:f[1], grupo:f[2], titulo:f[3], detalle:f[4], foto:f[5],
             tipo:f[6], valor:f[7], divisa:f[8], anio:f[9] };
  });
  return catEsCache;
}
/* Para agrupar por año hace falta un año y no un texto: «1966-1975» o
   «1869*68» valen por el primero de cuatro cifras que traigan. Los
   billetes antiguos muchas veces sólo lo llevan en la emisión. */
function anioDeES(c){
  var m=String(c.anio||"").match(/\d{4}/);
  if(!m) m=String(c.detalle||"").match(/\d{4}/);
  if(!m) m=String(c.grupo||"").match(/\d{4}/);
  return m ? m[0] : "";
}
function claveGrupoES(c){
  if((ui.esAgrupa||"epoca")!=="anio") return c.grupo;
  var a=anioDeES(c);
  return a || "Sin año";
}

function delCatalogoES(id){
  var l=catalogoES();
  for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i];
  return null;
}

/* Los dos catálogos hablan el mismo idioma a partir de aquí: lo que
   marcar necesita saber de una pieza, venga de donde venga. */
function itemDeCatalogo(id){
  var c=hayCatalogo()?delCatalogo(id):null;
  if(c) return { id:c.id, cecas:c.cecas, notas:c.tema, foto:fotoDelCatalogo(c),
                 comoSeLlama:c.pais+" "+c.anio,
                 ficha:{ ambito:"euro", tipo:"moneda", valor:2, divisa:"Euro",
                         anio:String(c.anio), pais:c.pais, ceca:c.serie||"",
                         conmemorativa:true } };
  var e=hayCatalogoES()?delCatalogoES(id):null;
  if(e) return { id:e.id, cecas:"", notas:e.titulo+(e.detalle?" · "+e.detalle:""),
                 foto:e.foto,
                 comoSeLlama:e.titulo+(e.anio?" "+e.anio:""),
                 ficha:{ ambito:"espana", tipo:e.tipo,
                         valor:(e.valor==null?"":e.valor), divisa:e.divisa||"",
                         anio:e.anio||"", pais:"España", ceca:"",
                         conmemorativa:false } };
  return null;
}

function esBloque(x){ return ui.esBloque||"todo"; }

function esFiltrado(){
  var texto=(ui.esBusca||"").trim().toLowerCase();
  var mapa=fichasDelCatalogo();
  var bloque=ui.esBloque||"todo";
  return catalogoES().filter(function(c){
    if(bloque!=="todo" && c.bloque!==bloque) return false;
    var puesta=!!(mapa[c.id] && tengo(mapa[c.id]));
    if(ui.esFiltro==="faltan" && puesta) return false;
    if(ui.esFiltro==="tengo"  && !puesta) return false;
    if(!texto) return true;
    return (c.grupo+" "+c.titulo+" "+c.detalle+" "+c.anio+" "+c.divisa).toLowerCase().indexOf(texto)>=0;
  });
}

function tengoDeES(){
  var mapa=fichasDelCatalogo(), n=0;
  catalogoES().forEach(function(c){ if(mapa[c.id] && tengo(mapa[c.id])) n++; });
  return n;
}

function pintarCatalogoES(){
  var main=document.getElementById("main");

  if(!hayCatalogoES()){
    main.innerHTML=cabecera("Catálogo de España","")+
      '<div class="vacio"><strong>El catálogo no se ha cargado</strong>'+
      'Falta el archivo catalogoes.js. Recarga la página.</div>';
    return;
  }

  var lista=catalogoES(), total=lista.length, mios=tengoDeES();
  var cuenta={};
  lista.forEach(function(c){ cuenta[c.bloque]=(cuenta[c.bloque]||0)+1; });
  var bloques=Object.keys(cuenta);

  main.innerHTML=
    cabecera("Catálogo de España",
      "Las monedas de peseta desde 1869, las de euro año por año y los billetes desde 1783. "+
      "Marca lo que tengas y se te crea la ficha en <strong>España</strong>. "+
      "Las pesetas van por tipo de moneda, no por estrella: si las coleccionas por estrella, "+
      "súbele la cantidad a la ficha.",
      '<button class="btn" id="esBajar">Descargar la lista</button>')+

    '<div class="cifras">'+
      '<div class="cifra"><div class="k">Las tengo</div>'+
        '<div class="v acento" id="esTengo">'+mios+'</div>'+
        '<div class="n">de '+total+' huecos</div></div>'+
      bloques.map(function(b){
        return '<div class="cifra"><div class="k">'+esc(b)+'</div><div class="v">'+cuenta[b]+'</div>'+
               '<div class="n">en el catálogo</div></div>';
      }).join("")+
    '</div>'+

    '<div class="filtros">'+
      '<div class="grupo">'+
        '<button data-esag="epoca" aria-pressed="'+((ui.esAgrupa||"epoca")==="epoca")+'">Por época</button>'+
        '<button data-esag="anio"  aria-pressed="'+(ui.esAgrupa==="anio")+'">Por año</button>'+
      '</div>'+
      '<div class="grupo">'+
        '<button data-esb="todo" aria-pressed="'+((ui.esBloque||"todo")==="todo")+'">Todo</button>'+
        bloques.map(function(b){
          return '<button data-esb="'+esc(b)+'" aria-pressed="'+(ui.esBloque===b)+'">'+esc(b)+'</button>';
        }).join("")+
      '</div>'+
      '<div class="grupo">'+
        '<button data-esf="todas"  aria-pressed="'+((ui.esFiltro||"todas")==="todas")+'">Todas</button>'+
        '<button data-esf="faltan" aria-pressed="'+(ui.esFiltro==="faltan")+'">Las que me faltan</button>'+
        '<button data-esf="tengo"  aria-pressed="'+(ui.esFiltro==="tengo")+'">Las que tengo</button>'+
      '</div>'+
      '<input class="buscador" id="esBusca" placeholder="Buscar por año, valor o época…" '+
        'value="'+esc(ui.esBusca||"")+'">'+
    '</div>'+

    '<div id="esLista"></div>';

  main.querySelectorAll("[data-esag]").forEach(function(b){
    b.addEventListener("click", function(){ ui.esAgrupa=b.dataset.esag; pintarCatalogoES(); });
  });
  main.querySelectorAll("[data-esb]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.esBloque=(b.dataset.esb==="todo"?"todo":b.dataset.esb); pintarCatalogoES();
    });
  });
  main.querySelectorAll("[data-esf]").forEach(function(b){
    b.addEventListener("click", function(){ ui.esFiltro=b.dataset.esf; pintarCatalogoES(); });
  });
  var bus=document.getElementById("esBusca");
  bus.addEventListener("input", function(){ ui.esBusca=bus.value; pintarListaES(); });
  document.getElementById("esBajar").addEventListener("click", bajarCatalogoES);

  pintarListaES();
}

function laminaES(c){
  if(c.foto) return '<img src="'+esc(c.foto)+'" alt="" loading="lazy" '+
    'style="width:46px;height:46px;border-radius:'+(c.tipo==="billete"?"6px":"50%")+';'+
    'object-fit:cover;background:var(--sup2);border:1px solid var(--linea);display:block">';
  return '<div style="width:46px;height:46px;border-radius:'+(c.tipo==="billete"?"6px":"50%")+';'+
    'background:var(--sup2);border:1px dashed var(--linea);display:flex;align-items:center;'+
    'justify-content:center;font-family:var(--mono);font-size:9px;color:var(--muted);'+
    'text-align:center;line-height:1.1">sin<br>foto</div>';
}

function pintarListaES(){
  var caja=document.getElementById("esLista"); if(!caja) return;
  var lista=esFiltrado(), mapa=fichasDelCatalogo();

  if(!lista.length){
    caja.innerHTML='<div class="vacio"><strong>Nada que enseñar</strong>'+
      'Con lo que has escrito no sale ninguna. Prueba con otra cosa.</div>';
    return;
  }

  var porAnio=((ui.esAgrupa||"epoca")==="anio");
  var grupos=[], indice={};
  lista.slice().sort(function(a,b){
    if(!porAnio) return 0;                       /* por época manda el orden del catálogo */
    var aa=anioDeES(a)||"9999", bb=anioDeES(b)||"9999";
    return aa.localeCompare(bb) || a.titulo.localeCompare(b.titulo,"es");
  }).forEach(function(c){
    var clave=claveGrupoES(c);
    if(!indice[clave]){ indice[clave]={clave:clave, cosas:[]}; grupos.push(indice[clave]); }
    indice[clave].cosas.push(c);
  });

  caja.innerHTML=grupos.map(function(g){
    var suyas=catalogoES().filter(function(c){ return claveGrupoES(c)===g.clave; });
    var puestas=suyas.filter(function(c){ return mapa[c.id] && tengo(mapa[c.id]); }).length;
    return '<div class="grupoTitulo">'+esc(g.clave)+
      '<span class="mono" style="text-transform:none;letter-spacing:0" '+
      'data-esmarcador="'+esc(g.clave)+'">'+puestas+' de '+suyas.length+'</span></div>'+
      '<div class="tarjeta" style="margin-bottom:14px"><div class="tarjeta-cuerpo tabla-caja" '+
      'style="padding:0"><table><tbody>'+
      g.cosas.map(function(c){
        var puesta=!!(mapa[c.id] && tengo(mapa[c.id]));
        return '<tr data-escat="'+esc(c.id)+'"'+(puesta?'':' style="color:var(--muted)"')+'>'+
          '<td style="width:58px;padding-right:0">'+laminaES(c)+'</td>'+
          '<td><strong>'+esc(c.titulo)+'</strong>'+
            (porAnio?'<div style="font-size:11.5px;color:var(--muted)">'+esc(c.grupo)+'</div>':'')+
            (c.detalle?'<div style="font-size:11.5px;color:var(--muted)">'+esc(c.detalle)+'</div>':'')+
          '</td>'+
          '<td style="width:1%;white-space:nowrap">'+
            (c.tipo==="billete"?'<span class="chapa neutra">Billete</span>':'')+'</td>'+
          '<td style="width:1%;white-space:nowrap">'+
            '<input type="checkbox" style="width:auto;margin:0" data-marca="'+esc(c.id)+'"'+
            (puesta?" checked":"")+' aria-label="La tengo"></td>'+
        '</tr>';
      }).join("")+
      '</tbody></table></div></div>';
  }).join("");

  caja.querySelectorAll("[data-marca]").forEach(function(casilla){
    casilla.addEventListener("change", function(){
      marcarDelCatalogo(casilla.dataset.marca, casilla.checked, casilla);
    });
  });
}

function refrescarCatalogoES(){
  var mapa=fichasDelCatalogo(), mios=tengoDeES();
  var a=document.getElementById("esTengo"); if(a) a.textContent=mios;
  document.querySelectorAll("[data-esmarcador]").forEach(function(e){
    var clave=e.dataset.esmarcador;
    var suyas=catalogoES().filter(function(c){ return claveGrupoES(c)===clave; });
    var n=suyas.filter(function(c){ return mapa[c.id] && tengo(mapa[c.id]); }).length;
    e.textContent=n+" de "+suyas.length;
  });
  document.querySelectorAll("[data-escat]").forEach(function(fila){
    var id=fila.dataset.escat, puesta=!!(mapa[id] && tengo(mapa[id]));
    fila.style.color = puesta ? "" : "var(--muted)";
    var casilla=fila.querySelector("[data-marca]");
    if(casilla) casilla.checked=puesta;
  });
  if((ui.esFiltro||"todas")!=="todas") pintarListaES();
  var nav=document.querySelector('[data-vista="catalogoes"] .cuenta');
  if(nav) nav.textContent=mios;
  var navE=document.querySelector('[data-vista="espana"] .cuenta');
  if(navE) navE.textContent=delAmbito("espana").length;
}

function bajarCatalogoES(){
  var mapa=fichasDelCatalogo();
  var lineas=["Bloque\tÉpoca\tQué es\tDetalle\tValor\tDivisa\tAño\t¿La tengo?"];
  catalogoES().forEach(function(c){
    lineas.push([c.bloque, c.grupo, c.titulo, c.detalle, (c.valor==null?"":c.valor),
                 c.divisa, c.anio, (mapa[c.id] && tengo(mapa[c.id]))?"sí":"no"].join("\t"));
  });
  bajarArchivo(lineas.join("\n"), "catalogo-espana.txt");
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function pesoDelAlbum(){
  try{ return new Blob([JSON.stringify(libro)]).size; }
  catch(e){ return JSON.stringify(libro).length; }
}
function conFotos(){ return todas().filter(function(p){ return !!p.foto; }).length; }
function bonitoPeso(bytes){
  if(bytes>1048576) return num(bytes/1048576,1)+" MB";
  return bytes<1024 ? "casi nada" : num(bytes/1024,0)+" kB";
}

function pintarAjustes(){
  var main=document.getElementById("main");
  var peso=pesoDelAlbum(), fotos=conFotos();

  main.innerHTML=
    cabecera("Ajustes", "Sacar una copia del álbum, ver lo que ocupa y vaciarlo.",
      '<button class="btn fuerte" id="descargar2">Descargar el álbum</button>')+

    '<div class="tarjeta" style="max-width:560px;margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Llevártelo</h2>'+
        '<span class="pista">Un archivo suelto, con las fotos dentro</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota" style="margin:0">Se descarga un archivo que se abre en cualquier '+
        'navegador, sin necesitar esta app ni internet. Sirve para enseñárselo a alguien, '+
        'para imprimirlo, o para guardarlo como PDF desde el propio navegador. '+
        'Puedes elegir qué apartados entran y si van también las que te faltan.</p>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Lo que ocupa</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div class="cifras" style="margin:0">'+
          '<div class="cifra"><div class="k">Álbum entero</div><div class="v">'+bonitoPeso(peso)+'</div>'+
            '<div class="n">'+plural(todas().length,"ficha","fichas")+'</div></div>'+
          '<div class="cifra"><div class="k">Con foto</div><div class="v">'+fotos+'</div>'+
            '<div class="n">de '+todas().length+'</div></div>'+
        '</div>'+
        '<p class="nota" style="margin:14px 0 0">Cada vez que cambias algo, el álbum entero '+
        'sube al repositorio privado. Con muchas fotos eso se nota al guardar. '+
        (peso>3145728
          ? '<strong style="color:var(--aviso)">Ya pasa de 3 MB: ve con tiento con las fotos nuevas.</strong>'
          : 'De momento va sobrado.')+'</p>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;border-color:var(--malo)">'+
      '<div class="tarjeta-cab"><h2 style="color:var(--malo)">Borrar</h2>'+
        '<span class="pista">No tiene vuelta atrás</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota" style="margin:0 0 14px">Lo borrado se va también de GitHub, '+
        'y no hay forma de recuperarlo desde aquí.</p>'+
        '<div style="display:flex;flex-direction:column;gap:12px">'+
          '<div><button class="btn malo" id="b_fotos">Quitar todas las fotos</button>'+
            '<div class="nota" style="margin-top:4px">Las fichas se quedan; sólo se van las '+
            plural(fotos,"foto","fotos")+'. Sirve para aligerar el álbum.</div></div>'+
          '<div style="border-top:1px solid var(--linea);padding-top:12px">'+
            '<button class="btn malo fuerte" id="b_todo">Vaciar el álbum</button>'+
            '<div class="nota" style="margin-top:4px">Se van las '+
            plural(todas().length,"ficha","fichas")+' con todo lo que llevan dentro.</div></div>'+
        '</div>'+
      '</div></div>';

  document.getElementById("descargar2").addEventListener("click", pedirAlbum);

  document.getElementById("b_fotos").addEventListener("click", function(){
    if(!fotos){ avisar("No hay ninguna foto que quitar.", true); return; }
    confirmar("Quitar todas las fotos",
      '<p style="margin:0">'+segunCuantos(fotos,"Se va <strong>la única foto</strong>",
        "Se van <strong>las "+fotos+" fotos</strong>")+
      '. Las fichas y sus datos se quedan como están.</p>',
      function(){
        todas().forEach(function(p){ delete p.foto; });
        guardar(); pintar(); avisar("Fotos quitadas");
      }, {aceptar:"Quitar", malo:true});
  });

  document.getElementById("b_todo").addEventListener("click", function(){
    if(!todas().length){ avisar("El álbum ya está vacío.", true); return; }
    abrirVentana("Vaciar el álbum",
      '<p style="margin:0 0 12px">'+segunCuantos(todas().length,
        "Se va <strong>la única ficha</strong>",
        "Se van <strong>las "+todas().length+" fichas</strong>")+
      ' con sus fotos y sus notas. El álbum se queda como el primer día.</p>'+
      '<div class="campo"><label class="lbl" for="b_palabra">Escribe BORRAR para confirmarlo</label>'+
        '<input id="b_palabra" class="mono" placeholder="BORRAR" autocomplete="off"></div>',
      function(){
        if(valor("b_palabra").toUpperCase()!=="BORRAR"){
          avisar("Escribe BORRAR para confirmarlo.", true);
          return true;
        }
        libro.piezas=[];
        guardar(); pintar(); avisar("Álbum vaciado");
      }, {aceptar:"Vaciar el álbum", malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
