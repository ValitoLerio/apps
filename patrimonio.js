/* ══════════════════════════════════════════════════════════════════
   PATRIMONIO — lo que tengo, lo que me costó y lo que vale hoy
   ══════════════════════════════════════════════════════════════════
   Un bien es cualquier cosa que valga dinero: un piso, un parking, lo
   que hay en el broker o lo que duerme en la cuenta. Todos se guardan
   igual, con tres cifras que no se mezclan nunca:

     lo que costó   el precio pagado, más los gastos de la compra
                    (notario, registro, impuestos) y las reformas
     lo que vale    una lista de valoraciones con su fecha; la última
                    manda, y las viejas dibujan la línea de evolución
     lo que debo    lo que queda de hipoteca

   De ahí sale todo lo demás: el patrimonio neto es lo que vale menos
   lo que debo, la plusvalía es lo que vale menos lo que costó, y la
   rentabilidad del alquiler se mide siempre contra lo que costó, no
   contra lo que vale hoy — si no, un piso que sube parece rentar menos.

   El valor de un piso es una opinión, así que se escribe a mano y con
   fecha. La app no inventa ninguna cifra: lo que no has apuntado, no
   sale.
   ══════════════════════════════════════════════════════════════════ */
(function(){

var CLAVE = "patrimonio.libro.v1";

var VACIO = { bienes: [], ajustes: {} };

var TIPOS = {
  piso:      {nombre:"Piso",      icono:"🏠", ladrillo:true},
  parking:   {nombre:"Parking",   icono:"🚗", ladrillo:true},
  local:     {nombre:"Local",     icono:"🏪", ladrillo:true},
  terreno:   {nombre:"Terreno",   icono:"🌲", ladrillo:true},
  inversion: {nombre:"Inversión", icono:"📈", ladrillo:false},
  ahorro:    {nombre:"Ahorro",    icono:"🏦", ladrillo:false},
  otro:      {nombre:"Otro",      icono:"📦", ladrillo:false}
};
var ORDEN_TIPOS = ["piso","parking","local","terreno","inversion","ahorro","otro"];

/* Los seis tonos de serie viven en el CSS, que es quien sabe si la
   pantalla está en claro o en oscuro. Aquí sólo se reparten en su orden
   fijo: el color va con el bien, no con su posición en el ranking, así
   que filtrar o reordenar no repinta nada. Del séptimo en adelante van
   en gris y se juntan en «Otros»: seis es lo que aguanta el ojo. */
var SERIES = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--s6)"];
var GRIS   = "var(--muted)";

var libro = null;
var ui = { vista:"resumen" };

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
  dec = dec==null ? 0 : dec;
  return (+n||0).toLocaleString("es-ES",{minimumFractionDigits:dec, maximumFractionDigits:dec});
}
/* El patrimonio se mueve en miles: los céntimos sólo estorban. */
function eur(n){ return num(n)+" €"; }
function eurFirma(n){ return (n>0?"+":n<0?"−":"")+num(Math.abs(n))+" €"; }
function pct(x, dec){ return (x*100).toLocaleString("es-ES",
  {minimumFractionDigits:dec==null?1:dec, maximumFractionDigits:dec==null?1:dec})+" %"; }
function pctFirma(x){ return (x>0?"+":x<0?"−":"")+pct(Math.abs(x)); }

function hoyISO(){
  var d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function fechaCorta(iso){
  if(!iso) return "—";
  var p=String(iso).split("-");
  return p.length<3 ? iso : p[2]+"/"+p[1]+"/"+p[0];
}
function mesLargo(iso){
  if(!iso) return "";
  var m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  var p=String(iso).split("-");
  return m[(+p[1]||1)-1]+" "+p[0];
}
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():""; }
function numero(id){ var e=document.getElementById(id); return e?(+e.value||0):0; }

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
              (opciones.soloCerrar?'':'<button class="btn" data-x>Cancelar</button>')+
              '<button class="btn '+(opciones.malo?"malo":"fuerte")+'" data-ok>'+
              esc(opciones.aceptar||"Guardar")+'</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    if(alGuardar && alGuardar()===true) return;   /* true = dejar la ventana abierta */
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
  if(!libro.bienes) libro.bienes=[];
  if(!libro.ajustes) libro.ajustes={};
  libro.bienes.forEach(function(b){
    if(!b.valores) b.valores=[];
    if(!b.hipoteca) b.hipoteca={};
  });
}
function guardar(){
  localStorage.setItem(CLAVE, JSON.stringify(libro));
}

/* ══════════════════════════════════════════════════════════════
   LAS CUENTAS
   ══════════════════════════════════════════════════════════════ */
function todos(){ return libro.bienes||[]; }
function porId(id){
  return todos().filter(function(b){ return b.id===id; })[0] || null;
}
function esLadrillo(b){ return !!(TIPOS[b.tipo]||{}).ladrillo; }

/* El color va con el bien, por su sitio en la lista: si mañana borras
   uno, los demás no cambian de color de golpe. */
function colorDe(b){
  var i=todos().indexOf(b);
  return i>=0 && i<SERIES.length ? SERIES[i] : GRIS;
}

function coste(b){ return r2((+b.compra||0)+(+b.gastos||0)+(+b.mejoras||0)); }

function valoresOrdenados(b){
  return (b.valores||[]).slice().sort(function(a,c){
    return String(a.f||"").localeCompare(String(c.f||""));
  });
}
/* Sin ninguna valoración apuntada, lo que vale es lo que costó: no me
   invento una revalorización que nadie ha dicho. */
function valorHoy(b){
  var v=valoresOrdenados(b);
  return v.length ? r2(v[v.length-1].v) : coste(b);
}
function fechaValor(b){
  var v=valoresOrdenados(b);
  return v.length ? v[v.length-1].f : (b.fecha||"");
}
/* Cuánto valía en una fecha: la última valoración anterior a ese día.
   Antes de comprarlo no valía nada mío, y entre la compra y la primera
   valoración vale lo que costó. */
function valorEn(b, f){
  if(b.fecha && b.fecha>f) return 0;
  var v=valoresOrdenados(b), ult=null;
  for(var i=0;i<v.length;i++){ if(String(v[i].f)<=f) ult=v[i]; }
  if(ult) return r2(ult.v);
  return v.length && !b.fecha ? 0 : coste(b);
}

function deuda(b){ return r2((b.hipoteca||{}).pendiente); }
function neto(b){ return r2(valorHoy(b)-deuda(b)); }
function plusvalia(b){ return r2(valorHoy(b)-coste(b)); }
function plusPct(b){ var c=coste(b); return c>0 ? plusvalia(b)/c : null; }

