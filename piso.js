// ── DATOS HISTÓRICOS COMPLETOS CON SUMINISTROS REALES ─────────────────────────
const DATA_VERSION = 5; // fuerza recarga: elimina cuota de meses anteriores a 2026-05

// Helper: m(mes, alq, otros, elecD, elecCob, calA, calAct, calP, calCon, calCob, aguaA, aguaAct, aguaP, aguaCon, aguaCob)
function mk(mes,alq,otros, ed,ec, cA,cAct,cP,cCon,cCob, aA,aAct,aP,aCon,aCob){
  const calCons=cAct!=null?Math.max(0,cAct-cA):0;
  const aguaCons=aAct!=null?Math.max(0,aAct-aA):0;
  const tot=alq+(ec||0)+(cCob||0)+(aCob||0);
  return {mes,alq,otros:otros||0,
    elec_directo:ed||0, elec_con:ed||0, elec_cob:ec||0,
    cal_ant:cA||0, cal_act:cAct||0, cal_preu:cP||0, cal_cons:calCons, cal_con:cCon||0, cal_cob:cCob||0,
    agua_ant:aA||0, agua_act:aAct||0, agua_preu:aP||0, agua_cons:aguaCons, agua_con:aCon||0, agua_cob:aCob||0,
    total:Math.round(tot*100)/100};
}

const MESES_INIT = [];

// Valores de partida. Todo esto se rellena desde Configuracion y viaja
// en los datos privados, nunca en este archivo, que es publico.
const CFG_DEFAULT = {
  inq:'', alq:0, cuota:0, cuotaDesde:'',
  calPreu:0, aguaPreu:0, elecPreu:0,
  cal:0, agua:0, elec:0,
  cierre:'Muchas gracias 🙏',
  invCompra:0, invNotario:0, invImpuesto:0, invCatastro:0,
  invInicial:0, invReforma:0, depRecibido:0
};


const GASTOS_INIT = [];

// Inversion: se calcula con lo que haya en Configuracion
function invCompra(){
  return (cfg.invCompra||0)+(cfg.invNotario||0)+(cfg.invImpuesto||0)+(cfg.invCatastro||0);
}
function invReformas(){ return (cfg.invInicial||0)+(cfg.invReforma||0); }
function invTotal(){    return invCompra()+invReformas(); }
function depRecibido(){ return cfg.depRecibido||0; }

// ── STORAGE ───────────────────────────────────────────────────────────────────
const LS={
  get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},
  set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))
};

// Primera vez en este dispositivo: sembrar solo las claves que falten.
// Nunca se sobreescribe nada que ya exista.
if(localStorage.getItem('piso_meses')  === null) LS.set('piso_meses',  MESES_INIT);
if(localStorage.getItem('piso_cfg')    === null) LS.set('piso_cfg',    CFG_DEFAULT);
if(localStorage.getItem('piso_gastos') === null) LS.set('piso_gastos', GASTOS_INIT);
if(localStorage.getItem('piso_data_version') === null) LS.set('piso_data_version', DATA_VERSION);

let cfg       = LS.get('piso_cfg')    || CFG_DEFAULT;
let meses     = LS.get('piso_meses')  || MESES_INIT;
let gastos    = LS.get('piso_gastos') || GASTOS_INIT;
let inquilinos= LS.get('piso_inq')    || [];

const INQ_REALES = [];
// Inquilinos reales si no hay datos
if(!LS.get('piso_inq')) LS.set('piso_inq', inquilinos);


