function planRellenar(){
  var p = leerPlanDeLaVentana();
  guardarPlan(p);
  var dias;
  if (planModo === 'semana') {
    var w1 = planSemanasLargo()[planDesde()];
    dias = w1.dias; dias.forEach(function(d){ d.est = planEstacion(w1.k, w1.mes); });
  } else dias = planDiasDesde();
  var lista = planPersonas(p);
  if (!p.base) p.base = isoDe(lunesDe(new Date(dias[0].y, dias[0].m, dias[0].d)));
  var base = deIso(p.base);
  var ENT = planEntradas(p), E = horasDeEntrada(p);
  var SPLIT = !!p.split, ENT_E = SPLIT ? (p.entEnc || {}) : null, ENT_O = SPLIT ? p.entradas : null;
  var E_E = SPLIT ? horasDeEntradaTodas(ENT_E) : E, E_O = SPLIT ? horasDeEntradaTodas(ENT_O) : E;
  if (!E.length) { toast('Pon a qué hora entra la gente'); return; }
  var DESC = (+p.descanso || 0) * 60;
  var DESC_E = (+p.descEnc > 0 && +p.descEnc < +p.descanso) ? +p.descEnc * 60 : 0, excUsada = {};
  planDeshacer = JSON.stringify(sched);
  var avisos = [], puestos = 0, coberturas = [];
  /* Reglas de equipo */
  var cierresCnt = {}, NOC = p.noCoinciden || [], JUN = p.juntos || [];
  var MAXSEG = +p.maxSeguidos || 0;
  function trabajaEn(sid, d){ var c = gcAt(sid, d); return !!(c && c.estado === 'trabajo' && c.inicio); }
  function rachaAntes(sid, d){
    var n = 0;
    for (var i = 0; i < 21; i++) {
      var f = new Date(d.y, d.m, d.d - 1); d = {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()};
      if (!trabajaEn(sid, d)) break; n++;
    }
    return n;
  }
  function horasSemanaAntes(sid, fecha){
    var h = 0;
    for (var f = lunesDe(fecha); f < fecha; f.setDate(f.getDate() + 1)) {
      var c = gcAt(sid, {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()});
      if (c && c.estado === 'trabajo') h += horasDeCelda(c);
    }
    return h;
  }
  function catDe(min){ return min < 11*60 ? 'man' : min < 15*60 ? 'med' : 'noc'; }
  function nombreDe(sid){ var x = personaDe(sid); return x ? x.name : '?'; }

  function finDe(c){
    if (!c || c.estado !== 'trabajo' || !c.inicio || !c.fin) return null;
    var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
    if (c.inicio2 && c.fin2) { var a2 = aMin(c.inicio2), b2 = aMin(c.fin2); if (b2 <= a2) b2 += 1440; b = Math.max(b, b2); }
    return b;
  }
  function poner(sid, dia, data){
    if (!sched[dia.y]) sched[dia.y] = {};
    if (!sched[dia.y][dia.m]) sched[dia.y][dia.m] = {};
    if (!sched[dia.y][dia.m][sid]) sched[dia.y][dia.m][sid] = {};
    sched[dia.y][dia.m][sid][dia.d] = data;
  }
  function diaAntes(dia){ var f = new Date(dia.y, dia.m, dia.d - 1); return {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()}; }
  function diaDespues(dia){ var f = new Date(dia.y, dia.m, dia.d + 1); return {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()}; }

  /* El turno de cada uno esa semana. Si falta algún encargado toda la
     semana (vacaciones), los que quedan se reparten primero abrir y
     cerrar, y el mediodía solo si hay tres. */
  var tiposSem = {};
  var semIni = semanasEntre(base, new Date(dias[0].y, dias[0].m, dias[0].d));
  /* Lo que hizo de verdad cada uno una semana ya puesta. */
  function tiposReales(lunes){
    var r = {};
    lista.forEach(function(s){
      var n = {man:0, med:0, noc:0}, max = 0;
      for (var i = 0; i < 7; i++) {
        var f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
        var c = gcAt(s.id, {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()});
        if (!c || c.estado !== 'trabajo' || !c.inicio) continue;
        var a = aMin(c.inicio), fin = aMin(c.fin); if (fin <= a) fin += 1440;
        n[fin >= 25*60 - 1 ? 'noc' : a < 11*60 ? 'man' : 'med']++;
      }
      Object.keys(n).forEach(function(k){ if (n[k] > max) { max = n[k]; r[s.id] = k; } });
    });
    return r;
  }
  function tiposDe(sem, lunes){
    if (tiposSem[sem]) return tiposSem[sem];
    var r = {}, encs = [];
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'no') return;
      r[s.id] = planTipo(g, sem);
      if (g.grupo === 'enc' || g.grupo === 'enccoc') {
        var dispo = 0;
        for (var i = 0; i < 7; i++) {
          var f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
          var c = gcAt(s.id, {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()});
          if (!c || c.estado === 'trabajo' || c.estado === 'festivo' || c.estado === 'libre') dispo++;
        }
        if (dispo >= 4) encs.push(s.id);
      }
    });
    /* Dos encargados: alternan. El que cerró la semana anterior, abre. */
    if (encs.length === 2) {
      var ant = (sem > semIni) ? tiposDe(sem - 1, new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - 7)) : tiposReales(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - 7));
      var A = encs[0], B = encs[1];
      if (ant[A] === 'noc' && ant[B] !== 'noc') { r[A] = 'man'; r[B] = 'noc'; }
      else if (ant[B] === 'noc' && ant[A] !== 'noc') { r[B] = 'man'; r[A] = 'noc'; }
      else if (ant[A] === 'man' && ant[B] !== 'man') { r[A] = 'noc'; r[B] = 'man'; }
      else if (ant[B] === 'man' && ant[A] !== 'man') { r[B] = 'noc'; r[A] = 'man'; }
    }
    /* Tres encargados y uno es también cocina (Valeriano): él va una
       semana de mañana y otra de cierre, y el cocinero al revés. Los
       otros dos rotan en lo que queda: en cuatro semanas cada uno
       abre una, cierra otra y hace dos de mediodía. */
    var ec3 = encs.filter(function(id){ return p.gente[id].grupo === 'enccoc'; })[0];
    if (encs.length === 3 && ec3) {
      var k4 = ((sem % 4) + 4) % 4, otros = encs.filter(function(id){ return id !== ec3; });
      r[ec3] = (k4 % 2 === 0) ? 'man' : 'noc';
      r[otros[0]] = ['noc','med','med','man'][k4];
      r[otros[1]] = ['med','man','noc','med'][k4];
    }
    var falta = ['man','noc','med'].slice(0, encs.length);
    var quedan = [];
    encs.forEach(function(id){
      var i = falta.indexOf(r[id]);
      if (i >= 0) falta.splice(i, 1); else quedan.push(id);
    });
    quedan.forEach(function(id){ r[id] = falta.length ? falta.shift() : r[id]; });
    /* Cocina: si el que es encargado y cocina cierra esa semana, el
       cocinero va de día; si no, de noche. Así siempre hay cocina a
       mediodía y por la noche. */
    var ec = lista.filter(function(s){ var g = p.gente[s.id]; return g && g.grupo === 'enccoc' && encs.indexOf(s.id) >= 0; })[0];
    if (ec) lista.forEach(function(s){
      var g = p.gente[s.id];
      if (g && g.grupo === 'coc') r[s.id] = r[ec.id] === 'noc' ? 'man' : 'noc';
    });
    return (tiposSem[sem] = r);
  }

  /* La hora de entrada de cada camarero y del cocinero en una semana.
     Las horas de entrada de "camareros/cocina" (menos las 7, que son de
     quien abre siempre) se reparten: el cocinero a la primera si va de
     mañana o a la última si va de noche, y los camareros rotan por las
     que quedan, una semana cada una. Así cada uno entra toda la semana
     a la misma hora y cambia de una semana a otra. */
  var horaSem = {};
  function horasDe(sem, lunes){
    if (horaSem[sem]) return horaSem[sem];
    var r = {}, tps = tiposDe(sem, lunes);
    var hs = Object.keys(p.entradas || {}).filter(function(h){ return +p.entradas[h] > 0; }).map(Number).sort(function(a, b){ return a - b; });
    var hayAbre = lista.some(function(s){ var g = p.gente[s.id]; return g && g.abre; });
    if (hayAbre) hs = hs.filter(function(h){ return h !== hs[0]; });
    if (!hs.length) return (horaSem[sem] = r);
    function dispo(id){
      var n = 0;
      for (var i = 0; i < 7; i++) {
        var f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
        var c = gcAt(id, {y:f.getFullYear(), m:f.getMonth(), d:f.getDate()});
        if (!c || c.estado === 'trabajo' || c.estado === 'festivo' || c.estado === 'libre') n++;
      }
      return n >= 4;
    }
    var quedan = hs.slice();
    lista.forEach(function(s){
      var g = p.gente[s.id];
      if (!g || g.grupo !== 'coc' || !dispo(s.id)) return;
      var h = tps[s.id] === 'noc' ? quedan[quedan.length - 1] : quedan[0];
      r[s.id] = h;
      if (quedan.length > 1) quedan.splice(quedan.indexOf(h), 1);
    });
    var cams = lista.filter(function(s){ var g = p.gente[s.id]; return g && g.grupo === 'cam' && !g.abre && dispo(s.id); });
    cams.forEach(function(s, k){
      r[s.id] = quedan[(((k + sem) % quedan.length) + quedan.length) % quedan.length];
    });
    return (horaSem[sem] = r);
  }

  /* Reparto de las fiestas por la semana. El dia de cada uno manda; solo
     se toca cuando se amontonan: si un dia libran dos o mas y otro dia de
     esa misma semana no libra nadie, se pasa una fiesta al dia vacio. */
  var festMov = {};
  if (p.repFiestas !== false) (function(){
    var sems = {};
    dias.forEach(function(d){
      var f = new Date(d.y, d.m, d.d), k = semanasEntre(base, f);
      (sems[k] = sems[k] || {})[f.getDay()] = d;
    });
    Object.keys(sems).forEach(function(k){
      var dd = sems[k], cuenta = [0,0,0,0,0,0,0], quien = [[],[],[],[],[],[],[]];
      lista.forEach(function(st){
        var g = p.gente[st.id]; if (!g || g.grupo === 'no') return;
        var fd = g.fest; if (!(fd >= 0)) return;
        var dia = dd[fd]; if (!dia) return;                     /* ese dia queda fuera del rango */
        var c = gcAt(st.id, dia);
        if (c && c.estado && c.estado !== 'festivo') return;    /* vacaciones, baja o turno puesto a mano */
        cuenta[fd]++;
        if (!c) quien[fd].push(st);                             /* solo se mueve lo que pone el generador */
      });
      for (var vuelta = 0; vuelta < 14; vuelta++) {
        var lleno = -1, vacio = -1, i;
        for (i = 0; i < 7; i++) {
          if (dd[i] == null) continue;
          if (cuenta[i] === 0 && vacio < 0) vacio = i;
          if (cuenta[i] >= 2 && quien[i].length && (lleno < 0 || cuenta[i] > cuenta[lleno])) lleno = i;
        }
        if (lleno < 0 || vacio < 0) break;
        var movido = null, dDest = dd[vacio];
        for (var j = quien[lleno].length - 1; j >= 0; j--) {
          var cand = quien[lleno][j], g2 = p.gente[cand.id];
          if (gcAt(cand.id, dDest)) continue;                   /* ese dia ya tiene algo puesto */
          if (g2.propio && g2.propio[vacio] && !g2.propio[vacio].libre) continue;
          if (fest2Dia(g2, +k) === vacio) continue;             /* ya es su segunda fiesta */
          var fe = new Date(dDest.y, dDest.m, dDest.d);
          if (petActivas(g2, fe).some(function(x){ return x.t === 'libre'; })) continue;
          movido = cand; quien[lleno].splice(j, 1); break;
        }
        if (!movido) { quien[lleno] = []; continue; }            /* no hay a quien mover: se deja */
        festMov[movido.id + '|' + k] = vacio;
        cuenta[lleno]--; cuenta[vacio]++;
        avisos.push(DC_FULL[vacio] + ' ' + etiquetaDia(dDest, curM) + ': ' + movido.name +
          ' libra este día en vez del ' + DC_FULL[lleno] + ', para repartir las fiestas de la semana');
      }
    });
  })();

  dias.forEach(function(dia){
    /* La hora de cerrar: en invierno a las 3, en verano a la 1 */
    var CIERRE = (dia.est || curS) === 'invierno' ? 27*60 : 25*60;
    var fecha = new Date(dia.y, dia.m, dia.d);
    var sem = semanasEntre(base, fecha);
    var tSem = tiposDe(sem, lunesDe(fecha));
    var hSem = horasDe(sem, lunesDe(fecha));
    var fijos = [], libres = [];
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'no') return;
      var c = gcAt(s.id, dia);
      if (c && c.estado) { if (c.estado === 'trabajo' && c.inicio) { c._enc = (g.grupo === 'enc' || g.grupo === 'enccoc'); fijos.push(c); } return; }
      var pets = petActivas(g, fecha);
      var petLibre = pets.filter(function(x){ return x.t === 'libre'; })[0];
      if (petLibre) { poner(s.id, dia, {estado:'festivo', nota: petLibre.nota || ''}); return; }
      var fMov = festMov[s.id + '|' + sem];
      if ((fMov == null ? g.fest : fMov) === fecha.getDay()) { poner(s.id, dia, {estado:'festivo', nota:''}); return; }
      if (fest2Dia(g, sem) === fecha.getDay()) { poner(s.id, dia, {estado:'festivo', nota:''}); return; }
      /* Su horario propio de ese dia de la semana, tal cual */
      var pr = g.propio && g.propio[fecha.getDay()];
      if (pr && pr.libre) { poner(s.id, dia, {estado:'festivo', nota:''}); return; }
      if (pr && pr.ini && pr.fin) {
        var dp = {estado:'trabajo', inicio:pr.ini, fin:pr.fin, nota:''};
        if (pr.ini2 && pr.fin2) { dp.inicio2 = pr.ini2; dp.fin2 = pr.fin2; }
        poner(s.id, dia, dp); fijos.push({inicio:dp.inicio, _enc:(g.grupo === 'enc' || g.grupo === 'enccoc')}); puestos++;
        return;
      }
      /* Maximo de dias seguidos trabajando */
      if (MAXSEG && rachaAntes(s.id, dia) >= MAXSEG) {
        poner(s.id, dia, {estado:'festivo', nota:'Descanso'});
        avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + s.name + ' descansa (lleva ' + MAXSEG + ' días seguidos)');
        return;
      }
      var prev = finDe(gcAt(s.id, diaAntes(dia)));
      var sig = gcAt(s.id, diaDespues(dia));
      var sigIni = (sig && sig.estado === 'trabajo' && sig.inicio) ? aMin(sig.inicio) + 1440 : null;
      var tipo = tSem[s.id] || planTipo(g, sem);
      /* Las horas de su grupo; si con ellas no puede entrar, se prueban todas */
      function armar(horas){
      var cand = horas.map(function(h){ return turnoDe(s, g, h, dia.est); });
      /* Un camarero o cocinero tiene que cerrar con el encargado: si con
         las horas puestas nadie llega al cierre, se le deja entrar a la
         hora justa para salir al cerrar (con sus horas). */
      if (g.grupo !== 'enc' && g.grupo !== 'enccoc' && g.grupo !== 'fijo') {
        var t7 = turnoDe(s, g, 7, dia.est), hc = (CIERRE - (t7.b - t7.a)) / 60;
        if (hc >= 24) hc -= 24;
        if (hc === Math.floor(hc) && horas.indexOf(hc) < 0) { var tc = turnoDe(s, g, hc, dia.est); tc.cierre = true; cand.push(tc); }
      }
      /* Al encargado también: si con las horas puestas solo cierra
         quedándose de más, que pueda entrar a la hora justa. */
      if (g.grupo === 'enc' || g.grupo === 'enccoc') {
        var e7 = turnoDe(s, g, 7, dia.est), he = (CIERRE - (e7.b - e7.a)) / 60;
        if (he >= 24) he -= 24;
        if (he === Math.floor(he) && horas.indexOf(he) < 0) cand.push(turnoDe(s, g, he, dia.est));
      }
      var porTope = false;
      var prefs = cand.filter(function(t){
        if (prev !== null && t.a + 1440 - prev < DESC) {                   // descanso con el dia de antes
          /* Excepción: un encargado, un día a la semana, con menos descanso para cambiar de turno */
          if (esEncD && DESC_E && t.a + 1440 - prev >= DESC_E && !excUsada[semKey]) { t.exc = (t.a + 1440 - prev) / 60; return true; }
          return false;
        }
        if (sigIni !== null && sigIni - t.b < DESC) return false;          // y con el de despues si ya esta puesto
        if (+g.maxSem > 0 && yaH + (t.b - t.a) / 60 > +g.maxSem + 0.01) { porTope = true; return false; }   // tope de horas de la semana
        return true;
      });
      /* Sus peticiones de ese dia */
      var porPet = null;
      if (pets.length) {
        var antes = prefs;
        prefs = prefs.filter(function(t){
          return pets.every(function(x){ return petDeja(x, t, E, CIERRE); });
        });
        if (!prefs.length && antes.length) porPet = pets.filter(function(x){ return !antes.some(function(t){ return petDeja(x, t, E, CIERRE); }); })[0] || pets[0];
      }
      return {prefs:prefs, porTope:porTope, porPet:porPet};
      }
      var yaH = +g.maxSem > 0 ? horasSemanaAntes(s.id, fecha) : 0;
      var esEncD = g.grupo === 'enc' || g.grupo === 'enccoc';
      var semKey = s.id + '|' + isoDe(lunesDe(fecha));
      var arm = armar(planPrefsGrupo(g, tipo, E, E_E, E_O, p));
      if (!arm.prefs.length && SPLIT) { var arm2 = armar(planPrefs(g, tipo, E, p)); if (arm2.prefs.length) arm = arm2; }
      var prefs = arm.prefs, porTope = arm.porTope, porPet = arm.porPet;
      libres.push({s:s, g:g, tipo:tipo, hSem:hSem[s.id], prefs:prefs, porTope:porTope, porPet:porPet});
    });

    /* No coinciden: los dos fuera el mismo dia */
    NOC.forEach(function(par){
      var fuera = par.map(function(sid){ var c = gcAt(sid, dia); return !!(c && c.estado && c.estado !== 'trabajo' && c.estado !== 'libre'); });
      if (fuera[0] && fuera[1]) avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + nombreDe(par[0]) + ' y ' + nombreDe(par[1]) + ' libran a la vez');
    });
    /* El turno de los que ya estaban puestos, para «van juntos» */
    var catFijo = {}, horFijo = {};
    lista.forEach(function(s){
      var c = gcAt(s.id, dia); if (!(c && c.estado === 'trabajo' && c.inicio)) return;
      catFijo[s.id] = catDe(aMin(c.inicio));
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440; horFijo[s.id] = [a, b];
    });
    /* «No coincide con» / «Coincide con» de las peticiones de ese dia */
    var petNo = [], petSi = [];
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g) return;
      petActivas(g, fecha).forEach(function(x){
        if (!x.con || x.con === s.id) return;
        if (x.t === 'noCoincide') petNo.push([s.id, x.con]);
        if (x.t === 'coincide') petSi.push([s.id, x.con]);
      });
    });

    // Los que ya estaban puestos ese dia cuentan en su hora de entrada
    var base0 = {}, base0E = {}, base0O = {};
    E.forEach(function(h){ base0[h] = 0; base0E[h] = 0; base0O[h] = 0; });
    fijos.forEach(function(c){
      var h = Math.floor(aMin(c.inicio) / 60); if (base0[h] == null) return;
      base0[h]++; if (c._enc) base0E[h]++; else base0O[h]++;
      delete c._enc;
    });
    /* ¿Ya cierra algún encargado con lo que estaba puesto? */
    /* ¿Ya abre algún encargado con lo que estaba puesto? */
    var encFijoAbre = lista.some(function(s){
      var g = p.gente[s.id]; if (!g || (g.grupo !== 'enc' && g.grupo !== 'enccoc')) return false;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return false;
      return aMin(c.inicio) <= E[0] * 60;
    });
    var encFijoCierra = lista.some(function(s){
      var g = p.gente[s.id]; if (!g || (g.grupo !== 'enc' && g.grupo !== 'enccoc')) return false;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return false;
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
      return b >= CIERRE - 1;
    });
    /* ¿Y algún camarero o cocinero que cierre con él? */
    var otroFijoCierra = lista.some(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'enc' || g.grupo === 'enccoc' || g.grupo === 'no') return false;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return false;
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
      return b >= CIERRE - 1;
    });

    // Se prueban todas las combinaciones (son pocas) y se queda la mejor
    var mejor = null, mejorCoste = Infinity, n = libres.length;
    var elec = new Array(n);
    var encs = libres.map(function(l){ return l.g.grupo === 'enc' || l.g.grupo === 'enccoc'; });
    var cocs = libres.map(function(l){ return l.g.grupo === 'coc' || l.g.grupo === 'enccoc'; });
    var cubre = libres.map(function(l){ return !!l.g.cubreCoc && l.g.grupo !== 'coc' && l.g.grupo !== 'enccoc'; });
    var abreS = libres.map(function(l){ return !!l.g.abre; });
    /* ¿Alguno de los que abren siempre ya está puesto a la primera hora?
       ¿Y cuántos hay ya puestos para abrir? */
    var abreFijo = false, abrenFijo = 0;
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'no') return;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      if (aMin(c.inicio) > E[0] * 60) return;
      abrenFijo++;
      if (g.abre) abreFijo = true;
    });
    /* Nunca abre uno solo: dos a la primera hora. Si él ha puesto más en
       «cuántos entran a cada hora», manda lo suyo. */
    var MIN_ABREN = Math.max(2, SPLIT ? (+ENT_E[E[0]] || 0) + (+ENT_O[E[0]] || 0) : (+ENT[E[0]] || 0));
    /* La mañana no se queda corta. Si falta gente se quita de otro sitio:
       de dos no baja, aunque ese día haya vacaciones o fiestas. */
    var MIN_MAN = p.minMan == null ? 3 : (+p.minMan || 0);
    var manFijos = 0;
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'no') return;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      if (aMin(c.inicio) < 11 * 60) manFijos++;
    });
    /* Las comidas, de 13 a 15. Esto no es cuantos entran, es cuantos hay
       a la vez: uno que entra a las 8 y otro que entra a las 12 estan los
       dos dentro a las 13. Se mira a las 13 y a las 14 y manda la peor. */
    var COMIDAS = p.comidas == null ? 4 : (+p.comidas || 0);
    var comFijos = [0, 0];
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || g.grupo === 'no') return;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      var tramos = [[aMin(c.inicio), aMin(c.fin)]];
      if (c.inicio2 && c.fin2) tramos.push([aMin(c.inicio2), aMin(c.fin2)]);
      var d13 = false, d14 = false;
      tramos.forEach(function(t){
        var a = t[0], b = t[1]; if (b <= a) b += 1440;
        if (a <= 13*60 && b > 13*60) d13 = true;
        if (a <= 14*60 && b > 14*60) d14 = true;
      });
      if (d13) comFijos[0]++;
      if (d14) comFijos[1]++;
    });
    /* Cocina con lo que ya estaba puesto ese día */
    var cocFijoD = false, cocFijoN = false;
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g || (g.grupo !== 'coc' && g.grupo !== 'enccoc')) return;
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
      if (a <= 13*60 && b >= 15*60) cocFijoD = true;
      if (b >= 23*60) cocFijoN = true;
    });
    function evaluar(){
      var cov = {}, covE = {}, covO = {}, coste = 0;
      E.forEach(function(h){ cov[h] = base0[h]; covE[h] = base0E[h]; covO[h] = base0O[h]; });
      var encCierra = false, encAbre = false, cocDia = cocFijoD, cocNoche = cocFijoN;
      var cubD = false, cubN = false, encCierran = 0, cubNenc = false;
      var abreQuienDebe = abreFijo, abren = abrenFijo, encUnicoAbre = false, deMan = manFijos;
      var com13 = comFijos[0], com14 = comFijos[1];
      var otroCierra = otroFijoCierra, alCierre = 0, cats = {}, hors = {};
      for (var i = 0; i < n; i++) {
        var r = elec[i], tt = libres[i].prefs[r];
        coste += r * 4;
        if (tt.exc) coste += 10;                                            /* menos descanso: solo para cambiar de turno */
        if (encs[i] && tt.b > CIERRE + 30) coste += (tt.b - CIERRE) / 60 * 30;   /* encargado que se queda de más */
        cats[libres[i].s.id] = catDe(tt.a);
        /* El turno de su semana (rota cada semana): salirse de él cuesta.
           Menos que dejar sin cubrir la apertura, las comidas o el
           cierre, pero lo bastante para que no hagan siempre lo mismo. */
        var tSemI = libres[i].tipo, grI = libres[i].g.grupo;
        if (libres[i].hSem != null && !libres[i].g.abre && (grI === 'cam' || grI === 'coc')) {
          if (tt.h !== libres[i].hSem) coste += 150;
        } else if (tSemI && !libres[i].g.abre && (grI === 'cam' || grI === 'enc' || grI === 'enccoc' || grI === 'coc')) {
          var catI = (encs[i] && tt.b >= CIERRE - 1) ? 'noc' : catDe(tt.a);
          if (catI !== tSemI) coste += (grI === 'coc' && tSemI === 'man' && catI === 'med') ? 40 : ((grI === 'enc' || grI === 'enccoc') ? (tSemI === 'man' && catI === 'noc' ? 900 : 250) : 420);
        }
        /* Y dentro de la semana, a la misma hora que el día anterior:
           el turno cambia de una semana a otra, no de un día a otro. */
        var cAntI = (fecha.getDay() !== 1 && libres[i].hSem == null) ? gcAt(libres[i].s.id, diaAntes(dia)) : null;
        if (cAntI && cAntI.estado === 'trabajo' && cAntI.inicio && Math.floor(aMin(cAntI.inicio) / 60) !== tt.h && (!libres[i].tipo || catDe(aMin(cAntI.inicio)) === libres[i].tipo)) coste += 60;
        hors[libres[i].s.id] = [tt.a, tt.b];
        if (p.justo && tt.b >= CIERRE - 1) coste += (cierresCnt[libres[i].s.id] || 0) * 6;   /* reparto de cierres */
        if (cov[tt.h] != null) { cov[tt.h]++; if (encs[i]) covE[tt.h]++; else covO[tt.h]++; }
        if (tt.cierre) alCierre++;
        if (!encs[i] && tt.b >= CIERRE - 1) otroCierra = true;
        if (encs[i] && tt.b >= CIERRE - 1) { encCierra = true; encCierran++; }
        if (cubre[i] && tt.a <= 13*60 && tt.b >= 15*60) cubD = true;
        if (cubre[i] && tt.b >= 23*60) { if (encs[i] && tt.b >= CIERRE - 1) cubNenc = true; else cubN = true; }
        if (tt.a < 11*60) deMan++;
        if (tt.a <= 13*60 && tt.b > 13*60) com13++;
        if (tt.a <= 14*60 && tt.b > 14*60) com14++;
        if (tt.a <= E[0]*60) {
          abren++;
          if (abreS[i]) abreQuienDebe = true;
          if (encs[i]) { encAbre = true; if (encsLibres < 2) encUnicoAbre = true; }
        }
        /* El que abre siempre, puesto a otra hora teniendo la primera */
        if (abreS[i] && tt.a > E[0]*60 &&
            libres[i].prefs.some(function(x){ return x.a <= E[0]*60; })) coste += 400;
        if (cocs[i] && tt.a <= 13*60 && tt.b >= 15*60) cocDia = true;
        if (cocs[i] && tt.b >= 23*60) cocNoche = true;
      }
      /* Cada hora, los que tienen que entrar. Cuando no da para todos hay
         que dejar algun hueco, y no da igual cual: el que se queda sin
         cubrir tiene que ser el del mediodia. La mañana y la noche son
         las que sacan el trabajo adelante; el mediodia es el que aguanta
         con menos. Antes todas las horas del medio costaban lo mismo, asi
         que el hueco caia donde cayera y lo normal era que le tocase a
         la mañana. */
      if (!SPLIT) for (var k = 0; k < E.length; k++) {
        var h = E[k], need = +ENT[h] || 0, c = cov[h];
        var punta = k === 0 || k === E.length - 1;
        if (c < need) coste += (need - c) * (punta ? 340 : costeHueco(h, p));
        else if (c > need) coste += (c - need) * (punta ? 40 : 3);
      }
      /* Encargados y los demás, cada uno con sus horas */
      else for (var k2 = 0; k2 < E.length; k2++) {
        var h2 = E[k2], nE = +ENT_E[h2] || 0, nO = +ENT_O[h2] || 0;
        var pO = E_O.length && (h2 === E_O[0] || h2 === E_O[E_O.length - 1]);
        if (covE[h2] < nE) coste += (nE - covE[h2]) * costeHueco(h2, p);
        else if (covE[h2] > nE) coste += (covE[h2] - nE) * 20;
        if (covO[h2] < nO) coste += (nO - covO[h2]) * (pO ? 340 : costeHueco(h2, p));
        else if (covO[h2] > nO) coste += (covO[h2] - nO) * (pO ? 40 : 3);
      }
      JUN.forEach(function(par){
        var a = cats[par[0]] || catFijo[par[0]], b = cats[par[1]] || catFijo[par[1]];
        if (a && b && a !== b) coste += 150;            /* van juntos: mismo turno */
      });
      petSi.forEach(function(par){
        var a = cats[par[0]] || catFijo[par[0]], b = cats[par[1]] || catFijo[par[1]];
        if (a && b && a !== b) coste += 180;            /* peticion: coincide con */
      });
      petNo.forEach(function(par){
        var a = hors[par[0]] || horFijo[par[0]], b = hors[par[1]] || horFijo[par[1]];
        if (a && b && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= 60) coste += 220;   /* peticion: no coincide con */
      });
      /* La mañana, lo primero después del cierre: sale más caro dejarla
         corta que dejar un hueco a cualquier otra hora, así que si falta
         gente la quita de la noche o del mediodía, no de la mañana. */
      if (deMan < MIN_MAN) coste += (MIN_MAN - deMan) * 360;
      /* En las comidas no se puede estar corto: va por delante de dejar
         un hueco a cualquier hora, y solo cede ante abrir y cerrar. */
      var comN = Math.min(com13, com14);
      if (COMIDAS && comN < COMIDAS) coste += (COMIDAS - comN) * 370;
      if (!encCierra && !encFijoCierra) coste += 2000;   /* siempre cierra un encargado */
      if (!otroCierra) coste += 280;                    /* y con él, un camarero o cocinero */
      if (alCierre > 1) coste += (alCierre - 1) * 200;  /* uno solo de más para cerrar */
      /* A la primera hora entra siempre el que abre (Tamara) */
      if (!abreQuienDebe && hayQuienAbre) coste += 500;
      /* Y nunca se abre solo: dos, esté ella o no. Si no está, uno es el
         encargado y con él entra otro. */
      if (abren < MIN_ABREN) coste += (MIN_ABREN - abren) * 320;
      /* Y con él un encargado. Si sólo queda uno libre, ese tiene que
         cerrar: entonces no abre él, abre otro, y eso no cuesta nada. */
      if (!encAbre && !encFijoAbre) coste += encsLibres >= 2 ? 260 : 0;
      if (encUnicoAbre) coste += 1500;                   /* el único encargado del día cierra, no abre */
      /* Cocina: el cocinero, o si no, uno de los que pueden cubrirla. Un
         encargado que cubre la cocina no cuenta como el que cierra. */
      if (cubNenc && encCierran >= 2) cubN = true;
      if (!cocDia) coste += cubD ? 6 : 250;
      if (!cocNoche) coste += cubN ? 6 : 250;
      return {coste:coste, cov:cov, covE:covE, covO:covO};
    }
    function probar(i){
      if (i === n) {
        var e = evaluar();
        if (e.coste < mejorCoste) { mejorCoste = e.coste; mejor = {elec:elec.slice(), e:e}; }
        return;
      }
      var ps = libres[i].prefs;
      if (!ps.length) { elec[i] = null; return; }
      for (var k = 0; k < ps.length; k++) { elec[i] = k; probar(i + 1); }
    }
    libres = libres.filter(function(l){
      if (!l.prefs.length && l.porTope) {
        poner(l.s.id, dia, {estado:'festivo', nota:'Tope horas'});
        avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + l.s.name + ' libra porque llega a su tope de ' + l.g.maxSem + ' h a la semana');
        return false;
      }
      if (!l.prefs.length && l.porPet) { avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + l.s.name + ' no tiene ningún turno que cumpla «' + petTexto(l.porPet) + '» (lo dejo vacío)'); return false; }
      if (!l.prefs.length) { avisos.push(etiquetaDia(dia, curM) + ': ' + l.s.name + ' no puede entrar por el descanso'); return false; }
      return true;
    });
    n = libres.length;
    encs = libres.map(function(l){ return l.g.grupo === 'enc' || l.g.grupo === 'enccoc'; });
    cocs = libres.map(function(l){ return l.g.grupo === 'coc' || l.g.grupo === 'enccoc'; });
    cubre = libres.map(function(l){ return !!l.g.cubreCoc && l.g.grupo !== 'coc' && l.g.grupo !== 'enccoc'; });
    abreS = libres.map(function(l){ return !!l.g.abre; });
    elec = new Array(n);
    var encsLibres = encs.filter(Boolean).length + lista.filter(function(s){
      var g = p.gente[s.id]; if (!g || (g.grupo !== 'enc' && g.grupo !== 'enccoc')) return false;
      var c = gcAt(s.id, dia); return !!(c && c.estado === 'trabajo' && c.inicio);
    }).length;
    /* ¿Hay alguien marcado «abre» que ese día pueda hacerlo? Si libra o
       está de vacaciones no se le puede exigir, y abre quien toque. */
    var hayQuienAbre = abreFijo || libres.some(function(l){
      return l.g.abre && l.prefs.some(function(t){ return t.a <= E[0]*60; });
    });
    probar(0);
    if (!mejor) return;
    libres.forEach(function(l, i){
      var t = l.prefs[mejor.elec[i]];
      poner(l.s.id, dia, {estado:'trabajo', inicio:t.ini, fin:t.fin, nota:''});
      if (t.exc) {
        excUsada[l.s.id + '|' + isoDe(lunesDe(fecha))] = 1;
        avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + l.s.name + ' descansa solo ' + (Math.round(t.exc * 10) / 10) + ' h (cambio de turno)');
      }
      puestos++;
    });
    lista.forEach(function(s){
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
      if (b >= CIERRE - 1) cierresCnt[s.id] = (cierresCnt[s.id] || 0) + 1;
    });
    var e = mejor.e, falta = [];
    E.forEach(function(h){
      if (SPLIT) {
        var nO = +ENT_O[h] || 0;
        if (e.covO[h] < nO) falta.push('a las ' + h + ' h entran ' + e.covO[h] + ' de ' + nO + ' (camareros/cocina)');
        return;
      }
      var need = +ENT[h] || 0;
      if (e.cov[h] < need) falta.push('a las ' + h + ' h entran ' + e.cov[h] + ' de ' + need);
    });
    /* Lo que no es una cuenta pero conviene saber: que cierre un
       encargado y que haya cocina a mediodía y por la noche. */
    var encC = false, cocD = false, cocN = false, otroC = false, encA = false, encHoy = 0;
    var abreOk = false, abrenN = 0, abreDebe = [];
    lista.forEach(function(s){
      var g = p.gente[s.id]; if (!g) return;
      if (g.abre && g.grupo !== 'no') abreDebe.push(s);
      var c = gcAt(s.id, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return;
      var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
      var esEnc = g.grupo === 'enc' || g.grupo === 'enccoc', esCoc = g.grupo === 'coc' || g.grupo === 'enccoc';
      if (a <= E[0] * 60) { abrenN++; if (g.abre) abreOk = true; }
      if (esEnc && b >= CIERRE - 1) encC = true;
      if (esEnc) encHoy++;
      if (esEnc && a <= E[0] * 60) encA = true;
      if (!esEnc && g.grupo !== 'no' && b >= CIERRE - 1) otroC = true;
      if (esCoc && a <= 13*60 && b >= 15*60) cocD = true;
      if (esCoc && b >= 23*60) cocN = true;
    });
    /* Sin cocinero en un turno: lo cubre un camarero que ya esté en
       ese turno ese día, y se le apunta «Cocina» en la nota. */
    function cubrirCocina(deNoche){
      var cand = libres.filter(function(l){ return l.g.cubreCoc && l.g.grupo !== 'coc' && l.g.grupo !== 'enccoc'; }).map(function(l){
        var c = gcAt(l.s.id, dia), a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440;
        var vale = deNoche ? b >= 23*60 : (a <= 13*60 && b >= 15*60);
        var esEnc = l.g.grupo === 'enc';
        return vale ? {l:l, c:c, rank: (esEnc ? 2 : 0) + (deNoche ? 0 : (a >= 9*60 ? 0 : 1))} : null;
      }).filter(Boolean).sort(function(x, y){ return x.rank - y.rank; });
      if (!cand.length) return null;
      cand[0].c.nota = 'Cocina';
      coberturas.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + cand[0].l.s.name + ' cubre la cocina ' + (deNoche ? 'por la noche' : 'a mediodía'));
      cand.forEach(function(x){ x.usado = true; });
      return cand[0].l.s.name;
    }
    if (libres.length) {
      if (!encC) falta.push('no cierra ningún encargado');
      /* Quien abre siempre, y con él un encargado. Con un solo encargado
         ese día no se le pide: tiene que cerrar, y abre otro. */
      if (!abrenN) falta.push('no abre nadie a las ' + E[0] + ' h');
      else if (abrenN < MIN_ABREN) falta.push('a las ' + E[0] + ' h abre' + (abrenN === 1 ? ' uno solo' : 'n ' + abrenN) + ' (hacen falta ' + MIN_ABREN + ')');
      if (abrenN && !abreOk && abreDebe.length) {
        var pend = abreDebe.filter(function(s){
          var c = gcAt(s.id, dia); return c && c.estado === 'trabajo';
        });
        if (pend.length) falta.push(pend.map(function(s){ return s.name; }).join(' y ') + ' no abre');
      }
      if (!encA && encHoy >= 2) falta.push('no abre ningún encargado');
      if (!encA && encHoy === 1) coberturas.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': sólo hay un encargado y cierra, así que abre otro');
      if (!otroC) falta.push('el encargado cierra solo (sin camarero ni cocinero)');
      if (!cocD && !cubrirCocina(false)) falta.push('sin cocina a mediodía');
      if (!cocN && !cubrirCocina(true)) falta.push('sin cocina por la noche');
    }
    function horDe(sid){ var c = gcAt(sid, dia); if (!c || c.estado !== 'trabajo' || !c.inicio) return null; var a = aMin(c.inicio), b = aMin(c.fin); if (b <= a) b += 1440; return [a, b]; }
    petNo.forEach(function(par){
      var a = horDe(par[0]), b = horDe(par[1]);
      if (a && b && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= 60) falta.push(nombreDe(par[0]) + ' coincide con ' + nombreDe(par[1]) + ' (pidió que no)');
    });
    petSi.forEach(function(par){
      var a = horDe(par[0]), b = horDe(par[1]);
      if (a && b && catDe(a[0]) !== catDe(b[0])) falta.push(nombreDe(par[0]) + ' no coincide con ' + nombreDe(par[1]) + ' (pidió que sí)');
    });
    if (falta.length && libres.length) avisos.push(DC_FULL[fecha.getDay()] + ' ' + etiquetaDia(dia, curM) + ': ' + falta.join(', '));
  });

  var resumen = planResumen(p, lista, dias, avisos);
  guardarPlan(p);
  save();
  renderAll();
  var caja = document.getElementById('plan-res');
  if (caja) {
    caja.innerHTML = '<b style="color:var(--gold2)">Hecho: ' + puestos + ' turnos puestos.</b> Revísalo y cambia lo que quieras tocando el día.' + resumen +
      (coberturas.length ? '<div style="margin-top:6px;color:var(--text2)">Cocina cubierta (llevan la nota «Cocina»):<br>' + coberturas.map(esc).join('<br>') + '</div>' : '') +
      (avisos.length ? '<div style="margin-top:6px;color:#e8a020">Para que lo mires:<br>' + avisos.map(esc).join('<br>') + '</div>' : '');
  }
  var bd = document.getElementById('plan-deshacer'); if (bd) bd.style.display = '';
  toast(puestos + ' turnos puestos' + (avisos.length ? ' · revisa los avisos' : ''));
}