function anios(b){
  if(!b.fecha) return 0;
  var t=Date.parse(b.fecha+"T00:00:00");
  if(isNaN(t)) return 0;
  return (Date.now()-t)/(1000*60*60*24*365.25);
}
/* Lo que ha rentado al año, compuesto. Con menos de medio año la cifra
   sale disparatada, así que no se enseña. */
function cagr(b){
  var a=anios(b), c=coste(b), v=valorHoy(b);
  if(a<0.5 || c<=0 || v<=0) return null;
  return Math.pow(v/c, 1/a)-1;
}

function rentaAnual(b){ return r2((+b.renta||0)*12); }
function gastoAnual(b){ return r2(b.gastoAnual); }
function cuotaAnual(b){ return r2(((b.hipoteca||{}).cuota||0)*12); }
/* La rentabilidad del alquiler se mide contra lo que costó. Medirla
   contra lo que vale hoy hace que un piso que sube parezca rentar menos
   cada año, y eso no es lo que pasa en tu bolsillo. */
function rentaBruta(b){ var c=coste(b); return c>0 && rentaAnual(b)>0 ? rentaAnual(b)/c : null; }
function rentaNeta(b){ var c=coste(b); return c>0 && rentaAnual(b)>0 ? (rentaAnual(b)-gastoAnual(b))/c : null; }
/* Lo que entra o sale del bolsillo cada mes, con la hipoteca puesta. */
function flujoMes(b){ return r2((+b.renta||0) - gastoAnual(b)/12 - ((b.hipoteca||{}).cuota||0)); }

function totales(){
  var t={coste:0, valor:0, deuda:0, neto:0, plus:0, renta:0, gastos:0, cuotas:0, flujo:0,
         ladrillo:0, financiero:0};
  todos().forEach(function(b){
    t.coste  = r2(t.coste  + coste(b));
    t.valor  = r2(t.valor  + valorHoy(b));
    t.deuda  = r2(t.deuda  + deuda(b));
    t.renta  = r2(t.renta  + rentaAnual(b));
    t.gastos = r2(t.gastos + gastoAnual(b));
    t.cuotas = r2(t.cuotas + cuotaAnual(b));
    t.flujo  = r2(t.flujo  + flujoMes(b));
    if(esLadrillo(b)) t.ladrillo=r2(t.ladrillo+neto(b));
    else              t.financiero=r2(t.financiero+neto(b));
  });
  t.neto = r2(t.valor - t.deuda);
  t.plus = r2(t.valor - t.coste);
  t.plusPct = t.coste>0 ? t.plus/t.coste : null;
  return t;
}

/* Todas las fechas en las que sabemos algo, para la línea de evolución. */
function lineaDelTiempo(){
  var fechas={};
  todos().forEach(function(b){
    if(b.fecha) fechas[b.fecha]=1;
    (b.valores||[]).forEach(function(v){ if(v.f) fechas[v.f]=1; });
  });
  var lista=Object.keys(fechas).sort();
  if(!lista.length) return [];
  var hoy=hoyISO();
  if(lista[lista.length-1]!==hoy) lista.push(hoy);
  return lista.map(function(f){
    var total=0;
    todos().forEach(function(b){ total=r2(total+valorEn(b,f)); });
    return {f:f, v:total};
  });
}

/* ══════════════════════════════════════════════════════════════
   GRÁFICOS
   ══════════════════════════════════════════════════════════════
   Dibujados a mano, sin librerías: son tres formas sencillas y así la
   app sigue abriendo sin pedirle nada a internet.

   Los colores salen de la paleta del sistema, en su orden fijo. En
   claro tres de los seis tonos no llegan a 3:1 contra el papel, así que
   ningún dato se queda sólo en el color: todos los tramos llevan su
   cifra escrita al lado y además está la tabla completa debajo.
   ══════════════════════════════════════════════════════════════ */

/* Reparto: una sola barra apilada. Para el «cuánto de cada uno» se lee
   mucho mejor que un quesito, sobre todo cuando dos trozos se parecen. */
function graficoReparto(items){
  var total=items.reduce(function(s,i){ return s+i.valor; }, 0);
  if(total<=0) return '';
  var tramos=items.map(function(i){
    return '<div class="tramo" style="flex:'+i.valor+' 0 0;background:'+i.color+'" '+
           'title="'+esc(i.nombre)+': '+eur(i.valor)+'"></div>';
  }).join("");
  var leyenda=items.map(function(i){
    return '<div class="fila"><span class="punto" style="background:'+i.color+'"></span>'+
           '<span class="nom">'+esc(i.nombre)+'</span>'+
           '<span class="cif">'+eur(i.valor)+'</span>'+
           '<span class="pct">'+pct(i.valor/total,0)+'</span></div>';
  }).join("");
  return '<div class="apilada">'+tramos+'</div><div class="leyenda">'+leyenda+'</div>';
}

/* Lo que costó contra lo que vale hoy, bien a bien. Las dos barras
   comparten escala —la del bien más caro— para que se puedan comparar
   entre filas y no sólo dentro de cada una. La gris es el coste y la de
   color el valor de hoy: gris lo de antes, color lo de ahora. */
function graficoBarras(bienes){
  var tope=0;
  bienes.forEach(function(b){ tope=Math.max(tope, coste(b), valorHoy(b)); });
  if(tope<=0) return '';
  function ancho(v){ return Math.max(0.4, (v/tope)*100); }

  var filas=bienes.map(function(b){
    var c=coste(b), v=valorHoy(b), col=colorDe(b);
    return '<div class="grupo-b">'+
      '<div class="et">'+esc(b.nombre)+'<small>'+esc((TIPOS[b.tipo]||{}).nombre||"")+'</small></div>'+
      '<div class="pista">'+
        '<div class="par"><div class="barra ref" style="width:'+ancho(c)+'%"></div>'+
          '<span class="val">'+eur(c)+'</span></div>'+
        '<div class="par"><div class="barra" style="width:'+ancho(v)+'%;background:'+col+'"></div>'+
          '<span class="val">'+eur(v)+'</span></div>'+
      '</div></div>';
  }).join("");

  return '<div class="barras">'+filas+'</div>'+
    '<div class="ejes">'+
      '<div class="fila"><span class="muestra" style="background:var(--barra-ref)">'+
        '</span>Lo que me costó</div>'+
      '<div class="fila"><span class="muestra" style="background:'+
        (bienes.length?colorDe(bienes[0]):"var(--acento)")+'"></span>'+
        'Lo que vale hoy, con el color de cada bien</div>'+
    '</div>';
}

