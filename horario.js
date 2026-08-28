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
var SLOTS = [];
for (var _h = 7; _h <= 23; _h++) SLOTS.push(_h);
SLOTS.push(0); SLOTS.push(1);

// ================================================================
// STATE
// ================================================================
var curM = new Date().getMonth(), curY = 2026, curS = 'verano';
var sched = {};
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
function dim(y,m)       { return new Date(y, m+1, 0).getDate(); }
function autoS(m)       { return VERANO.indexOf(m) >= 0 ? 'verano' : 'invierno'; }
function fmtH(t)        { if (!t) return '?'; return t.slice(-2) === ':00' ? t.slice(0,-3) : t; }

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
// RENDER ALL
// ================================================================
function renderAll() {
  var yr = document.getElementById('yr');
  if (yr) curY = parseInt(yr.value);
  // Sync hours year selector
  var hyr = document.getElementById('hours-year-sel');
  if (hyr) hyr.value = curY;
  renderNav(); renderTable(); renderStats(); renderCov(); renderHours(); renderAusencias();
}

// ================================================================
// HOURS SUMMARY TABLE
// ================================================================
function calcStaffHours(sid, y, m) {
  if (!sched[y]||!sched[y][m]||!sched[y][m][sid]) return {h:0, d:0};
  var totalH = 0, totalD = 0;
  Object.values(sched[y][m][sid]).forEach(function(c){
    if (!c) return;
    if (c.estado === 'trabajo') {
      totalD++;
      if (c.inicio && c.fin) {
        var a = parseInt(c.inicio.split(':')[0])*60+parseInt(c.inicio.split(':')[1]);
        var b = parseInt(c.fin.split(':')[0])*60+parseInt(c.fin.split(':')[1]);
        var diff = b - a; if (diff < 0) diff += 1440;
        totalH += diff/60;
      }
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
  if (mode === 'weekly')  { renderHoursWeekly(tbl, y, all); return; }
  if (mode === 'annual')  { renderHoursAnnual(tbl, y, all); return; }
  renderHoursMonthly(tbl, y, all);
}

function cellSt(isCur, bg) {
  return 'background:'+(bg||(isCur?'rgba(201,168,76,.07)':'transparent'))+';padding:7px 4px;border:1px solid var(--border);text-align:center;vertical-align:middle';
}
function hdCell(d, h, hl) {
  if (!d) return '<div style="font-size:.7rem;color:#2e2b22">-</div>';
  return '<div style="font-size:.82rem;font-weight:700;color:'+(hl?'var(--gold2)':'#a0d0a0')+'">'+d+'d</div><div style="font-size:.75rem;color:var(--text2)">'+h+'h</div>';
}
function stickyNC(s) {
  return '<td style="background:var(--surface);position:sticky;left:0;z-index:5;padding:7px 12px;border:1px solid var(--border)">'
       + '<span style="color:'+RCOL[s.role]+';font-weight:600;font-size:.8rem">'+s.name+'</span>'
       + '<span class="rt r'+s.role+'" style="margin-left:3px">'+RLBL[s.role]+'</span></td>';
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
    if(cell.inicio&&cell.fin){
      var a=parseInt(cell.inicio.split(':')[0])*60+parseInt(cell.inicio.split(':')[1]);
      var b=parseInt(cell.fin.split(':')[0])*60+parseInt(cell.fin.split(':')[1]);
      var diff=b-a; if(diff<0)diff+=1440; h+=diff/60;
    }
  });
  return {h:Math.round(h*10)/10, d:d};
}

function getWeeksOfMonth(y, m) {
  var days=dim(y,m), weeks=[], wk=null;
  for(var d=1;d<=days;d++){
    var dow=new Date(y,m,d).getDay();
    if(!wk||dow===1){ if(wk)weeks.push(wk); var jan1=new Date(y,0,1); var doy=Math.floor((new Date(y,m,d)-jan1)/86400000); var wn=Math.ceil((doy+jan1.getDay()+1)/7); wk={label:'S'+wn,days:[]}; }
    wk.days.push({y:y,m:m,d:d});
  }
  if(wk&&wk.days.length)weeks.push(wk);
  return weeks;
}

function renderHoursMonthly(tbl, y, all) {
  var th='<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:9px 12px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;min-width:130px">Personal</th>';
  MESES.forEach(function(mn,mi){
    var ic=mi===curM&&y===curY;
    th+='<th style="background:'+(ic?'rgba(201,168,76,.18)':'var(--surface)')+';color:'+(ic?'var(--gold2)':'var(--text2)')+';padding:8px 5px;border:1px solid var(--border);text-align:center;min-width:64px;font-size:.73rem;font-weight:'+(ic?'700':'500')+'">'+mn.substring(0,3)+'</th>';
  });
  th+='<th style="background:#1a2010;color:var(--gold2);padding:8px 10px;border:1px solid var(--border);text-align:center;min-width:72px;font-size:.76rem;font-weight:700">AÑO</th></tr></thead>';
  var tb='<tbody>'; var lastR=null;
  all.forEach(function(s){
    if(s.role!==lastR){if(lastR!==null)tb+=grpSep(15);lastR=s.role;}
    var yH=0,yD=0; tb+='<tr>'+stickyNC(s);
    MESES.forEach(function(mn,mi){
      var r=calcStaffHours(s.id,y,mi); yH+=r.h; yD+=r.d;
      tb+='<td style="'+cellSt(mi===curM&&y===curY)+'">'+hdCell(r.d,r.h,mi===curM&&y===curY)+'</td>';
    });
    tb+='<td style="background:#1a2010;padding:7px 10px;border:1px solid var(--border);text-align:center;vertical-align:middle"><div style="font-size:.9rem;font-weight:900;color:var(--gold2)">'+yD+'d</div><div style="font-size:.8rem;font-weight:700;color:#a0d080">'+Math.round(yH*10)/10+'h</div></td></tr>';
  });
  tb+='</tbody>'; tbl.innerHTML=th+tb;
}

function renderHoursWeekly(tbl, y, all) {
  var weeks=getWeeksOfMonth(y,curM);
  var today=new Date();
  var th='<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:9px 12px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;min-width:130px">Personal — '+MESES[curM]+' '+y+'</th>';
  weeks.forEach(function(wk){
    var ic=wk.days.some(function(dd){return dd.d===today.getDate()&&dd.m===today.getMonth()&&dd.y===today.getFullYear();});
    var d0=wk.days[0],d1=wk.days[wk.days.length-1];
    th+='<th style="background:'+(ic?'rgba(201,168,76,.18)':'var(--surface)')+';color:'+(ic?'var(--gold2)':'var(--text2)')+';padding:8px 5px;border:1px solid var(--border);text-align:center;min-width:72px;font-size:.73rem;font-weight:'+(ic?'700':'500')+'">'+wk.label+'<br><span style="font-size:.62rem;opacity:.7">'+d0.d+'/'+(d0.m+1)+'-'+d1.d+'/'+(d1.m+1)+'</span></th>';
  });
  th+='<th style="background:#1a2010;color:var(--gold2);padding:8px 10px;border:1px solid var(--border);text-align:center;min-width:72px;font-size:.76rem;font-weight:700">MES</th></tr></thead>';
  var tb='<tbody>'; var lastR=null;
  all.forEach(function(s){
    if(s.role!==lastR){if(lastR!==null)tb+=grpSep(weeks.length+2);lastR=s.role;}
    var mRes=calcStaffHours(s.id,y,curM); tb+='<tr>'+stickyNC(s);
    weeks.forEach(function(wk){
      var ic=wk.days.some(function(dd){return dd.d===today.getDate()&&dd.m===today.getMonth()&&dd.y===today.getFullYear();});
      var r=calcStaffWeek(s.id,wk);
      tb+='<td style="'+cellSt(ic)+'">'+hdCell(r.d,r.h,ic)+'</td>';
    });
    tb+='<td style="background:#1a2010;padding:7px 10px;border:1px solid var(--border);text-align:center;vertical-align:middle"><div style="font-size:.9rem;font-weight:900;color:var(--gold2)">'+mRes.d+'d</div><div style="font-size:.8rem;font-weight:700;color:#a0d080">'+mRes.h+'h</div></td></tr>';
  });
  tb+='</tbody>'; tbl.innerHTML=th+tb;
}

function renderHoursAnnual(tbl, y, all) {
  var th='<thead><tr>'
    +'<th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:9px 12px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;min-width:130px">Personal — '+y+'</th>'
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
      +'<td style="'+cellSt(false)+'"><span style="font-size:.95rem;font-weight:700;color:#a0d080">'+yH+'h</span></td>'
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
   lee "del 3 al 5" en vez de una lista larga de numeros. */
function tramos(dias){
  if (!dias.length) return [];
  var orden = dias.slice().sort(function(a,b){ return a-b; });
  var salida = [], ini = orden[0], prev = orden[0];
  for (var i = 1; i < orden.length; i++) {
    if (orden[i] === prev + 1) { prev = orden[i]; continue; }
    salida.push([ini, prev]); ini = prev = orden[i];
  }
  salida.push([ini, prev]);
  return salida;
}
function textoTramos(dias){
  return tramos(dias).map(function(t){
    return t[0] === t[1] ? String(t[0]) : t[0] + '-' + t[1];
  }).join(', ');
}

/* Recoge las ausencias del mes en curso o de todo el año. */
function recogerAusencias(){
  var alcance = (document.getElementById('aus-alcance') || {}).value || 'mes';
  var meses = alcance === 'ano' ? [] : [curM];
  if (alcance === 'ano') for (var m = 0; m < 12; m++) meses.push(m);

  var porPersona = {};   // sid -> mes -> tipo -> [dias]
  var totales = {vacaciones:0, festivo:0, baja:0, ausencia:0};

  staff().forEach(function(s){
    meses.forEach(function(m){
      var celdas = ((sched[curY] || {})[m] || {})[s.id] || {};
      Object.keys(celdas).forEach(function(dia){
        var c = celdas[dia];
        if (!c || !AUS_TIPOS[c.estado]) return;
        porPersona[s.id] = porPersona[s.id] || {};
        porPersona[s.id][m] = porPersona[s.id][m] || {};
        (porPersona[s.id][m][c.estado] = porPersona[s.id][m][c.estado] || []).push(+dia);
        totales[c.estado]++;
      });
    });
  });
  return {porPersona: porPersona, totales: totales, meses: meses, alcance: alcance};
}

function renderAusencias(){
  var tbl = document.getElementById('austbl'); if (!tbl) return;
  var datos = recogerAusencias();

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
        (datos.alcance === 'ano' ? 'en ' + curY : 'en ' + MESES[curM]) + '.</td></tr></tbody>';
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
    'padding:9px 12px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;min-width:130px">Personal</th>' +
    (datos.alcance === 'ano'
      ? '<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);text-align:left;font-size:.74rem;min-width:80px">Mes</th>'
      : '') +
    tipos.map(function(k){
      return '<th style="background:var(--surface);color:var(--text2);padding:9px 10px;border:1px solid var(--border);' +
             'text-align:left;font-size:.74rem;min-width:120px">' + AUS_TIPOS[k].lbl + '</th>';
    }).join('') +
    '<th style="background:#1a2010;color:var(--gold2);padding:9px 10px;border:1px solid var(--border);' +
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
  function celdasTipos(porTipo){
    var total = 0;
    var html = tipos.map(function(k){
      var dias = (porTipo && porTipo[k]) || [];
      total += dias.length;
      return '<td style="padding:7px 10px;border:1px solid var(--border)">' +
             (dias.length
               ? '<span class="tb ' + AUS_TIPOS[k].cls + '" style="cursor:default;font-size:.78rem;padding:3px 8px">' +
                 textoTramos(dias) + '<span style="opacity:.7;margin-left:5px">(' + dias.length + 'd)</span></span>'
               : '<span style="color:var(--border)">·</span>') +
             '</td>';
    }).join('');
    html += '<td style="background:#1a2010;padding:7px 10px;border:1px solid var(--border);text-align:center">' +
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
            celdasTipos(null) + '</tr>';
      return;
    }
    mesesConAlgo.forEach(function(m, idx){
      tb += '<tr>';
      if (idx === 0) tb += celdaNombre(s, mesesConAlgo.length);
      if (datos.alcance === 'ano') {
        tb += '<td style="padding:7px 10px;border:1px solid var(--border);color:var(--text2);white-space:nowrap">' +
              MESES[m] + '</td>';
      }
      tb += celdasTipos(porMes[m]) + '</tr>';
    });
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
  if (myl) myl.textContent = MESES[curM]+' '+curY;
}
function renderStats() {
  var c = SCFG[curS];
  var stm=document.getElementById('stm'), sts=document.getElementById('sts'), sth=document.getElementById('sth');
  if (stm) stm.textContent = MESES[curM];
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
  var days  = dim(curY, curM);
  var today = new Date();
  var all   = visibleStaff();

  var th = '<thead><tr><th class="nch" style="position:sticky;left:0;top:0;z-index:20;background:var(--surface);min-width:130px;text-align:center">Personal</th>';
  for (var d = 1; d <= days; d++) {
    var dow = new Date(curY, curM, d).getDay();
    var we  = dow===0||dow===6;
    var tod = today.getDate()===d && today.getMonth()===curM && today.getFullYear()===curY;
    th += '<th class="dh'+(we?' we':'')+(tod?' tod':'')+'">'+DC[dow]+'<br><span style="font-size:.95rem;font-weight:700">'+d+'</span></th>';
  }
  th += '</tr></thead>';

  var tb = '<tbody>';
  var lastR = null;
  all.forEach(function(s, si){
    if (s.role !== lastR) {
      if (si > 0) tb += '<tr class="gs"><td colspan="'+(days+1)+'"></td></tr>';
      lastR = s.role;
    }
    tb += '<tr><td class="nc"><div style="display:flex;align-items:center;justify-content:center;gap:4px" class="nc-row">'
       +  '<div style="text-align:center"><span style="color:'+RCOL[s.role]+';font-weight:600">'+s.name+'</span><span class="rt r'+s.role+'">'+RLBL[s.role]+'</span></div>'
       +  '<button onclick="toggleHide(\''+s.id+'\')" class="hide-btn" title="Ocultar">O</button>'
       +  '</div></td>';
    for (var d = 1; d <= days; d++) {
      var cell = gc(s.id, d);
      var dow  = new Date(curY, curM, d).getDay();
      var we   = dow===0||dow===6;
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
        inn = '<div style="width:100%;display:flex;justify-content:'+align+';'+pad+'">'
            + '<span class="tb '+cls+'" style="'+radius+';background:'+bgCol+'" onclick="openCell(\''+s.id+'\','+d+',event)">'
            + '<span class="th">'+fmtH(cell.inicio)+'-'+fmtH(cell.fin)+'</span></span></div>';
        if (cell.nota) inn += '<div style="width:100%;display:flex;justify-content:'+align+';'+pad+'"><span style="font-size:.6rem;color:var(--text2);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cell.nota+'</span></div>';
      } else if (est !== 'libre') {
        var lbl = est==='baja'?'B Baja':est==='ausencia'?'A Aus':EICO[est]||est;
        inn = '<span class="tb '+cls+'" onclick="openCell(\''+s.id+'\','+d+',event)">'+lbl+'</span>';
      } else {
        inn = '<span class="tb '+cls+'" onclick="openCell(\''+s.id+'\','+d+',event)">+</span>';
      }
      tb += '<td style="'+(we?'background:rgba(30,28,20,.5)':'')+'"><div class="ci">'+inn+'</div></td>';
    }
    tb += '</tr>';
  });

  // Ocultos
  var hiddenStaff = staff().filter(function(s){ return hidden[s.id]; });
  if (hiddenStaff.length > 0) {
    tb += '<tr class="gs"><td colspan="'+(days+1)+'"></td></tr>';
    tb += '<tr><td class="nc" colspan="'+(days+1)+'" style="padding:7px 12px;background:#1a1410">'
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

  var th = '<thead><tr><th style="background:#111;color:var(--gold);font-size:.8rem;padding:8px 10px;border:1px solid #2a2820;text-align:left;width:120px;min-width:120px">Personal</th>';
  dias.forEach(function(dd){
    var dow = dd.getDay(); var we = dow===0||dow===6;
    var tod = dd.toDateString()===today.toDateString();
    var bg  = tod?'rgba(201,168,76,.22)':(we?'#1e1c14':'#141210');
    var col = tod?'var(--gold2)':(we?'var(--gold)':'#ccc');
    th += '<th style="background:'+bg+';color:'+col+';padding:10px 4px;border:1px solid #2a2820;border-bottom:3px solid '+(we?'var(--gold)':'#444')+';text-align:center;min-width:140px">'
        + '<div style="font-weight:900;font-size:1rem;letter-spacing:.04em">'+DC_FULL[dow].substring(0,3)+'</div>'
        + '<div style="font-size:.78rem;opacity:.85;margin-top:2px">'+dd.getDate()+'/'+(dd.getMonth()+1)+'</div>'
        + '</th>';
  });
  th += '</tr></thead>';

  var tb = '<tbody>';
  var lastR = null;
  all.forEach(function(s, si){
    if (s.role !== lastR) {
      if (si > 0) tb += '<tr><td colspan="8" style="height:2px;background:#333;padding:0;border:none"></td></tr>';
      lastR = s.role;
    }
    tb += '<tr>';
    tb += '<td style="background:#111;position:sticky;left:0;z-index:5;padding:6px 10px;border:1px solid #2a2820;width:120px;min-width:120px">'
        + '<span style="color:'+RCOL[s.role]+';font-weight:700;font-size:.88rem;white-space:nowrap">'+s.name+'</span>'
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
        var wpad    = walign==='flex-start' ? 'margin-left:-1px' : walign==='flex-end' ? 'margin-right:-1px' : '';
        var wradius = walign==='flex-start' ? 'border-radius:0 4px 4px 0' : walign==='flex-end' ? 'border-radius:4px 0 0 4px' : 'border-radius:4px';
        var wbgCol  = shiftBg(walign);
        inner = '<div style="width:100%;display:flex;justify-content:'+walign+';'+wpad+'">'
              + '<div style="display:inline-flex;align-items:center;gap:3px;'+wradius+';background:'+wbgCol+';padding:3px 6px">'
              + '<div style="font-size:.95rem;font-weight:900;color:#e0ffe0;white-space:nowrap">'+fmtH(cell.inicio)+'</div>'
              + '<div style="font-size:.82rem;font-weight:700;color:#8ac898">-'+fmtH(cell.fin)+'</div>'
              + (cell.nota?'<div style="font-size:.62rem;color:#6a9a78;margin-left:2px">'+cell.nota+'</div>':'')
              + '</div></div>';
      } else if (est === 'vacaciones') { inner = 'VAC'; }
      else if (est === 'festivo')      { inner = 'FES'; }
      else if (est === 'baja')         { inner = 'BAJ'; }
      else if (est === 'ausencia')     { inner = 'AUS'; }
      else { inner = '<div style="color:#333;font-size:.9rem">-</div>'; }

      var fullCell = '';
      if      (inner==='VAC') { fullCell='background:'+cssVar('--wk-vac-bg','#0f3a5a')+';'; inner='<div style="font-weight:900;font-size:1rem;color:'+cssVar('--wk-vac-txt','#74b3e0')+'">V</div>'; }
      else if (inner==='FES') { fullCell='background:'+cssVar('--wk-fes-bg','#3a0f0a')+';'; inner='<div style="font-weight:900;font-size:1rem;color:'+cssVar('--wk-fes-txt','#e87c6f')+'">F</div>'; }
      else if (inner==='BAJ') { fullCell='background:'+cssVar('--wk-baj-bg','#3a0a0a')+';'; inner='<div style="font-weight:900;font-size:1rem;color:'+cssVar('--wk-baj-txt','#f1948a')+'">B</div>'; }
      else if (inner==='AUS') { fullCell='background:'+cssVar('--wk-aus-bg','#3a1a00')+';'; inner='<div style="font-weight:900;font-size:1rem;color:'+cssVar('--wk-aus-txt','#f0a070')+'">A</div>'; }

      var wrapAlign = est==='trabajo' ? '' : 'justify-content:center;';
      tb += '<td onclick="openCell(\''+s.id+'\','+d+',event,'+m+','+y+')" style="'+fullCell+'border:1px solid #3e3c30;border-bottom:2px solid #555240;padding:0;vertical-align:middle;cursor:pointer;text-align:center" onmouseover="this.style.filter=\'brightness(1.3)\'" onmouseout="this.style.filter=\'none\'">'
          + '<div style="width:100%;height:56px;display:flex;align-items:center;'+wrapAlign+'">'+inner+'</div>'
          + '</td>';
    });
    tb += '</tr>';
  });
  tb += '</tbody>';

  area.innerHTML =
    '<div style="padding:5px 10px;background:#0d0d0b;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a2820">'
    + '<span style="font-family:\'Playfair Display\',serif;font-size:.85rem;color:var(--gold2)">Horario - '+MESES[curM]+' '+curY+'</span>'
    + '<span style="font-size:.65rem;color:var(--text2)">'+fmt(weekStart)+' - '+fmt(end)+' - '+SCFG[curS].lbl+'</span>'
    + '</div>'
    + '<div id="wk-scaler" style="overflow:hidden;width:100%">'
    + '<div id="wk-inner" style="transform-origin:top left">'
    + '<table id="wk-tbl" style="border-collapse:collapse;table-layout:auto;font-family:\'DM Sans\',sans-serif;background:#0f0e0b;white-space:nowrap">'+th+tb+'</table>'
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
function isW(ini, fin, slot) {
  if (!ini||!fin) return false;
  var a = parseInt(ini.split(':')[0])*60+parseInt(ini.split(':')[1]);
  var b = parseInt(fin.split(':')[0])*60+parseInt(fin.split(':')[1]);
  var s0 = slot*60, s1 = slot*60+59;
  return a < b ? (s0<b && s1>=a) : (s0>=a || s1<b);
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
  if (!tbl) return;
  var days = dim(curY, curM);
  var all  = visibleStaff();
  var today= new Date();
  var cov  = {}, who = {};
  SLOTS.forEach(function(slot){
    cov[slot] = {}; who[slot] = {};
    for (var d=1; d<=days; d++) { cov[slot][d]=0; who[slot][d]=[]; }
  });
  for (var d=1; d<=days; d++) {
    all.forEach(function(s){
      var cell = gc(s.id, d);
      if (!cell||cell.estado!=='trabajo') return;
      SLOTS.forEach(function(slot){
        if (isW(cell.inicio, cell.fin, slot)) {
          cov[slot][d]++;
          who[slot][d].push(s.name.split(' ')[0]);
        }
      });
    });
  }
  var html = '<thead><tr><th style="background:var(--surface);color:var(--gold);font-family:Playfair Display,serif;font-size:.82rem;padding:8px 14px;border:1px solid var(--border);text-align:left;position:sticky;left:0;z-index:10;white-space:nowrap">Hora</th>';
  for (var d=1; d<=days; d++) {
    var dow = new Date(curY,curM,d).getDay();
    var we  = dow===0||dow===6;
    var tod = today.getDate()===d&&today.getMonth()===curM&&today.getFullYear()===curY;
    html += '<th style="background:'+(tod?'rgba(201,168,76,.18)':(we?'#1e1c14':'var(--surface)'))+';color:'+(tod?'var(--gold2)':(we?'var(--gold)':'var(--text2)'))+';padding:7px 4px;border:1px solid var(--border);text-align:center;min-width:38px;font-size:.7rem;white-space:nowrap">'+DC[dow]+'<br><span style="font-size:.88rem;font-weight:700">'+d+'</span></th>';
  }
  html += '</tr></thead><tbody>';
  SLOTS.forEach(function(slot, si){
    var isMid = slot===0||slot===1;
    var lbl   = (slot<10?'0':'')+slot+':00';
    if (slot===12||slot===20) html += '<tr><td colspan="'+(days+1)+'" style="height:3px;background:var(--border);padding:0;border:none"></td></tr>';
    var rbg = isMid?'rgba(142,68,173,.07)':(si%2===0?'rgba(255,255,255,.013)':'transparent');
    html += '<tr style="background:'+rbg+'"><td style="position:sticky;left:0;z-index:5;background:'+(isMid?'rgba(142,68,173,.15)':'var(--surface)')+';color:'+(isMid?'#c090e8':'var(--gold)')+';font-weight:700;font-size:.8rem;padding:6px 14px;border:1px solid var(--border);white-space:nowrap">'+lbl+(isMid?' L':'')+' </td>';
    for (var d=1; d<=days; d++) {
      var n   = cov[slot][d];
      var col = cbg(n);
      var tip = n===0?'Nadie':n+' persona'+(n>1?'s':'')+': '+who[slot][d].join(', ');
      html += '<td title="'+lbl+' Dia '+d+' - '+tip+'" style="text-align:center;padding:5px 2px;background:'+col.bg+';border:1px solid rgba(46,43,34,.35);cursor:default;transition:filter .1s" onmouseover="this.style.filter=\'brightness(1.5)\'" onmouseout="this.style.filter=\'none\'">'
            + '<div style="color:'+col.fg+';font-size:'+(n>0?'1.1rem':'.75rem')+';font-weight:'+(n>0?'900':'400')+';line-height:1">'+(n>0?n:'.') +'</div>'
            + (n>0?'<div style="color:rgba(255,255,255,.55);font-size:.56rem;margin-top:1px">pers.</div>':'')
            + '</td>';
    }
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
    sc(sid, day, Object.assign({}, clip));
    curM = savedM; curY = savedY;
    renderTable(); renderCov(); renderAusencias();
    toast('Turno pegado en dia '+day);
    return;
  }

  active = {sid:sid, day:day, mo:curM, yr:curY};
  var pop  = document.getElementById('popup');
  var cell = gc(sid, day);
  curM = savedM; curY = savedY;

  var est = cell ? cell.estado : 'libre';
  var s   = staff().find(function(x){ return x.id===sid; });
  var pt  = document.getElementById('ptitle');
  if (pt) pt.textContent = s.name+' - Dia '+day;

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
  var h = tgtH(active.sid);
  var p = v.split(':');
  var tot = parseInt(p[0])*60+parseInt(p[1])+h*60;
  var fh = Math.floor(tot/60)%24, fm = tot%60;
  var fs = (fh<10?'0':'')+fh+':'+(fm<10?'0':'')+fm;
  var felm = document.getElementById('fin'); if (felm) felm.value = fs;
  var s2 = staff().find(function(x){ return x.id===active.sid; });
  var rl = s2.role==='enc'?'Encargado':s2.role==='coc'?'Cocinero':'Camarero';
  var hl = document.getElementById('hl');
  if (hl) hl.innerHTML = '<span style="color:var(--gold2);font-weight:600">'+h+'h</span> - '+rl+' - '+(curS==='verano'?'Verano':'Invierno')+' - '+fmtH(v)+' to '+fmtH(fs);
}

function selE(est) {
  var pop = document.getElementById('popup'); if (!pop) return;
  /* Marcar "Libre" es querer vaciar el dia: se hace ya, sin Guardar. */
  if (est === 'libre') { borrarCelda(); return; }
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
    if (pop._align) data.align = pop._align;
  }
  var nota = document.getElementById('nota'); data.nota = nota?nota.value:'';
  var savedM = curM, savedY = curY;
  if (active.mo !== undefined) { curM = active.mo; curY = active.yr; }
  sc(active.sid, active.day, data);
  curM = savedM; curY = savedY;
  closePopup(); renderTable(); renderCov(); renderAusencias();
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
  closePopup(); renderTable(); renderCov(); renderAusencias();
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
  var desc = cell.estado==='trabajo'&&cell.inicio?(fmtH(cell.inicio)+'-'+fmtH(cell.fin)):cell.estado;
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
// HIDE/SHOW
// ================================================================
function toggleHide(sid) {
  var s = staff().find(function(x){ return x.id===sid; });
  if (hidden[sid]) { delete hidden[sid]; toast(s.name+' visible'); }
  else             { hidden[sid]=true;   toast(s.name+' oculto'); }
  save(); renderTable(); renderCov(); renderAusencias();
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
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;border:1px solid var(--border)">'
         + '<span style="font-size:.85rem;color:'+RCOL[c.role]+'">'+c.name
         + '<span class="rt r'+c.role+'" style="margin-left:5px">'+RLBL[c.role]+'</span></span>'
         + '<button onclick="delCam(\''+c.id+'\')" style="background:rgba(192,57,43,.2);border:1px solid rgba(192,57,43,.4);color:#e87c6f;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:.75rem;font-family:\'DM Sans\',sans-serif">X Eliminar</button>'
         + '</div>';
  }).join('');
}

