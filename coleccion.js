/* ══════════════════════════════════════════════════════════════════
   COLECCIÓN — el álbum de monedas y billetes
   ══════════════════════════════════════════════════════════════════
   Tres apartados, que es como se guardan de verdad:

     España        pesetas, reales, escudos… lo de aquí de siempre
     Euros         por país y año, con las conmemorativas aparte
     Resto         todo lo demás, agrupado por país

   Dentro de cada uno, monedas y billetes por separado.

   Una pieza puede estar en el álbum o estar en la lista de las que
   faltan: es la misma ficha con la casilla «la tengo» sin marcar, para
   poder llevar encima lo que buscas sin apuntarlo en otro sitio.

   Las fotos se guardan reducidas a 320 px. El álbum entero viaja a
   GitHub en cada cambio, así que en Ajustes se ve cuánto ocupa.
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
var ui = { vista:"resumen", tipo:"todo", busca:"", soloFaltan:false, orden:"pais" };

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
  var lamina = p.foto
    ? '<img src="'+esc(p.foto)+'" alt="">'
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
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
        '<img id="e_previa" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;'+
          'background:var(--sup2);border:1px solid var(--linea);'+(p.foto?'" src="'+esc(p.foto):'display:none')+'">'+
        '<input type="file" id="e_foto" accept="image/*" style="width:auto;flex:1;min-width:150px">'+
        (p.foto?'<button type="button" class="btn suave" id="e_quitarFoto">Quitar</button>':"")+
      '</div>'+
      '<p class="nota" style="margin:6px 0 0">Se guarda reducida a 320 px. El álbum entero '+
      'viaja a GitHub en cada cambio, así que conviene no cargarlo de fotos enormes.</p>'+
    '</div>',

    function(){
      var v=document.getElementById("e_valor").value;
      if(v===""){ avisar("Ponle el valor, aunque sea aproximado.", true); return true; }
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
      avisar(nueva?"Pieza añadida":"Pieza guardada");
    },
    {aceptar:nueva?"Añadir":"Guardar"});

  /* Mientras la ventana está abierta, la foto nueva vive aquí: así se
     puede quitar sin tocar la ficha hasta que se guarde. */
  var fotoPendiente;

  function refrescarCampos(){
    var ambito=valor("e_ambito");
    document.getElementById("cajaPais").style.display = (ambito==="espana") ? "none" : "";
    document.getElementById("cajaConmemo").style.display = (ambito==="euro") ? "" : "none";
  }
  document.getElementById("e_ambito").addEventListener("change", refrescarCampos);
  refrescarCampos();

  var quitar=document.getElementById("e_quitarFoto");
  if(quitar) quitar.addEventListener("click", function(){
    fotoPendiente=null;
    document.getElementById("e_previa").style.display="none";
    quitar.remove();
  });

  document.getElementById("e_foto").addEventListener("change", function(){
    var archivo=this.files && this.files[0];
    if(!archivo) return;
    encogerFoto(archivo, function(dataUrl){
      fotoPendiente=dataUrl;
      var previa=document.getElementById("e_previa");
      previa.src=dataUrl; previa.style.display="";
    });
  });
}

/* La foto se reduce antes de guardarla: 320 px de lado largo y JPEG,
   que para ver una moneda sobra y deja el archivo en unos pocos kB. */
function encogerFoto(archivo, listo){
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
    img.onerror=function(){ avisar("No he podido leer esa imagen.", true); };
    img.src=lector.result;
  };
  lector.onerror=function(){ avisar("No he podido leer ese archivo.", true); };
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