/* La línea del valor total. Una sola serie: la deuda de la hipoteca no
   tiene histórico apuntado, así que dibujar el neto de años atrás sería
   inventárselo. */
/* El dibujo se estira hasta el ancho de su caja, así que el lienzo se
   hace del tamaño que va a ocupar de verdad: si no, la letra sale
   encogida en el móvil e hinchada en el escritorio. El ancho lo mide
   quien llama, que para entonces la caja ya está puesta. */
function graficoLinea(puntos, W){
  if(puntos.length<2) return '';
  var estrecho = W < 460;
  var H = estrecho?205:230;
  var ML = estrecho?54:66, MR=14, MT=16, MB=28;
  var ax=W-ML-MR, ay=H-MT-MB;

  var t0=Date.parse(puntos[0].f+"T00:00:00");
  var t1=Date.parse(puntos[puntos.length-1].f+"T00:00:00");
  var span=Math.max(1, t1-t0);
  var tope=0;
  puntos.forEach(function(p){ tope=Math.max(tope,p.v); });
  if(tope<=0) return '';
  tope=escalaBonita(tope);

  function X(p){ return ML + ((Date.parse(p.f+"T00:00:00")-t0)/span)*ax; }
  function Y(v){ return MT + ay - (v/tope)*ay; }

  /* Cuatro escalones siempre: con tres, el tope se parte en tercios y
     las etiquetas salen con cifras que no dicen nada. */
  var rejilla="", n=4;
  for(var i=0;i<=n;i++){
    var v=tope*i/n, y=Y(v);
    rejilla+='<line x1="'+ML+'" y1="'+y.toFixed(1)+'" x2="'+(W-MR)+'" y2="'+y.toFixed(1)+'" '+
             'stroke="var(--linea)" stroke-width="1"/>'+
             '<text x="'+(ML-9)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="11" '+
             'fill="var(--muted)" font-family="var(--mono)">'+num(v)+'</text>';
  }

  var d=puntos.map(function(p,i){ return (i?"L":"M")+X(p).toFixed(1)+" "+Y(p.v).toFixed(1); }).join(" ");
  var area=d+" L"+X(puntos[puntos.length-1]).toFixed(1)+" "+Y(0).toFixed(1)+
           " L"+X(puntos[0]).toFixed(1)+" "+Y(0).toFixed(1)+" Z";

  var marcas=puntos.map(function(p,i){
    return '<circle cx="'+X(p).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="4.5" '+
           'fill="var(--acento)" stroke="var(--sup)" stroke-width="2"/>';
  }).join("");

  /* Zonas de escucha anchas: el ratón no tiene que acertar el punto. */
  var zonas=puntos.map(function(p,i){
    var x=X(p), izq=i? (x+X(puntos[i-1]))/2 : ML;
    var der=i<puntos.length-1 ? (x+X(puntos[i+1]))/2 : W-MR;
    return '<rect x="'+izq.toFixed(1)+'" y="'+MT+'" width="'+Math.max(1,der-izq).toFixed(1)+'" '+
           'height="'+ay+'" fill="transparent" data-i="'+i+'" '+
           'data-x="'+x.toFixed(1)+'" data-y="'+Y(p.v).toFixed(1)+'"/>';
  }).join("");

  var primeraX=X(puntos[0]), ultimaX=X(puntos[puntos.length-1]);
  var ejeX='<text x="'+primeraX.toFixed(1)+'" y="'+(H-8)+'" font-size="11" fill="var(--muted)" '+
           'font-family="var(--mono)">'+mesLargo(puntos[0].f)+'</text>'+
           '<text x="'+ultimaX.toFixed(1)+'" y="'+(H-8)+'" text-anchor="end" font-size="11" '+
           'fill="var(--muted)" font-family="var(--mono)">'+mesLargo(puntos[puntos.length-1].f)+'</text>';

  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" '+
      'aria-label="Evolución del valor de los bienes">'+
      rejilla+
      '<path d="'+area+'" fill="var(--acento)" opacity=".10"/>'+
      '<path d="'+d+'" fill="none" stroke="var(--acento)" stroke-width="2" '+
        'stroke-linejoin="round" stroke-linecap="round"/>'+
      marcas+ejeX+zonas+
    '</svg>';
}

/* Un tope redondo para que las etiquetas del eje no salgan con decimales
   raros: 137.400 sube a 150.000. */
function escalaBonita(v){
  var exp=Math.pow(10, Math.floor(Math.log10(v)));
  var paso=exp/2;
  return Math.ceil(v/paso)*paso;
}

/* Dibuja la línea dentro de su caja, ya medida, y vuelve a dibujarla si
   la caja cambia de ancho: al girar el móvil, al plegarse el carril o al
   arrastrar la ventana. */
function dibujarLinea(puntos){
  var caja=document.getElementById("lienzoLinea");
  if(!caja) return;
  var ancho=Math.round(caja.clientWidth) || 720;
  caja.dataset.w=ancho;
  caja.innerHTML=graficoLinea(puntos, ancho);
  engancharLinea(puntos);

  if(!caja._vigilada && window.ResizeObserver){
    caja._vigilada=true;
    var ultimo=ancho;
    new ResizeObserver(function(){
      var c=document.getElementById("lienzoLinea");
      if(!c || Math.abs(c.clientWidth-ultimo)<20) return;
      ultimo=Math.round(c.clientWidth);
      c.dataset.w=ultimo;
      c.innerHTML=graficoLinea(puntos, ultimo);
      engancharLinea(puntos);
    }).observe(caja);
  }
}