// ── NAV ───────────────────────────────────────────────────────────────────────
const TABS = ['dashboard','recibo','recibos','gastos','inquilinos','inversion','config'];
function show(tab){
  TABS.forEach(t=>document.getElementById('tab-'+t).style.display=t===tab?'':'none');
  document.querySelectorAll('nav button').forEach((b,i)=>b.classList.toggle('active',TABS[i]===tab));
  if(tab==='dashboard')  renderDash();
  if(tab==='recibo')     initRecibo();
  if(tab==='recibos')    renderRecibos();
  if(tab==='gastos')     renderGastos();
  if(tab==='inquilinos') renderInquilinos();
  if(tab==='inversion')  renderInversion();
  if(tab==='config')     loadCfg();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDash(){
  const totAlq  = meses.reduce((s,m)=>s+m.total,0);
  const totOtros= meses.reduce((s,m)=>s+(m.otros||0),0);
  const totGas  = gastos.reduce((s,g)=>s+g.imp,0);
  const ben     = totAlq+totOtros-totGas;

  document.getElementById('metrics').innerHTML=`
    <div class="metric"><div class="metric-label">Total alquileres cobrados</div><div class="metric-value text-success">${fmt(totAlq)} €</div></div>
    <div class="metric"><div class="metric-label">Otros ingresos</div><div class="metric-value text-info">${fmt(totOtros)} €</div></div>
    <div class="metric"><div class="metric-label">Total gastos operativos</div><div class="metric-value text-danger">${fmt(totGas)} €</div></div>
    <div class="metric"><div class="metric-label">Beneficio neto operativo</div><div class="metric-value ${ben>=0?'text-success':'text-danger'}">${fmt(ben)} €</div></div>`;

  const years=[...new Set(meses.map(m=>m.mes.slice(0,4)))].sort();
  const anualRows=years.map(y=>{
    const ms=meses.filter(m=>m.mes.startsWith(y));
    const gs=gastos.filter(g=>g.fecha.startsWith(y));
    const yAlq=ms.reduce((s,m)=>s+m.total,0);
    const yOtr=ms.reduce((s,m)=>s+(m.otros||0),0);
    const yGas=gs.reduce((s,g)=>s+g.imp,0);
    const yBen=yAlq+yOtr-yGas;
    return `<tr class="yr-row">
      <td>${y}</td>
      <td class="tr">${fmt(yAlq)} €</td>
      <td class="tr ${yOtr>0?'text-info':'text-muted'}">${fmt(yOtr)} €</td>
      <td class="tr text-danger">${fmt(yGas)} €</td>
      <td class="tr ${yBen>=0?'text-success':'text-danger'}">${fmt(yBen)} €</td>
    </tr>`;
  }).join('');
  document.getElementById('tabla-anual').innerHTML=`
    <table><thead><tr><th>Año</th><th class="tr">Alquiler</th><th class="tr">Otros ing.</th><th class="tr">Gastos</th><th class="tr">Beneficio</th></tr></thead>
    <tbody>${anualRows}</tbody></table>`;

  const sorted=[...meses].sort((a,b)=>b.mes.localeCompare(a.mes));
  document.getElementById('tabla-meses').innerHTML=sorted.length===0?'<div class="empty">Sin registros aún.</div>':
    `<table><thead><tr><th>Mes</th><th class="tr">Alquiler</th><th class="tr">Suministros</th><th class="tr">Otros</th><th class="tr">Total recibo</th><th></th></tr></thead>
    <tbody>${sorted.map(m=>{
      const sum=m.cal_cob+m.agua_cob+m.elec_cob;
      return `<tr>
        <td class="fw500">${fmtMes(m.mes)}</td>
        <td class="tr">${fmt(m.alq)} €</td>
        <td class="tr text-muted">${fmt(sum)} €</td>
        <td class="tr ${(m.otros||0)>0?'text-info':'text-muted'}">${fmt(m.otros||0)} €</td>
        <td class="tr fw500">${fmt(m.total)} €</td>
        <td style="text-align:right"><button class="btn-ghost" onclick="delMes('${m.mes}')">×</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;

  const gs=[...gastos].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  document.getElementById('tabla-gastos-dash').innerHTML=gs.length===0?'<div class="empty">Sin gastos.</div>':
    `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="tr">Importe</th></tr></thead>
    <tbody>${gs.map(g=>`<tr>
      <td class="text-muted" style="white-space:nowrap">${g.fecha}</td>
      <td style="white-space:nowrap">${etiquetaTipo(g)}</td>
      <td>${g.desc}</td>
      <td class="tr text-danger">${fmt(g.imp)} €</td>
    </tr>`).join('')}</tbody></table>
    <div class="total-row"><span class="text-muted" style="font-size:12px">Total acumulado</span><span class="text-danger fw500">${fmt(totGas)} €</span></div>`;
}

// ── INVERSIÓN ─────────────────────────────────────────────────────────────────
function renderDesgloseInversion(){
  const filaHtml = (etiqueta, valor, destacada) =>
    `<div class="inv-row"${destacada?' style="border-top:2px solid var(--border);margin-top:4px;padding-top:10px"':''}>`
    + `<span class="${destacada?'fw500':'text-muted'}">${etiqueta}</span>`
    + `<span class="${destacada?'fw500':''}"${destacada?' style="font-size:16px"':''}>${fmt(valor)} €</span></div>`;

  const compra = document.getElementById('inv-compra-box');
  if(compra){
    compra.innerHTML =
      filaHtml('Precio de compra', cfg.invCompra||0)
      + filaHtml('Notario', cfg.invNotario||0)
      + filaHtml('Impuesto de compra', cfg.invImpuesto||0)
      + filaHtml('Catastro', cfg.invCatastro||0)
      + filaHtml('Total coste compra', invCompra(), true)
      + (depRecibido()>0
          ? `<div style="background:var(--accent-bg);border-radius:8px;padding:10px 12px;margin-top:12px;display:flex;justify-content:space-between;font-size:14px">
               <span style="color:var(--accent)">Deposito inquilino recibido</span>
               <span style="color:var(--accent);font-weight:500">− ${fmt(depRecibido())} €</span></div>`
          : '');
  }

  const reformas = document.getElementById('inv-reformas-box');
  if(reformas){
    reformas.innerHTML =
      filaHtml('Inversion inicial', cfg.invInicial||0)
      + filaHtml('Reforma y amueblado', cfg.invReforma||0)
      + filaHtml('Total reformas', invReformas(), true)
      + `<div class="inv-row" style="font-size:15px"><span class="fw500">TOTAL INVERTIDO</span>`
      + `<span class="fw500" style="font-size:17px">${fmt(invTotal())} €</span></div>`;
  }
}

function renderInversion(){
  renderDesgloseInversion();
  const totAlq=meses.reduce((s,m)=>s+m.total+(m.otros||0),0);
  const totGas=gastos.reduce((s,g)=>s+g.imp,0);
  const ben=totAlq-totGas;
  const capRecuperado=Math.max(0,ben+depRecibido());
  const TOTAL=invTotal();
  const pendiente=Math.max(0,TOTAL-capRecuperado);
  const roi=TOTAL>0?(capRecuperado/TOTAL*100):0;
  const pctRec=TOTAL>0?Math.min(100,capRecuperado/TOTAL*100):0;

  // Calcular años estimados para recuperar
  const numAnios=[...new Set(meses.map(m=>m.mes.slice(0,4)))].length;
  const benAnualMed=numAnios>0?ben/numAnios:900*12;
  const anosEst=benAnualMed>0?pendiente/benAnualMed:Infinity;

  document.getElementById('inv-metrics').innerHTML=`
    <div class="metric"><div class="metric-label">ROI acumulado</div><div class="metric-value ${roi>=0?'text-success':'text-danger'}">${roi.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Capital recuperado</div><div class="metric-value text-success">${fmt(capRecuperado)} €</div></div>
    <div class="metric"><div class="metric-label">Capital pendiente</div><div class="metric-value text-danger">${fmt(pendiente)} €</div></div>
    <div class="metric"><div class="metric-label">Beneficio neto</div><div class="metric-value ${ben>=0?'text-success':'text-danger'}">${fmt(ben)} €</div></div>`;

  document.getElementById('ii-total').textContent=fmt(TOTAL)+' €';
  document.getElementById('ii-ing').textContent=fmt(totAlq)+' €';
  document.getElementById('ii-gas').textContent=fmt(totGas)+' €';
  document.getElementById('ii-ben').textContent=fmt(ben)+' €';
  document.getElementById('ii-pend').textContent=fmt(pendiente)+' €';

  document.getElementById('inv-proy').innerHTML=`
    <div style="font-size:22px;font-weight:500;margin-bottom:4px;color:${pendiente>0?'var(--warn)':'var(--accent)'}">${pendiente>0?'~'+anosEst.toFixed(1)+' años más':'¡Inversión recuperada!'}</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:16px">Estimado con ${fmt(benAnualMed)} €/año de beneficio neto medio</div>
    <div style="background:var(--surface2);border-radius:8px;height:10px;overflow:hidden;margin-bottom:6px">
      <div style="background:var(--accent);height:100%;width:${pctRec.toFixed(1)}%;border-radius:8px;transition:width .6s"></div>
    </div>
    <div style="font-size:12px;color:var(--muted)">${pctRec.toFixed(1)}% del total invertido recuperado · ${fmt(capRecuperado)} € de ${fmt(TOTAL)} €</div>`;
}

// Calcula saldo acumulado de todos los meses anteriores al indicado
// + = inquilino tiene a favor   − = inquilino debe
function toggleEditSaldo(){
  const box=document.getElementById('saldo-editable');
  const btn=document.getElementById('btn-edit-saldo');
  const abierto=box.style.display!=='none';
  box.style.display=abierto?'none':'block';
  btn.textContent=abierto?'✏️ Modificar saldo':'✕ Cerrar';
  if(!abierto){
    // Pre-rellenar con el valor actual
    const actual=parseFloat(document.getElementById('saldo-ant').dataset.valor||0);
    document.getElementById('saldo-manual').value=actual!==0?actual:'';
  }
}

function aplicarSaldoManual(){
  const val=parseFloat(document.getElementById('saldo-manual').value)||0;
  document.getElementById('saldo-ant').dataset.valor=val;
  document.getElementById('saldo-ant').dataset.manual='1';
  actualizarDisplaySaldo(val);
  calcular();
}

function resetSaldo(){
  document.getElementById('saldo-ant').dataset.manual='';
  document.getElementById('saldo-manual').value='';
  // Recalcular automático
  const mesSel=document.getElementById('r-mes').value;
  const saldo=calcularSaldoAcumulado(mesSel);
  document.getElementById('saldo-ant').dataset.valor=saldo;
  actualizarDisplaySaldo(saldo);
  const desde=cfg.cuotaDesde||'0000-00';
  const mesesAnt=[...meses].filter(m=>m.mes<mesSel&&m.mes>=desde).sort((a,b)=>a.mes.localeCompare(b.mes));
  document.getElementById('saldo-origen').textContent=
    mesesAnt.length>0?'Calculado automáticamente desde '+fmtMes(mesesAnt[0].mes)+' ('+mesesAnt.length+' meses)':'Sin meses anteriores con cuota';
  calcular();
}

function actualizarDisplaySaldo(saldo){
  const spd=document.getElementById('saldo-prev-display');
  spd.textContent=(saldo>0?'+ ':saldo<0?'− ':'')+fmt(Math.abs(saldo))+' €';
  spd.style.color=saldo>0?'var(--accent)':saldo<0?'var(--danger)':'var(--muted)';
  document.getElementById('cuota-mes-display').textContent='+ '+fmt(cfg.cuota||0)+' €';
}


function calcularSaldoAcumulado(hastaExcluido){
  const desde = cfg.cuotaDesde || '0000-00'; // si no hay fecha, cuenta todo
  const ordenados=[...meses]
    .filter(m => (!hastaExcluido || m.mes < hastaExcluido) && m.mes >= desde)
    .sort((a,b)=>a.mes.localeCompare(b.mes));
  let saldo=0;
  for(const m of ordenados){
    /* Cada recibo guarda la cuota con la que se emitio. Solo los meses
       antiguos, que no la llevan, usan la de Configuracion. Con != null
       una cuota de 0 € guardada cuenta como 0 y no como la de hoy. */
    const c=(m.cuota!=null)?m.cuota:(cfg.cuota||0);
    const consumo=(m.cal_cob||0)+(m.agua_cob||0)+(m.elec_cob||0);
    saldo+=c-consumo;
  }
  return Math.round(saldo*100)/100;
}

// ── RECIBO ────────────────────────────────────────────────────────────────────
function initRecibo(){
  const now=new Date();
  const mesSel=now.toISOString().slice(0,7);
  document.getElementById('r-mes').value=mesSel;
  document.getElementById('r-alq').value=cfg.alq||'';
  // Mostrar cuota configurada
  const cuotaEl=document.getElementById('cuota-display');
  if(cuotaEl) cuotaEl.textContent=fmt(cfg.cuota||0)+' €';
  ['cal','agua'].forEach(k=>{
    document.getElementById('p-'+k).textContent=cfg[k]||0;
    const ultimos=[...meses].filter(m=>m[k+'_act']!=null&&m[k+'_act']!==''&&m[k+'_act']!==0)
                             .sort((a,b)=>b.mes.localeCompare(a.mes));
    const last=ultimos[0];
    document.getElementById(k+'-ant').value=last?last[k+'_act']:'';
    document.getElementById(k+'-act').value='';
    const preuCfg=cfg[k+'Preu'];
    document.getElementById(k+'-preu').value=preuCfg||(last?last[k+'_preu']:'')||'';
    set(k+'-cons','');set('r-'+k,'');set(k+'-cob','');
  });
  document.getElementById('p-elec').textContent=cfg.elec||0;
  document.getElementById('elec-directo').value=cfg.elecPreu||'';
  set('elec-cob','');

  // Saldo acumulado automático (salvo que haya uno manual activo)
  const saldoEl=document.getElementById('saldo-ant');
  const esManual=saldoEl.dataset.manual==='1';
  const saldo=esManual?parseFloat(saldoEl.dataset.valor||0):calcularSaldoAcumulado(mesSel);
  const desde=cfg.cuotaDesde||'0000-00';
  const mesesAnt=[...meses].filter(m=>m.mes<mesSel&&m.mes>=desde).sort((a,b)=>a.mes.localeCompare(b.mes));

  saldoEl.dataset.valor=saldo;
  actualizarDisplaySaldo(saldo);
  if(!esManual){
    document.getElementById('saldo-origen').textContent=
      mesesAnt.length>0?'Calculado desde '+fmtMes(mesesAnt[0].mes)+' ('+mesesAnt.length+' meses)':'Sin meses anteriores con cuota';
  }
  calcular();
}
function calcular(){
  const alq=n('r-alq');

  // Calefacción y agua: por lecturas
  function suministroLect(pref, pctKey){
    const ant=n(pref+'-ant'), act=n(pref+'-act'), preu=n(pref+'-preu');
    const cons=Math.max(0, act-ant);
    const costeReal=cons*preu;
    const costeCob=costeReal*(1+(cfg[pctKey]||0)/100);
    set(pref+'-cons', cons%1===0?cons.toFixed(0):cons.toFixed(3));
    set('r-'+pref, fmt(costeReal)+' €');
    set(pref+'-cob', fmt(costeCob)+' €');
    return {ant,act,preu,cons,costeReal,costeCob,modo:'lect'};
  }

  // Electricidad: precio directo
  function suministroDirecto(pctKey){
    const costeReal=n('elec-directo');
    const costeCob=costeReal*(1+(cfg[pctKey]||0)/100);
    set('elec-cob', fmt(costeCob)+' €');
    return {costeReal,costeCob,modo:'directo'};
  }

  const cal  = suministroLect('cal',  'cal');
  const agua = suministroLect('agua', 'agua');
  const elec = suministroDirecto('elec');

  const cuota = cfg.cuota || 0;
  const totalConsumo = cal.costeCob + agua.costeCob + elec.costeCob;
  const liquidacion = cuota - totalConsumo;
  const saldoAnt = parseFloat(document.getElementById('saldo-ant').dataset.valor||0);
  const origenSaldo = document.getElementById('saldo-origen').textContent;
  const total = alq + cuota;
  document.getElementById('total-r').textContent = fmt(total) + ' €';

  // Actualizar panel saldo en tiempo real
  const cd=document.getElementById('consumo-display');
  if(cd){ cd.textContent=(totalConsumo>0?'- ':'')+fmt(totalConsumo)+' €'; cd.style.color=totalConsumo>0?'var(--danger)':'var(--muted)'; }
  const saldoTotal = saldoAnt + cuota - totalConsumo;
  const std=document.getElementById('saldo-total-display');
  if(std){
    std.textContent=(saldoTotal>0?'+ ':saldoTotal<0?'- ':'')+fmt(Math.abs(saldoTotal))+' €';
    std.style.color=saldoTotal>0?'var(--accent)':saldoTotal<0?'var(--danger)':'var(--muted)';
  }

  // ── RECIBO PARA WHATSAPP (con formato markdown de WhatsApp) ─────────────
  const mes = document.getElementById('r-mes').value;
  const inq = cfg.inq || '(Inquilino)';

  let lines = [];

  // CABECERA
  lines.push('🏠 *RECIBO DE ALQUILER*');
  lines.push('📅 *' + fmtMes(mes).toUpperCase() + '*');
  lines.push('👤 Inquilino: *' + inq + '*');
  lines.push('');

  // BLOQUE 1 — PAGO DEL MES
  lines.push('*─────────────────────────────*');
  lines.push('💰 *IMPORTE A PAGAR*');
  lines.push('*─────────────────────────────*');
  lines.push('🏡 Alquiler mensual:       *' + fmt(alq) + ' €*');
  lines.push('📦 Fondo gastos consumo:   *' + fmt(cuota) + ' €*');
  lines.push('*─────────────────────────────*');
  lines.push('✅ *TOTAL:   ' + fmt(alq + cuota) + ' €*');
  lines.push('');

  // BLOQUE 2 — CUENTA CONSUMO
  const saldoFavorAnterior = saldoAnt;
  const totalFavor = saldoFavorAnterior + cuota;
  const saldoFinal = totalFavor - totalConsumo;
  const desde = cfg.cuotaDesde || '0000-00';
  const mesesAnteriores = [...meses].filter(m => m.mes < mes && m.mes >= desde);
  const numMeses = mesesAnteriores.length;

  lines.push('*─────────────────────────────*');
  lines.push('📊 *ESTADO CUENTA CONSUMO*');
  lines.push('*─────────────────────────────*');
  lines.push('📥 Ingreso mensual:        *' + fmt(cuota) + ' €/mes*');
  if(numMeses > 0){
    lines.push('📋 Total ingresado (' + numMeses + ' mes' + (numMeses !== 1 ? 'es' : '') + '): *' + fmt(numMeses * cuota) + ' €*');
  }
  lines.push('');

  if(Math.abs(saldoFavorAnterior) >= 0.01){
    if(saldoFavorAnterior > 0){
      lines.push('⬅️ Saldo anterior _[inquilino]_:');
      lines.push('     *+ ' + fmt(saldoFavorAnterior) + ' €*');
    } else {
      lines.push('⬅️ Saldo anterior _[propietario]_:');
      lines.push('     *+ ' + fmt(Math.abs(saldoFavorAnterior)) + ' €*');
    }
  } else {
    lines.push('⬅️ Saldo anterior:       *0,00 €*');
  }
  lines.push('➕ Ingreso ' + fmtMes(mes) + ':    *+ ' + fmt(cuota) + ' €*');
  lines.push('📊 Total disponible:      *' + fmt(totalFavor) + ' €*');

  if(totalConsumo > 0){
    lines.push('');
    lines.push('🔻 *Gastos del mes:*');
    if(cal.costeCob > 0)  lines.push('   🔥 Calefacción:    *- ' + fmt(cal.costeCob) + ' €*');
    if(agua.costeCob > 0) lines.push('   💧 Agua caliente:  *- ' + fmt(agua.costeCob) + ' €*');
    if(elec.costeCob > 0) lines.push('   ⚡ Electricidad:   *- ' + fmt(elec.costeCob) + ' €*');
    lines.push('   Total gastos:      *- ' + fmt(totalConsumo) + ' €*');
  }

  lines.push('');
  lines.push('*─────────────────────────────*');
  if(saldoFinal > 0.004){
    lines.push('✅ *SALDO A FAVOR DEL INQUILINO*');
    lines.push('   *+ ' + fmt(saldoFinal) + ' €*');
  } else if(saldoFinal < -0.004){
    lines.push('⚠️ *SALDO A FAVOR DEL PROPIETARIO*');
    lines.push('   *+ ' + fmt(Math.abs(saldoFinal)) + ' €*');
  } else {
    lines.push('✅ *SALDO AL DÍA* · 0,00 €');
  }
  lines.push('*─────────────────────────────*');
  lines.push('');
  lines.push('_' + (cfg.cierre || 'Muchas gracias 🙏') + '_');

  document.getElementById('preview').textContent = lines.join('\n');
  // Dibujar factura visual
  dibujarFactura(getDatosFactura());

  // ── PANEL PRIVADO ────────────────────────────────────────────────────────
  const mC = cal.costeCob - cal.costeReal;
  const mA = agua.costeCob - agua.costeReal;
  const mE = elec.costeCob - elec.costeReal;
  document.getElementById('margen-preview').innerHTML = `
    <table style="font-size:13px;width:100%">
      <tr><td style="color:var(--muted)">🔥 Calefacción (${fmtNum(cal.cons)} uds × ${fmtP(cal.preu)} €)</td><td class="tr text-success">+${fmt(mC)} €</td></tr>
      <tr><td style="color:var(--muted)">💧 Agua caliente (${fmtNum(agua.cons)} uds × ${fmtP(agua.preu)} €)</td><td class="tr text-success">+${fmt(mA)} €</td></tr>
      <tr><td style="color:var(--muted)">⚡ Electricidad (${fmt(elec.costeReal)} €)</td><td class="tr text-success">+${fmt(mE)} €</td></tr>
      <tr style="border-top:1px solid var(--border)">
        <td style="padding-top:8px;font-weight:500">Margen suministros</td>
        <td class="tr text-success fw500" style="padding-top:8px">+${fmt(mC+mA+mE)} €</td>
      </tr>
      <tr style="border-top:1px solid var(--border)">
        <td style="padding-top:8px;color:var(--muted)">Cuota cobrada</td>
        <td class="tr" style="padding-top:8px">${fmt(cuota)} €</td>
      </tr>
      <tr><td style="color:var(--muted)">Consumo real</td><td class="tr text-danger">- ${fmt(totalConsumo)} €</td></tr>
      ${saldoAnt!==0?`<tr><td style="color:var(--muted)">Saldo arrastrado (${origenSaldo||'mes ant.'})</td>
        <td class="tr" style="color:${saldoAnt>0?'var(--danger)':'var(--accent)'}">
          ${saldoAnt>0?'+':''}${fmt(saldoAnt)} €</td></tr>`:''}
      <tr style="border-top:1px solid var(--border)">
        <td style="padding-top:8px;font-weight:500">Liquidación este mes</td>
        <td class="tr fw500" style="padding-top:8px;color:${liquidacion>=0?'var(--accent)':'var(--danger)'}">
          ${liquidacion>=0?'✅ +'+fmt(liquidacion):'⚠️ −'+fmt(Math.abs(liquidacion))} €
        </td>
      </tr>
    </table>`;
}
function fmtNum(x){const v=x||0;return v%1===0?v.toFixed(0):v.toFixed(3)}
function fmtP(x){return(x||0).toFixed(4)}
function guardarRecibo(){
  const mes=document.getElementById('r-mes').value;
  if(!mes)return alert('Selecciona un mes.');
  const alq=n('r-alq');
  /* Si has tocado "Modificar saldo", manda lo que hayas escrito; si no,
     se calcula sumando los meses anteriores. */
  const saldoEl=document.getElementById('saldo-ant');
  const manual=saldoEl && saldoEl.dataset.manual==='1';
  const saldoAnt=manual?(parseFloat(saldoEl.dataset.valor)||0):calcularSaldoAcumulado(mes);
  const cuota=cfg.cuota||0;

  function getLect(pref,pctKey){
    const ant=n(pref+'-ant'),act=n(pref+'-act'),preu=n(pref+'-preu');
    const cons=Math.max(0,act-ant);
    const costeReal=cons*preu;
    const costeCob=costeReal*(1+(cfg[pctKey]||0)/100);
    return {ant,act,preu,cons,con:costeReal,cob:costeCob};
  }
  const cal=getLect('cal','cal');
  const agua=getLect('agua','agua');
  const elecDir=n('elec-directo');
  const elecCob=elecDir*(1+(cfg.elec||0)/100);
  const totalConsumo=cal.cob+agua.cob+elecCob;
  const liquidacion=cuota-totalConsumo;
  const total=alq+cuota;

  const rec={mes,alq,cuota,saldo_ant:saldoAnt,saldo_manual:!!manual,liquidacion,
    cal_ant:cal.ant,cal_act:cal.act,cal_preu:cal.preu,cal_cons:cal.cons,cal_con:cal.con,cal_cob:cal.cob,
    agua_ant:agua.ant,agua_act:agua.act,agua_preu:agua.preu,agua_cons:agua.cons,agua_con:agua.con,agua_cob:agua.cob,
    elec_directo:elecDir,elec_con:elecDir,elec_cob:elecCob,
    total};

  const idx=meses.findIndex(m=>m.mes===mes);
  if(idx>=0){
    if(!confirm('Ya existe un recibo para '+fmtMes(mes)+'. ¿Sobreescribir?'))return;
    meses[idx]=rec;
  } else {
    meses.push(rec);
  }
  LS.set('piso_meses',meses);
  flash('flash-recibo');
}
function copiarTexto(texto, btnEl){
  // Intento 1: API moderna (funciona en https)
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(texto).then(()=>{
      if(btnEl){const orig=btnEl.textContent;btnEl.textContent='✓ ¡Copiado!';setTimeout(()=>btnEl.textContent=orig,2000);}
    }).catch(()=>copiarFallback(texto,btnEl));
    return;
  }
  copiarFallback(texto,btnEl);
}
function copiarFallback(texto, btnEl){
  // Método alternativo: textarea temporal + execCommand
  const ta=document.createElement('textarea');
  ta.value=texto;
  ta.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();ta.select();
  try{
    document.execCommand('copy');
    if(btnEl){const orig=btnEl.textContent;btnEl.textContent='✓ ¡Copiado!';setTimeout(()=>btnEl.textContent=orig,2000);}
  } catch(e){
    alert('No se pudo copiar automáticamente.\n\nSelecciona el texto del recibo y cópialo con Ctrl+C (o Cmd+C en Mac).');
  }
  document.body.removeChild(ta);
}
function copiar(){
  const texto=document.getElementById('preview').textContent;
  const btn=document.querySelector('#tab-recibo .btn-secondary');
  copiarTexto(texto,btn);
  flash('flash-copy');
}
function copiarRecibo(tid){
  const el=document.getElementById(tid);
  if(!el)return;
  const btn=el.nextElementSibling?.querySelector('button');
  copiarTexto(el.textContent,btn);
  el.style.background='var(--accent-bg)';
  setTimeout(()=>el.style.background='',1500);
}function borrarRecibo(mes){
  meses=meses.filter(function(m){return m.mes!==mes;});
  LS.set('piso_meses',meses);
  renderRecibos();
}
function delMes(mes){
  if(!confirm('¿Eliminar recibo de '+fmtMes(mes)+'?'))return;
  meses=meses.filter(m=>m.mes!==mes);
  LS.set('piso_meses',meses);
  renderDash();
}

