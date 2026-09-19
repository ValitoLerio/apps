// ================================================================
// DATA
// ================================================================
// El personal se gestiona desde el boton "Personal" y viaja en los datos,
// no en el codigo: este archivo es publico.
var ENC = [];
var COC = [];
var CAM = [];

var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var DC    = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
var DC_FULL = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
var RCOL  = {enc:'var(--enc)', coc:'var(--coc)', cam:'var(--cam)'};
var RLBL  = {enc:'ENC', coc:'COC', cam:'CAM'};
var EICO  = {trabajo:'OK', festivo:'F', vacaciones:'V', baja:'B', ausencia:'A', libre:'-'};
var ECLS  = {trabajo:'et', festivo:'ef', vacaciones:'ev', baja:'eb', ausencia:'ea', libre:'el'};
var VERANO = [5,6,7,8,9,10];
var SCFG  = {
  verano:   {lbl:'Verano',   h:'8-9h',  eH:9,  rH:8},
  invierno: {lbl:'Invierno', h:'9-10h', eH:10, rH:9}
};
// Las horas que se miran en el cuadro de quien esta trabajando: de las
// siete de la manana a las dos de la madrugada, en verano y en invierno
// igual. Se cierra a las tres, y la ultima hora que se trabaja es la de
// las dos: el que sale a las 03:00 no esta trabajando en la hora de las
// tres, asi que esa fila no existe. Las de despues de medianoche van al
// final, marcadas con una L, porque son de la madrugada del dia
// siguiente aunque el turno empezara el dia de antes.
var SLOTS = [];
for (var _h = 7; _h <= 23; _h++) SLOTS.push(_h);
SLOTS.push(0); SLOTS.push(1); SLOTS.push(2);

// ================================================================
// STATE
// ================================================================
var curM = new Date().getMonth(), curY = 2026, curS = 'verano';
var sched = {};
// El cajon viejo del cuadrante de vacaciones, de cuando iba por su
// cuenta. Ya no se escribe en el: ahora el cuadrante guarda en `sched`,
// igual que los turnos. Se sigue leyendo solo para pasar al horario lo
// que quedara apuntado ahi. vac[año][mes][id][dia]
var vac   = {};
var active = null;
var clip   = null;
var hidden = {};
var weekMode  = false;
var weekStart = null;

// ================================================================
// HELPERS
// ================================================================
function staff()        { return ENC.concat(COC).concat(CAM); }
function visibleStaff() { return staff().filter(function(s){ return !hidden[s.id]; }); }