function engancharLinea(puntos){
  var caja=document.getElementById("lienzoLinea");
  if(!caja) return;
  var svg=caja.querySelector("svg");
  if(!svg) return;
  var globo=null;
  function quitar(){ if(globo){ globo.remove(); globo=null; } }

  caja.querySelectorAll("rect[data-i]").forEach(function(z){
    z.addEventListener("mouseenter", function(){
      var p=puntos[+z.dataset.i];
      quitar();
      globo=document.createElement("div");
      globo.className="globo";
      globo.innerHTML='<div class="g-f">'+esc(fechaCorta(p.f))+'</div>'+
                      '<div class="g-v">'+eur(p.v)+'</div>';
      /* El SVG se estira al ancho de la caja: paso de coordenadas del
         dibujo a píxeles con la proporción que haya en ese momento. */
      var k=caja.clientWidth/(+caja.dataset.w||720);
      globo.style.left=(+z.dataset.x*k)+"px";
      globo.style.top=(+z.dataset.y*k)+"px";
      caja.appendChild(globo);
    });
  });
  svg.addEventListener("mouseleave", quitar);
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Patrimonio</span>'+
        '<span class="sub">Lo que tengo</span></div>'+
      boton("resumen",  "Resumen",   null)+
      boton("bienes",   "Bienes",    todos().length)+
      boton("evolucion","Evolución", null)+
      boton("ajustes",  "Ajustes",   null)+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)" id="estadoSync">Guardado en GitHub</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll("[data-vista]").forEach(function(b){
    b.addEventListener("click", function(){ ui.vista=b.dataset.vista; pintar(); });
  });

  if(ui.vista==="bienes")         pintarBienes();
  else if(ui.vista==="evolucion") pintarEvolucion();
  else if(ui.vista==="ajustes")   pintarAjustes();
  else                            pintarResumen();

  if(window.Sync && Sync.mostrarEstadoEn)
    Sync.mostrarEstadoEn(document.getElementById("estadoSync"));
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

function nadaTodavia(main){
  main.innerHTML=
    cabecera("Patrimonio","Aquí no hay nada todavía.")+
    '<div class="vacio"><strong>Empieza por un bien</strong>'+
    'Un piso, un parking, lo que tengas en el broker o en la cuenta. '+
    'De cada uno hacen falta dos cifras: lo que te costó y lo que vale hoy.'+
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px">'+
      '<button class="btn fuerte" data-nuevo="piso">🏠 Un piso</button>'+
      '<button class="btn" data-nuevo="parking">🚗 Un parking</button>'+
      '<button class="btn" data-nuevo="inversion">📈 Inversión</button>'+
      '<button class="btn" data-nuevo="ahorro">🏦 Ahorro</button>'+
    '</div></div>';
  main.querySelectorAll("[data-nuevo]").forEach(function(b){
    b.addEventListener("click", function(){ formulario(null, b.dataset.nuevo); });
  });
}

/* ══════════════════════════════════════════════════════════════
   RESUMEN
   ══════════════════════════════════════════════════════════════ */
function pintarResumen(){
  var main=document.getElementById("main");
  if(!todos().length) return nadaTodavia(main);

  var t=totales();
  var conRenta=todos().filter(function(b){ return rentaAnual(b)>0; });

  /* El reparto se hace sobre el neto: un piso hipotecado hasta las cejas
     no pesa en tu patrimonio lo que vale, sino lo que es tuyo de él. */
  var reparto=todos().slice(0,SERIES.length).map(function(b){
      return {nombre:b.nombre, valor:Math.max(0,neto(b)), color:colorDe(b)};
    }).filter(function(i){ return i.valor>0; })
      .sort(function(a,b){ return b.valor-a.valor; });

  /* Del séptimo bien en adelante ya no queda color que los distinga, así
     que van juntos al final en un solo tramo gris. */
  var sobran=todos().slice(SERIES.length);
  var restos=sobran.reduce(function(x,b){ return x+Math.max(0,neto(b)); }, 0);
  if(restos>0) reparto.push({nombre:"Otros ("+sobran.length+")", valor:restos, color:GRIS});

  main.innerHTML=
    cabecera("Resumen","Lo que tienes hoy, lo que te costó y lo que debes por ello.",
      '<button class="btn fuerte" id="b_nuevo">Añadir bien</button>')+

    '<div class="cifras">'+
      cifra("Patrimonio neto", eur(t.neto), "Lo que vale menos lo que debes", "acento")+
      cifra("Vale hoy", eur(t.valor), todos().length+(todos().length===1?" bien":" bienes"))+
      cifra("Me costó", eur(t.coste), "compra, gastos y reformas")+
      cifra("Debo", t.deuda?eur(t.deuda):"nada", t.deuda?"de hipoteca":"sin hipotecas",
            t.deuda?"malo":"")+
      cifra("Plusvalía", eurFirma(t.plus),
            t.plusPct==null?"—":pctFirma(t.plusPct)+" sobre lo que costó",
            t.plus>0?"ok":t.plus<0?"malo":"")+
    '</div>'+

    (conRenta.length?
      '<div class="cifras">'+
        cifra("Alquiler al año", eur(t.renta), conRenta.length+
              (conRenta.length===1?" bien alquilado":" bienes alquilados"))+
        cifra("Gastos al año", eur(t.gastos), "comunidad, seguros, impuestos")+
        cifra("Hipoteca al año", t.cuotas?eur(t.cuotas):"—", "lo que pagas de cuotas")+
        cifra("Al mes en el bolsillo", eurFirma(t.flujo), "alquiler menos gastos y cuota",
              t.flujo>0?"ok":t.flujo<0?"malo":"")+
      '</div>' : '')+

    (reparto.length>1?
      '<div class="tarjeta"><div class="tarjeta-cab"><h2>De dónde sale el patrimonio</h2>'+
        '<span class="pista">Sobre el neto de cada bien</span></div>'+
        '<div class="tarjeta-cuerpo">'+graficoReparto(reparto)+'</div></div>' : '')+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Lo que costó y lo que vale</h2>'+
      '<span class="pista">Misma escala en todas las filas</span></div>'+
      '<div class="tarjeta-cuerpo">'+graficoBarras(todos())+'</div></div>'+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Bien a bien</h2>'+
      '<span class="pista">Pulsa una fila para ver su ficha</span></div>'+
      '<div class="tabla-caja">'+tablaResumen()+'</div></div>';

  document.getElementById("b_nuevo").addEventListener("click", function(){ formulario(null); });
  main.querySelectorAll("tr[data-id]").forEach(function(f){
    f.style.cursor="pointer";
    f.addEventListener("click", function(){ ficha(f.dataset.id); });
  });
}

function cifra(k, v, n, clase){
  return '<div class="cifra"><div class="k">'+esc(k)+'</div>'+
         '<div class="v '+(clase||"")+'">'+esc(v)+'</div>'+
         (n?'<div class="n">'+esc(n)+'</div>':'')+'</div>';
}