// ── MIS RECIBOS ───────────────────────────────────────────────────────────────
function textoReciboCompleto(m){
  const SEP='═══════════════════════════════════';
  const sep='───────────────────────────────────';
  const W=33;
  const inq=cfg.inq||'(Inquilino)';
  const cuota=(m.cuota!=null)?m.cuota:(cfg.cuota||0);
  function R(label,val){return label+' '.repeat(Math.max(1,W-label.length))+val;}

  let lines=[];

  // CABECERA
  lines.push('🏠 *RECIBO DE ALQUILER*');
  lines.push('📅 *' + fmtMes(m.mes).toUpperCase() + '*');
  lines.push('👤 Inquilino: *' + inq + '*');
  lines.push('');

  // BLOQUE 1 — PAGO
  lines.push('*─────────────────────────────*');
  lines.push('💰 *IMPORTE A PAGAR*');
  lines.push('*─────────────────────────────*');
  lines.push('🏡 Alquiler mensual:       *' + fmt(m.alq) + ' €*');
  lines.push('📦 Fondo gastos consumo:   *' + fmt(cuota) + ' €*');
  lines.push('*─────────────────────────────*');
  lines.push('✅ *TOTAL:   ' + fmt(m.alq + cuota) + ' €*');
  lines.push('');

  // BLOQUE 2 — CUENTA CONSUMO
  /* Lo que se le envio al inquilino no puede cambiar despues: se usa el
     saldo guardado en el recibo, no el que saldria hoy. */
  const saldoFavAnt = (m.saldo_ant!=null) ? m.saldo_ant : calcularSaldoAcumulado(m.mes);
  const totalConsumo=(m.cal_cob||0)+(m.agua_cob||0)+(m.elec_cob||0);
  const totalFavor=saldoFavAnt+cuota;
  const saldoFinal=totalFavor-totalConsumo;
  const desdeRec = cfg.cuotaDesde || '0000-00';
  const mesesAntRec=[...meses].filter(r=>r.mes<m.mes && r.mes>=desdeRec);
  const numMesesRec=mesesAntRec.length;

  lines.push('*─────────────────────────────*');
  lines.push('📊 *ESTADO CUENTA CONSUMO*');
  lines.push('*─────────────────────────────*');
  lines.push('📥 Ingreso mensual:        *' + fmt(cuota) + ' €/mes*');
  if(numMesesRec>0){
    lines.push('📋 Total ingresado (' + numMesesRec + ' mes' + (numMesesRec!==1?'es':'') + '): *' + fmt(numMesesRec*cuota) + ' €*');
  }
  lines.push('');
  if(Math.abs(saldoFavAnt)>=0.01){
    if(saldoFavAnt>0){
      lines.push('⬅️ Saldo anterior _[inquilino]_:');
      lines.push('     *+ ' + fmt(saldoFavAnt) + ' €*');
    } else {
      lines.push('⬅️ Saldo anterior _[propietario]_:');
      lines.push('     *+ ' + fmt(Math.abs(saldoFavAnt)) + ' €*');
    }
  } else {
    lines.push('⬅️ Saldo anterior:       *0,00 €*');
  }
  lines.push('➕ Ingreso ' + fmtMes(m.mes) + ':    *+ ' + fmt(cuota) + ' €*');
  lines.push('📊 Total disponible:      *' + fmt(totalFavor) + ' €*');

  if(totalConsumo>0){
    lines.push('');
    lines.push('🔻 *Gastos del mes:*');
    if((m.cal_cob||0)>0)  lines.push('   🔥 Calefacción:    *- ' + fmt(m.cal_cob) + ' €*');
    if((m.agua_cob||0)>0) lines.push('   💧 Agua caliente:  *- ' + fmt(m.agua_cob) + ' €*');
    if((m.elec_cob||0)>0) lines.push('   ⚡ Electricidad:   *- ' + fmt(m.elec_cob) + ' €*');
    lines.push('   Total gastos:      *- ' + fmt(totalConsumo) + ' €*');
  }

  lines.push('');
  lines.push('*─────────────────────────────*');
  if(saldoFinal>0.004){
    lines.push('✅ *SALDO A FAVOR DEL INQUILINO*');
    lines.push('   *+ ' + fmt(saldoFinal) + ' €*');
  } else if(saldoFinal<-0.004){
    lines.push('⚠️ *SALDO A FAVOR DEL PROPIETARIO*');
    lines.push('   *+ ' + fmt(Math.abs(saldoFinal)) + ' €*');
  } else {
    lines.push('✅ *SALDO AL DÍA* · 0,00 €');
  }
  lines.push('*─────────────────────────────*');
  lines.push('');
  lines.push('_' + (cfg.cierre||'Muchas gracias 🙏') + '_');
  return lines.join('\n');
}