// ================================================================
// RESET
// ================================================================
function resetAll() {
  if (!confirm('Borrar todos los datos?')) return;
  localStorage.clear();
  sched={}; hidden={};
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
      if(!d.rsch && !d.rcam) throw new Error('El archivo no es una copia del horario');
      if(!confirm('Esto reemplaza el horario que haya ahora. Continuar?')) { ev.target.value=''; return; }
      if(d.rsch)   localStorage.setItem('rsch',   JSON.stringify(d.rsch));
      if(d.rcam)   localStorage.setItem('rcam',   JSON.stringify(d.rcam));
      if(d.rhid)   localStorage.setItem('rhid',   JSON.stringify(d.rhid));
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
var THEME_KEYS = ['bg','surface','surface2','border','text','text2','gold','gold2','enc','coc','cam','shift-l','shift-c','shift-r','wk-vac-bg','wk-vac-txt','wk-fes-bg','wk-fes-txt','wk-baj-bg','wk-baj-txt','wk-aus-bg','wk-aus-txt'];
var THEME_DEFAULTS = {
  bg:'#0f0e0b', surface:'#1a1814', surface2:'#232017', border:'#2e2b22',
  text:'#f0ece0', text2:'#b0aa98', gold:'#c9a84c', gold2:'#e8c96d',
  enc:'#c9a84c', coc:'#e07b39', cam:'#5b9bd5',
  'shift-l':'#1a4a2e', 'shift-c':'#1a1814', 'shift-r':'#2a1a0a',
  'wk-vac-bg':'#0f3a5a', 'wk-vac-txt':'#74b3e0',
  'wk-fes-bg':'#3a0f0a', 'wk-fes-txt':'#e87c6f',
  'wk-baj-bg':'#3a0a0a', 'wk-baj-txt':'#f1948a',
  'wk-aus-bg':'#3a1a00', 'wk-aus-txt':'#f0a070'
};
var PRESETS = {
  dark:  {bg:'#0f0e0b',surface:'#1a1814',surface2:'#232017',border:'#2e2b22',text:'#f0ece0',text2:'#b0aa98',gold:'#c9a84c',gold2:'#e8c96d',enc:'#c9a84c',coc:'#e07b39',cam:'#5b9bd5','shift-l':'#1a4a2e','shift-c':'#1a1814','shift-r':'#2a1a0a'},
  light: {bg:'#f5f0e8',surface:'#ede8dc',surface2:'#e0d8c8',border:'#c8bfa8',text:'#2a2010',text2:'#6a5a3a',gold:'#8a6a1a',gold2:'#6a4a0a',enc:'#7a5500',coc:'#a04010',cam:'#1a5a8a','shift-l':'#c8e8d0','shift-c':'#e8e8d0','shift-r':'#e8d8b0'},
  navy:  {bg:'#060e1a',surface:'#0d1828',surface2:'#142234',border:'#1e3050',text:'#cce0ff',text2:'#7a9ac0',gold:'#5b9bd5',gold2:'#8ac0f0',enc:'#5b9bd5',coc:'#e07b39',cam:'#4caf50','shift-l':'#0a2a4a','shift-c':'#0a1a2a','shift-r':'#1a0a3a'},
  forest:{bg:'#070f09',surface:'#0e1e12',surface2:'#162a1a',border:'#1e3a22',text:'#d0f0d8',text2:'#7aaa88',gold:'#4caf50',gold2:'#80d888',enc:'#4caf50',coc:'#cddc39',cam:'#26c6da','shift-l':'#0a2a10','shift-c':'#0a1a0a','shift-r':'#1a2a0a'}
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
  if (weekMode) renderTable();
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
  Object.keys(p).forEach(function(k){ root.style.setProperty('--'+k,p[k]); });
  syncInputs(); if (weekMode) renderTable();
}
function saveTheme() {
  try { localStorage.setItem('rtheme', JSON.stringify(getThemeVals())); } catch(e){}
  toast('Tema guardado');
}
function loadTheme() {
  try {
    var d = localStorage.getItem('rtheme'); if (!d) return;
    var vals = JSON.parse(d);
    var root = document.documentElement;
    Object.keys(vals).forEach(function(k){ root.style.setProperty('--'+k, vals[k]); });
  } catch(e){}
}
function resetTheme() {
  var root = document.documentElement;
  Object.keys(THEME_DEFAULTS).forEach(function(k){ root.style.setProperty('--'+k, THEME_DEFAULTS[k]); });
  syncInputs(); try{localStorage.removeItem('rtheme');}catch(e){} toast('Colores restablecidos');
}
function openTheme()  { syncInputs(); var el=document.getElementById('themeov'); if(el)el.classList.add('show'); }
function closeTheme() { var el=document.getElementById('themeov'); if(el)el.classList.remove('show'); }

// ================================================================
// INIT
// ================================================================
function iniciarHorario(){
  load(); loadTheme();
  curM = new Date().getMonth();
  curS = autoS(curM);
  var bv=document.getElementById('bv'), bi=document.getElementById('bi');
  if(bv) bv.classList.toggle('on', curS==='verano');
  if(bi) bi.classList.toggle('on', curS==='invierno');
  renderAll();
  if (staff().length === 0) openAddModal();
}
iniciarHorario();