function tablaResumen(){
  var t=totales();
  var filas=todos().map(function(b){
    var p=plusvalia(b), pp=plusPct(b);
    return '<tr data-id="'+esc(b.id)+'">'+
      '<td><span class="punto-t" style="background:'+colorDe(b)+'"></span>'+
        '<strong>'+esc(b.nombre)+'</strong>'+
        (b.lugar?'<div style="font-size:12px;color:var(--muted);padding-left:16px">'+
          esc(b.lugar)+'</div>':'')+'</td>'+
      '<td class="num">'+eur(coste(b))+'</td>'+
      '<td class="num">'+eur(valorHoy(b))+'</td>'+
      '<td class="num '+(p>0?"sube":p<0?"baja":"")+'">'+eurFirma(p)+'</td>'+
      '<td class="num mono '+(p>0?"sube":p<0?"baja":"")+'">'+(pp==null?"—":pctFirma(pp))+'</td>'+
      '<td class="num">'+(deuda(b)?eur(deuda(b)):"—")+'</td>'+
      '<td class="num"><strong>'+eur(neto(b))+'</strong></td>'+
    '</tr>';
  }).join("");

  return '<table><thead><tr><th>Bien</th><th class="num">Me costó</th>'+
    '<th class="num">Vale hoy</th><th class="num">Plusvalía</th><th class="num">%</th>'+
    '<th class="num">Debo</th><th class="num">Neto</th></tr></thead>'+
    '<tbody>'+filas+'</tbody>'+
    '<tfoot><tr><td>Todo junto</td>'+
      '<td class="num">'+eur(t.coste)+'</td>'+
      '<td class="num">'+eur(t.valor)+'</td>'+
      '<td class="num '+(t.plus>0?"sube":t.plus<0?"baja":"")+'">'+eurFirma(t.plus)+'</td>'+
      '<td class="num mono">'+(t.plusPct==null?"—":pctFirma(t.plusPct))+'</td>'+
      '<td class="num">'+(t.deuda?eur(t.deuda):"—")+'</td>'+
      '<td class="num">'+eur(t.neto)+'</td></tr></tfoot></table>';
}

/* ══════════════════════════════════════════════════════════════
   BIENES
   ══════════════════════════════════════════════════════════════ */
function pintarBienes(){
  var main=document.getElementById("main");
  if(!todos().length) return nadaTodavia(main);

  var tarjetas=todos().map(function(b){
    var p=plusvalia(b), pp=plusPct(b), d=deuda(b);
    return '<button class="bien" data-id="'+esc(b.id)+'">'+
      '<div class="tira-color" style="background:'+colorDe(b)+'"></div>'+
      '<div class="cuerpo">'+
        '<div class="nom">'+esc(b.nombre)+'</div>'+
        '<div class="sitio">'+esc((TIPOS[b.tipo]||{}).icono||"")+' '+
          esc((TIPOS[b.tipo]||{}).nombre||"")+(b.lugar?' · '+esc(b.lugar):'')+'</div>'+
        '<div class="valor">'+eur(valorHoy(b))+'</div>'+
        '<div class="bajo">costó '+eur(coste(b))+
          (fechaValor(b)?' · valorado el '+esc(fechaCorta(fechaValor(b))):'')+'</div>'+
        '<div class="pie">'+
          (p!==0?'<span class="chapa '+(p>0?"ok":"malo")+'">'+eurFirma(p)+
            (pp==null?'':' · '+pctFirma(pp))+'</span>':
            '<span class="chapa neutra">sin valorar</span>')+
          (d?'<span class="chapa aviso">debo '+eur(d)+'</span>':'')+
          (rentaAnual(b)>0?'<span class="chapa acento">'+eur(b.renta)+'/mes</span>':'')+
        '</div>'+
      '</div></button>';
  }).join("");

  main.innerHTML=
    cabecera("Bienes","Cada ficha guarda lo que costó, lo que vale y lo que debes por ella.",
      '<button class="btn fuerte" id="b_nuevo">Añadir bien</button>')+
    '<div class="bienes">'+tarjetas+'</div>';

  document.getElementById("b_nuevo").addEventListener("click", function(){ formulario(null); });
  main.querySelectorAll("[data-id]").forEach(function(c){
    c.addEventListener("click", function(){ ficha(c.dataset.id); });
  });
}

/* ══════════════════════════════════════════════════════════════
   LA FICHA DE UN BIEN
   ══════════════════════════════════════════════════════════════ */
function renglon(k, v, clase){
  return '<div style="display:flex;justify-content:space-between;gap:14px;padding:5px 0;'+
    'font-size:13.5px;border-bottom:1px solid var(--linea-suave)">'+
    '<span style="color:var(--muted)">'+esc(k)+'</span>'+
    '<span class="num '+(clase||"")+'" style="font-weight:600">'+v+'</span></div>';
}