function editarRecibo(mes){
  const m=meses.find(r=>r.mes===mes);
  if(!m) return;

  // Ir a la pestaña de nuevo recibo
  show('recibo');

  // Rellenar campos principales
  document.getElementById('r-mes').value=m.mes;
  document.getElementById('r-alq').value=m.alq||'';

  // Calefacción
  document.getElementById('cal-ant').value=m.cal_ant||'';
  document.getElementById('cal-act').value=m.cal_act||'';
  document.getElementById('cal-preu').value=m.cal_preu||'';

  // Agua
  document.getElementById('agua-ant').value=m.agua_ant||'';
  document.getElementById('agua-act').value=m.agua_act||'';
  document.getElementById('agua-preu').value=m.agua_preu||'';

  // Electricidad
  document.getElementById('elec-directo').value=m.elec_directo||'';

  // Saldo anterior guardado del recibo — marcar como manual
  const saldoAnt=m.saldo_ant!=null?m.saldo_ant:calcularSaldoAcumulado(mes);
  const saldoEl=document.getElementById('saldo-ant');
  saldoEl.dataset.valor=saldoAnt;
  saldoEl.dataset.manual='1';   /* el del recibo guardado, no se recalcula */
  document.getElementById('saldo-manual').value=saldoAnt;
  document.getElementById('saldo-editable').style.display='block';
  document.getElementById('btn-edit-saldo').textContent='✕ Cerrar';
  actualizarDisplaySaldo(saldoAnt);

  // Márgenes
  ['cal','agua','elec'].forEach(k=>document.getElementById('p-'+k).textContent=cfg[k]||0);
  document.getElementById('cuota-mes-display').textContent='+ '+fmt(cfg.cuota||0)+' €';
  document.getElementById('saldo-origen').textContent='Saldo del recibo guardado (editable)';

  calcular();
  // Aviso visual
  setTimeout(()=>{
    const el=document.getElementById('flash-recibo');
    el.textContent='✏️ Editando recibo de '+fmtMes(mes)+' — modifica y pulsa "Guardar recibo"';
    el.style.display='block'; el.style.background='var(--warn-bg)'; el.style.color='var(--warn)';
    setTimeout(()=>{el.style.display='none'; el.style.background=''; el.style.color='';},5000);
  },300);
}


function verRecibo(mes){
  const m=meses.find(r=>r.mes===mes);
  document.getElementById('modal-texto').textContent=textoReciboCompleto(m);
  document.getElementById('modal-titulo').textContent='Recibo de '+fmtMes(mes);
  const wa=document.getElementById('modal-wa');
  if(wa) wa.onclick=function(){ whatsappRecibo(mes); };
  document.getElementById('modal-recibo').style.display='block';
  document.body.style.overflow='hidden';
}
function cerrarModal(){
  document.getElementById('modal-recibo').style.display='none';
  document.body.style.overflow='';
}