// ----------------------------------------------------------------
// EL MES EMPIEZA EL PRIMER LUNES
// ----------------------------------------------------------------
// El mes del horario no es el del calendario: va del PRIMER LUNES al
// domingo de antes del primer lunes del mes siguiente, para que todas
// las semanas esten enteras y las horas semanales signifiquen algo.
//
// Los dias sueltos del principio (del 1 al primer lunes) son del mes
// anterior, que termina en ellos. Asi los meses encajan uno detras de
// otro sin huecos: ningun dia se queda fuera ni sale en dos sitios.
//
// Los turnos se siguen guardando por su fecha real (sched[ano][mes][dia]),
// asi que esto solo cambia como se agrupan y se enseñan: no hay que tocar
// ni un dato de los que ya estan.
function primerLunes(y, m) {
  var dow = new Date(y, m, 1).getDay();          // 0 domingo ... 6 sabado
  return new Date(y, m, 1 + (dow === 1 ? 0 : (8 - dow) % 7));
}
function diasDelMes(y, m) {
  var fin = primerLunes(m === 11 ? y + 1 : y, (m + 1) % 12);
  var lista = [], d = primerLunes(y, m);
  while (d < fin) {
    lista.push({y:d.getFullYear(), m:d.getMonth(), d:d.getDate(), dow:d.getDay()});
    d.setDate(d.getDate() + 1);
  }
  return lista;
}
// A que mes del horario pertenece una fecha: al suyo si ya paso su primer
// lunes y, si no, al anterior.
function mesDeFecha(fecha) {
  var y = fecha.getFullYear(), m = fecha.getMonth();
  if (fecha < primerLunes(y, m)) { m--; if (m < 0) { m = 11; y--; } }
  return {y:y, m:m};
}
// La celda de un dia cualquiera, sea del mes que sea.
function gcAt(sid, dia) {
  var sM = curM, sY = curY;
  curM = dia.m; curY = dia.y;
  var c = gc(sid, dia.d);
  curM = sM; curY = sY;
  return c;
}
function esHoy(dia, hoy) {
  return hoy.getDate() === dia.d && hoy.getMonth() === dia.m && hoy.getFullYear() === dia.y;
}
// "7" si el dia es del mes, "4/10" si ya es del siguiente.
function etiquetaDia(dia, m) {
  return dia.m === m ? String(dia.d) : dia.d + '/' + (dia.m + 1);
}
// "7 oct - 3 nov", para que se vea de un vistazo donde empieza y acaba.
function rangoDelMes(y, m) {
  var dd = diasDelMes(y, m);
  if (!dd.length) return '';
  var a = dd[0], b = dd[dd.length - 1];
  var cor = function(x){ return x.d + ' ' + MESES[x.m].substring(0,3).toLowerCase(); };
  return cor(a) + ' - ' + cor(b);
}
function autoS(m)       { return VERANO.indexOf(m) >= 0 ? 'verano' : 'invierno'; }
function esc(t)         { return String(t==null?'':t).replace(/[&<>"']/g, function(c){
                            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function fmtH(t)        { if (!t) return '?'; return t; }
/* La hora en corto, solo para el cuadrante del mes, donde el sitio esta
   contado: las horas en punto pierden los minutos (09:00 -> 9) y asi el
   turno cabe en una celda estrecha. En el horario de WhatsApp, en la
   semana y en la ventana de editar, las horas van enteras. */
function fmtC(t) {
  if (!t) return '?';
  return t.slice(-3) === ':00' ? String(parseInt(t.slice(0,2), 10)) : t;
}

// ----------------------------------------------------------------
// TURNO PARTIDO
// ----------------------------------------------------------------
// Un dia puede llevar dos tramos: el del mediodia y el de la noche, que
// en un restaurante es lo corriente. El segundo es optativo y vive en
// inicio2/fin2. Sin el, un turno es exactamente lo que era antes: los
// dias ya apuntados no se enteran de que esto existe.
function minutosDe(ini, fin) {
  if (!ini || !fin) return 0;
  var a = parseInt(ini.split(':')[0])*60 + parseInt(ini.split(':')[1]);
  var b = parseInt(fin.split(':')[0])*60 + parseInt(fin.split(':')[1]);
  var d = b - a; if (d < 0) d += 1440;      // el que sale de madrugada
  return d;
}
function esPartido(c) { return !!(c && c.inicio2 && c.fin2); }
// Las horas del dia son las de los dos tramos juntos.
function horasDeCelda(c) {
  if (!c) return 0;
  return (minutosDe(c.inicio, c.fin) + minutosDe(c.inicio2, c.fin2)) / 60;
}

function textoTurno(c) {
  if (!c || !c.inicio) return '';
  return fmtH(c.inicio)+'-'+fmtH(c.fin) + (esPartido(c) ? ' / '+fmtH(c.inicio2)+'-'+fmtH(c.fin2) : '');
}

function tgtH(sid) {
  var s = staff().find(function(x){ return x.id === sid; });
  if (!s) return 8;
  return s.role === 'enc' ? SCFG[curS].eH : SCFG[curS].rH;
}

function cssVar(name, fallback) {
  var v = document.documentElement.style.getPropertyValue(name).trim();
  if (!v) v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* La letra que se lee sobre un fondo: negra si el fondo es claro,
   blanca si es oscuro. Los bloques de los turnos los pinta cada uno a
   su gusto en Colores, asi que el color de la letra no puede estar
   escrito a fuego: con un verde menta y una letra casi blanca no se lee
   nada. */
function letraSobre(fondo) {
  return claridad(fondo) > .55 ? '#141414' : '#f4f4f0';
}
/* La segunda linea -la hora de salida, el segundo tramo, la nota- va del
   mismo color pero mas floja. */
function letraFloja(fondo) {
  return conAlfa(letraSobre(fondo), .72);
}

function shiftBg(align) {
  if (align === 'flex-start') return cssVar('--shift-l','#1a4a2e');
  if (align === 'flex-end')   return cssVar('--shift-r','#2a1a0a');
  return cssVar('--shift-c','#1a1814');
}

// ================================================================
// STORAGE
// ================================================================
function save() {
  try { localStorage.setItem('rsch', JSON.stringify(sched)); } catch(e){}
  try { localStorage.setItem('rcam', JSON.stringify({enc:ENC, coc:COC, cam:CAM})); } catch(e){}
  try { localStorage.setItem('rhid', JSON.stringify(hidden));} catch(e){}
  try { localStorage.setItem('rvac', JSON.stringify(vac));   } catch(e){}
}
function load() {
  try { var d=localStorage.getItem('rsch');   if(d){var p=JSON.parse(d);if(typeof p==='object')sched=p;} } catch(e){}
  try {
    var d=localStorage.getItem('rcam');
    if(d){
      var p=JSON.parse(d);
      if(Array.isArray(p)){ CAM=p; }                       // formato antiguo: solo camareros
      else if(p && typeof p==='object'){
        ENC = Array.isArray(p.enc) ? p.enc : ENC;
        COC = Array.isArray(p.coc) ? p.coc : COC;
        CAM = Array.isArray(p.cam) ? p.cam : CAM;
      }
    }
  } catch(e){}
  try { var d=localStorage.getItem('rhid');   if(d){var p=JSON.parse(d);if(typeof p==='object')hidden=p;}} catch(e){}
  try { var d=localStorage.getItem('rvac');   if(d){var p=JSON.parse(d);if(typeof p==='object')vac=p;}   } catch(e){}
  try { var d=localStorage.getItem('rancho');
        if (d && ANCHOS.some(function(x){ return x.id === d; })) anchoDia = d; } catch(e){}
}

// ================================================================
// SCHEDULE DATA
// ================================================================
function gc(sid, day) {
  if (!sched[curY]) sched[curY] = {};
  if (!sched[curY][curM]) sched[curY][curM] = {};
  if (!sched[curY][curM][sid]) sched[curY][curM][sid] = {};
  return sched[curY][curM][sid][day] || null;
}
function sc(sid, day, data) {
  if (!sched[curY]) sched[curY] = {};
  if (!sched[curY][curM]) sched[curY][curM] = {};
  if (!sched[curY][curM][sid]) sched[curY][curM][sid] = {};
  sched[curY][curM][sid][day] = data;
  save();
}

// ================================================================
// LO ANCHO QUE ES CADA DIA
// ================================================================
// Cuanto mas ancho, mas se nota si el turno esta a la izquierda, al
// medio o a la derecha; cuanto mas estrecho, mas dias caben de una vez.
// El boton de arriba va pasando por los cuatro anchos y se queda con el
// que se deje puesto.
var ANCHOS = [
  {id:'justo',   lbl:'Justo',   px:64},
  {id:'normal',  lbl:'Normal',  px:82},
  {id:'ancho',   lbl:'Ancho',   px:98},
  {id:'deveras', lbl:'Muy ancho', px:126}
];
var anchoDia = 'ancho';
function aplicarAncho() {
  var a = ANCHOS.filter(function(x){ return x.id === anchoDia; })[0] || ANCHOS[2];
  document.documentElement.style.setProperty('--dia-ancho', a.px + 'px');
  var b = document.getElementById('banch');
  if (b) b.innerHTML = '\u2194 ' + a.lbl;
}
function cambiarAncho() {
  var i = 0;
  ANCHOS.forEach(function(x, k){ if (x.id === anchoDia) i = k; });
  anchoDia = ANCHOS[(i + 1) % ANCHOS.length].id;
  try { localStorage.setItem('rancho', anchoDia); } catch(e){}
  aplicarAncho();
  toast('Dias ' + (ANCHOS.filter(function(x){ return x.id===anchoDia; })[0].lbl).toLowerCase());
}

// ================================================================
// SEASON / MONTH
// ================================================================
function setSeason(s) {
  curS = s;
  var bv = document.getElementById('bv'), bi = document.getElementById('bi');
  if (bv) { bv.classList.toggle('on', s==='verano'); }
  if (bi) { bi.classList.toggle('on', s==='invierno'); }
  renderAll();
}
function selMonth(m) {
  curM = m; curS = autoS(m);
  var bv = document.getElementById('bv'), bi = document.getElementById('bi');
  if (bv) bv.classList.toggle('on', curS==='verano');
  if (bi) bi.classList.toggle('on', curS==='invierno');
  renderAll();
}

// ================================================================
// WEEK MODE
// ================================================================
function getMondayOf(date) {
  var d = new Date(date);
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function toggleWeekMode() {
  weekMode = !weekMode;
  var bwk = document.getElementById('bwk');
  if (weekMode) {
    weekStart = getMondayOf(new Date());
    if (bwk) { bwk.style.background='#27ae60'; bwk.style.color='#0f0e0b'; }
  } else {
    if (bwk) { bwk.style.background='transparent'; bwk.style.color='#27ae60'; }
  }
  var wb   = document.getElementById('week-bar');
  var cov  = document.getElementById('cov');
  var sb   = document.getElementById('statsbar');
  var cb   = document.getElementById('clip-banner');
  var mn   = document.getElementById('mnav');
  if (wb)  wb.classList.toggle('show', weekMode);
  if (cov) cov.style.display  = weekMode ? 'none' : 'block';
  var aus = document.getElementById('ausencias-section');
  if (aus) aus.style.display = weekMode ? 'none' : 'block';
  if (sb)  sb.style.display   = weekMode ? 'none' : 'flex';
  if (cb && !weekMode) cb.style.display = '';
  if (mn)  mn.style.display   = weekMode ? 'none' : 'flex';
  renderAll();
}
function prevWeek() { weekStart.setDate(weekStart.getDate()-7); syncWeekMonth(); renderAll(); }
function nextWeek() { weekStart.setDate(weekStart.getDate()+7); syncWeekMonth(); renderAll(); }
function syncWeekMonth() {
  curM = weekStart.getMonth(); curY = weekStart.getFullYear(); curS = autoS(curM);
  var bv=document.getElementById('bv'), bi=document.getElementById('bi'), yr=document.getElementById('yr');
  if (bv) bv.classList.toggle('on', curS==='verano');
  if (bi) bi.classList.toggle('on', curS==='invierno');
  if (yr) yr.value = curY;
}
function updateWeekLabel() {
  var end = new Date(weekStart); end.setDate(end.getDate()+6);
  var fmt = function(d){ return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear(); };
  var wl  = document.getElementById('week-label');
  var ws  = document.getElementById('wk-season');
  if (wl) wl.textContent = fmt(weekStart)+' - '+fmt(end);
  if (ws) ws.textContent = SCFG[curS].lbl+' · '+SCFG[curS].h;
}

// ================================================================
// LAS CABECERAS, PEGADAS
// ================================================================
// Cada cuadrante de abajo lleva su barra con el titulo y el mes. Al
// subir la tabla se iba y ya no sabias en que mes estabas. Ahora se
// queda pegada arriba del cuerpo mientras estas en ese cuadrante, y la
// siguiente la empuja al llegar. (La fila de los dias no se puede pegar
// aqui: cada tabla vive dentro de su caja de desplazamiento lateral, y
// pegarla ahi la dejaria flotando encima de sus propias filas. En el
// cuadrante del mes, que tiene su propio desplazamiento, si se pega.)
var SECCIONES_PEGADAS = ['cov','hours-section','ausencias-section','vac-section'];
function pegarCabeceras() {
  SECCIONES_PEGADAS.forEach(function(id){
    var sec = document.getElementById(id); if (!sec) return;
    var barra = sec.firstElementChild; if (!barra) return;
    barra.style.position = 'sticky';
    barra.style.top      = '0';
    barra.style.zIndex   = '30';
  });
}

// ================================================================
// RENDER ALL
// ================================================================
// El mes que se esta mirando, tal cual se escribe en la chapa de cada
// cuadrante. Los cuadrantes quedan lejos de la barra de arriba, y al
// bajar la pantalla hay que poder ver en que mes se esta sin subir.
function rotuloMes(y, m) {
  return MESES[m] + ' ' + y + ' \u00b7 ' + rangoDelMes(y, m);
}
function ponerChapa(id, texto) {
  var el = document.getElementById(id);
  if (el) el.textContent = texto;
}

function renderAll() {
  var yr = document.getElementById('yr');
  if (yr) curY = parseInt(yr.value);
  // Sync hours year selector
  var hyr = document.getElementById('hours-year-sel');
  if (hyr) hyr.value = curY;
  renderNav(); renderTable(); renderStats(); renderCov(); renderHours(); renderAusencias(); renderVacaciones();
  pegarCabeceras();
}

// ================================================================
// HOURS SUMMARY TABLE
// ================================================================
// Las horas de un mes son las de SUS dias, que es lo que ahora va del
// primer lunes al domingo de antes del primer lunes siguiente. Antes se
// vaciaba el cajon sched[ano][mes] entero, y con los meses corridos eso
// dejaba fuera la ultima semana y colaba los dias sueltos del principio.
function calcStaffHours(sid, y, m) {
  var totalH = 0, totalD = 0;
  diasDelMes(y, m).forEach(function(dia){
    var c = ((((sched[dia.y]||{})[dia.m]||{})[sid])||{})[dia.d];
    if (!c) return;
    if (c.estado === 'trabajo') {
      totalD++;
      totalH += horasDeCelda(c);
    }
  });
  return {h: Math.round(totalH*10)/10, d: totalD};
}

function renderHours() {
  var tbl = document.getElementById('hourstbl'); if (!tbl) return;
  var hyr = document.getElementById('hours-year-sel');
  var y   = hyr ? parseInt(hyr.value) : curY;
  var all = staff();
  var view = document.getElementById('hours-view-sel');
  var mode = view ? view.value : 'monthly';
  ponerChapa('hours-mes',
    mode === 'annual' ? 'Año ' + y :
    mode === 'weekly' ? 'Semanas de ' + y :
    rotuloMes(y, curM));
  if (mode === 'weekly')  { renderHoursWeekly(tbl, y, all); return; }
  if (mode === 'annual')  { renderHoursAnnual(tbl, y, all); return; }
  renderHoursMonthly(tbl, y, all);
}

function cellSt(isCur, bg) {
  return 'background:'+(bg||(isCur?'rgba(201,168,76,.07)':'transparent'))+';padding:7px 6px;border:1px solid var(--border);text-align:center;vertical-align:middle';
}
function hdCell(d, h, hl) {
  if (!d) return '<div style="font-size:.76rem;color:var(--border)">-</div>';
  return '<div style="font-size:.85rem;font-weight:700;color:'+(hl?'var(--gold2)':'var(--est-trabajo)')+'">'+d+'d</div><div style="font-size:.76rem;color:var(--text2)">'+h+'h</div>';
}
function stickyNC(s) {
  return '<td style="background:var(--surface);position:sticky;left:0;z-index:8;padding:7px 11px;border:1px solid var(--border);' +
         'box-shadow:2px 0 0 var(--border);line-height:1.2;white-space:nowrap">'
       + '<span style="color:'+RCOL[s.role]+';font-weight:600;font-size:.8rem">'+s.name+'</span>'
       + '<span class="rt r'+s.role+'" style="margin-left:2px">'+RLBL[s.role]+'</span></td>';
}
function grpSep(cols) {
  return '<tr><td colspan="'+cols+'" style="height:3px;background:var(--border);padding:0;border:none"></td></tr>';
}

function calcStaffWeek(sid, week) {
  var h=0, d=0;
  week.days.forEach(function(day){
    var sM=curM, sY=curY; curM=day.m; curY=day.y;
    var cell=gc(sid,day.d);
    curM=sM; curY=sY;
    if(!cell||cell.estado!=='trabajo') return;
    d++;
    h += horasDeCelda(cell);
  });
  return {h:Math.round(h*10)/10, d:d};
}

// Ahora el mes empieza en lunes y acaba en domingo, asi que las semanas
// salen todas de siete dias: no hay ni primera ni ultima semana coja.
function getWeeksOfMonth(y, m) {
  var weeks=[], wk=null;
  diasDelMes(y, m).forEach(function(dia){
    if(!wk || dia.dow===1){
      if(wk) weeks.push(wk);
      var jan1=new Date(dia.y,0,1);
      var doy=Math.floor((new Date(dia.y,dia.m,dia.d)-jan1)/86400000);
      var wn=Math.ceil((doy+jan1.getDay()+1)/7);
      wk={label:'S'+wn, days:[]};
    }
    wk.days.push({y:dia.y, m:dia.m, d:dia.d});
  });
  if(wk&&wk.days.length)weeks.push(wk);
  return weeks;
}

function renderHoursMonthly(tbl, y, all) {
  var th='<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:8px 11px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Personal</th>';
  MESES.forEach(function(mn,mi){
    var ic=mi===curM&&y===curY;
    th+='<th style="background:'+(ic?'rgba(201,168,76,.18)':'var(--surface)')+';color:'+(ic?'var(--gold2)':'var(--text2)')+';padding:8px 7px;border:1px solid var(--border);text-align:center;font-size:.76rem;font-weight:'+(ic?'700':'500')+'">'+mn.substring(0,3)+'</th>';
  });
  th+='<th style="background:var(--total-bg);color:var(--gold2);padding:8px 10px;border:1px solid var(--border);text-align:center;width:72px;font-size:.78rem;font-weight:700">AÑO</th></tr></thead>';
  var tb='<tbody>'; var lastR=null;
  all.forEach(function(s){
    if(s.role!==lastR){if(lastR!==null)tb+=grpSep(15);lastR=s.role;}
    var yH=0,yD=0; tb+='<tr>'+stickyNC(s);
    MESES.forEach(function(mn,mi){
      var r=calcStaffHours(s.id,y,mi); yH+=r.h; yD+=r.d;
      tb+='<td style="'+cellSt(mi===curM&&y===curY)+'">'+hdCell(r.d,r.h,mi===curM&&y===curY)+'</td>';
    });
    tb+='<td style="background:var(--total-bg);padding:7px 10px;border:1px solid var(--border);text-align:center;vertical-align:middle"><div style="font-size:.9rem;font-weight:900;color:var(--gold2)">'+yD+'d</div><div style="font-size:.8rem;font-weight:700;color:var(--est-trabajo)">'+Math.round(yH*10)/10+'h</div></td></tr>';
  });
  tb+='</tbody>'; tbl.innerHTML=th+tb;
}

function renderHoursWeekly(tbl, y, all) {
  var weeks=getWeeksOfMonth(y,curM);
  var today=new Date();
  var th='<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:8px 11px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Personal — '+MESES[curM]+' '+y+'</th>';
  weeks.forEach(function(wk){
    var ic=wk.days.some(function(dd){return dd.d===today.getDate()&&dd.m===today.getMonth()&&dd.y===today.getFullYear();});
    var d0=wk.days[0],d1=wk.days[wk.days.length-1];
    th+='<th style="background:'+(ic?'rgba(201,168,76,.18)':'var(--surface)')+';color:'+(ic?'var(--gold2)':'var(--text2)')+';padding:8px 7px;border:1px solid var(--border);text-align:center;font-size:.76rem;font-weight:'+(ic?'700':'500')+'">'+wk.label+'<br><span style="font-size:.62rem;opacity:.7">'+d0.d+'/'+(d0.m+1)+'-'+d1.d+'/'+(d1.m+1)+'</span></th>';
  });
  th+='<th style="background:var(--total-bg);color:var(--gold2);padding:8px 10px;border:1px solid var(--border);text-align:center;width:72px;font-size:.78rem;font-weight:700">MES</th></tr></thead>';
  var tb='<tbody>'; var lastR=null;
  all.forEach(function(s){
    if(s.role!==lastR){if(lastR!==null)tb+=grpSep(weeks.length+2);lastR=s.role;}
    var mRes=calcStaffHours(s.id,y,curM); tb+='<tr>'+stickyNC(s);
    weeks.forEach(function(wk){
      var ic=wk.days.some(function(dd){return dd.d===today.getDate()&&dd.m===today.getMonth()&&dd.y===today.getFullYear();});
      var r=calcStaffWeek(s.id,wk);
      tb+='<td style="'+cellSt(ic)+'">'+hdCell(r.d,r.h,ic)+'</td>';
    });
    tb+='<td style="background:var(--total-bg);padding:7px 10px;border:1px solid var(--border);text-align:center;vertical-align:middle"><div style="font-size:.9rem;font-weight:900;color:var(--gold2)">'+mRes.d+'d</div><div style="font-size:.8rem;font-weight:700;color:var(--est-trabajo)">'+mRes.h+'h</div></td></tr>';
  });
  tb+='</tbody>'; tbl.innerHTML=th+tb;
}

function renderHoursAnnual(tbl, y, all) {
  var th='<thead><tr>'
    +'<th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:8px 11px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Personal — '+y+'</th>'
    +'<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:center;font-size:.74rem;min-width:100px">Dias trabajados</th>'
    +'<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:center;font-size:.74rem;min-width:100px">Horas totales</th>'
    +'<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:center;font-size:.74rem;min-width:100px">Media h/dia</th>'
    +'<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:center;font-size:.74rem;min-width:100px">Media h/semana</th>'
    +'</tr></thead>';
  var tb='<tbody>'; var lastR=null;
  all.forEach(function(s){
    if(s.role!==lastR){if(lastR!==null)tb+=grpSep(5);lastR=s.role;}
    var yH=0,yD=0; for(var mi=0;mi<12;mi++){var r=calcStaffHours(s.id,y,mi);yH+=r.h;yD+=r.d;} yH=Math.round(yH*10)/10;
    var avgD=yD>0?Math.round((yH/yD)*10)/10:0, avgW=Math.round((yH/52)*10)/10;
    tb+='<tr>'+stickyNC(s)
      +'<td style="'+cellSt(false)+'"><span style="font-size:.95rem;font-weight:700;color:var(--gold2)">'+yD+'</span></td>'
      +'<td style="'+cellSt(false)+'"><span style="font-size:.95rem;font-weight:700;color:var(--est-trabajo)">'+yH+'h</span></td>'
      +'<td style="'+cellSt(false)+'"><span style="font-size:.88rem;color:var(--text2)">'+avgD+'h</span></td>'
      +'<td style="'+cellSt(false)+'"><span style="font-size:.88rem;color:var(--text2)">'+avgW+'h</span></td>'
      +'</tr>';
  });
  tb+='</tbody>'; tbl.innerHTML=th+tb;
}
// ================================================================
// AUSENCIAS: VACACIONES, FESTIVOS Y BAJAS
// ================================================================
var ausFiltro = null;   /* null = se ven los cuatro tipos */

/* Al pulsar una ficha se ve solo ese tipo; al volver a pulsarla, todos. */
function filtrarAusencias(tipo){
  ausFiltro = (ausFiltro === tipo) ? null : tipo;
  renderAusencias();
}

var AUS_TIPOS = {
  vacaciones: {lbl:'Vacaciones', cls:'ev', ico:'\uD83C\uDFD6\uFE0F'},
  festivo:    {lbl:'Festivos',   cls:'ef', ico:'\uD83C\uDF89'},
  baja:       {lbl:'Bajas',      cls:'eb', ico:'B'},
  ausencia:   {lbl:'Ausencias',  cls:'ea', ico:'A'}
};

/* Agrupa los dias sueltos en tramos: 3,4,5 y 9 -> "3-5" y "9". Asi se
   lee "del 3 al 5" en vez de una lista larga de numeros.

   Cada dia lleva su fecha entera, no solo el numero: como el mes del
   horario puede terminar en el mes de al lado, un 30 y un 1 son dias
   seguidos y tienen que salir como un tramo, no como dos sueltos. */
function serie(dia){ return Date.UTC(dia.y, dia.m, dia.d) / 86400000; }
function tramos(dias){
  if (!dias.length) return [];
  var orden = dias.slice().sort(function(a,b){ return serie(a)-serie(b); });
  var salida = [], ini = orden[0], prev = orden[0];
  for (var i = 1; i < orden.length; i++) {
    if (serie(orden[i]) === serie(prev) + 1) { prev = orden[i]; continue; }
    salida.push([ini, prev]); ini = prev = orden[i];
  }
  salida.push([ini, prev]);
  return salida;
}
function textoTramos(dias, m){
  return tramos(dias).map(function(t){
    var a = etiquetaDia(t[0], m), b = etiquetaDia(t[1], m);
    return a === b ? a : a + '-' + b;
  }).join(', ');
}

/* Recoge las ausencias del mes en curso o de todo el año. */
function recogerAusencias(){
  var alcance = (document.getElementById('aus-alcance') || {}).value || 'mes';
  var meses = alcance === 'ano' ? [] : [curM];
  if (alcance === 'ano') for (var m = 0; m < 12; m++) meses.push(m);

  var porPersona = {};   // sid -> mes -> tipo -> [{y,m,d}]
  var totales = {vacaciones:0, festivo:0, baja:0, ausencia:0};

  staff().forEach(function(s){
    meses.forEach(function(m){
      // Los dias del mes del horario, que arranca el primer lunes y puede
      // acabar ya dentro del mes siguiente.
      diasDelMes(curY, m).forEach(function(dia){
        var c = ((((sched[dia.y] || {})[dia.m] || {})[s.id]) || {})[dia.d];
        if (!c || !AUS_TIPOS[c.estado]) return;
        porPersona[s.id] = porPersona[s.id] || {};
        porPersona[s.id][m] = porPersona[s.id][m] || {};
        (porPersona[s.id][m][c.estado] = porPersona[s.id][m][c.estado] || []).push(dia);
        totales[c.estado]++;
      });
    });
  });
  return {porPersona: porPersona, totales: totales, meses: meses, alcance: alcance};
}

function renderAusencias(){
  var tbl = document.getElementById('austbl'); if (!tbl) return;
  var datos = recogerAusencias();
  ponerChapa('aus-mes', datos.alcance === 'ano' ? 'Todo ' + curY : rotuloMes(curY, curM));

  // Fichas de recuento
  var caja = document.getElementById('aus-resumen');
  if (caja) {
    caja.innerHTML = Object.keys(AUS_TIPOS).map(function(k){
      var n = datos.totales[k];
      var elegida = (ausFiltro === k);
      var apagada = (ausFiltro && !elegida);
      return '<div class="tb ' + AUS_TIPOS[k].cls + ' aus-ficha" data-tipo="' + k + '"' +
             ' title="' + (elegida ? 'Quitar el filtro' : 'Ver solo ' + AUS_TIPOS[k].lbl.toLowerCase()) + '"' +
             ' style="cursor:pointer;padding:7px 12px;transition:opacity .15s,box-shadow .15s;' +
             (elegida ? 'box-shadow:0 0 0 2px currentColor;' : '') +
             (apagada ? 'opacity:.4;' : '') + '">' +
             '<span style="font-size:1.05rem;font-weight:700">' + n + '</span>' +
             '<span style="margin-left:5px;font-weight:500">' + AUS_TIPOS[k].lbl + '</span></div>';
    }).join('') +
    (ausFiltro
      ? '<button onclick="filtrarAusencias(null)" style="background:none;border:1px solid var(--border);' +
        'color:var(--text2);border-radius:14px;padding:5px 12px;cursor:pointer;font-family:inherit;' +
        'font-size:.72rem;align-self:center">\u2715 Ver todo</button>'
      : '');
    caja.querySelectorAll('.aus-ficha').forEach(function(f){
      f.addEventListener('click', function(){ filtrarAusencias(f.getAttribute('data-tipo')); });
    });
  }

  /* Con un tipo elegido solo sale esa columna y solo quien lo tenga.
     Sin filtro, la plantilla entera con los cuatro tipos. */
  var tipos = ausFiltro ? [ausFiltro] : Object.keys(AUS_TIPOS);
  var todos = visibleStaff();
  if (ausFiltro) {
    todos = todos.filter(function(s){
      var porMes = datos.porPersona[s.id];
      if (!porMes) return false;
      return Object.keys(porMes).some(function(m){
        return (porMes[m][ausFiltro] || []).length > 0;
      });
    });
    if (!todos.length) {
      tbl.innerHTML = '<tbody><tr><td style="padding:26px 4px;text-align:center;color:var(--text2)">' +
        'Nadie tiene ' + AUS_TIPOS[ausFiltro].lbl.toLowerCase() + ' ' +
        (datos.alcance === 'ano' ? 'en ' + curY : 'en ' + MESES[curM] + ' (' + rangoDelMes(curY, curM) + ')') + '.</td></tr></tbody>';
      return;
    }
  }
  if (!todos.length) {
    tbl.innerHTML = '<tbody><tr><td style="padding:26px 4px;text-align:center;color:var(--text2)">' +
      'Aun no hay personal dado de alta.</td></tr></tbody>';
    return;
  }

  var th = '<thead><tr>' +
    '<th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;' +
    'padding:5px 7px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Personal</th>' +
    (datos.alcance === 'ano'
      ? '<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:left;font-size:.74rem;min-width:80px">Mes</th>'
      : '') +
    tipos.map(function(k){
      return '<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);' +
             'text-align:left;font-size:.74rem;min-width:120px">' + AUS_TIPOS[k].lbl + '</th>';
    }).join('') +
    '<th style="background:var(--total-bg);color:var(--gold2);padding:9px 10px;border:1px solid var(--border);' +
    'text-align:center;font-size:.74rem;min-width:70px">Días</th></tr></thead>';

  var columnas = tipos.length + (datos.alcance === 'ano' ? 2 : 1) + 1;
  var tb = '<tbody>';
  var ultimoRol = null;

  function celdaNombre(s, filas){
    return '<td' + (filas > 1 ? ' rowspan="' + filas + '"' : '') +
           ' style="background:var(--surface);position:sticky;left:0;z-index:5;' +
           'padding:7px 12px;border:1px solid var(--border);vertical-align:top">' +
           '<span style="color:' + RCOL[s.role] + ';font-weight:600;font-size:.8rem">' + s.name + '</span>' +
           '<span class="rt r' + s.role + '" style="margin-left:3px">' + RLBL[s.role] + '</span></td>';
  }
  function celdasTipos(porTipo, mes){
    var total = 0;
    var html = tipos.map(function(k){
      var dias = (porTipo && porTipo[k]) || [];
      total += dias.length;
      return '<td style="padding:8px 12px;border:1px solid var(--border)">' +
             (dias.length
               ? '<span class="tb ' + AUS_TIPOS[k].cls + '" style="cursor:default;font-size:.82rem;padding:4px 9px">' +
                 textoTramos(dias, mes) + '<span style="opacity:.7;margin-left:5px">(' + dias.length + 'd)</span></span>'
               : '<span style="color:var(--border)">·</span>') +
             '</td>';
    }).join('');
    html += '<td style="background:var(--total-bg);padding:7px 10px;border:1px solid var(--border);text-align:center">' +
            (total
              ? '<span style="font-size:.9rem;font-weight:700;color:var(--gold2)">' + total + '</span>'
              : '<span style="color:var(--border)">·</span>') + '</td>';
    return html;
  }

  todos.forEach(function(s){
    if (s.role !== ultimoRol) {
      if (ultimoRol !== null) tb += '<tr><td colspan="' + columnas + '" style="height:3px;background:var(--border);padding:0;border:none"></td></tr>';
      ultimoRol = s.role;
    }
    var porMes = datos.porPersona[s.id];
    var mesesConAlgo = porMes ? Object.keys(porMes).map(Number).sort(function(a,b){ return a-b; }) : [];
    if (ausFiltro) {
      mesesConAlgo = mesesConAlgo.filter(function(m){ return (porMes[m][ausFiltro] || []).length > 0; });
    }

    if (!mesesConAlgo.length) {
      // Sin nada: sale igualmente, para tener la plantilla completa
      tb += '<tr>' + celdaNombre(s, 1) +
            (datos.alcance === 'ano'
              ? '<td style="padding:7px 10px;border:1px solid var(--border);color:var(--border)">—</td>'
              : '') +
            celdasTipos(null, curM) + '</tr>';
      return;
    }
    mesesConAlgo.forEach(function(m, idx){
      tb += '<tr>';
      if (idx === 0) tb += celdaNombre(s, mesesConAlgo.length);
      if (datos.alcance === 'ano') {
        tb += '<td style="padding:7px 10px;border:1px solid var(--border);color:var(--text2);white-space:nowrap">' +
              MESES[m] + '</td>';
      }
      tb += celdasTipos(porMes[m], m) + '</tr>';
    });
  });
  tb += '</tbody>';
  tbl.innerHTML = th + tb;
}


// ================================================================
// CUADRANTE DE VACACIONES, FESTIVOS, BAJAS Y AUSENCIAS
// ================================================================
// Un cuadrante de dias sueltos, sin horas ni turnos ni temporada: se
// elige arriba que se esta poniendo (vacaciones, festivo, baja o
// ausencia) y se van pulsando los dias.
//
// Y lo que se marca aqui ES el horario: se guarda en el mismo sitio que
// los turnos (`sched`), asi que el dia sale solo en el cuadrante del
// mes, en el de la semana, en el recuento de ausencias y en el horario
// que se manda por WhatsApp. No hay que apuntarlo dos veces.
var VAC_TIPOS = ['vacaciones','festivo','baja','ausencia'];
var VAC_EST = {
  vacaciones: {letra:'V', lbl:'Vacaciones', uno:'Vacaciones', bg:'var(--est-vacaciones-lleno)', col:'var(--est-vacaciones-txt)', puro:'var(--est-vacaciones)'},
  festivo:    {letra:'F', lbl:'Festivos',   uno:'Festivo',    bg:'var(--est-festivo-lleno)',    col:'var(--est-festivo-txt)',    puro:'var(--est-festivo)'},
  baja:       {letra:'B', lbl:'Bajas',      uno:'Baja',       bg:'var(--est-baja-lleno)',       col:'var(--est-baja-txt)',       puro:'var(--est-baja)'},
  ausencia:   {letra:'A', lbl:'Ausencias',  uno:'Ausencia',   bg:'var(--est-ausencia-lleno)',   col:'var(--est-ausencia-txt)',   puro:'var(--est-ausencia)'}
};
// Lo que se esta poniendo ahora mismo al pulsar un dia.
var vacTipo = 'vacaciones';
function setVacTipo(t){ if (!VAC_EST[t]) return; vacTipo = t; renderVacaciones(); }

// La celda del horario de un dia cualquiera, sin tocar el mes en curso.
function celdaDe(sid, dia){
  return ((((sched[dia.y] || {})[dia.m] || {})[sid]) || {})[dia.d] || null;
}
function estadoDe(sid, dia){
  var c = celdaDe(sid, dia);
  return c && c.estado ? c.estado : 'libre';
}
// Cuantos dias de un tipo tiene alguien en un mes del horario.
function diasTipoMes(sid, y, m, tipo){
  var n = 0;
  diasDelMes(y, m).forEach(function(dia){ if (estadoDe(sid, dia) === tipo) n++; });
  return n;
}
function diasTipoAno(sid, y, tipo){
  var n = 0;
  for (var m = 0; m < 12; m++) n += diasTipoMes(sid, y, m, tipo);
  return n;
}

// Un toque pone el dia del tipo elegido y otro toque, del mismo tipo, lo
// quita. Si el dia tenia un turno con horas, el turno se va: estar de
// vacaciones y trabajar a la vez no puede ser, y se avisa de lo que se
// ha llevado por delante.
function marcarDiaVac(sid, y, m, d){
  var dia = {y:y, m:m, d:d};
  var celda = celdaDe(sid, dia);
  var est   = celda && celda.estado ? celda.estado : 'libre';
  var savedM = curM, savedY = curY;
  curM = m; curY = y;
  if (est === vacTipo) {
    var mes = (sched[y] || {})[m] || {};
    if (mes[sid]) delete mes[sid][d];
    save();
    curM = savedM; curY = savedY;
    toast(VAC_EST[vacTipo].uno + ' quitado - dia ' + etiquetaDia(dia, curM));
  } else {
    var teniaTurno = (est === 'trabajo' && celda && celda.inicio) ? textoTurno(celda) : '';
    sc(sid, d, {estado: vacTipo, nota: (celda && celda.nota) || ''});
    curM = savedM; curY = savedY;
    toast(VAC_EST[vacTipo].uno + ' - dia ' + etiquetaDia(dia, curM) +
          (teniaTurno ? ' (se ha quitado el turno ' + teniaTurno + ')' : ''));
  }
  // Se repinta todo, que esto ya es el horario: el mes, la semana, la
  // cobertura, las horas y el recuento de ausencias.
  renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras();
}

// ----------------------------------------------------------------
// LO QUE HABIA EN EL CAJON VIEJO
// ----------------------------------------------------------------
// Antes el cuadrante guardaba las vacaciones aparte, en `vac` ('rvac'),
// sin que el horario se enterara. Esas vacaciones se pasan al horario
// una sola vez, y solo a los dias que esten libres: si en un dia ya hay
// algo puesto a mano, manda el horario. El cajon viejo se queda como
// estaba, por si acaso.
function migrarVacacionesViejas(){
  try { if (localStorage.getItem('rvacmig') === '1') return; } catch(e){}
  var pasadas = 0;
  Object.keys(vac || {}).forEach(function(y){
    Object.keys(vac[y] || {}).forEach(function(m){
      Object.keys(vac[y][m] || {}).forEach(function(sid){
        Object.keys(vac[y][m][sid] || {}).forEach(function(d){
          if (!vac[y][m][sid][d]) return;
          if (!sched[y])           sched[y] = {};
          if (!sched[y][m])        sched[y][m] = {};
          if (!sched[y][m][sid])   sched[y][m][sid] = {};
          if (sched[y][m][sid][d]) return;     // en el horario ya hay algo
          sched[y][m][sid][d] = {estado:'vacaciones', nota:''};
          pasadas++;
        });
      });
    });
  });
  if (pasadas) save();
  try { localStorage.setItem('rvacmig', '1'); } catch(e){}
  return pasadas;
}

function renderVacaciones(){
  var tbl = document.getElementById('vactbl'); if (!tbl) return;
  var dias = diasDelMes(curY, curM);
  var hoy  = new Date();
  var all  = visibleStaff();

  ponerChapa('vac-rango', rotuloMes(curY, curM));

  // Los botones de que se esta poniendo.
  var barra = document.getElementById('vac-tipos');
  if (barra) {
    barra.innerHTML = VAC_TIPOS.map(function(t){
      var e = VAC_EST[t], on = (t === vacTipo);
      return '<button onclick="setVacTipo(\'' + t + '\')" ' +
        'title="Poner ' + e.uno.toLowerCase() + ' al pulsar un dia" ' +
        'style="cursor:pointer;font-family:inherit;font-size:.74rem;font-weight:600;padding:5px 12px;' +
        'border-radius:14px;border:1px solid ' + (on ? e.puro : 'var(--border)') + ';' +
        'background:' + (on ? e.bg : 'transparent') + ';color:' + (on ? e.col : 'var(--text2)') + ';">' +
        '<span style="font-weight:900">' + e.letra + '</span> ' + e.uno + '</button>';
    }).join('');
  }

  if (!all.length) {
    tbl.innerHTML = '<tbody><tr><td style="padding:26px 4px;text-align:center;color:var(--text2)">' +
      'Aun no hay personal dado de alta.</td></tr></tbody>';
    return;
  }

  var th = '<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;' +
    'font-size:.82rem;padding:9px 12px;border:1px solid var(--border);text-align:left;position:sticky;left:0;' +
    'z-index:10;min-width:104px">Personal</th>';
  dias.forEach(function(dia){
    var we  = dia.dow===0||dia.dow===6;
    var tod = esHoy(dia, hoy);
    th += '<th style="background:' + (tod?'rgba(201,168,76,.18)':(we?'#1e1c14':'var(--surface)')) + ';color:' +
          (tod?'var(--gold2)':(we?'var(--gold)':'var(--text2)')) + ';padding:6px 3px;border:1px solid var(--border);' +
          'text-align:center;min-width:34px;font-size:.66rem;white-space:nowrap">' + DC[dia.dow] +
          '<br><span style="font-size:.82rem;font-weight:700">' + etiquetaDia(dia, curM) + '</span></th>';
  });
  th += '<th style="background:var(--total-bg);color:var(--gold2);padding:6px 10px;border:1px solid var(--border);' +
        'text-align:center;min-width:74px;font-size:.72rem;font-weight:700">' + VAC_EST[vacTipo].lbl +
        '<br><span style="font-size:.64rem;font-weight:500;color:var(--text2)">mes / a&ntilde;o</span></th></tr></thead>';

  var tb = '<tbody>';
  var ultimoRol = null;
  all.forEach(function(s){
    if (s.role !== ultimoRol) {
      if (ultimoRol !== null) tb += '<tr><td colspan="' + (dias.length+2) + '" style="height:3px;background:var(--border);padding:0;border:none"></td></tr>';
      ultimoRol = s.role;
    }
    var enElMes = 0;
    var cuenta  = {vacaciones:0, festivo:0, baja:0, ausencia:0};
    var celdas = dias.map(function(dia){
      var est = estadoDe(s.id, dia);
      var e   = VAC_EST[est];
      if (e) cuenta[est]++;
      if (est === vacTipo) enElMes++;
      var we    = dia.dow===0||dia.dow===6;
      var trab  = (est === 'trabajo');
      var marca = e ? e.letra : '&middot;';
      var fondo = e ? e.bg : (we ? 'rgba(30,28,20,.5)' : 'transparent');
      var color = e ? e.col : (trab ? 'var(--gold)' : 'var(--border)');
      // El dia que tiene turno se ve, para no borrarlo sin querer.
      var celda = trab ? celdaDe(s.id, dia) : null;
      var pista = e
        ? ' - ' + e.uno + (est === vacTipo ? ' (pulsa para quitarlo)' : ' (pulsa para poner ' + VAC_EST[vacTipo].uno.toLowerCase() + ')')
        : (trab && celda && celda.inicio
            ? ' - turno ' + textoTurno(celda) + ' (pulsa y se cambia por ' + VAC_EST[vacTipo].uno.toLowerCase() + ')'
            : ' - poner ' + VAC_EST[vacTipo].uno.toLowerCase());
      return '<td onclick="marcarDiaVac(\'' + s.id + '\',' + dia.y + ',' + dia.m + ',' + dia.d + ')" ' +
             'title="' + esc(s.name) + ' - ' + etiquetaDia(dia, curM) + pista + '" ' +
             'style="cursor:pointer;text-align:center;padding:4px 2px;border:1px solid var(--border);' +
             'background:' + fondo + ';color:' + color + ';font-weight:700;font-size:.78rem;user-select:none">' +
             (trab ? '&bull;' : marca) + '</td>';
    }).join('');
    var ano = diasTipoAno(s.id, curY, vacTipo);
    var desglose = VAC_TIPOS.map(function(t){ return VAC_EST[t].letra + cuenta[t]; }).join(' ');
    tb += '<tr><td style="background:var(--surface);position:sticky;left:0;z-index:5;padding:4px 10px;' +
          'border:1px solid var(--border);white-space:nowrap">' +
          '<span style="color:' + RCOL[s.role] + ';font-weight:600;font-size:.8rem">' + esc(s.name) + '</span>' +
          '<span class="rt r' + s.role + '" style="margin-left:3px">' + RLBL[s.role] + '</span></td>' +
          celdas +
          '<td style="background:var(--total-bg);padding:4px 9px;border:1px solid var(--border);text-align:center" ' +
          'title="En este mes: ' + desglose + '">' +
          '<div style="font-size:.9rem;font-weight:900;color:' + VAC_EST[vacTipo].puro + '">' + enElMes + 'd</div>' +
          '<div style="font-size:.64rem;color:var(--text2);white-space:nowrap">' + ano + ' en ' + curY +
          ' &middot; ' + desglose + '</div></td></tr>';
  });
  tb += '</tbody>';
  tbl.innerHTML = th + tb;
}

function renderNav() {
  var nav = document.getElementById('mnav');
  if (!nav) return;
  nav.innerHTML = MESES.map(function(n,i){
    var ic = VERANO.indexOf(i) >= 0 ? 'S' : 'I';
    return '<button class="mb'+(i===curM?' on':'')+'" onclick="selMonth('+i+')">'+ic+' '+n+'</button>';
  }).join('');
  var myl = document.getElementById('myl');
  if (myl) myl.textContent = MESES[curM]+' '+curY+' ('+rangoDelMes(curY, curM)+')';
}
function renderStats() {
  var c = SCFG[curS];
  var stm=document.getElementById('stm'), sts=document.getElementById('sts'), sth=document.getElementById('sth');
  if (stm) stm.textContent = MESES[curM]+' - '+rangoDelMes(curY, curM);
  if (sts) sts.textContent = c.lbl;
  if (sth) sth.textContent = c.h;
}

// ================================================================
// MONTH TABLE
// ================================================================
function renderTable() {
  if (weekMode) { renderWeekTable(); return; }
  var area  = document.getElementById('sarea');
  if (!area) return;
  var dias  = diasDelMes(curY, curM);
  var today = new Date();
  var all   = visibleStaff();

  var th = '<thead><tr><th class="nch" style="position:sticky;left:0;top:0;z-index:20;background:var(--surface);min-width:100px;text-align:center">Personal</th>';
  dias.forEach(function(dia){
    var we  = dia.dow===0||dia.dow===6;
    var tod = esHoy(dia, today);
    th += '<th class="dh'+(we?' we':'')+(tod?' tod':'')+'">'+DC[dia.dow]+'<br><span style="font-size:.95rem;font-weight:700">'+etiquetaDia(dia, curM)+'</span></th>';
  });
  th += '</tr></thead>';

  var tb = '<tbody>';
  var lastR = null;
  all.forEach(function(s, si){
    if (s.role !== lastR) {
      if (si > 0) tb += '<tr class="gs"><td colspan="'+(dias.length+1)+'"></td></tr>';
      lastR = s.role;
    }
    tb += '<tr><td class="nc"><div style="display:flex;align-items:center;justify-content:center;gap:2px" class="nc-row">'
       +  '<div style="text-align:center;line-height:1.15"><span style="color:'+RCOL[s.role]+';font-weight:600;font-size:.74rem">'+s.name+'</span><span class="rt r'+s.role+'">'+RLBL[s.role]+'</span></div>'
       +  (fijoDe(s.id)
             ? '<button onclick="rellenarMes(\''+s.id+'\')" class="hide-btn" title="Rellenar el mes con su turno fijo">&#9776;</button>'
             : '')
       +  '<button onclick="toggleHide(\''+s.id+'\')" class="hide-btn" title="Ocultar">O</button>'
       +  '</div></td>';
    dias.forEach(function(dia){
      var d    = dia.d;
      var cell = gcAt(s.id, dia);
      var we   = dia.dow===0||dia.dow===6;
      var est  = cell ? cell.estado : 'libre';
      var cls  = ECLS[est]||'el';
      var inn  = '';
      if (est === 'trabajo' && cell && cell.inicio) {
        var hIni = parseInt(cell.inicio.split(':')[0]);
        var autoA = hIni>=7&&hIni<=12 ? 'flex-start' : hIni>=13&&hIni<=15 ? 'center' : 'flex-end';
        var align = cell.align || autoA;
        var pad   = align==='flex-start' ? 'margin-left:-2px' : align==='flex-end' ? 'margin-right:-2px' : '';
        var radius= align==='flex-start' ? 'border-radius:0 5px 5px 0' : align==='flex-end' ? 'border-radius:5px 0 0 5px' : 'border-radius:5px';
        var bgCol = shiftBg(align);
        /* El bloque ocupa dos tercios de la celda y se pega al lado que
           le toca, con dos rayas finas partiendo el dia en tres: asi se
           ve de un golpe si es de manana (izquierda), de tarde (centro)
           o de noche (derecha), sin leer la hora. */
        var rayaM = function(x){ return '<div style="position:absolute;top:3px;bottom:3px;left:'+x+
                    '%;width:1px;background:rgba(128,128,128,.16)"></div>'; };
        inn = '<div style="position:relative;width:100%;display:flex;justify-content:'+align+';'+pad+'">'
            + rayaM(33.33) + rayaM(66.66)
            + '<span class="tb '+cls+'" style="position:relative;min-width:62%;justify-content:center;'+radius+';background:'+bgCol+';color:'+letraSobre(bgCol)+'" onclick="openCell(\''+s.id+'\','+d+',event,'+dia.m+','+dia.y+')">'
            + '<span class="th">'+fmtC(cell.inicio)+'-'+fmtC(cell.fin)
            + (esPartido(cell) ? '<br>'+fmtC(cell.inicio2)+'-'+fmtC(cell.fin2) : '')
            + '</span></span></div>';
        if (cell.nota) inn += '<div style="width:100%;display:flex;justify-content:'+align+';'+pad+'"><span style="font-size:.6rem;color:var(--text2);max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cell.nota+'</span></div>';
      } else if (est !== 'libre') {
        var lbl = est==='baja'?'B':est==='ausencia'?'A':EICO[est]||est;
        inn = '<span class="tb '+cls+'" onclick="openCell(\''+s.id+'\','+d+',event,'+dia.m+','+dia.y+')">'+lbl+'</span>';
      } else {
        inn = '<span class="tb '+cls+'" onclick="openCell(\''+s.id+'\','+d+',event,'+dia.m+','+dia.y+')">+</span>';
      }
      tb += '<td style="'+(we?'background:rgba(30,28,20,.5)':'')+'"><div class="ci">'+inn+'</div></td>';
    });
    tb += '</tr>';
  });

  // Ocultos
  var hiddenStaff = staff().filter(function(s){ return hidden[s.id]; });
  if (hiddenStaff.length > 0) {
    tb += '<tr class="gs"><td colspan="'+(dias.length+1)+'"></td></tr>';
    tb += '<tr><td class="nc" colspan="'+(dias.length+1)+'" style="padding:7px 12px;background:#1a1410">'
        + '<span style="font-size:.7rem;color:var(--text2);margin-right:8px">Ocultos:</span>'
        + hiddenStaff.map(function(s){
            return '<button onclick="toggleHide(\''+s.id+'\')" style="background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);color:var(--gold);border-radius:10px;padding:2px 9px;cursor:pointer;font-size:.73rem;font-family:\'DM Sans\',sans-serif;margin-right:4px">'+s.name+' Mostrar</button>';
          }).join('')
        + '</td></tr>';
  }
  tb += '</tbody>';
  area.innerHTML = '<table class="sched">'+th+tb+'</table>';
}

// ================================================================
// WEEK TABLE
// ================================================================
function renderWeekTable() {
  updateWeekLabel();
  var area = document.getElementById('sarea');
  if (!area) return;
  var all  = visibleStaff();
  var dias = [];
  for (var i = 0; i < 7; i++) {
    var dd = new Date(weekStart);
    dd.setDate(dd.getDate()+i);
    dias.push(dd);
  }
  var today = new Date();
  var fmt   = function(d){ return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear(); };
  var end   = new Date(weekStart); end.setDate(end.getDate()+6);

  var th = '<thead><tr><th style="background:var(--surface);color:var(--gold);font-size:.72rem;padding:5px 8px;border:1px solid var(--border);text-align:left;width:96px;min-width:96px">Personal</th>';
  dias.forEach(function(dd){
    var dow = dd.getDay(); var we = dow===0||dow===6;
    var tod = dd.toDateString()===today.toDateString();
    var bg  = tod?'rgba(201,168,76,.22)':(we?'var(--surface2)':'var(--surface)');
    var col = tod?'var(--gold2)':(we?'var(--gold)':'var(--text2)');
    th += '<th style="background:'+bg+';color:'+col+';padding:6px 4px;border:1px solid var(--border);border-bottom:3px solid '+(we?'var(--gold)':'var(--border)')+';text-align:center;min-width:140px">'
        + '<div style="font-weight:900;font-size:1rem;letter-spacing:.04em">'+DC_FULL[dow].substring(0,3)+'</div>'
        + '<div style="font-size:.78rem;opacity:.85;margin-top:2px">'+dd.getDate()+'/'+(dd.getMonth()+1)+'</div>'
        + '</th>';
  });
  th += '</tr></thead>';

  var tb = '<tbody>';
  var lastR = null;
  all.forEach(function(s, si){
    if (s.role !== lastR) {
      if (si > 0) tb += '<tr><td colspan="8" style="height:2px;background:var(--border);padding:0;border:none"></td></tr>';
      lastR = s.role;
    }
    tb += '<tr>';
    tb += '<td style="background:var(--surface);position:sticky;left:0;z-index:8;padding:3px 8px;border:1px solid var(--border);width:96px;min-width:96px;box-shadow:2px 0 0 var(--border)">'
        + '<span style="color:'+RCOL[s.role]+';font-weight:700;font-size:.76rem;line-height:1.15;white-space:nowrap">'+s.name+'</span>'
        + '</td>';
    dias.forEach(function(dd){
      var m  = dd.getMonth(), y = dd.getFullYear(), d = dd.getDate();
      var dow = dd.getDay(); var we = dow===0||dow===6;
      var savedM = curM, savedY = curY;
      curM = m; curY = y;
      var cell = gc(s.id, d);
      curM = savedM; curY = savedY;
      var est = cell ? cell.estado : 'libre';
      var inner = '';
      if (est === 'trabajo' && cell && cell.inicio) {
        var hIni = parseInt(cell.inicio.split(':')[0]);
        var autoA = hIni>=7&&hIni<=12 ? 'flex-start' : hIni>=13&&hIni<=15 ? 'center' : 'flex-end';
        var walign  = cell.align || autoA;
        /* En la semana sobra sitio, asi que el turno se pega del todo al
           lado que le toca: a la izquierda la manana, al medio la tarde
           y a la derecha la noche. Dos rayas finas parten la celda en
           tres, para que la posicion se vea de un golpe sin leer la
           hora. El bloque pierde la esquina por el lado que toca el
           borde, como en el cuadrante del mes. */
        var wradius = walign==='flex-start' ? 'border-radius:0 7px 7px 0' : walign==='flex-end' ? 'border-radius:7px 0 0 7px' : 'border-radius:7px';
        var wbgCol  = shiftBg(walign);
        var raya = function(x){ return '<div style="position:absolute;top:5px;bottom:5px;left:'+x+
                   '%;width:1px;background:rgba(255,255,255,.07)"></div>'; };
        inner = '<div style="position:relative;width:100%;height:40px;display:flex;align-items:center;justify-content:'+walign+'">'
              + raya(33.33) + raya(66.66)
              + '<div title="' + textoTurno(cell) + '" style="position:relative;display:inline-flex;align-items:center;justify-content:center;gap:3px;'
              +   'min-width:42%;'+wradius+';background:'+wbgCol+';padding:4px 9px;box-shadow:0 1px 3px rgba(0,0,0,.35)">'
              + '<div style="font-size:.92rem;font-weight:900;color:'+letraSobre(wbgCol)+';white-space:nowrap">'+fmtC(cell.inicio)+'</div>'
              + '<div style="font-size:.82rem;font-weight:700;color:'+letraFloja(wbgCol)+'">-'+fmtC(cell.fin)+'</div>'
              + (esPartido(cell)
                  ? '<div style="font-size:.82rem;font-weight:700;color:'+letraFloja(wbgCol)+'">/ '+fmtC(cell.inicio2)+'-'+fmtC(cell.fin2)+'</div>'
                  : '')
              + (cell.nota?'<div style="font-size:.62rem;color:'+letraFloja(wbgCol)+';margin-left:2px">'+cell.nota+'</div>':'')
              + '</div>'
              + '</div>';
      } else if (est === 'vacaciones') { inner = 'VAC'; }
      else if (est === 'festivo')      { inner = 'FES'; }
      else if (est === 'baja')         { inner = 'BAJ'; }
      else if (est === 'ausencia')     { inner = 'AUS'; }
      else { inner = '<div style="color:var(--border);font-size:.9rem">-</div>'; }

      var fullCell = '';
      var pinta = function(clave, letra){
        return {fondo:'background:var(--'+clave+'-lleno);',
                dentro:'<div style="font-weight:900;font-size:1rem;color:var(--'+clave+'-txt)">'+letra+'</div>'};
      };
      var p = inner==='VAC' ? pinta('est-vacaciones','V')
            : inner==='FES' ? pinta('est-festivo','F')
            : inner==='BAJ' ? pinta('est-baja','B')
            : inner==='AUS' ? pinta('est-ausencia','A') : null;
      if (p) { fullCell = p.fondo; inner = p.dentro; }

      var wrapAlign = est==='trabajo' ? '' : 'justify-content:center;';
      tb += '<td onclick="openCell(\''+s.id+'\','+d+',event,'+m+','+y+')" style="'+fullCell+'border:1px solid var(--border);border-bottom:2px solid var(--border);padding:0;vertical-align:middle;cursor:pointer;text-align:center" onmouseover="this.style.filter=\'brightness(1.3)\'" onmouseout="this.style.filter=\'none\'">'
          + (est==='trabajo' && cell && cell.inicio
              ? inner
              : '<div style="width:100%;height:40px;display:flex;align-items:center;'+wrapAlign+'">'+inner+'</div>')
          + '</td>';
    });
    tb += '</tr>';
  });
  tb += '</tbody>';

  area.innerHTML =
    '<div style="padding:5px 10px;background:var(--surface);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">'
    + '<span style="font-family:\'Playfair Display\',serif;font-size:.85rem;color:var(--gold2)">Horario - '+MESES[curM]+' '+curY+'</span>'
    + '<span style="font-size:.63rem;color:var(--text2);margin-left:14px">'
    +   '<span style="color:'+cssVar('--shift-l','#1a4a2e')+';font-weight:900">&#9608;</span> izquierda: ma&ntilde;ana &nbsp; '
    +   '<span style="color:'+cssVar('--shift-c','#1a1814')+';font-weight:900">&#9608;</span> centro: tarde &nbsp; '
    +   '<span style="color:'+cssVar('--shift-r','#2a1a0a')+';font-weight:900">&#9608;</span> derecha: noche'
    + '</span>'
    + '<span style="font-size:.65rem;color:var(--text2)">'+fmt(weekStart)+' - '+fmt(end)+' - '+SCFG[curS].lbl+'</span>'
    + '</div>'
    + '<div id="wk-scaler" style="overflow:hidden;width:100%">'
    + '<div id="wk-inner" style="transform-origin:top left">'
    + '<table id="wk-tbl" style="border-collapse:collapse;table-layout:auto;width:100%;font-family:\'DM Sans\',sans-serif;background:var(--bg);white-space:nowrap">'+th+tb+'</table>'
    + '</div></div>';

  setTimeout(function(){
    var sc  = document.getElementById('wk-scaler');
    var tbl = document.getElementById('wk-tbl');
    var inn = document.getElementById('wk-inner');
    if (!sc||!tbl||!inn) return;
    var ratio = sc.offsetWidth / tbl.offsetWidth;
    if (ratio < 1) {
      inn.style.transform = 'scale('+ratio+')';
      sc.style.height = (tbl.offsetHeight * ratio) + 'px';
    }
  }, 50);
}

// ================================================================
// COVERAGE
// ================================================================
/* Si alguien esta trabajando en esa hora del reloj. La hora va de s0 a
   s1 (las 21:00 son de 21:00 a 21:59) y el turno de a a b.

   Con el turno que cruza la medianoche (a mayor que b) se trabaja de a
   a las doce y de las doce a b, y basta con pisar un trozo de la hora:
   antes se pedia la hora entera por los dos lados, asi que el que
   entraba a las 21:30 no salia en las nueve y el que se iba a las 02:30
   no salia en las dos. */
function isW(ini, fin, slot) {
  if (!ini||!fin) return false;
  var a = parseInt(ini.split(':')[0])*60+parseInt(ini.split(':')[1]);
  var b = parseInt(fin.split(':')[0])*60+parseInt(fin.split(':')[1]);
  var s0 = slot*60, s1 = slot*60+59;
  return a < b ? (s0 < b && s1 >= a) : (s1 >= a || s0 < b);
}
function cbg(n) {
  if (n===0) return {bg:'#16140f',fg:'#3a3530'};
  if (n<=2)  return {bg:'#0d2e14',fg:'#ffffff'};
  if (n<=4)  return {bg:'#0f4a1e',fg:'#ffffff'};
  if (n<=6)  return {bg:'#1a7a32',fg:'#ffffff'};
  return            {bg:'#22a845',fg:'#ffffff'};
}
function renderCov() {
  var tbl  = document.getElementById('covtbl');
  ponerChapa('cov-mes', rotuloMes(curY, curM));
  if (!tbl) return;
  var dias = diasDelMes(curY, curM);
  var all  = visibleStaff();
  var today= new Date();
  // Se indexa por la posicion en el mes, no por el numero del dia: el mes
  // puede llevar un 30 y un 1 y se pisarian entre ellos.
  var cov  = {}, who = {};
  SLOTS.forEach(function(slot){
    cov[slot] = {}; who[slot] = {};
    dias.forEach(function(dia, i){ cov[slot][i]=0; who[slot][i]=[]; });
  });
  dias.forEach(function(dia, i){
    all.forEach(function(s){
      var cell = gcAt(s.id, dia);
      if (!cell||cell.estado!=='trabajo') return;
      SLOTS.forEach(function(slot){
        if (isW(cell.inicio, cell.fin, slot) ||
            (esPartido(cell) && isW(cell.inicio2, cell.fin2, slot))) {
          cov[slot][i]++;
          who[slot][i].push(s.name.split(' ')[0]);
        }
      });
    });
  });
  var html = '<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:8px 14px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Hora</th>';
  dias.forEach(function(dia){
    var we  = dia.dow===0||dia.dow===6;
    var tod = esHoy(dia, today);
    html += '<th style="background:'+(tod?'rgba(201,168,76,.18)':(we?'#1e1c14':'var(--surface)'))+';color:'+(tod?'var(--gold2)':(we?'var(--gold)':'var(--text2)'))+';padding:7px 4px;border:1px solid var(--border);text-align:center;min-width:38px;font-size:.7rem;white-space:nowrap">'+DC[dia.dow]+'<br><span style="font-size:.88rem;font-weight:700">'+etiquetaDia(dia, curM)+'</span></th>';
  });
  html += '</tr></thead><tbody>';
  SLOTS.forEach(function(slot, si){
    var isMid = slot <= 2;               // de madrugada: 00, 01 y 02
    var lbl   = (slot<10?'0':'')+slot+':00';
    if (slot===12||slot===20) html += '<tr><td colspan="'+(dias.length+1)+'" style="height:3px;background:var(--border);padding:0;border:none"></td></tr>';
    var rbg = isMid?'rgba(142,68,173,.07)':(si%2===0?'rgba(255,255,255,.013)':'transparent');
    html += '<tr style="background:'+rbg+'"><td style="position:sticky;left:0;z-index:5;background:'+(isMid?'rgba(142,68,173,.15)':'var(--surface)')+';color:'+(isMid?'#c090e8':'var(--gold)')+';font-weight:700;font-size:.8rem;padding:6px 14px;border:1px solid var(--border);white-space:nowrap">'+lbl+(isMid?' L':'')+' </td>';
    dias.forEach(function(dia, i){
      var n   = cov[slot][i];
      var col = cbg(n);
      var tip = n===0?'Nadie':n+' persona'+(n>1?'s':'')+': '+who[slot][i].join(', ');
      html += '<td title="'+lbl+' Dia '+etiquetaDia(dia, curM)+' - '+tip+'" style="text-align:center;padding:5px 2px;background:'+col.bg+';border:1px solid rgba(46,43,34,.35);cursor:default;transition:filter .1s" onmouseover="this.style.filter=\'brightness(1.5)\'" onmouseout="this.style.filter=\'none\'">'
            + '<div style="color:'+col.fg+';font-size:'+(n>0?'1.1rem':'.75rem')+';font-weight:'+(n>0?'900':'400')+';line-height:1">'+(n>0?n:'.') +'</div>'
            + (n>0?'<div style="color:rgba(255,255,255,.55);font-size:.56rem;margin-top:1px">pers.</div>':'')
            + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tbl.innerHTML = html;
}

// ================================================================
// POPUP
// ================================================================
function openCell(sid, day, event, mo, yr) {
  event.stopPropagation();
  var savedM = curM, savedY = curY;
  if (mo !== undefined) { curM = mo; curY = yr; }

  if (clip) {
    // La etiqueta se saca antes de devolver curM a su sitio: es la del dia
    // en el que se ha pegado, que puede ser del mes de al lado.
    var donde = etiquetaDia({y:curY, m:curM, d:day}, savedM);
    sc(sid, day, Object.assign({}, clip));
    curM = savedM; curY = savedY;
    renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras(); pegarCabeceras();
    toast('Turno pegado en el '+donde);
    return;
  }

  active = {sid:sid, day:day, mo:curM, yr:curY};
  var pop  = document.getElementById('popup');
  var cell = gc(sid, day);
  curM = savedM; curY = savedY;

  var est = cell ? cell.estado : 'libre';
  var s   = staff().find(function(x){ return x.id===sid; });
  var pt  = document.getElementById('ptitle');
  // Con los meses corridos, un "dia 6" puede ser del mes de al lado: se
  // dice cual para no anotar el turno en el dia equivocado.
  if (pt) pt.textContent = s.name+' - Dia '+etiquetaDia({y:active.yr, m:active.mo, d:day}, savedM);

  document.querySelectorAll('.pb').forEach(function(b){ b.classList.remove('on'); });
  var btn = document.querySelector('.pb[onclick*="\''+est+'\'"]');
  if (btn) btn.classList.add('on');
  if (pop) pop._est = est;

  var ta = document.getElementById('ta');
  var ar = document.getElementById('align-row');
  if (ta) {
    if (est === 'trabajo') {
      ta.style.display = 'block';
      var ini = document.getElementById('ini'); if (ini) ini.value = cell&&cell.inicio?cell.inicio:'';
      var fin = document.getElementById('fin'); if (fin) fin.value = cell&&cell.fin?cell.fin:'';
      var i2 = document.getElementById('ini2'); if (i2) i2.value = cell&&cell.inicio2?cell.inicio2:'';
      var f2 = document.getElementById('fin2'); if (f2) f2.value = cell&&cell.fin2?cell.fin2:'';
      togglePartido(esPartido(cell));
      var nota = document.getElementById('nota'); if (nota) nota.value = cell&&cell.nota?cell.nota:'';
      var hl = document.getElementById('hl');
      if (cell&&cell.inicio) calcFin(); else if (hl) hl.textContent = 'Introduce la hora de entrada';
      if (ar) { ar.style.display='block'; var hIni=cell&&cell.inicio?parseInt(cell.inicio.split(':')[0]):13; var autoA=hIni>=7&&hIni<=12?'flex-start':hIni>=13&&hIni<=15?'center':'flex-end'; selAlign(cell&&cell.align?cell.align:autoA); }
    } else {
      ta.style.display = 'none';
      var nota = document.getElementById('nota'); if (nota) nota.value = cell&&cell.nota?cell.nota:'';
      if (ar) ar.style.display = 'none';
    }
  }

  var conAlgo = !!(cell && cell.estado && cell.estado !== 'libre');
  var cb = document.getElementById('copybtn');
  if (cb) cb.style.display = conAlgo ? 'inline-flex' : 'none';
  var db = document.getElementById('delbtn');
  if (db) db.style.display = conAlgo ? 'inline-flex' : 'none';

  if (pop) {
    pop.style.display = 'block';
    var rect = event.target.closest('td')?event.target.closest('td').getBoundingClientRect():event.target.getBoundingClientRect();
    var top = rect.bottom+5, left = rect.left;
    if (left+215>window.innerWidth) left = window.innerWidth-220;
    if (top+290>window.innerHeight) top = rect.top-295;
    pop.style.top  = top+'px';
    pop.style.left = left+'px';
  }
}

function calcFin() {
  var ini = document.getElementById('ini');
  if (!ini||!active) return;
  var v = ini.value; if (!v) return;
  var pop = document.getElementById('popup');
  var partido = !!(pop && pop._partido);
  var h = tgtH(active.sid);
  var felm = document.getElementById('fin');
  var fs;
  /* Con turno partido la salida no se puede adivinar: el primer tramo no
     dura la jornada entera. Se escriben los dos a mano y aqui se dice lo
     que suman contra las horas que tocan. */
  if (partido) {
    fs = felm ? felm.value : '';
  } else {
    var p = v.split(':');
    var tot = parseInt(p[0])*60+parseInt(p[1])+h*60;
    var fh = Math.floor(tot/60)%24, fm = tot%60;
    fs = (fh<10?'0':'')+fh+':'+(fm<10?'0':'')+fm;
    if (felm) felm.value = fs;
  }
  var s2 = staff().find(function(x){ return x.id===active.sid; });
  var rl = s2.role==='enc'?'Encargado':s2.role==='coc'?'Cocinero':'Camarero';
  var hl = document.getElementById('hl');
  if (!hl) return;
  if (partido) {
    var i2 = (document.getElementById('ini2')||{}).value||'';
    var f2 = (document.getElementById('fin2')||{}).value||'';
    var suma = Math.round(((minutosDe(v,fs)+minutosDe(i2,f2))/60)*10)/10;
    hl.innerHTML = '<span style="color:var(--gold2);font-weight:600">'+suma+'h</span> de '+h+'h - '+rl+
                   ' - partido: '+fmtH(v)+'-'+fmtH(fs)+
                   (i2&&f2 ? ' y '+fmtH(i2)+'-'+fmtH(f2) : ' y falta el segundo tramo');
  } else {
    hl.innerHTML = '<span style="color:var(--gold2);font-weight:600">'+h+'h</span> - '+rl+' - '+(curS==='verano'?'Verano':'Invierno')+' - '+fmtH(v)+' to '+fmtH(fs);
  }
}

/* Enseña o esconde el segundo tramo. Con un valor se pone como se le
   diga (al abrir un dia ya guardado); sin el, es el boton. */
function togglePartido(forzar) {
  var pop = document.getElementById('popup'); if (!pop) return;
  var fila = document.getElementById('partido-row');
  var btn  = document.getElementById('partido-btn');
  var on   = (forzar === undefined) ? !pop._partido : !!forzar;
  pop._partido = on;
  if (fila) fila.style.display = on ? 'block' : 'none';
  if (btn) {
    btn.textContent = on ? '- Quitar el segundo turno' : '+ Turno partido';
    btn.style.color = on ? 'var(--gold2)' : 'var(--text2)';
  }
  if (!on) {
    var i2 = document.getElementById('ini2'); if (i2) i2.value = '';
    var f2 = document.getElementById('fin2'); if (f2) f2.value = '';
  }
  /* Al abrirlo a mano se recalcula la pista; al pintar un dia guardado no,
     que ya lo hace quien llama. */
  if (forzar === undefined) calcFin();
}

/* Guarda un estado sin datos extra (festivo, vacaciones, baja, ausencia)
   y cierra. Solo "Trabaja" necesita el paso de Guardar, porque hay que
   escribir las horas. */
function aplicarEstado(est) {
  if (!active) return;
  var dia = active.day;
  var savedM = curM, savedY = curY;
  if (active.mo !== undefined) { curM = active.mo; curY = active.yr; }
  var previo = gc(active.sid, active.day) || {};
  sc(active.sid, active.day, {estado: est, nota: previo.nota || ''});
  curM = savedM; curY = savedY;
  closePopup(); renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras();
  var comoSeLlama = {festivo:'Festivo', vacaciones:'Vacaciones', baja:'Baja', ausencia:'Ausencia'};
  toast((comoSeLlama[est] || est) + ' · día ' + dia);
}

function selE(est) {
  var pop = document.getElementById('popup'); if (!pop) return;
  /* Marcar "Libre" es querer vaciar el dia: se hace ya, sin Guardar. */
  if (est === 'libre') { borrarCelda(); return; }
  /* Los demas, salvo un turno con horas, tambien se aplican en el acto. */
  if (est !== 'trabajo') { aplicarEstado(est); return; }
  pop._est = est;
  document.querySelectorAll('.pb').forEach(function(b){ b.classList.remove('on'); });
  event.target.classList.add('on');
  var ta = document.getElementById('ta'); if (!ta) return;
  var ar = document.getElementById('align-row');
  if (est === 'trabajo') {
    ta.style.display = 'block';
    var ini = document.getElementById('ini'); var hl = document.getElementById('hl');
    if (ini&&ini.value) calcFin(); else if (hl) hl.textContent = 'Introduce la hora de entrada';
    if (ar) { ar.style.display='block'; selAlign(pop._align||'center'); }
  } else {
    ta.style.display = 'none';
    if (ar) ar.style.display = 'none';
  }
}

function selAlign(a) {
  var pop = document.getElementById('popup'); if (!pop) return;
  pop._align = a;
  var map = {'flex-start':'ab-l','center':'ab-c','flex-end':'ab-r'};
  ['ab-l','ab-c','ab-r'].forEach(function(id){
    var b = document.getElementById(id); if (!b) return;
    var active = id===map[a];
    b.style.background   = active?'var(--gold)':'var(--surface)';
    b.style.color        = active?'#0f0e0b':'var(--text2)';
    b.style.borderColor  = active?'var(--gold)':'var(--border)';
  });
}

function saveCell() {
  if (!active) return;
  var pop = document.getElementById('popup'); if (!pop) return;
  var est = pop._est||'libre';
  var data = {estado:est};
  if (est === 'trabajo') {
    var ini = document.getElementById('ini'); data.inicio = ini?ini.value:'';
    var fin = document.getElementById('fin'); data.fin    = fin?fin.value:'';
    /* El segundo tramo solo se guarda si esta entero: medio turno
       partido no es nada. */
    var i2 = document.getElementById('ini2'), f2 = document.getElementById('fin2');
    if (pop._partido && i2 && f2 && i2.value && f2.value) {
      data.inicio2 = i2.value; data.fin2 = f2.value;
    }
    if (pop._align) data.align = pop._align;
  }
  var nota = document.getElementById('nota'); data.nota = nota?nota.value:'';
  var savedM = curM, savedY = curY;
  if (active.mo !== undefined) { curM = active.mo; curY = active.yr; }
  sc(active.sid, active.day, data);
  curM = savedM; curY = savedY;
  closePopup(); renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras();
}

/* Vacia el dia y cierra: un solo toque, sin elegir "Libre" ni Guardar. */
function borrarCelda() {
  if (!active) return;
  var savedM = curM, savedY = curY;
  if (active.mo !== undefined) { curM = active.mo; curY = active.yr; }
  var mes = (sched[curY] || {})[curM] || {};
  if (mes[active.sid]) delete mes[active.sid][active.day];
  save();
  curM = savedM; curY = savedY;
  closePopup(); renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras();
  toast('Día vaciado');
}

function copyCell() {
  if (!active) return;
  var savedM=curM, savedY=curY;
  if (active.mo!==undefined){curM=active.mo;curY=active.yr;}
  var cell = gc(active.sid, active.day);
  curM=savedM; curY=savedY;
  if (!cell) return;
  clip = Object.assign({}, cell);
  var s = staff().find(function(x){ return x.id===active.sid; });
  var desc = cell.estado==='trabajo'&&cell.inicio?textoTurno(cell):cell.estado;
  var ci = document.getElementById('clip-info'); if (ci) ci.textContent = 'Copiado: '+s.name+' - '+desc;
  var cs = document.getElementById('clip-sub'); if (cs) cs.textContent = 'Haz clic en cualquier celda para pegar';
  var banner = document.getElementById('clip-banner'); if (banner) banner.classList.add('show');
  closePopup(); toast('Turno copiado');
}

function clearClip() {
  clip = null;
  var banner = document.getElementById('clip-banner'); if (banner) banner.classList.remove('show');
}

function closePopup() {
  var pop = document.getElementById('popup'); if (pop) pop.style.display='none';
  active = null;
}

document.addEventListener('click', function(e){
  var pop = document.getElementById('popup');
  if (pop&&pop.style.display!=='none'&&!pop.contains(e.target)) closePopup();
});

// ================================================================
// EL HORARIO DE LA SEMANA, PARA MANDARLO
// ================================================================
// De lunes a domingo, que es como se trabaja la semana aqui y como se
// cuentan las horas en toda la app. Sale el mismo cuadrante que se ve en
// pantalla, escrito en corto para que se lea en el movil: cada dia con
// quien entra y a que hora, y al final las horas de cada uno. Se puede
// mandar entero o el de una sola persona, para el que solo quiere saber
// lo suyo.
var waSemanaLunes = null;   // el lunes de la semana que se esta mirando
var waSemanaQuien = '';     // '' = todos; si no, el id de la persona
var waSemanaPara  = '';     // a quien se le manda; '' = elegir el chat a mano
/* La agenda de a quien se le manda el horario: nombre y telefono, tantos
   como quiera. Va aparte del personal porque no siempre coinciden —el
   cuadrante se le manda tambien a quien no sale en el—, y viaja a GitHub
   con el resto del horario. */
var waGente = [];
function cargarWaGente(){
  try { waGente = JSON.parse(localStorage.getItem('rwa')) || []; }
  catch(e){ waGente = []; }
  if (!Array.isArray(waGente)) waGente = [];
}
function guardarWaGente(){
  try { localStorage.setItem('rwa', JSON.stringify(waGente)); } catch(e){}
}
/* WhatsApp quiere el numero sin mas: sin +, ni espacios, ni guiones. */
function telLimpio(t){ return String(t||'').replace(/[^0-9]/g,''); }

/* A quien se le manda el horario: primero todos los que trabajan aqui,
   que son los de siempre y ya estan escritos en Personal, y detras los
   de fuera que se apunten a mano. El telefono de cada persona vive con
   ella en Personal; el de los de fuera, en esta lista. */
function waDestinos(){
  /* Solo los que trabajan: visibleStaff() deja fuera a los que has
     ocultado en el cuadrante, que son los que ya no estan. */
  var lista = visibleStaff().map(function(s){
    return {id:s.id, nombre:s.name, tel:s.tel||'', personal:true};
  });
  return lista.concat(waGente.map(function(g){
    return {id:g.id, nombre:g.nombre, tel:g.tel||'', personal:false};
  }));
}
function waDestinoDe(id){
  return waDestinos().filter(function(d){ return d.id===id; })[0] || null;
}
/* El telefono de alguien del personal se guarda en su ficha, que es
   donde esta su nombre y donde viaja con el resto del horario. */
function ponerTelPersonal(id, tel){
  [ENC, COC, CAM].forEach(function(l){
    l.forEach(function(p){ if (p.id===id) p.tel = telLimpio(tel); });
  });
  save();
}

function lunesDeLaSemana(){
  if (weekMode && weekStart) return new Date(weekStart);
  return getMondayOf(new Date());
}
function diasDeLaSemana(lunes){
  var lista=[];
  for (var i=0;i<7;i++){ var d=new Date(lunes); d.setDate(d.getDate()+i); lista.push(d); }
  return lista;
}
function celdaDeFecha(sid, fecha){
  var sM=curM, sY=curY;
  curM=fecha.getMonth(); curY=fecha.getFullYear();
  var c=gc(sid, fecha.getDate());
  curM=sM; curY=sY;
  return c;
}
function dosCifras(n){ return (n<10?'0':'')+n; }
function rangoSemana(lunes){
  var d=diasDeLaSemana(lunes), a=d[0], z=d[6];
  var m=['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
         'septiembre','octubre','noviembre','diciembre'];
  return a.getMonth()===z.getMonth()
    ? a.getDate()+' - '+z.getDate()+' de '+m[z.getMonth()]
    : a.getDate()+' de '+m[a.getMonth()]+' - '+z.getDate()+' de '+m[z.getMonth()];
}

function textoSemana(lunes, sid){
  var quien = sid ? staff().filter(function(s){ return s.id===sid; }) : visibleStaff();
  var nombres = {festivo:'Festivo', vacaciones:'Vacaciones', baja:'Baja', ausencia:'Ausencia'};
  var l = [];
  l.push('*HORARIO ' + rangoSemana(lunes).toUpperCase() + '*');
  if (sid && quien.length) l.push(quien[0].name);
  l.push('');

  var horas = {};
  diasDeLaSemana(lunes).forEach(function(dd){
    var lineas = [];
    quien.forEach(function(s){
      var c = celdaDeFecha(s.id, dd);
      if (!c || !c.estado || c.estado==='libre') return;
      var txt;
      if (c.estado==='trabajo') {
        txt = c.inicio ? (fmtH(c.inicio)+'-'+fmtH(c.fin) +
                (esPartido(c) ? ' y '+fmtH(c.inicio2)+'-'+fmtH(c.fin2) : '')) : 'trabaja';
        horas[s.id] = (horas[s.id]||0) + horasDeCelda(c);
      } else {
        txt = nombres[c.estado] || c.estado;
      }
      lineas.push('  ' + (sid ? '' : s.name + ': ') + txt + (c.nota ? ' ('+c.nota+')' : ''));
    });
    l.push('*'+DC_FULL[dd.getDay()].toUpperCase()+' '+dd.getDate()+'/'+dosCifras(dd.getMonth()+1)+'*');
    l = l.concat(lineas.length ? lineas : ['  -']);
    l.push('');
  });

  var conHoras = quien.filter(function(s){ return horas[s.id]; });
  if (conHoras.length) {
    l.push('*Horas de la semana*');
    conHoras.forEach(function(s){
      l.push('  '+(sid?'':s.name+': ')+(Math.round(horas[s.id]*10)/10)+'h');
    });
  }
  return l.join('\n').trim();
}

function abrirSemanaWA(){
  cargarWaGente();
  waSemanaLunes = lunesDeLaSemana();
  waSemanaQuien = '';
  pintarSemanaWA();
  var ov=document.getElementById('waov'); if (ov) ov.classList.add('show');
}
function cerrarSemanaWA(){
  var ov=document.getElementById('waov'); if (ov) ov.classList.remove('show');
}
function waSemanaMover(pasos){
  waSemanaLunes.setDate(waSemanaLunes.getDate()+pasos*7);
  pintarSemanaWA();
}
function waSemanaDe(sid){ waSemanaQuien=sid||''; pintarSemanaWA(); }
function waSemanaPara_(id){ waSemanaPara=id||''; pintarSemanaWA(); }
/* El mismo formulario vale para apuntar a alguien de fuera y para
   ponerle el telefono a uno del personal: si viene con una persona
   detras, el numero se guarda en su ficha. */
var waEditando = null;
function waNuevaGente(quien){
  waEditando = quien || null;
  var c=document.getElementById('wa-nueva');
  var n=document.getElementById('wa-nombre'), t=document.getElementById('wa-tel');
  if (c) c.style.display='flex';
  if (n) { n.value = waEditando ? waEditando.nombre : ''; n.readOnly = !!waEditando; }
  if (t) { t.value = waEditando ? (waEditando.tel||'') : ''; }
  var foco = waEditando ? t : n; if (foco) foco.focus();
}
function waCerrarNueva(){
  waEditando = null;
  var c=document.getElementById('wa-nueva'); if (c) c.style.display='none';
  var n=document.getElementById('wa-nombre'); if (n) n.readOnly=false;
}
function waGenteGuardar(){
  var n=document.getElementById('wa-nombre'), t=document.getElementById('wa-tel');
  var nombre=(n&&n.value||'').trim(), tel=telLimpio(t&&t.value);
  if (!nombre) { toast('Ponle un nombre'); return; }
  if (!tel)    { toast('Pon el telefono con el pais: +376...'); return; }
  if (waEditando && waEditando.personal) {
    ponerTelPersonal(waEditando.id, tel);
    waSemanaPara = waEditando.id;
    toast('Telefono de '+nombre+' guardado');
  } else if (waEditando) {
    waGente.forEach(function(g){ if (g.id===waEditando.id) g.tel = tel; });
    guardarWaGente();
    waSemanaPara = waEditando.id;
    toast('Telefono de '+nombre+' guardado');
  } else {
    waGente.push({id:'w_'+Date.now(), nombre:nombre, tel:tel});
    guardarWaGente();
    waSemanaPara = waGente[waGente.length-1].id;
    toast(nombre+' añadido');
  }
  if (n) n.value=''; if (t) t.value='';
  waCerrarNueva();
  pintarSemanaWA();
}
/* Al pulsar un nombre: si tiene telefono, queda elegido; si no, se pide
   ahi mismo en vez de mandar a otra pantalla. */
function waElegir(id){
  var d = waDestinoDe(id);
  if (!d) return;
  if (!d.tel) { waNuevaGente(d); return; }
  waSemanaPara = id;
  pintarSemanaWA();
}
function waGenteQuitar(id, ev){
  if (ev) ev.stopPropagation();
  var d = waDestinoDe(id); if (!d) return;
  /* Del personal no se borra a nadie desde aqui —eso es cosa de
     Personal—: se le quita el telefono y en paz. */
  if (d.personal) {
    if (!confirm('Quitarle el telefono a '+d.nombre+'?')) return;
    ponerTelPersonal(id, '');
  } else {
    if (!confirm('Quitar a '+d.nombre+' de la lista?')) return;
    waGente = waGente.filter(function(g){ return g.id!==id; });
    guardarWaGente();
  }
  if (waSemanaPara===id) waSemanaPara='';
  pintarSemanaWA();
}
function pintarSemanaWA(){
  var r=document.getElementById('wa-rango');
  if (r) r.textContent = rangoSemana(waSemanaLunes);
  var caja=document.getElementById('wa-quien');
  if (caja) {
    var botones = [{id:'', name:'Todos'}].concat(visibleStaff());
    caja.innerHTML = botones.map(function(s){
      var on = (waSemanaQuien===s.id);
      return '<button onclick="waSemanaDe(\''+s.id+'\')" style="background:'+(on?'#25d366':'var(--surface)')+
             ';border:1px solid '+(on?'#25d366':'var(--border)')+';color:'+(on?'#06301a':'var(--text2)')+
             ';border-radius:5px;padding:3px 9px;cursor:pointer;font-size:.75rem">'+s.name+'</button>';
    }).join('');
  }
  var caja2=document.getElementById('wa-gente');
  if (caja2) {
    var html = waDestinos().map(function(g){
      var on=(waSemanaPara===g.id);
      var sinTel=!g.tel;
      return '<span style="display:inline-flex;align-items:center;background:'+(on?'#25d366':'var(--surface)')+
             ';border:1px '+(sinTel?'dashed':'solid')+' '+(on?'#25d366':'var(--border)')+
             ';border-radius:5px;overflow:hidden">'+
             '<button onclick="waElegir(\''+g.id+'\')" title="'+
             (sinTel?'Ponle el telefono':'Mandarselo a '+g.nombre)+
             '" style="background:transparent;border:0;color:'+
             (on?'#06301a':(sinTel?'#7a7460':'var(--text2)'))+
             ';padding:3px 7px;cursor:pointer;font-size:.75rem">'+g.nombre+(sinTel?' +tel':'')+'</button>'+
             (sinTel?'':'<button onclick="waGenteQuitar(\''+g.id+'\',event)" title="'+
               (g.personal?'Quitarle el telefono':'Quitarlo de la lista')+'" '+
               'style="background:transparent;border:0;color:'+(on?'#06301a':'#7a3a30')+
               ';padding:3px 6px 3px 0;cursor:pointer;font-size:.7rem">&#10005;</button>')+
             '</span>';
    }).join('');
    var libre=(waSemanaPara==='');
    html += '<button onclick="waSemanaPara_(\'\')" style="background:'+(libre?'#25d366':'var(--surface)')+
            ';border:1px solid '+(libre?'#25d366':'var(--border)')+';color:'+(libre?'#06301a':'var(--text2)')+
            ';border-radius:5px;padding:3px 9px;cursor:pointer;font-size:.75rem">Elegir el chat</button>';
    html += '<button onclick="waNuevaGente()" style="background:transparent;border:1px dashed var(--border);'+
            'color:var(--text2);border-radius:5px;padding:3px 9px;cursor:pointer;font-size:.75rem">+ Otro</button>';
    caja2.innerHTML = html;
  }
  var t=document.getElementById('wa-texto');
  if (t) t.value = textoSemana(waSemanaLunes, waSemanaQuien);
}
function waSemanaEnviar(){
  var t=document.getElementById('wa-texto'); if (!t) return;
  var quien=waDestinoDe(waSemanaPara);
  if (quien && !quien.tel) quien = null;
  /* Con telefono se abre su chat directamente; sin el, WhatsApp pregunta
     a quien —que es lo que hace falta para mandarlo a un grupo, porque a
     los grupos no se llega por el numero. */
  var url = quien ? 'https://wa.me/'+telLimpio(quien.tel)+'?text='+encodeURIComponent(t.value)
                  : 'https://wa.me/?text='+encodeURIComponent(t.value);
  window.open(url, '_blank');
}
function waSemanaCopiar(btn){
  var t=document.getElementById('wa-texto'); if (!t) return;
  t.select();
  var ok=false;
  try { ok=document.execCommand('copy'); } catch(e){ ok=false; }
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value);
  if (btn){ var v=btn.textContent; btn.textContent='Copiado'; setTimeout(function(){ btn.textContent=v; },1500); }
  toast('Horario copiado');
}

// ================================================================
// HIDE/SHOW
// ================================================================
function toggleHide(sid) {
  var s = staff().find(function(x){ return x.id===sid; });
  if (hidden[sid]) { delete hidden[sid]; toast(s.name+' visible'); }
  else             { hidden[sid]=true;   toast(s.name+' oculto'); }
  save(); renderTable(); renderCov(); renderHours(); renderAusencias(); renderVacaciones(); pegarCabeceras();
}

// ================================================================
// ADD CAMARERO
// ================================================================
function openAddModal() {
  var nn = document.getElementById('nn'); if (nn) nn.value = '';
  renderCamList();
  var addov = document.getElementById('addov'); if (addov) addov.classList.add('show');
  setTimeout(function(){ var nn=document.getElementById('nn'); if(nn)nn.focus(); }, 80);
}
function closeAdd() { var addov=document.getElementById('addov'); if(addov)addov.classList.remove('show'); }
function listaDe(rol){ return rol==='enc' ? ENC : rol==='coc' ? COC : CAM; }

function doAdd() {
  var nn = document.getElementById('nn'); if (!nn) return;
  var name = nn.value.trim(); if (!name) return;
  var sel = document.getElementById('nrol');
  var rol = sel ? sel.value : 'cam';
  listaDe(rol).push({id:'p_'+Date.now(), name:name, role:rol});
  save(); renderCamList(); renderAll();
  nn.value = '';
  nn.focus();
}
// El orden del cuadrante es el de estas listas, asi que colocar a
// alguien en su sitio es moverlo dentro de la suya. Cada uno se mueve
// entre los de su oficio: el cuadrante va por grupos (encargados,
// cocina, sala) y sacarlo de ahi lo dejaria en tierra de nadie.
function moverPersona(id, paso) {
  var lista = null;
  [ENC, COC, CAM].forEach(function(l){
    if (l.some(function(c){ return c.id===id; })) lista = l;
  });
  if (!lista) return;
  var i = -1;
  lista.forEach(function(c, k){ if (c.id===id) i = k; });
  var j = i + paso;
  if (i < 0 || j < 0 || j >= lista.length) return;   // ya esta el primero o el ultimo
  var tmp = lista[i]; lista[i] = lista[j]; lista[j] = tmp;
  save(); renderCamList(); renderAll();
}

// ================================================================
// EL TURNO FIJO DE CADA UNO
// ================================================================
// Hay gente que hace siempre lo mismo: Tamara entra a las siete todos
// los dias y libra los viernes. Eso se guarda con la persona
// -fijo:{ini,fin,libra}- y con un boton se vuelca al mes que estes
// mirando. Solo rellena los dias que esten vacios: lo que ya hayas
// puesto a mano no se toca, y luego se puede cambiar dia a dia como
// siempre.
function personaDe(id) {
  return staff().filter(function(x){ return x.id === id; })[0] || null;
}
function fijoDe(id) {
  var p = personaDe(id);
  return (p && p.fijo) || null;
}
/* Guarda un dato del turno fijo. El dia que libra va de 0 (domingo) a 6
   (sabado), o vacio si no libra ninguno en concreto. */
function setFijo(id, campo, valor) {
  var p = personaDe(id); if (!p) return;
  p.fijo = p.fijo || {ini:'', fin:'', libra:''};
  p.fijo[campo] = valor;
  /* Al escribir la entrada, la salida se rellena sola con las horas que
     le tocan por su oficio y la temporada, si no habia ninguna. */
  if (campo === 'ini' && valor && !p.fijo.fin) {
    var t = valor.split(':');
    var tot = parseInt(t[0])*60 + parseInt(t[1]) + tgtH(id)*60;
    var h = Math.floor(tot/60) % 24, m = tot % 60;
    p.fijo.fin = (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
  }
  if (!p.fijo.ini && !p.fijo.fin && p.fijo.libra === '') delete p.fijo;
  save(); renderCamList();
}

/* Vuelca el turno fijo en los dias vacios del mes que se esta viendo. */
function rellenarMes(id) {
  var f = fijoDe(id); if (!f) return;
  var p = personaDe(id);
  var puestos = 0, libres = 0;
  diasDelMes(curY, curM).forEach(function(dia){
    var hay = ((((sched[dia.y]||{})[dia.m]||{})[id])||{})[dia.d];
    if (hay && hay.estado && hay.estado !== 'libre') return;    // ya hay algo
    var sM = curM, sY = curY; curM = dia.m; curY = dia.y;
    if (f.libra !== '' && dia.dow === +f.libra) { sc(id, dia.d, {estado:'festivo', nota:''}); libres++; }
    else if (f.ini && f.fin)                    { sc(id, dia.d, {estado:'trabajo', inicio:f.ini, fin:f.fin, nota:''}); puestos++; }
    curM = sM; curY = sY;
  });
  renderAll();
  toast(p.name + ': ' + puestos + ' dias de ' + fmtH(f.ini) + '-' + fmtH(f.fin) +
        (libres ? ' y ' + libres + ' de fiesta' : '') + ' en ' + MESES[curM]);
}

function delCam(id) {
  ENC = ENC.filter(function(c){ return c.id!==id; });
  COC = COC.filter(function(c){ return c.id!==id; });
  CAM = CAM.filter(function(c){ return c.id!==id; });
  save(); renderCamList(); renderAll();
}
function renderCamList() {
  var el = document.getElementById('camlist'); if (!el) return;
  var todos = staff();
  if (todos.length === 0) {
    el.innerHTML = '<div style="font-size:.8rem;color:var(--text2);padding:10px 4px;text-align:center">Aun no hay nadie. Anade la primera persona abajo.</div>';
    return;
  }
  el.innerHTML = todos.map(function(c){
    var suya = listaDe(c.role);
    var pos  = -1;
    suya.forEach(function(x, k){ if (x.id===c.id) pos = k; });
    var esPrimero = pos <= 0, esUltimo = pos >= suya.length-1;
    function flecha(paso, signo, apagada, titulo) {
      return '<button onclick="moverPersona(\''+c.id+'\','+paso+')"'+(apagada?' disabled':'')
           + ' title="'+titulo+'" style="background:var(--surface);border:1px solid var(--border);'
           + 'color:'+(apagada?'#3a3530':'var(--text2)')+';border-radius:5px;padding:3px 7px;'
           + 'cursor:'+(apagada?'default':'pointer')+';font-size:.75rem;line-height:1">'+signo+'</button>';
    }
    var f = c.fijo || {ini:'', fin:'', libra:''};
    var dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
    var opciones = '<option value="">no libra fijo</option>' + dias.map(function(d,i){
      return '<option value="'+i+'"'+(String(f.libra)===String(i)?' selected':'')+'>libra '+d.toLowerCase()+'</option>';
    }).join('');
    var tieneFijo = !!(f.ini && f.fin);
    return '<div style="padding:6px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;border:1px solid var(--border)">'
         + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">'
         + '<span style="font-size:.85rem;color:'+RCOL[c.role]+'">'+c.name
         + '<span class="rt r'+c.role+'" style="margin-left:5px">'+RLBL[c.role]+'</span></span>'
         + '<span style="display:flex;gap:4px;align-items:center">'
         + flecha(-1, '&#9650;', esPrimero, 'Subirlo en la lista')
         + flecha( 1, '&#9660;', esUltimo,  'Bajarlo en la lista')
         + '<button onclick="delCam(\''+c.id+'\')" style="background:rgba(192,57,43,.2);border:1px solid rgba(192,57,43,.4);color:#e87c6f;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:.75rem;font-family:\'DM Sans\',sans-serif">X Eliminar</button>'
         + '</span></div>'
         + '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:.7rem;color:var(--text2)">'
         + '<span>Siempre</span>'
         + '<input type="time" value="'+(f.ini||'')+'" onchange="setFijo(\''+c.id+'\',\'ini\',this.value)" style="font-size:.72rem;padding:2px 4px;width:78px">'
         + '<span>a</span>'
         + '<input type="time" value="'+(f.fin||'')+'" onchange="setFijo(\''+c.id+'\',\'fin\',this.value)" style="font-size:.72rem;padding:2px 4px;width:78px">'
         + '<select onchange="setFijo(\''+c.id+'\',\'libra\',this.value)" style="font-size:.72rem;padding:2px 4px">'+opciones+'</select>'
         + (tieneFijo
             ? '<button onclick="rellenarMes(\''+c.id+'\')" title="Poner su turno fijo en los dias vacios del mes que estas viendo" style="background:rgba(39,174,96,.18);border:1px solid rgba(39,174,96,.45);color:var(--est-trabajo);border-radius:5px;padding:2px 8px;cursor:pointer;font-size:.72rem;font-family:\'DM Sans\',sans-serif">Rellenar el mes</button>'
             : '<span style="opacity:.7">pon la hora y saldra el boton de rellenar</span>')
         + '</div></div>';
  }).join('')
    + '<div style="font-size:.7rem;color:var(--text2);padding:6px 4px 0">Las flechas colocan a cada uno '
    + 'donde quieras: el cuadrante sale en este mismo orden. Cada persona se mueve entre las de su '
    + 'oficio.</div>';
}

// ================================================================
// RESET
// ================================================================
function resetAll() {
  if (!confirm('Borrar todos los datos?')) return;
  localStorage.clear();
  sched={}; hidden={}; vac={};
  ENC=[]; COC=[]; CAM=[];
  renderAll(); toast('Datos borrados');
}

// ================================================================
// TOAST
// ================================================================
function toast(msg) {
  var t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.style.opacity='1';
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.style.opacity='0'; }, 2400);
}

// ================================================================
// COPIA DE SEGURIDAD
// ================================================================
function exportarHorario(){
  var datos = {
    tipo: 'horario', version: 1,
    fecha: new Date().toISOString().slice(0,10),
    rsch: sched,
    rcam: {enc:ENC, coc:COC, cam:CAM},
    rhid: hidden,
    rvac: vac,
    rtheme: getThemeVals()
  };
  var nombre = 'horario-copia-' + datos.fecha + '.json';
  var blob = new Blob([JSON.stringify(datos, null, 2)], {type:'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Copia descargada');
}

function importarHorario(ev){
  var file = ev.target.files[0];
  if(!file) return;
  var lector = new FileReader();
  lector.onload = function(e){
    try {
      var d = JSON.parse(e.target.result);
      if(!d.rsch && !d.rcam && !d.rvac) throw new Error('El archivo no es una copia del horario');
      if(!confirm('Esto reemplaza el horario que haya ahora. Continuar?')) { ev.target.value=''; return; }
      if(d.rsch)   localStorage.setItem('rsch',   JSON.stringify(d.rsch));
      if(d.rcam)   localStorage.setItem('rcam',   JSON.stringify(d.rcam));
      if(d.rhid)   localStorage.setItem('rhid',   JSON.stringify(d.rhid));
      if(d.rvac)   localStorage.setItem('rvac',   JSON.stringify(d.rvac));
      if(d.rtheme) localStorage.setItem('rtheme', JSON.stringify(d.rtheme));
      location.reload();
    } catch(err){
      alert('No he podido leer ese archivo: ' + err.message);
    }
    ev.target.value = '';
  };
  lector.readAsText(file);
}

// ================================================================
// THEME
// ================================================================
/* Un color por cada cosa que puede pasar un dia. De ese color salen
   solos el fondo y el borde de la etiqueta, asi que se toca uno y
   cambia en todas partes: en el cuadrante del mes, en el de la semana,
   en el de vacaciones, en el recuento y en la ventana de editar. */
var ESTADOS = ['est-trabajo','est-festivo','est-vacaciones','est-baja','est-ausencia'];
var THEME_KEYS = ['bg','surface','surface2','border','text','text2','gold','gold2','mes-bar','mes-txt','enc','coc','cam','shift-l','shift-c','shift-r'].concat(ESTADOS);
var THEME_DEFAULTS = {
  bg:'#0f0e0b', surface:'#1a1814', surface2:'#232017', border:'#2e2b22',
  text:'#f0ece0', text2:'#b0aa98', gold:'#c9a84c', gold2:'#e8c96d',
  'mes-bar':'#14120f', 'mes-txt':'#d8d2c2',
  enc:'#c9a84c', coc:'#e07b39', cam:'#5b9bd5',
  'shift-l':'#1a4a2e', 'shift-c':'#1a1814', 'shift-r':'#2a1a0a',
  'est-trabajo':'#5dca82', 'est-festivo':'#e87c6f', 'est-vacaciones':'#74b3e0',
  'est-baja':'#c48ae0', 'est-ausencia':'#f0a070'
};

/* El color de una etiqueta, con la transparencia que se le pida. */
function conAlfa(hex, a) {
  hex = String(hex || '').trim();
  if (hex.charAt(0) !== '#') return hex;
  if (hex.length === 4) hex = '#' + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3];
  if (hex.length !== 7) return hex;
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
/* Cuanta luz tiene un color, de 0 (negro) a 1 (blanco). */
function claridad(hex) {
  hex = String(hex || '').trim();
  if (hex.charAt(0) !== '#') return 0;
  if (hex.length === 4) hex = '#' + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3];
  if (hex.length !== 7) return 0;
  var r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function oscurecer(hex, cuanto) {
  hex = String(hex || '').trim();
  if (hex.charAt(0) !== '#' || hex.length !== 7) return hex;
  var p = function(i){ return Math.max(0, Math.round(parseInt(hex.slice(i,i+2),16) * (1-cuanto))); };
  var h = function(v){ return (v<16?'0':'') + v.toString(16); };
  return '#' + h(p(1)) + h(p(3)) + h(p(5));
}

/* De cada color de estado salen cuatro: el fondo de la etiqueta, su
   borde, la letra y el relleno de la celda entera en la vista de semana.

   Y depende del tema. Sobre fondo oscuro el color se pone flojito por
   detras y la letra va del color, que es como se leia bien. Sobre fondo
   claro eso no vale: un rojo al 18% sobre blanco sale rosa, y un rojo y
   un salmon acaban iguales. Ahi la etiqueta va del color entero, a
   pelo, con la letra en blanco o en negro segun lo que se lea mejor. */
function derivarEstados() {
  var raiz  = document.documentElement;
  var fondo = cssVar('--bg', THEME_DEFAULTS.bg);
  var temaClaro = claridad(fondo) > .5;
  /* La columna de los totales lleva un velo del color de los titulos
     sobre el fondo de la pagina: en oscuro sale un dorado apagado, en
     claro un crema. Antes era un verde de noche escrito a fuego, y con
     el tema claro los numeros no se veian. */
  raiz.style.setProperty('--total-bg',
    conAlfa(cssVar('--gold', THEME_DEFAULTS.gold), temaClaro ? .22 : .14));
  ESTADOS.forEach(function(k){
    var col = cssVar('--'+k, THEME_DEFAULTS[k]);
    var bg, bd, lleno, txt;
    if (temaClaro) {
      bg = col; lleno = col; bd = oscurecer(col, .25);
      txt = claridad(col) > .6 ? '#141414' : '#ffffff';
    } else {
      bg = conAlfa(col, .18); lleno = conAlfa(col, .30); bd = conAlfa(col, .40);
      txt = col;
    }
    raiz.style.setProperty('--'+k+'-bg',    bg);
    raiz.style.setProperty('--'+k+'-bd',    bd);
    raiz.style.setProperty('--'+k+'-lleno', lleno);
    raiz.style.setProperty('--'+k+'-txt',   txt);
  });
}
/* Los temas rapidos. Cada uno se pone entero -fondos, letras, oficios,
   turnos y los colores de la semana- para que al cambiar de tema no se
   quede nada del anterior descolgado. El nombre y la nota son lo que se
   lee en los botones: dicen cuanto resalta cada uno. */
var PRESETS = {
  dark: {nombre:'Oscuro', nota:'el de siempre',
    bg:'#0f0e0b',surface:'#1a1814',surface2:'#232017',border:'#2e2b22',text:'#f0ece0',text2:'#b0aa98',gold:'#c9a84c',gold2:'#e8c96d','mes-bar':'#14120f','mes-txt':'#d8d2c2',enc:'#c9a84c',coc:'#e07b39',cam:'#5b9bd5',
    'shift-l':'#1a4a2e','shift-c':'#1a1814','shift-r':'#2a1a0a',
    'est-trabajo':'#5dca82','est-festivo':'#e87c6f','est-vacaciones':'#74b3e0','est-baja':'#c48ae0','est-ausencia':'#f0a070'},

  contraste: {nombre:'Contraste', nota:'el que mas resalta',
    bg:'#000000',surface:'#101010',surface2:'#1c1c1c',border:'#4a4a4a',text:'#ffffff',text2:'#d0d0d0',gold:'#ffd400',gold2:'#ffe866','mes-bar':'#000000','mes-txt':'#ffffff',enc:'#ffd400',coc:'#ff8a2b',cam:'#4fc3ff',
    'shift-l':'#0b6b34','shift-c':'#2b2b2b','shift-r':'#6b3a00',
    'est-trabajo':'#39ff88','est-festivo':'#ff6b5a','est-vacaciones':'#4fc3ff','est-baja':'#d98aff','est-ausencia':'#ffb15c'},

  neon: {nombre:'Neon', nota:'colores muy vivos',
    bg:'#0a0a12',surface:'#14142a',surface2:'#1d1d3a',border:'#3a3a6a',text:'#f2f2ff',text2:'#a9a9d8',gold:'#00e5ff',gold2:'#7bf5ff','mes-bar':'#07070f','mes-txt':'#dcdcff',enc:'#00e5ff',coc:'#ff4fd8',cam:'#9dff3c',
    'shift-l':'#0a5a4a','shift-c':'#2a2a4a','shift-r':'#4a1a5a',
    'est-trabajo':'#9dff3c','est-festivo':'#ff4fd8','est-vacaciones':'#00e5ff','est-baja':'#c77dff','est-ausencia':'#ffd24a'},

  pizarra: {nombre:'Pizarra', nota:'gris, sin dorados',
    bg:'#16181a',surface:'#202427',surface2:'#2a2f33',border:'#3c4348',text:'#eef2f4',text2:'#a8b2b8',gold:'#ff9f45',gold2:'#ffc07a','mes-bar':'#101315','mes-txt':'#dbe3e8',enc:'#ff9f45',coc:'#7ad1a0',cam:'#7fb4ff',
    'shift-l':'#1f4d38','shift-c':'#2a2f33','shift-r':'#4a331c',
    'est-trabajo':'#7ad1a0','est-festivo':'#f0968a','est-vacaciones':'#8fcdf0','est-baja':'#c39ae0','est-ausencia':'#f5b985'},

  navy: {nombre:'Marino', nota:'azul oscuro',
    bg:'#060e1a',surface:'#0d1828',surface2:'#142234',border:'#1e3050',text:'#cce0ff',text2:'#7a9ac0',gold:'#5b9bd5',gold2:'#8ac0f0','mes-bar':'#03070f','mes-txt':'#bcd6f5',enc:'#5b9bd5',coc:'#e07b39',cam:'#4caf50',
    'shift-l':'#0a2a4a','shift-c':'#0a1a2a','shift-r':'#1a0a3a',
    'est-trabajo':'#6ad39a','est-festivo':'#f09a8a','est-vacaciones':'#8fcdf0','est-baja':'#b79af0','est-ausencia':'#f0b070'},

  forest: {nombre:'Bosque', nota:'verde oscuro',
    bg:'#070f09',surface:'#0e1e12',surface2:'#162a1a',border:'#1e3a22',text:'#d0f0d8',text2:'#7aaa88',gold:'#4caf50',gold2:'#80d888','mes-bar':'#040804','mes-txt':'#c2e8cb',enc:'#4caf50',coc:'#cddc39',cam:'#26c6da',
    'shift-l':'#0a2a10','shift-c':'#0a1a0a','shift-r':'#1a2a0a',
    'est-trabajo':'#7fe08a','est-festivo':'#e8998a','est-vacaciones':'#86ccdd','est-baja':'#b69ae8','est-ausencia':'#e5c072'},

  vino: {nombre:'Vino', nota:'granate, calido',
    bg:'#140a0c',surface:'#201015',surface2:'#2b171d',border:'#43222b',text:'#f6e7ea',text2:'#c0a0a8',gold:'#e0a33c',gold2:'#f3c76f','mes-bar':'#0d0507','mes-txt':'#ecd9dd',enc:'#e0a33c',coc:'#e8705a',cam:'#c48ae0',
    'shift-l':'#1f4a33','shift-c':'#2b171d','shift-r':'#4a2416',
    'est-trabajo':'#7fd4a0','est-festivo':'#f5998f','est-vacaciones':'#8ccbe8','est-baja':'#cf9be8','est-ausencia':'#f2b97f'},

  light: {nombre:'Claro', nota:'fondo blanco',
    bg:'#f5f0e8',surface:'#ede8dc',surface2:'#e0d8c8',border:'#c8bfa8',text:'#2a2010',text2:'#6a5a3a',gold:'#8a6a1a',gold2:'#6a4a0a','mes-bar':'#ded6c4','mes-txt':'#2a2010',enc:'#7a5500',coc:'#a04010',cam:'#1a5a8a',
    'shift-l':'#c8e8d0','shift-c':'#e8e8d0','shift-r':'#e8d8b0',
    'est-trabajo':'#12703f','est-festivo':'#8a2418','est-vacaciones':'#134a70','est-baja':'#5e2a8a','est-ausencia':'#8a4a10'},

  papel: {nombre:'Papel', nota:'blanco, como la hoja',
    bg:'#ffffff',surface:'#f2f2f2',surface2:'#e7e7e7',border:'#b9b9b9',text:'#111111',text2:'#555555',gold:'#0a58ca',gold2:'#003a99','mes-bar':'#dcdcdc','mes-txt':'#111111',enc:'#0a58ca',coc:'#b3450f',cam:'#0f7a4a',
    'shift-l':'#bfe8cd','shift-c':'#e7e7e7','shift-r':'#ffdfae',
    'est-trabajo':'#0f7a4a','est-festivo':'#8c1d0f','est-vacaciones':'#0a3d6b','est-baja':'#5b2a8c','est-ausencia':'#8c4a0f'}
};

function getThemeVals() {
  var vals = {};
  THEME_KEYS.forEach(function(k){ var el=document.getElementById('c-'+k); if(el)vals[k]=el.value; });
  return vals;
}
function applyTheme() {
  var root = document.documentElement;
  THEME_KEYS.forEach(function(k){
    var el = document.getElementById('c-'+k); if (!el) return;
    var val = el.value;
    root.style.setProperty('--'+k, val);
    var hx = document.getElementById('h-'+k); if (hx) hx.textContent = val.toUpperCase();
  });
  derivarEstados();
  /* Se repinta todo, no solo la semana: los colores de los estados se
     escriben dentro de las celdas, asi que si no se vuelve a pintar el
     cambio no se ve y parece que la app no hace caso. */
  renderTable(); renderCov(); renderAusencias(); renderVacaciones();
}
function syncInputs() {
  THEME_KEYS.forEach(function(k){
    var el = document.getElementById('c-'+k); if (!el) return;
    var v = document.documentElement.style.getPropertyValue('--'+k).trim() || THEME_DEFAULTS[k] || '#000000';
    if (v.startsWith('#')&&v.length===7) el.value=v; else el.value=THEME_DEFAULTS[k]||'#000000';
    var hx = document.getElementById('h-'+k); if (hx) hx.textContent = el.value.toUpperCase();
  });
}
function loadPreset(name) {
  var p = PRESETS[name]; if (!p) return;
  var root = document.documentElement;
  THEME_KEYS.forEach(function(k){ if (p[k]) root.style.setProperty('--'+k, p[k]); });
  derivarEstados();
  syncInputs(); renderTable(); renderCov(); renderAusencias(); renderVacaciones();
  pintarPresets(name);
  toast('Tema ' + p.nombre + ' - pulsa Guardar si te quedas con el');
}

/* Los botones de los temas, con una muestra de sus colores: asi se ve
   cual resalta mas antes de probarlo. */
function pintarPresets(elegido) {
  var caja = document.getElementById('preset-list'); if (!caja) return;
  caja.innerHTML = Object.keys(PRESETS).map(function(k){
    var p = PRESETS[k];
    var puntos = ['gold','enc','coc','cam','shift-l'].map(function(c){
      return '<span style="width:9px;height:9px;border-radius:50%;background:' + p[c] +
             ';display:inline-block;border:1px solid rgba(128,128,128,.45)"></span>';
    }).join('');
    return '<button onclick="loadPreset(\'' + k + '\')" class="preset-btn" title="' + p.nota + '" ' +
      'style="background:' + p.bg + ';color:' + p.gold + ';border-color:' + p.gold +
      (k === elegido ? ';box-shadow:0 0 0 2px ' + p.gold2 : '') + '">' +
      '<span style="display:block">' + p.nombre + '</span>' +
      '<span style="display:flex;gap:3px;justify-content:center;margin-top:3px">' + puntos + '</span>' +
      '<span style="display:block;font-size:.6rem;font-weight:500;opacity:.8;margin-top:2px">' + p.nota + '</span>' +
      '</button>';
  }).join('');
}
function saveTheme() {
  try { localStorage.setItem('rtheme', JSON.stringify(getThemeVals())); } catch(e){}
  toast('Tema guardado');
}
function loadTheme() {
  try {
    var d = localStorage.getItem('rtheme');
    if (d) {
      var vals = JSON.parse(d);
      var root = document.documentElement;
      Object.keys(vals).forEach(function(k){ root.style.setProperty('--'+k, vals[k]); });
    }
  } catch(e){}
  derivarEstados();
}
function resetTheme() {
  var root = document.documentElement;
  Object.keys(THEME_DEFAULTS).forEach(function(k){ root.style.setProperty('--'+k, THEME_DEFAULTS[k]); });
  derivarEstados();
  syncInputs(); renderAll(); try{localStorage.removeItem('rtheme');}catch(e){} toast('Colores restablecidos');
}
/* Los colores de todos los dias salen arriba; el resto se abre solo si
   se pide, que veintidos casillas de golpe no las quiere nadie. */
function verMasColores() {
  var caja = document.getElementById('mas-colores');
  var btn  = document.getElementById('mas-colores-btn');
  if (!caja) return;
  var abierta = caja.style.display !== 'none';
  caja.style.display = abierta ? 'none' : 'block';
  if (btn) btn.textContent = abierta ? '+ Los demas colores' : '- Esconder los demas';
  if (!abierta) syncInputs();
}
function openTheme()  { syncInputs(); pintarPresets(); var el=document.getElementById('themeov'); if(el)el.classList.add('show'); }
function closeTheme() { var el=document.getElementById('themeov'); if(el)el.classList.remove('show'); }

// ================================================================
// INIT
// ================================================================
function iniciarHorario(){
  load(); loadTheme(); aplicarAncho();
  // Las vacaciones que quedaran en el cajon viejo pasan al horario.
  var pasadas = migrarVacacionesViejas();
  // Se abre por el mes al que pertenece hoy, que ya no es el del
  // calendario: los primeros dias de septiembre son todavia de agosto.
  var ahora = mesDeFecha(new Date());
  curM = ahora.m;
  var yr = document.getElementById('yr');
  if (yr && [].some.call(yr.options, function(o){ return +o.value === ahora.y; })) {
    yr.value = ahora.y;
  }
  curS = autoS(curM);
  var bv=document.getElementById('bv'), bi=document.getElementById('bi');
  if(bv) bv.classList.toggle('on', curS==='verano');
  if(bi) bi.classList.toggle('on', curS==='invierno');
  renderAll();
  if (pasadas) toast(pasadas + ' dias de vacaciones pasados al horario');
  if (staff().length === 0) openAddModal();
}
window.addEventListener('resize', function(){ pegarCabeceras(); });
iniciarHorario();