function ficha(id){
  var b=porId(id); if(!b) return;
  var tipo=TIPOS[b.tipo]||TIPOS.otro;
  var p=plusvalia(b), pp=plusPct(b), g=cagr(b), d=deuda(b);
  var vs=valoresOrdenados(b).slice(-6).reverse();

  var cuerpo=
    '<div class="bloque"><h4>Lo que me costó</h4>'+
      renglon(esLadrillo(b)?"Precio de compra":"Lo que llevo metido", eur(b.compra))+
      (esLadrillo(b)?renglon("Gastos de la compra", eur(b.gastos)):"")+
      (esLadrillo(b)?renglon("Reformas y mejoras", eur(b.mejoras)):"")+
      renglon("Total", eur(coste(b)))+
      (b.fecha?renglon("Comprado el", fechaCorta(b.fecha)):"")+
      (anios(b)>=1?renglon("Lo llevo teniendo", num(anios(b),1)+" años"):"")+
    '</div>'+

    '<div class="bloque"><h4>Lo que vale</h4>'+
      renglon("Valor de hoy", eur(valorHoy(b)))+
      renglon("Valorado el", fechaCorta(fechaValor(b)))+
      renglon("Plusvalía", eurFirma(p), p>0?"sube":p<0?"baja":"")+
      renglon("Sobre lo que costó", pp==null?"—":pctFirma(pp), p>0?"sube":p<0?"baja":"")+
      (g==null?"":renglon("Al año, compuesto", pctFirma(g), g>0?"sube":"baja"))+
    '</div>'+

    (d||((b.hipoteca||{}).cuota)?
    '<div class="bloque"><h4>La hipoteca</h4>'+
      renglon("Me queda por pagar", eur(d), "baja")+
      renglon("Cuota al mes", eur((b.hipoteca||{}).cuota))+
      ((b.hipoteca||{}).interes?renglon("Interés", num(b.hipoteca.interes,2)+" %"):"")+
      renglon("Es mío de este bien", eur(neto(b)))+
      (valorHoy(b)>0?renglon("Tuyo, sobre lo que vale",
        pct(Math.max(0,neto(b))/valorHoy(b),0)):"")+
    '</div>':'')+

    (rentaAnual(b)>0?
    '<div class="bloque"><h4>El alquiler</h4>'+
      renglon("Cobro al mes", eur(b.renta))+
      renglon("Al año", eur(rentaAnual(b)))+
      renglon("Gastos al año", eur(gastoAnual(b)))+
      renglon("Rentabilidad bruta", rentaBruta(b)==null?"—":pct(rentaBruta(b),2))+
      renglon("Rentabilidad neta", rentaNeta(b)==null?"—":pct(rentaNeta(b),2))+
      renglon("Me queda al mes", eurFirma(flujoMes(b)),
              flujoMes(b)>0?"sube":flujoMes(b)<0?"baja":"")+
    '</div>':'')+

    (vs.length?
    '<div class="bloque"><h4>Últimas valoraciones</h4>'+
      vs.map(function(v){ return renglon(fechaCorta(v.f), eur(v.v)); }).join("")+
    '</div>':'')+

    (b.notas?'<div class="bloque"><h4>Notas</h4>'+
      '<p style="margin:0;font-size:13.5px;white-space:pre-wrap">'+esc(b.notas)+'</p></div>':'');

  var d2=abrirVentana(tipo.icono+" "+b.nombre, cuerpo, function(){
    setTimeout(function(){ formulario(b); }, 0);
  }, {aceptar:"Editar",
      extra:'<button class="btn malo" data-borrar>Borrar</button>'+
            '<button class="btn" data-valor>Apuntar valor</button>'});

  d2.querySelector("[data-borrar]").addEventListener("click", function(){
    d2.close(); d2.remove();
    setTimeout(function(){ borrarBien(b); }, 0);
  });
  d2.querySelector("[data-valor]").addEventListener("click", function(){
    d2.close(); d2.remove();
    setTimeout(function(){ ventanaValor(b); }, 0);
  });
}

function borrarBien(b){
  confirmar("Borrar "+b.nombre,
    '<p style="margin:0">Se va la ficha entera, con sus valoraciones y sus notas. '+
    'No hay forma de recuperarla desde aquí.</p>',
    function(){
      libro.bienes=todos().filter(function(x){ return x.id!==b.id; });
      guardar(); pintar(); avisar(b.nombre+" borrado");
    }, {aceptar:"Borrar", malo:true});
}

/* ══════════════════════════════════════════════════════════════
   AÑADIR Y EDITAR
   ══════════════════════════════════════════════════════════════ */
function campo(id, etiqueta, tipo, val, extra){
  return '<div class="campo"><label class="lbl" for="'+id+'" id="lb_'+id+'">'+esc(etiqueta)+'</label>'+
    '<input id="'+id+'" type="'+tipo+'"'+(extra||"")+' value="'+
    (val==null||val===""?"":esc(String(val)))+'"></div>';
}

function formulario(bien, tipoNuevo){
  var esNuevo=!bien;
  var b=bien||{tipo:tipoNuevo||"piso", valores:[], hipoteca:{}};
  var h=b.hipoteca||{};
  var opciones=ORDEN_TIPOS.map(function(k){
    return '<option value="'+k+'"'+(b.tipo===k?' selected':'')+'>'+
           TIPOS[k].icono+' '+esc(TIPOS[k].nombre)+'</option>';
  }).join("");

  var cuerpo=
    '<div class="bloque"><h4>Qué es</h4><div class="rejilla">'+
      campo("f_nombre","Nombre","text",b.nombre,' placeholder="Piso de Soldeu"')+
      '<div class="campo"><label class="lbl" for="f_tipo">Tipo</label>'+
        '<select id="f_tipo">'+opciones+'</select></div>'+
      campo("f_lugar","Dónde está","text",b.lugar,' placeholder="Andorra la Vella"')+
      campo("f_fecha","Cuándo lo compré","date",b.fecha)+
    '</div></div>'+

    '<div class="bloque"><h4>Lo que me costó</h4><div class="rejilla">'+
      campo("f_compra","Precio de compra (€)","number",b.compra,' step="1" min="0"')+
      campo("f_gastos","Gastos de la compra (€)","number",b.gastos,' step="1" min="0"')+
      campo("f_mejoras","Reformas y mejoras (€)","number",b.mejoras,' step="1" min="0"')+
    '</div><p class="nota" style="margin:10px 0 0" id="n_coste">Los gastos son el notario, '+
      'el registro y los impuestos de la compra. Van aparte del precio porque los pagaste '+
      'igual, y cuentan para la rentabilidad.</p></div>'+

    '<div class="bloque"><h4>Lo que vale hoy</h4><div class="rejilla">'+
      campo("f_valor","Valor de hoy (€)","number", bien?valorHoy(b):"",' step="1" min="0"')+
    '</div><p class="nota" style="margin:10px 0 0">Si lo cambias, queda apuntado con la fecha '+
      'de hoy y la línea de evolución se mueve. Déjalo como está y no se apunta nada.</p></div>'+

    '<div class="bloque solo-ladrillo"><h4>La hipoteca</h4><div class="rejilla">'+
      campo("f_hip","Me queda por pagar (€)","number",h.pendiente,' step="1" min="0"')+
      campo("f_cuota","Cuota al mes (€)","number",h.cuota,' step="1" min="0"')+
      campo("f_interes","Interés (%)","number",h.interes,' step="0.01" min="0"')+
    '</div></div>'+

    '<div class="bloque solo-ladrillo"><h4>Si está alquilado</h4><div class="rejilla">'+
      campo("f_renta","Alquiler al mes (€)","number",b.renta,' step="1" min="0"')+
      campo("f_gasto","Gastos al año (€)","number",b.gastoAnual,' step="1" min="0"')+
    '</div><p class="nota" style="margin:10px 0 0">Los gastos del año son la comunidad, el '+
      'seguro y los impuestos: lo que pagas por tenerlo, sin contar la hipoteca.</p></div>'+

    '<div class="bloque"><h4>Notas</h4>'+
      '<textarea id="f_notas" placeholder="Lo que quieras recordar">'+
      esc(b.notas||"")+'</textarea></div>';

  abrirVentana(esNuevo?"Nuevo bien":"Editar "+(b.nombre||""), cuerpo, function(){
    var nombre=valor("f_nombre");
    if(!nombre){ avisar("Ponle un nombre.", true); return true; }

    var destino=bien;
    if(esNuevo){
      destino={id:uid(), valores:[], hipoteca:{}};
      libro.bienes.push(destino);
    }
    destino.nombre = nombre;
    destino.tipo   = valor("f_tipo") || "otro";
    destino.lugar  = valor("f_lugar");
    destino.fecha  = valor("f_fecha");
    destino.compra = numero("f_compra");
    destino.notas  = (document.getElementById("f_notas")||{}).value || "";

    var ladrillo=(TIPOS[destino.tipo]||{}).ladrillo;
    destino.gastos     = ladrillo?numero("f_gastos"):0;
    destino.mejoras    = ladrillo?numero("f_mejoras"):0;
    destino.renta      = ladrillo?numero("f_renta"):0;
    destino.gastoAnual = ladrillo?numero("f_gasto"):0;
    destino.hipoteca   = ladrillo
      ? {pendiente:numero("f_hip"), cuota:numero("f_cuota"), interes:numero("f_interes")}
      : {};

    /* El valor sólo se apunta si de verdad ha cambiado: así no se llena
       la evolución de puntos repetidos cada vez que abres la ficha. */
    if(valor("f_valor")!==""){
      var v=numero("f_valor");
      if(v!==valorHoy(destino) || !(destino.valores||[]).length) apuntarValor(destino, v);
    }

    guardar(); pintar();
    avisar(esNuevo?nombre+" añadido":"Guardado");
  }, {aceptar:esNuevo?"Añadir":"Guardar"});

  function ajustar(){
    var t=document.getElementById("f_tipo").value;
    var ladrillo=!!(TIPOS[t]||{}).ladrillo;
    document.querySelectorAll(".solo-ladrillo").forEach(function(x){
      x.style.display = ladrillo ? "" : "none";
    });
    document.getElementById("lb_f_compra").textContent =
      ladrillo ? "Precio de compra (€)" : "Lo que llevo metido (€)";
    document.getElementById("lb_f_fecha").textContent =
      ladrillo ? "Cuándo lo compré" : "Desde cuándo";
    ["f_gastos","f_mejoras"].forEach(function(id){
      document.getElementById(id).closest(".campo").style.display = ladrillo?"":"none";
    });
    document.getElementById("n_coste").style.display = ladrillo?"":"none";
  }
  document.getElementById("f_tipo").addEventListener("change", ajustar);
  ajustar();
}