function renderRecibos(){
  const sorted=[...meses].sort((a,b)=>b.mes.localeCompare(a.mes));

  const years=[...new Set(sorted.map(m=>m.mes.slice(0,4)))].sort((a,b)=>b-a);
  const sel=document.getElementById('rec-filtro-año');
  const prev=sel.value||'todos';
  sel.innerHTML='<option value="todos">Todos los años</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value=years.includes(prev)?prev:'todos';

  const filtro=sel.value;
  const lista=filtro==='todos'?sorted:sorted.filter(m=>m.mes.startsWith(filtro));

  if(lista.length===0){
    document.getElementById('recibos-lista').innerHTML='<div class="card"><div class="empty">No hay recibos guardados aún.</div></div>';
    return;
  }

  // Agrupar por año
  const porAño={};
  lista.forEach(m=>{const y=m.mes.slice(0,4);if(!porAño[y])porAño[y]=[];porAño[y].push(m);});

  let html='';
  Object.keys(porAño).sort((a,b)=>b-a).forEach(y=>{
    const ms=porAño[y];
    const totAño=ms.reduce((s,m)=>s+m.total,0);
    html+=`<div style="margin-bottom:2rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-family:var(--serif);font-size:17px">${y}</div>
        <div style="font-size:13px;color:var(--muted)">Total cobrado: <strong style="color:var(--accent)">${fmt(totAño)} €</strong></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em">Mes</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em">Alquiler</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em">Cuota</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em">Total</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em">Saldo</th>
            <th style="padding:10px 16px;width:130px"></th>
          </tr></thead>
          <tbody>`;
    ms.forEach(m=>{
      const cuota=(m.cuota!=null)?m.cuota:(cfg.cuota||0);
      const totalConsumo=(m.cal_cob||0)+(m.agua_cob||0)+(m.elec_cob||0);
      /* El saldo que se emitio manda. El de hoy solo sirve para avisar
         de que algo cambio despues de enviar el recibo. */
      const saldoEmitido=(m.saldo_ant!=null)?m.saldo_ant:calcularSaldoAcumulado(m.mes);
      const saldoHoy=calcularSaldoAcumulado(m.mes);
      const descuadre=(m.saldo_ant!=null)&&Math.abs(saldoHoy-saldoEmitido)>0.004;
      const saldoFavAnt=saldoEmitido;
      const saldoFinal=saldoFavAnt+cuota-totalConsumo;
      const saldoHtml=saldoFinal>0.004
        ?`<span style="color:var(--accent);font-weight:500">✅ +${fmt(saldoFinal)} € → inquilino</span>`
        :saldoFinal<-0.004
        ?`<span style="color:var(--danger);font-weight:500">⚠️ +${fmt(Math.abs(saldoFinal))} € → propietario</span>`
        :`<span style="color:var(--muted)">Al día</span>`;
      const avisoDescuadre=descuadre
        ? `<div style="font-size:11px;color:var(--warn);margin-top:2px" title="El saldo de partida guardado era ${fmt(saldoEmitido)} € y hoy saldría ${fmt(saldoHoy)} €, porque se han tocado meses anteriores">⚠︎ recalculado hoy: ${fmt(saldoHoy + cuota - totalConsumo)} €</div>`
        : '';
      html+=`<tr style="border-top:1px solid var(--border)">
        <td style="padding:11px 16px;font-weight:500">${fmtMes(m.mes)}</td>
        <td style="padding:11px 16px;text-align:right">${fmt(m.alq)} €</td>
        <td style="padding:11px 16px;text-align:right">${fmt(cuota)} €</td>
        <td style="padding:11px 16px;text-align:right;font-weight:500">${fmt(m.alq+cuota)} €</td>
        <td style="padding:11px 16px;text-align:right">${saldoHtml}${avisoDescuadre}</td>
        <td style="padding:11px 16px;text-align:right">
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn btn-primary" style="padding:5px 12px;font-size:12px;background:#25D366;color:#0b3d24" onclick="whatsappRecibo('${m.mes}')" title="Enviar la factura por WhatsApp">📱 WhatsApp</button>
            <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" onclick="verRecibo('${m.mes}')">👁 Ver</button>
            <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;color:var(--info)" onclick="editarRecibo('${m.mes}')">✏️ Editar</button>
            <button class="btn btn-ghost" style="font-size:13px;padding:5px 8px;border:1px solid var(--border);color:var(--danger)" onclick="this.dataset.c=this.dataset.c||0;this.dataset.c++;if(this.dataset.c==1){this.textContent='¿Seguro?';setTimeout(()=>{this.textContent='🗑';this.dataset.c=0;},3000);}else{borrarRecibo('${m.mes}');}">🗑</button>
          </div>
        </td>
      </tr>`;
    });
    html+=`</tbody></table></div></div>`;
  });
  document.getElementById('recibos-lista').innerHTML=html;
}

// ── INQUILINOS ────────────────────────────────────────────────────────────────
function guardarInquilino(){
  const nombre=document.getElementById('inq-nombre').value.trim();
  const entrada=document.getElementById('inq-entrada').value;
  if(!nombre||!entrada)return alert('Nombre y fecha de entrada son obligatorios.');
  const inq={
    id:Date.now(),
    nombre,
    tel:document.getElementById('inq-tel').value.trim(),
    censo:document.getElementById('inq-censo').value.trim(),
    entrada,
    salida:document.getElementById('inq-salida').value,
    alq:parseFloat(document.getElementById('inq-alq').value)||0,
    dep:parseFloat(document.getElementById('inq-dep').value)||0,
    depDev:parseFloat(document.getElementById('inq-dep-dev').value)||0,
    notas:document.getElementById('inq-notas').value.trim(),
  };
  inquilinos.push(inq);
  LS.set('piso_inq',inquilinos);
  ['inq-nombre','inq-tel','inq-censo','inq-entrada','inq-salida','inq-alq','inq-dep','inq-dep-dev','inq-notas'].forEach(id=>document.getElementById(id).value='');
  flash('flash-inq');
  renderInquilinos();
}

function delInquilino(id){
  if(!confirm('¿Eliminar este inquilino?'))return;
  inquilinos=inquilinos.filter(i=>i.id!==id);
  LS.set('piso_inq',inquilinos);
  renderInquilinos();
}