function apuntarValor(b, v, f){
  f = f || hoyISO();
  if(!b.valores) b.valores=[];
  var ya=b.valores.filter(function(x){ return x.f===f; })[0];
  if(ya) ya.v=r2(v); else b.valores.push({f:f, v:r2(v)});
}

function ventanaValor(b){
  abrirVentana("Apuntar valor · "+b.nombre,
    '<p class="nota">Cuánto vale a día de hoy, o en la fecha que quieras. Si ya hay un '+
    'valor apuntado ese mismo día, se sustituye.</p><div class="rejilla">'+
      campo("v_fecha","Fecha","date",hoyISO())+
      campo("v_valor","Valor (€)","number",valorHoy(b),' step="1" min="0"')+
    '</div>',
    function(){
      var f=valor("v_fecha");
      if(!f){ avisar("Pon una fecha.", true); return true; }
      apuntarValor(b, numero("v_valor"), f);
      guardar(); pintar(); avisar("Valor apuntado");
    }, {aceptar:"Apuntar"});
}

/* ══════════════════════════════════════════════════════════════
   EVOLUCIÓN
   ══════════════════════════════════════════════════════════════ */
function pintarEvolucion(){
  var main=document.getElementById("main");
  if(!todos().length) return nadaTodavia(main);

  var puntos=lineaDelTiempo();
  var apuntes=[];
  todos().forEach(function(b){
    valoresOrdenados(b).forEach(function(v){ apuntes.push({b:b, f:v.f, v:v.v}); });
  });
  apuntes.sort(function(a,c){ return String(c.f).localeCompare(String(a.f)); });

  var hayLinea = puntos.length>=2 &&
                 puntos.some(function(p,i){ return i && p.v!==puntos[0].v; });

  var grafico = hayLinea ? '<div class="lienzo" id="lienzoLinea"></div>' :
    '<div class="vacio"><strong>Todavía no hay línea que dibujar</strong>'+
    'Apunta lo que vale un bien en dos fechas distintas y aquí verás cómo se ha movido.</div>';

  var filas=apuntes.map(function(a){
    return '<tr><td><span class="punto-t" style="background:'+colorDe(a.b)+'"></span>'+
      esc(a.b.nombre)+'</td>'+
      '<td class="mono">'+esc(fechaCorta(a.f))+'</td>'+
      '<td class="num">'+eur(a.v)+'</td>'+
      '<td class="num"><button class="btn suave sm" data-quitar="'+esc(a.b.id)+'" '+
        'data-f="'+esc(a.f)+'" title="Quitar este apunte">✕</button></td></tr>';
  }).join("");

  /* De cuánto a cuánto ha ido cada bien desde el primer apunte. */
  var recorrido=todos().map(function(b){
    var v=valoresOrdenados(b);
    if(v.length<2) return "";
    var a=v[0], z=v[v.length-1], dif=r2(z.v-a.v);
    return '<tr><td><span class="punto-t" style="background:'+colorDe(b)+'"></span>'+
      esc(b.nombre)+'</td>'+
      '<td class="mono">'+esc(fechaCorta(a.f))+'</td>'+
      '<td class="num">'+eur(a.v)+'</td>'+
      '<td class="num">'+eur(z.v)+'</td>'+
      '<td class="num '+(dif>0?"sube":dif<0?"baja":"")+'">'+eurFirma(dif)+'</td>'+
      '<td class="num mono '+(dif>0?"sube":dif<0?"baja":"")+'">'+
        (a.v>0?pctFirma(dif/a.v):"—")+'</td></tr>';
  }).filter(Boolean).join("");

  main.innerHTML=
    cabecera("Evolución","Lo que vale el conjunto, según las valoraciones que has ido apuntando.",
      '<button class="btn fuerte" id="b_valor">Apuntar valor</button>')+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Valor de los bienes</h2>'+
      '<span class="pista">Sin descontar la hipoteca</span></div>'+
      '<div class="tarjeta-cuerpo">'+grafico+'</div></div>'+

    (recorrido?
    '<div class="tarjeta"><div class="tarjeta-cab"><h2>De cuánto a cuánto</h2>'+
      '<span class="pista">Desde el primer apunte de cada bien</span></div>'+
      '<div class="tabla-caja"><table><thead><tr><th>Bien</th><th>Desde</th>'+
        '<th class="num">Valía</th><th class="num">Vale</th><th class="num">Diferencia</th>'+
        '<th class="num">%</th></tr></thead><tbody>'+recorrido+'</tbody></table></div></div>':'')+

    '<div class="tarjeta"><div class="tarjeta-cab"><h2>Todos los apuntes</h2>'+
      '<span class="pista">'+apuntes.length+(apuntes.length===1?" valoración":" valoraciones")+
      '</span></div>'+
      (apuntes.length?'<div class="tabla-caja"><table><thead><tr><th>Bien</th><th>Fecha</th>'+
        '<th class="num">Valor</th><th></th></tr></thead><tbody>'+filas+'</tbody></table></div>':
        '<div class="tarjeta-cuerpo"><p class="nota" style="margin:0">Ninguna todavía. '+
        'Mientras no apuntes nada, cada bien vale lo que te costó.</p></div>')+
    '</div>';

  if(hayLinea) dibujarLinea(puntos);

  document.getElementById("b_valor").addEventListener("click", elegirBienYValor);
  main.querySelectorAll("[data-quitar]").forEach(function(x){
    x.addEventListener("click", function(){
      var b=porId(x.dataset.quitar); if(!b) return;
      b.valores=(b.valores||[]).filter(function(v){ return v.f!==x.dataset.f; });
      guardar(); pintar(); avisar("Apunte quitado");
    });
  });
}