function renderInquilinos(){
  // Construir opciones de año: años presentes + pasados + 2 futuros
  const ahora=new Date().getFullYear();
  const añosInq=inquilinos.flatMap(i=>{
    const yE=i.entrada?+i.entrada.slice(0,4):ahora;
    const yS=i.salida?+i.salida.slice(0,4):ahora;
    return [yE,yS];
  });
  const minYear=Math.min(...añosInq, 2023);
  const maxYear=Math.max(...añosInq, ahora)+2;
  const sel=document.getElementById('inq-filtro-año');
  const prevVal=sel.value||String(ahora);
  sel.innerHTML='<option value="todos">Todos los años</option>'+
    Array.from({length:maxYear-minYear+1},(_,i)=>{
      const y=minYear+i;
      const tag=y===ahora?' (actual)':y>ahora?' (futuro)':y===ahora-1?' (anterior)':'';
      return `<option value="${y}">${y}${tag}</option>`;
    }).join('');
  sel.value=prevVal in Object.fromEntries([['todos','todos'],...Array.from({length:maxYear-minYear+1},(_,i)=>[String(minYear+i),1])])?prevVal:String(ahora);

  const filtro=sel.value;

  const filtrados=inquilinos.filter(i=>{
    if(filtro==='todos')return true;
    const yF=+filtro;
    const yE=i.entrada?+i.entrada.slice(0,4):null;
    const yS=i.salida?+i.salida.slice(0,4):null;
    if(yE&&yS) return yF>=yE&&yF<=yS;
    if(yE&&!yS) return yF>=yE;
    return true;
  }).sort((a,b)=>b.entrada.localeCompare(a.entrada));

  const lista=document.getElementById('inq-lista');
  if(filtrados.length===0){lista.innerHTML='<div class="card"><div class="empty">No hay inquilinos en este período.</div></div>';document.getElementById('inq-resumen-box').innerHTML='';return;}

  lista.innerHTML=filtrados.map(i=>{
    const activo=!i.salida||new Date(i.salida)>=new Date();
    const depPend=i.dep-i.depDev;
    return `<div class="card" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-weight:500;font-size:15px">${i.nombre}</div>
          ${i.tel?`<div style="font-size:13px;color:var(--muted)">${i.tel}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge" style="${activo?'background:var(--accent-bg);color:var(--accent)':'background:var(--surface2);color:var(--muted)'}">${activo?'Activo':'Finalizado'}</span>
          <button class="btn-ghost" onclick="delInquilino(${i.id})">×</button>
        </div>
      </div>
      <table style="font-size:13px;width:100%">
        ${i.censo?`<tr><td style="color:var(--muted);padding:4px 0">Nº Censo / Doc.</td><td style="text-align:right;padding:4px 0;font-family:var(--mono)">${i.censo}</td></tr>`:''}
        <tr><td style="color:var(--muted);padding:4px 0">Entrada</td><td style="text-align:right;padding:4px 0">${fmtFecha(i.entrada)}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Salida</td><td style="text-align:right;padding:4px 0">${i.salida?fmtFecha(i.salida):'<span style="color:var(--accent)">En curso</span>'}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Alquiler mensual</td><td style="text-align:right;padding:4px 0;font-weight:500">${fmt(i.alq)} €</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Depósito recibido</td><td style="text-align:right;padding:4px 0 text-success">${fmt(i.dep)} €</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Depósito devuelto</td><td style="text-align:right;padding:4px 0">${fmt(i.depDev)} €</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="padding-top:8px;font-weight:500">Depósito pendiente</td><td style="text-align:right;padding-top:8px;font-weight:500;color:${depPend>0?'var(--accent)':'var(--muted)'}">${fmt(depPend)} €</td></tr>
      </table>
      ${i.notas?`<div style="margin-top:10px;font-size:12px;color:var(--muted);background:var(--surface2);padding:8px 10px;border-radius:6px">${i.notas}</div>`:''}
    </div>`;
  }).join('');

  // Resumen
  const totalDep=filtrados.reduce((s,i)=>s+i.dep,0);
  const totalDev=filtrados.reduce((s,i)=>s+i.depDev,0);
  const depPend=totalDep-totalDev;
  document.getElementById('inq-resumen-box').innerHTML=`
    <div class="card-title" style="font-size:14px;margin-bottom:10px">Resumen ${filtro==='todos'?'total':filtro}</div>
    <table style="font-size:13px;width:100%">
      <tr><td style="color:var(--muted);padding:4px 0">Inquilinos en este período</td><td style="text-align:right;font-weight:500">${filtrados.length}</td></tr>
      <tr><td style="color:var(--muted);padding:4px 0">Total depósitos recibidos</td><td style="text-align:right;color:var(--accent);font-weight:500">${fmt(totalDep)} €</td></tr>
      <tr><td style="color:var(--muted);padding:4px 0">Total depósitos devueltos</td><td style="text-align:right">${fmt(totalDev)} €</td></tr>
      <tr style="border-top:1px solid var(--border)"><td style="padding-top:8px;font-weight:500">Depósitos pendientes</td><td style="text-align:right;padding-top:8px;font-weight:500;color:${depPend>0?'var(--accent)':'var(--muted)'}">${fmt(depPend)} €</td></tr>
    </table>`;
}

function fmtFecha(s){if(!s)return'—';const[y,m,d]=s.split('-');return d+'/'+m+'/'+y}

// ── GASTOS ────────────────────────────────────────────────────────────────────
const TIPOS_GASTO = {
  comunidad:   {nombre:'Comunidad',                  corto:'Comunidad',   icono:'🏢'},
  suministros: {nombre:'Suministros del propietario',corto:'Suministros', icono:'💡'},
  seguro:      {nombre:'Seguro',                     corto:'Seguro',      icono:'🛡️'},
  impuestos:   {nombre:'Impuestos y tasas',          corto:'Impuestos',   icono:'🏛️'},
  reparacion:  {nombre:'Reparación y mantenimiento', corto:'Reparación',  icono:'🔧'},
  gestion:     {nombre:'Gestión y administración',   corto:'Gestión',     icono:'📋'},
  otros:       {nombre:'Otros gastos',               corto:'Otros',       icono:'📦'}
};
function tipoDe(g){ return TIPOS_GASTO[g.tipo] ? g.tipo : 'otros'; }
/* En las tablas el nombre largo se come el ancho: ahi va el corto, con
   el completo en el tooltip. */
function etiquetaTipo(g){
  const t = TIPOS_GASTO[tipoDe(g)];
  return '<span title="'+t.nombre+'">'+t.icono+' '+t.corto+'</span>';
}

function guardarGasto(){
  const fecha=document.getElementById('g-fecha').value;
  const desc=document.getElementById('g-desc').value.trim();
  const imp=parseFloat(document.getElementById('g-imp').value);
  if(!fecha||!desc||isNaN(imp)||imp<=0)return alert('Rellena todos los campos correctamente.');
  const tipo=(document.getElementById('g-tipo')||{}).value||'otros';
  gastos.push({id:Date.now(),fecha,desc,imp,tipo});
  LS.set('piso_gastos',gastos);
  document.getElementById('g-desc').value='';document.getElementById('g-imp').value='';
  flash('flash-gasto');renderGastos();
}
function renderGastos(){
  const todos=[...gastos].sort((a,b)=>b.fecha.localeCompare(a.fecha));

  // Filtro por tipo, con lo que haya de verdad registrado
  const sel=document.getElementById('g-filtro');
  if(sel){
    const previo=sel.value||'todos';
    const presentes=[...new Set(todos.map(tipoDe))];
    sel.innerHTML='<option value="todos">Todos los tipos</option>'+
      Object.keys(TIPOS_GASTO).filter(k=>presentes.includes(k))
        .map(k=>`<option value="${k}">${TIPOS_GASTO[k].icono} ${TIPOS_GASTO[k].nombre}</option>`).join('');
    sel.value=[...presentes,'todos'].includes(previo)?previo:'todos';
    if(!sel.dataset.listo){ sel.dataset.listo='1'; sel.addEventListener('change',renderGastos); }
  }
  const filtro=sel?sel.value:'todos';
  const sorted=filtro==='todos'?todos:todos.filter(g=>tipoDe(g)===filtro);
  const total=sorted.reduce((s,g)=>s+g.imp,0);

  // Resumen por tipo: de una ojeada, en qué se va el dinero
  const caja=document.getElementById('resumen-gastos');
  if(caja){
    const porTipo={};
    todos.forEach(g=>{ const t=tipoDe(g); (porTipo[t]=porTipo[t]||{n:0,imp:0}); porTipo[t].n++; porTipo[t].imp+=g.imp; });
    const totalTodos=todos.reduce((s,g)=>s+g.imp,0);
    const claves=Object.keys(porTipo).sort((a,b)=>porTipo[b].imp-porTipo[a].imp);
    caja.innerHTML=claves.length===0?'<div class="empty">Sin gastos todavía.</div>':
      claves.map(k=>{
        const pct=totalTodos>0?(porTipo[k].imp/totalTodos*100):0;
        return `<div style="margin-bottom:10px;cursor:pointer" onclick="filtrarGastos('${k}')" title="Ver solo estos">
          <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:3px">
            <span>${TIPOS_GASTO[k].icono} ${TIPOS_GASTO[k].nombre}
              <span class="text-muted" style="font-size:11.5px">· ${porTipo[k].n}</span></span>
            <span class="fw500 text-danger">${fmt(porTipo[k].imp)} €</span>
          </div>
          <div style="background:var(--surface2);border-radius:4px;height:5px;overflow:hidden">
            <div style="background:var(--danger);height:100%;width:${pct.toFixed(1)}%;border-radius:4px"></div>
          </div>
        </div>`;
      }).join('')+
      `<div class="total-row" style="margin-top:12px"><span class="text-muted" style="font-size:12px">Total acumulado</span>
       <span class="text-danger fw500">${fmt(totalTodos)} €</span></div>`;
  }

  document.getElementById('lista-gastos').innerHTML=sorted.length===0?'<div class="empty">Sin gastos de este tipo.</div>':
    `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="tr">Importe</th><th></th></tr></thead>
    <tbody>${sorted.map(g=>`<tr>
      <td class="text-muted" style="white-space:nowrap">${g.fecha}</td>
      <td style="white-space:nowrap">${etiquetaTipo(g)}</td>
      <td>${g.desc}</td>
      <td class="tr text-danger" style="white-space:nowrap">${fmt(g.imp)} €</td>
      <td style="text-align:right"><button class="btn-ghost" onclick="delGasto(${g.id})">×</button></td>
    </tr>`).join('')}</tbody></table>
    <div class="total-row"><span class="text-muted" style="font-size:12px">${filtro==='todos'?'Total gastos':'Total de este tipo'}</span><span class="text-danger fw500">${fmt(total)} €</span></div>`;
}

function filtrarGastos(tipo){
  const sel=document.getElementById('g-filtro');
  if(!sel) return;
  sel.value=(sel.value===tipo)?'todos':tipo;   // volver a pulsar quita el filtro
  renderGastos();
}
function delGasto(id){
  if(!confirm('¿Eliminar este gasto?'))return;
  gastos=gastos.filter(g=>g.id!==id);LS.set('piso_gastos',gastos);renderGastos();
}

function loadCfg(){
  document.getElementById('c-inq').value        = cfg.inq||'';
  document.getElementById('c-alq').value        = cfg.alq||'';
  document.getElementById('c-cuota').value      = cfg.cuota!=null ? cfg.cuota : 100;
  document.getElementById('c-cuota-desde').value= cfg.cuotaDesde||'';
  document.getElementById('c-cal-preu').value   = cfg.calPreu||'';
  document.getElementById('c-agua-preu').value  = cfg.aguaPreu||'';
  document.getElementById('c-elec-preu').value  = cfg.elecPreu||'';
  document.getElementById('c-cal').value        = cfg.cal||'';
  document.getElementById('c-agua').value       = cfg.agua||'';
  document.getElementById('c-elec').value       = cfg.elec||'';
  document.getElementById('c-cierre').value     = cfg.cierre||'Muchas gracias 🙏';
  document.getElementById('c-invCompra').value = cfg.invCompra||'';
  document.getElementById('c-invNotario').value = cfg.invNotario||'';
  document.getElementById('c-invImpuesto').value = cfg.invImpuesto||'';
  document.getElementById('c-invCatastro').value = cfg.invCatastro||'';
  document.getElementById('c-invInicial').value = cfg.invInicial||'';
  document.getElementById('c-invReforma').value = cfg.invReforma||'';
  document.getElementById('c-depRecibido').value = cfg.depRecibido||'';
}
function guardarCfg(){
  cfg={
    inq:        document.getElementById('c-inq').value.trim(),
    alq:        parseFloat(document.getElementById('c-alq').value)||0,
    cuota:      parseFloat(document.getElementById('c-cuota').value)||0,
    cuotaDesde: document.getElementById('c-cuota-desde').value||'',
    calPreu:    parseFloat(document.getElementById('c-cal-preu').value)||0,
    aguaPreu:   parseFloat(document.getElementById('c-agua-preu').value)||0,
    elecPreu:   parseFloat(document.getElementById('c-elec-preu').value)||0,
    cal:        parseFloat(document.getElementById('c-cal').value)||0,
    agua:       parseFloat(document.getElementById('c-agua').value)||0,
    elec:       parseFloat(document.getElementById('c-elec').value)||0,
    cierre:     document.getElementById('c-cierre').value||'Muchas gracias 🙏',
    invCompra: parseFloat(document.getElementById('c-invCompra').value)||0,
    invNotario: parseFloat(document.getElementById('c-invNotario').value)||0,
    invImpuesto: parseFloat(document.getElementById('c-invImpuesto').value)||0,
    invCatastro: parseFloat(document.getElementById('c-invCatastro').value)||0,
    invInicial: parseFloat(document.getElementById('c-invInicial').value)||0,
    invReforma: parseFloat(document.getElementById('c-invReforma').value)||0,
    depRecibido: parseFloat(document.getElementById('c-depRecibido').value)||0,
  };
  LS.set('piso_cfg',cfg);flash('flash-cfg');
  renderDesgloseInversion();
}

// ── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────
// ── GUARDAR ARCHIVOS (funciona en local y en la version web) ─────────────────
// En la version web las descargas las media el visor: pide confirmacion al abrir.
// En local (doble clic en el Mac) se usa el metodo de siempre.
async function guardarArchivo(filename, data, fallback){
  var dl = null;
  try { if (window.claude && window.claude.use) dl = await window.claude.use('downloads'); } catch(e){}
  if (!dl) { fallback(); return true; }
  try { await dl.save({filename: filename, data: data}); return true; }
  catch(err){
    var code = err && err.code;
    if (code === 'declined') return false;
    if (code === 'unavailable' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed'){
      fallback(); return true;
    }
    alert('No se pudo guardar el archivo: ' + ((err && err.message) || 'error desconocido'));
    return false;
  }
}

function exportarDatos(){
  const datos = {
    version: DATA_VERSION,
    fecha: new Date().toISOString().slice(0,10),
    cfg, meses, gastos, inquilinos
  };
  const json   = JSON.stringify(datos, null, 2);
  const hoy    = new Date().toISOString().slice(0,10);
  const nombre = 'piso-soldeu-backup-' + hoy + '.json';
  function local(){
    const blob = new Blob([json], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  guardarArchivo(nombre, json, local).then(function(ok){ if(ok) flash('flash-export'); });
}

function importarDatos(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const datos = JSON.parse(e.target.result);
      // Validar que tiene la estructura correcta
      if(!datos.meses || !datos.gastos || !datos.cfg){
        throw new Error('Estructura inválida');
      }
      LS.set('piso_cfg',       datos.cfg);
      LS.set('piso_meses',     datos.meses);
      LS.set('piso_gastos',    datos.gastos);
      LS.set('piso_inq',       datos.inquilinos || []);
      LS.set('piso_data_version', datos.version || DATA_VERSION);
      flash('flash-import');
      // Recargar datos en memoria y refrescar vista
      cfg        = datos.cfg;
      meses      = datos.meses;
      gastos     = datos.gastos;
      inquilinos = datos.inquilinos || [];
      setTimeout(()=>{ renderDash(); }, 1500);
    } catch(err) {
      flash('flash-import-err');
    }
    // Limpiar el input para poder volver a importar el mismo archivo
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ── FACTURA VISUAL PROFESIONAL ────────────────────────────────────────────────
function dibujarFactura(datos, lienzo){
  const cv=lienzo||document.getElementById('factura-canvas');
  if(!cv) return;
  const SC=2, W=580;
  const rowsCon=(datos.totalConsumo>0?3:0)+(datos.cal>0?1:0)+(datos.agua>0?1:0)+(datos.elec>0?1:0);
  const H=720+(datos.numMeses>0?28:0)+rowsCon*30;
  cv.width=W*SC; cv.height=H*SC;
  cv.style.width=W+'px'; cv.style.height=H+'px';
  const c=cv.getContext('2d');
  c.scale(SC,SC);

  // Colores
  const G='#1a5c3e',GL='#eaf5f1',GD='#145033',GB='#c3e0d3';
  const RD='#b83030',RL='#fdf1f1';
  const OR='#9a6200',OL='#fdf7e8';
  const DK='#111111',MD='#555555',LT='#888888',VL='#bbbbbb';
  const WH='#ffffff',BG='#f5f4f1',BD='#e0dcd5';

  // Fondo hoja
  c.fillStyle=BG; c.fillRect(0,0,W,H);
  // Hoja blanca con sombra
  c.shadowColor='rgba(0,0,0,.1)'; c.shadowBlur=20; c.shadowOffsetY=4;
  c.fillStyle=WH; c.beginPath(); c.roundRect(20,12,W-40,H-24,8); c.fill();
  c.shadowColor='transparent'; c.shadowBlur=0; c.shadowOffsetY=0;

  const L=48, R=W-48, CW=R-L;
  let y=0;

  // ── Funciones helper
  function f(size,wt){ c.font=`${wt||400} ${size}px -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif`; }
  function t(txt,x,yy,col,sz,wt,al){ f(sz,wt); c.fillStyle=col; c.textAlign=al||'left'; c.fillText(txt,x,yy); c.textAlign='left'; }
  function ln(yy,col,lw){ c.beginPath(); c.strokeStyle=col||BD; c.lineWidth=lw||1; c.moveTo(L,yy); c.lineTo(R,yy); c.stroke(); }
  function box(x,yy,w,h,r,fill,stroke,sw){
    c.beginPath(); c.roundRect(x,yy,w,h,r||0);
    if(fill){c.fillStyle=fill; c.fill();}
    if(stroke){c.strokeStyle=stroke; c.lineWidth=sw||1; c.stroke();}
  }
  function row(label,val,yy,lc,vc,vs,bold){
    t(label,L,yy,lc||MD,13,bold?600:400);
    t(val,R,yy,vc||DK,13,vs||600,'right');
    return yy+30;
  }

  // ── CABECERA VERDE
  y=0;
  box(20,12,W-40,90,8,G);
  // Acento lateral
  c.fillStyle=GD; c.fillRect(20,12,5,90);
  // Título
  t('RECIBO DE ALQUILER',L+14,y+52,WH,20,700);
  t('PISO SOLDEU',L+14,y+70,'rgba(255,255,255,.55)',11,400);
  // Mes y fecha
  t(datos.mes.toUpperCase(),R,y+48,WH,16,700,'right');
  t(new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}),R,y+68,'rgba(255,255,255,.6)',11,400,'right');
  y=116;

  // ── INQUILINO
  y+=8;
  box(L,y,CW,50,6,GL,GB,1);
  t('ARRENDATARIO',L+14,y+16,G,9,700);
  t(datos.inq,L+14,y+35,DK,15,600);
  y+=62;

  // ── SEPARADOR SECCIÓN
  function seccion(titulo,yy){
    t(titulo,L,yy,LT,9,700);
    c.beginPath(); c.strokeStyle=BD; c.lineWidth=1; c.moveTo(L+c.measureText(titulo).width+8,yy-4); c.lineTo(R,yy-4); c.stroke();
    return yy+16;
  }

  // ── BLOQUE 1: CARGO MENSUAL
  y=seccion('CARGO MENSUAL',y);
  y=row('Alquiler mensual',fmt(datos.alq)+' €',y);
  y=row('Fondo gastos consumo',fmt(datos.cuota)+' €',y);
  ln(y); y+=12;
  // Total grande
  box(L-4,y,CW+8,56,6,G);
  t('TOTAL A PAGAR',L+12,y+20,GB,10,700);
  t(fmt(datos.alq+datos.cuota)+' €',R-8,y+40,WH,26,700,'right');
  y+=70;

  // ── BLOQUE 2: CUENTA CONSUMO
  y+=4; y=seccion('ESTADO CUENTA DE CONSUMO',y);

  // Info cuota
  t('Cuota mensual: ',L,y,MD,12,400);
  t(fmt(datos.cuota)+' €/mes',L+c.measureText('Cuota mensual: ').width,y,DK,12,600);
  if(datos.numMeses>0){
    /* la etiqueta necesita sitio: con R-130 se comia el importe */
    t('Meses acumulados:',R-205,y,MD,12,400,'left');
    t(datos.numMeses+'  (' + fmt(datos.numMeses*datos.cuota)+' €)',R,y,DK,12,600,'right');
  }
  y+=28;

  // Saldo anterior
  const sfPos=datos.saldoFavAnt>=0;
  box(L-4,y-2,CW+8,34,4,sfPos?GL:RL,sfPos?GB:'#f4c3c3',1);
  const sfLbl=sfPos?'Saldo anterior — a favor del inquilino':'Saldo anterior — a favor del propietario';
  const sfVal=(sfPos?'+ ':'— ')+fmt(Math.abs(datos.saldoFavAnt))+' €';
  t('●',L+6,y+16,sfPos?G:RD,14,700);
  t(sfLbl,L+20,y+16,sfPos?G:RD,12,600);
  t(sfVal,R,y+16,sfPos?G:RD,13,700,'right');
  y+=42;

  y=row('+ Ingreso '+datos.mes,fmt(datos.cuota)+' €',y,MD,G,600);
  ln(y,BD); y+=8;
  y=row('Total disponible',fmt(datos.totalFavor)+' €',y,MD,DK,700,true); y+=4;

  // Gastos
  if(datos.totalConsumo>0){
    y+=6; ln(y,BD); y+=12;
    t('GASTOS DEL MES',L,y,LT,9,700); y+=18;
    if(datos.cal>0){
      box(L-4,y-2,CW+8,28,2,'#fff9f9');
      t('🔥 Calefacción',L+6,y+16,MD,13,400);
      t('− '+fmt(datos.cal)+' €',R,y+16,RD,13,600,'right');
      y+=30;
    }
    if(datos.agua>0){
      t('💧 Agua caliente',L+6,y+14,MD,13,400);
      t('− '+fmt(datos.agua)+' €',R,y+14,RD,13,600,'right');
      y+=28;
    }
    if(datos.elec>0){
      t('⚡ Electricidad',L+6,y+14,MD,13,400);
      t('− '+fmt(datos.elec)+' €',R,y+14,RD,13,600,'right');
      y+=28;
    }
    ln(y,BD); y+=8;
    t('Total gastos',L,y+12,RD,13,600);
    t('− '+fmt(datos.totalConsumo)+' €',R,y+12,RD,14,700,'right');
    y+=30;
  }

  // ── SALDO FINAL
  y+=14;
  const sPos=datos.saldoFinal>0.004, sNeg=datos.saldoFinal<-0.004;
  const sBG=sPos?G:sNeg?RD:OR;
  const sLabel=sPos?'SALDO A FAVOR DEL INQUILINO':sNeg?'SALDO A FAVOR DEL PROPIETARIO':'CUENTA AL DÍA';
  const sVal=sPos?'+ '+fmt(datos.saldoFinal)+' €':sNeg?'+ '+fmt(Math.abs(datos.saldoFinal))+' €':'0,00 €';
  box(L-4,y,CW+8,70,6,sBG);
  // Etiqueta pequeña
  t(sLabel,L+14,y+20,'rgba(255,255,255,.7)',10,700);
  // Importe grande
  t(sVal,L+14,y+52,WH,28,700);
  // Línea decorativa derecha
  c.fillStyle='rgba(255,255,255,.15)'; c.fillRect(R-90,y+10,2,50);
  y+=84;

  // ── PIE
  y+=4; ln(y,BD); y+=16;
  t(datos.cierre,L,y,LT,12,400);
  t('Documento informativo · '+new Date().getFullYear(),R,y,VL,10,400,'right');

  /* Ajustar el alto al contenido real. OJO: tocar cv.height borra el
     lienzo, asi que antes copiamos lo pintado y lo devolvemos encima.
     Sin esto la factura salia en blanco. */
  const realH=y+24;
  const altoFinal=Math.round(realH*SC);
  if(altoFinal>0 && altoFinal!==cv.height){
    const copia=document.createElement('canvas');
    copia.width=cv.width; copia.height=Math.min(cv.height, altoFinal);
    copia.getContext('2d').drawImage(cv,0,0);
    cv.height=altoFinal;
    const ctx2=cv.getContext('2d');
    ctx2.fillStyle=BG; ctx2.fillRect(0,0,cv.width,cv.height);
    ctx2.drawImage(copia,0,0);
  }
  cv.style.height=realH+'px';
}

function descargarFactura(){
  const canvas=document.getElementById('factura-canvas');
  if(!canvas) return;
  const mes=document.getElementById('r-mes').value||'factura';
  const nombre='recibo-'+mes+'.png';
  function local(){
    const a=document.createElement('a');
    a.download=nombre;
    a.href=canvas.toDataURL('image/png');
    a.click();
  }
  canvas.toBlob(function(blob){
    if(!blob){ local(); return; }
    guardarArchivo(nombre, blob, local);
  },'image/png');
}

async function compartirFactura(){
  const canvas=document.getElementById('factura-canvas');
  if(!canvas) return;
  canvas.toBlob(async blob=>{
    const file=new File([blob],'recibo.png',{type:'image/png'});
    try{
      await navigator.share({files:[file],title:'Recibo de alquiler'});
    } catch(e){ descargarFactura(); }
  },'image/png');
}

function activarCompartir(){
  if(navigator.canShare && navigator.share){
    const btn=document.getElementById('btn-compartir');
    if(btn) btn.style.display='';
  }
}

/* Los mismos datos que getDatosFactura(), pero de un recibo del
   historial en vez del formulario. */
function datosFacturaDeRecibo(m){
  const cuota=(m.cuota!=null)?m.cuota:(cfg.cuota||0);
  const saldoAnt=(m.saldo_ant!=null)?m.saldo_ant:calcularSaldoAcumulado(m.mes);
  const cal=m.cal_cob||0, agua=m.agua_cob||0, elec=m.elec_cob||0;
  const totalConsumo=cal+agua+elec;
  const desde=cfg.cuotaDesde||'0000-00';
  const numMeses=[...meses].filter(r=>r.mes<m.mes&&r.mes>=desde).length;
  const totalFavor=saldoAnt+cuota;
  return {
    mes:fmtMes(m.mes), inq:cfg.inq||'(Inquilino)',
    alq:m.alq||0, cuota, saldoFavAnt:saldoAnt, numMeses,
    cal, agua, elec, totalConsumo, totalFavor,
    saldoFinal:totalFavor-totalConsumo,
    cierre:cfg.cierre||'Muchas gracias 🙏'
  };
}

/* Dibuja la factura en un lienzo aparte y la devuelve como imagen.
   Se hace TODO de forma sincrona (toDataURL, no toBlob) para no perder
   el gesto del usuario: si entre su clic y el window.open hay un await,
   el navegador bloquea la ventana y no se abre nada. */
function imagenDeRecibo(m){
  const cv=document.createElement('canvas');
  dibujarFactura(datosFacturaDeRecibo(m), cv);
  const datos=cv.toDataURL('image/png');
  const base64=datos.split(',')[1];
  const bin=atob(base64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes], {type:'image/png'});
}

/* El telefono del inquilino que este viviendo ahora, si lo hay. */
function telefonoInquilino(){
  const vivos=(inquilinos||[]).filter(i=>!i.salida||new Date(i.salida)>=new Date());
  const con=(vivos.length?vivos:(inquilinos||[])).filter(i=>i.tel&&i.tel.trim());
  if(!con.length) return '';
  const bruto=con[0].tel.replace(/[^\d+]/g,'');
  if(!bruto) return '';
  if(bruto.charAt(0)==='+') return bruto.slice(1).replace(/\D/g,'');
  const d=bruto.replace(/\D/g,'');
  /* un numero corto es de aqui: le ponemos el prefijo de Andorra */
  return d.length<=9 ? '376'+d : d;
}

function textoWhatsApp(m){
  const d=datosFacturaDeRecibo(m);
  const l=['🏠 *Recibo de '+d.mes+'*',
           'Alquiler: '+fmt(d.alq)+' €',
           'Fondo gastos consumo: '+fmt(d.cuota)+' €',
           '*Total: '+fmt(d.alq+d.cuota)+' €*'];
  if(d.totalConsumo>0) l.push('Gastos del mes: '+fmt(d.totalConsumo)+' €');
  l.push(d.saldoFinal>0.004 ? 'Saldo a tu favor: '+fmt(d.saldoFinal)+' €'
       : d.saldoFinal<-0.004 ? 'Saldo a favor del propietario: '+fmt(Math.abs(d.saldoFinal))+' €'
       : 'Cuenta de consumo al día');
  l.push('', 'Te adjunto la factura.');
  return l.join('\n');
}

/* Manda la factura por WhatsApp. En el movil, si el aparato deja
   compartir archivos, va la imagen dentro del propio envio. Si no, se
   descarga la imagen y se abre el chat con el texto puesto, para
   adjuntarla a mano: ni WhatsApp Web ni wa.me admiten adjuntos. */
function whatsappRecibo(mes){
  const m=meses.find(r=>r.mes===mes);
  if(!m){ alert('No encuentro ese recibo.'); return; }
  const nombre='recibo-'+mes+'.png';
  const texto=textoWhatsApp(m);
  const tel=telefonoInquilino();

  let blob=null;
  try{ blob=imagenDeRecibo(m); }
  catch(err){ alert('No he podido generar la factura: '+err.message); return; }

  // 1) Movil: compartir la imagen directamente, con el texto dentro
  try{
    const file=new File([blob], nombre, {type:'image/png'});
    if(navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
      navigator.share({files:[file], text:texto, title:'Recibo '+fmtMes(mes)})
        .catch(()=>{});   /* si lo cancela, no pasa nada */
      return;
    }
  }catch(err){ /* seguimos por el otro camino */ }

  // 2) Ordenador: bajamos la imagen y abrimos el chat, todo dentro del
  //    mismo clic para que el navegador no bloquee la ventana
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);

  const destino='https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(texto);
  const ventana=window.open(destino, '_blank');
  if(!ventana){
    /* El navegador la ha bloqueado: dejamos un enlace a mano */
    mostrarEnlaceWhatsApp(destino, tel);
  }
}

/* Si el navegador bloquea la ventana, un enlace que sí puede pulsar. */
function mostrarEnlaceWhatsApp(destino, tel){
  const previo=document.getElementById('wa-aviso');
  if(previo) previo.remove();
  const caja=document.createElement('div');
  caja.id='wa-aviso';
  caja.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2000;'+
    'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;'+
    'box-shadow:0 18px 40px -18px rgba(0,0,0,.35);max-width:90vw;text-align:center;font-size:13.5px';
  caja.innerHTML='<div style="margin-bottom:10px">La factura ya está descargada. '+
    'Tu navegador ha bloqueado la ventana de WhatsApp:</div>'+
    '<a href="'+destino+'" target="_blank" rel="noopener" class="btn btn-primary" '+
    'style="background:#25D366;color:#0b3d24;text-decoration:none;display:inline-block">'+
    'Abrir WhatsApp'+(tel?'':' y elegir contacto')+'</a> '+
    '<button class="btn btn-secondary" onclick="this.closest(\'#wa-aviso\').remove()">Cerrar</button>';
  document.body.appendChild(caja);
  setTimeout(()=>{ const c=document.getElementById('wa-aviso'); if(c) c.remove(); }, 20000);
}

function getDatosFactura(){
  const mes=document.getElementById('r-mes').value;
  const alq=n('r-alq');
  const cuota=cfg.cuota||0;
  const saldoAnt=calcularSaldoAcumulado(mes);
  const cal=parseFloat((document.getElementById('cal-cob')||{}).value)||0;
  const agua=parseFloat((document.getElementById('agua-cob')||{}).value)||0;
  const elec=parseFloat((document.getElementById('elec-cob')||{}).value)||0;
  const totalConsumo=cal+agua+elec;
  const desde=cfg.cuotaDesde||'0000-00';
  const mesesAnt=[...meses].filter(m=>m.mes<mes&&m.mes>=desde);
  const totalFavor=saldoAnt+cuota;
  const saldoFinal=totalFavor-totalConsumo;
  return {
    mes:fmtMes(mes), inq:cfg.inq||'(Inquilino)',
    alq,cuota,saldoFavAnt:saldoAnt,numMeses:mesesAnt.length,
    cal,agua,elec,totalConsumo,totalFavor,saldoFinal,
    cierre:cfg.cierre||'Muchas gracias 🙏'
  };
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function n(id){return parseFloat(document.getElementById(id).value)||0}
function set(id,v){document.getElementById(id).value=v}
function fmt(x){return(Math.round((x||0)*100)/100).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtMes(s){if(!s)return'';const[y,m]=s.split('-');return['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][+m-1]+' '+y}
function flash(id){const el=document.getElementById(id);el.style.display='block';setTimeout(()=>el.style.display='none',3000)}

// ── INIT ──────────────────────────────────────────────────────────────────────
renderDash();
activarCompartir();