function elegirBienYValor(){
  var opciones=todos().map(function(b){
    return '<option value="'+esc(b.id)+'">'+esc(b.nombre)+'</option>';
  }).join("");
  abrirVentana("Apuntar valor",
    '<div class="rejilla">'+
      '<div class="campo"><label class="lbl" for="e_bien">Bien</label>'+
        '<select id="e_bien">'+opciones+'</select></div>'+
      campo("e_fecha","Fecha","date",hoyISO())+
      campo("e_valor","Valor (€)","number","",' step="1" min="0"')+
    '</div>',
    function(){
      var b=porId(valor("e_bien"));
      if(!b){ avisar("Elige un bien.", true); return true; }
      if(valor("e_fecha")===""){ avisar("Pon una fecha.", true); return true; }
      if(valor("e_valor")===""){ avisar("Pon el valor.", true); return true; }
      apuntarValor(b, numero("e_valor"), valor("e_fecha"));
      guardar(); pintar(); avisar("Valor apuntado");
    }, {aceptar:"Apuntar"});
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function bajarArchivo(texto, nombre){
  var blob=new Blob([texto], {type:"application/json;charset=utf-8"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

function pintarAjustes(){
  var main=document.getElementById("main");
  var apuntes=todos().reduce(function(s,b){ return s+(b.valores||[]).length; }, 0);

  main.innerHTML=
    cabecera("Ajustes","La copia de seguridad y el botón de borrar.")+

    '<div class="tarjeta" style="max-width:560px">'+
      '<div class="tarjeta-cab"><h2>Copia de seguridad</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota">Los datos ya viajan solos a tu repositorio privado. Esto es un '+
        'archivo aparte, por si algún día quieres llevártelos a otro sitio.</p>'+
        '<p class="nota">Ahora mismo: '+todos().length+
          (todos().length===1?" bien":" bienes")+' y '+apuntes+
          (apuntes===1?" valoración":" valoraciones")+'.</p>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button class="btn" id="b_bajar">Descargar copia</button>'+
          '<button class="btn" id="b_subir">Restaurar copia</button>'+
        '</div>'+
        '<input type="file" id="f_copia" accept="application/json,.json" hidden>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;border-color:var(--malo)">'+
      '<div class="tarjeta-cab"><h2 style="color:var(--malo)">Borrar</h2>'+
        '<span class="pista">No tiene vuelta atrás</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota" style="margin:0 0 14px">Lo borrado se va también de GitHub.</p>'+
        '<button class="btn malo fuerte" id="b_todo">Vaciar el patrimonio</button>'+
      '</div></div>';

  document.getElementById("b_bajar").addEventListener("click", function(){
    bajarArchivo(JSON.stringify(libro, null, 2), "patrimonio-"+hoyISO()+".json");
    avisar("Copia descargada");
  });

  var archivo=document.getElementById("f_copia");
  document.getElementById("b_subir").addEventListener("click", function(){ archivo.click(); });
  archivo.addEventListener("change", function(){
    var f=archivo.files[0]; if(!f) return;
    var lector=new FileReader();
    lector.onload=function(){
      var datos;
      try{ datos=JSON.parse(lector.result); }
      catch(e){ avisar("Ese archivo no se puede leer.", true); return; }
      if(!datos || !Array.isArray(datos.bienes)){
        avisar("Ese archivo no es una copia del patrimonio.", true); return;
      }
      confirmar("Restaurar copia",
        '<p style="margin:0">Entran <strong>'+datos.bienes.length+'</strong> bienes y se va '+
        'lo que hay ahora. Lo de GitHub se sustituye también.</p>',
        function(){
          libro=datos;
          if(!libro.ajustes) libro.ajustes={};
          libro.bienes.forEach(function(b){
            if(!b.id) b.id=uid();
            if(!b.valores) b.valores=[];
            if(!b.hipoteca) b.hipoteca={};
          });
          guardar(); ui.vista="resumen"; pintar(); avisar("Copia restaurada");
        }, {aceptar:"Restaurar", malo:true});
      archivo.value="";
    };
    lector.readAsText(f);
  });

  document.getElementById("b_todo").addEventListener("click", function(){
    if(!todos().length){ avisar("Ya está vacío.", true); return; }
    abrirVentana("Vaciar el patrimonio",
      '<p style="margin:0 0 12px">Se van los <strong>'+todos().length+
      '</strong> bienes con sus valoraciones y sus notas.</p>'+
      '<div class="campo"><label class="lbl" for="b_palabra">Escribe BORRAR para confirmarlo</label>'+
      '<input id="b_palabra" class="mono" placeholder="BORRAR" autocomplete="off"></div>',
      function(){
        if(valor("b_palabra").toUpperCase()!=="BORRAR"){
          avisar("Escribe BORRAR para confirmarlo.", true);
          return true;
        }
        libro.bienes=[];
        guardar(); ui.vista="resumen"; pintar(); avisar("Patrimonio vaciado");
      }, {aceptar:"Vaciar", malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
