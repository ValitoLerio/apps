/* ══════════════════════════════════════════════════════════════════
   LIBROS — la biblioteca de casa
   ══════════════════════════════════════════════════════════════════
   Para saber qué tienes, qué has leído y dónde está cada uno. Tres
   estados y poco más: por leer, leyendo y leído. Y lo que de verdad se
   olvida: en qué estante está y a quién se lo prestaste.
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var CLAVE = 'libros.libro.v1';
var VACIO = {libros:[], ajustes:{}};

var ESTADOS = {
  porleer: {nombre:'Por leer', icono:'📗'},
  leyendo: {nombre:'Leyendo',  icono:'📖'},
  leido:   {nombre:'Leído',    icono:'✅'}
};
var ORDEN_ESTADOS = ['porleer','leyendo','leido'];

var libro = null;
var ui = {vista:'todos', busca:'', orden:'titulo', genero:''};

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function esc(t){
  return String(t==null?'':t).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
/* Para saber si dos libros son el mismo: sin tildes, sin puntos y
   sin el artículo de delante. «El Quijote» y «quijote» son uno. */
function llano(t){
  return String(t==null?'':t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9ñ ]+/g,' ')
    .replace(/^(el|la|los|las|un|una|the|a)\s+/,'')
    .replace(/\s+/g,' ').trim();
}
function esElMismo(a, b){
  if(!llano(a.titulo) || llano(a.titulo) !== llano(b.titulo)) return false;
  var x = llano(a.autor), y = llano(b.autor);
  return !x || !y || x === y;          /* si falta el autor, vale el título */
}
/* Devuelve el libro que ya tienes igual a éste, o nada. */
function yaLoTengo(cual, saltarId){
  var lista = libros();
  for(var i=0;i<lista.length;i++){
    if(saltarId && lista[i].id === saltarId) continue;
    if(esElMismo(cual, lista[i])) return lista[i];
  }
  return null;
}
/* ¿Ya está éste entre los que llevo aceptados de la misma tanda? */
function estaEntre(lista, cual){
  for(var i=0;i<lista.length;i++) if(esElMismo(cual, lista[i])) return true;
  return false;
}
function repetidos(){
  var lista = libros(), grupos = [], usados = {};
  for(var i=0;i<lista.length;i++){
    if(usados[lista[i].id]) continue;
    var grupo = [lista[i]];
    for(var j=i+1;j<lista.length;j++){
      if(usados[lista[j].id]) continue;
      if(esElMismo(lista[i], lista[j])){ grupo.push(lista[j]); usados[lista[j].id] = true; }
    }
    if(grupo.length > 1) grupos.push(grupo);
  }
  return grupos;
}

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function fin(nombre){
  var m = String(nombre||'').match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : 'fichero';
}
function plural(n, uno, varios){ return n+' '+(n===1?uno:varios); }
function hoyISO(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dmy(iso){
  if(!iso) return '';
  var p=String(iso).slice(0,10).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso;
}

function avisar(texto, malo){
  var caja=document.getElementById('aviso');
  if(!caja){
    caja=document.createElement('div'); caja.id='aviso';
    caja.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:120;'+
      'padding:10px 16px;border-radius:9px;font-size:13.5px;box-shadow:var(--sombra);max-width:88vw';
    document.body.appendChild(caja);
  }
  caja.style.background = malo ? 'var(--malo-suave)' : 'var(--ok-suave)';
  caja.style.color      = malo ? 'var(--malo)'       : 'var(--ok)';
  caja.textContent = texto;
  caja.style.display='block';
  clearTimeout(caja._t);
  caja._t = setTimeout(function(){ caja.style.display='none'; }, 3000);
}

function abrirVentana(titulo, cuerpoHTML, alGuardar, opciones){
  opciones = opciones || {};
  document.querySelectorAll('dialog').forEach(function(x){
    try{ x.close(); }catch(e){} x.remove();
  });
  var d=document.createElement('dialog');
  d.style.cssText='border:1px solid var(--linea);border-radius:12px;background:var(--sup);'+
    'color:var(--tinta);padding:0;max-width:min(560px,94vw);width:100%;box-shadow:var(--sombra)';
  d.innerHTML =
    '<form method="dialog" style="margin:0">'+
      '<div style="padding:14px 18px;border-bottom:1px solid var(--linea-suave);'+
        'display:flex;align-items:center;justify-content:space-between;gap:12px">'+
        '<h2 style="font-size:17px">'+esc(titulo)+'</h2>'+
        '<button value="cancelar" class="btn suave sm">Cerrar</button></div>'+
      '<div style="padding:16px 18px;max-height:66vh;overflow:auto">'+cuerpoHTML+'</div>'+
      '<div style="padding:12px 18px;border-top:1px solid var(--linea-suave);display:flex;'+
        'gap:8px;justify-content:flex-end;flex-wrap:wrap">'+
        (opciones.extra||'')+
        '<button value="cancelar" class="btn">Cancelar</button>'+
        '<button value="ok" class="btn '+(opciones.malo?'malo':'fuerte')+'">'+
        esc(opciones.aceptar||'Guardar')+'</button></div>'+
    '</form>';
  document.body.appendChild(d);
  d.addEventListener('close', function(){
    /* si el guardado dice que no (falta el título, está repetido…) la
       ventana se vuelve a abrir con lo que hubiera escrito */
    if(d.returnValue==='ok' && alGuardar){
      if(alGuardar()===true){ try{ d.showModal(); }catch(e){} return; }
    }
    d.remove();
  });
  d.showModal();
  return d;
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  opciones=opciones||{};
  abrirVentana(titulo, cuerpo, function(){ alAceptar(); },
               {aceptar:opciones.aceptar||'Aceptar', malo:opciones.malo});
}

/* ══════════════════════════════════════════════════════════════
   LOS LIBROS DESCARGADOS (epub, pdf…)
   ══════════════════════════════════════════════════════════════
   Los ficheros NO van a GitHub: pesan demasiado. Se quedan guardados
   en el propio navegador de este aparato. La ficha del libro sí viaja,
   así que en el móvil verás el libro pero pondrá que el fichero está
   en el ordenador. */
var BD = null, AQUI = {};

function bd(){
  return new Promise(function(ok, mal){
    if(BD) return ok(BD);
    var p = indexedDB.open('libros-ficheros', 1);
    p.onupgradeneeded = function(){ p.result.createObjectStore('ficheros'); };
    p.onsuccess = function(){ BD = p.result; ok(BD); };
    p.onerror   = function(){ mal(p.error); };
  });
}
function conBD(modo, faena){
  return bd().then(function(db){
    return new Promise(function(ok, mal){
      var t = db.transaction('ficheros', modo);
      var r = faena(t.objectStore('ficheros'));
      r.onsuccess = function(){ ok(r.result); };
      r.onerror   = function(){ mal(r.error); };
    });
  });
}
function meterFichero(id, f){ return conBD('readwrite', function(s){ return s.put(f, id); }); }
function sacarFichero(id){   return conBD('readonly',  function(s){ return s.get(id); }); }
function tirarFichero(id){   return conBD('readwrite', function(s){ return s.delete(id); }); }

function repasarFicheros(){
  return conBD('readonly', function(s){ return s.getAllKeys(); }).then(function(ids){
    AQUI = {};
    (ids||[]).forEach(function(i){ AQUI[i] = true; });
  }).catch(function(){ AQUI = {}; });
}

function peso(n){
  n = +n || 0;
  if(n > 1048576) return (n/1048576).toFixed(1).replace('.',',')+' MB';
  if(n > 1024)    return Math.round(n/1024)+' KB';
  return n+' B';
}
function bajar(blob, nombre){
  var u = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = u; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(u); }, 20000);
}

/* Abrir: el pdf se lee en el navegador; el epub se descarga y lo abre
   el lector que tengas puesto. */
function abrirLibro(id){
  sacarFichero(id).then(function(f){
    var l = libroDe(id);
    if(!f){ avisar('El fichero está en el otro aparato, aquí no.', true); return; }
    var nombre = (l && l.archivo && l.archivo.nombre) || ((l?l.titulo:'libro')+'.epub');
    if(/pdf/i.test(f.type||'') || /\.pdf$/i.test(nombre)){
      var u = URL.createObjectURL(f);
      window.open(u, '_blank');
      setTimeout(function(){ URL.revokeObjectURL(u); }, 60000);
    }else{
      bajar(f, nombre);
      avisar('Descargado, ábrelo con tu lector');
    }
  });
}

/* Enviar: en el móvil sale el cuadro de compartir de siempre
   (WhatsApp, correo, AirDrop…). En el ordenador, si el navegador no
   deja compartir, te lo descarga para que lo adjuntes tú. */
function enviarLibro(id){
  sacarFichero(id).then(function(f){
    var l = libroDe(id);
    if(!f){ avisar('El fichero está en el otro aparato, aquí no.', true); return; }
    var nombre = (l && l.archivo && l.archivo.nombre) || ((l?l.titulo:'libro')+'.epub');
    var fich;
    try{ fich = new File([f], nombre, {type: f.type || 'application/octet-stream'}); }
    catch(e){ fich = null; }
    if(fich && navigator.canShare && navigator.canShare({files:[fich]})){
      navigator.share({
        files: [fich],
        title: (l && l.titulo) || nombre,
        text: (l && l.titulo ? l.titulo : nombre) + (l && l.autor ? ' — ' + l.autor : '')
      }).catch(function(){});
    }else{
      bajar(f, nombre);
      avisar('Tu navegador no deja enviarlo directamente: te lo he descargado');
    }
  });
}

function enviarVarios(){
  var lista = libros().filter(function(l){ return l.archivo && AQUI[l.id]; });
  if(!lista.length){ avisar('No hay ningún fichero en este aparato.', true); return; }
  var v = abrirVentana('Enviar libros',
    '<div class="tabla-caja" style="max-height:44vh;overflow:auto"><table style="min-width:400px"><tbody>'+
    lista.map(function(l,i){
      return '<tr><td style="width:26px"><input type="checkbox" id="ev_'+i+'" style="width:auto"></td>'+
        '<td><strong style="font-size:13px">'+esc(l.titulo||'')+'</strong>'+
        (l.autor?'<div class="nota" style="margin:0">'+esc(l.autor)+'</div>':'')+'</td>'+
        '<td class="nota" style="margin:0;white-space:nowrap">'+peso(l.archivo.tam)+'</td></tr>';
    }).join('')+'</tbody></table></div>'+
    '<p class="nota" style="margin:10px 0 0">En el móvil se abre el cuadro de compartir de siempre. '+
    'En el ordenador, si el navegador no deja, se descargan y los adjuntas tú.</p>',
    function(){
      var elegidos = lista.filter(function(l,i){ return v.querySelector('#ev_'+i).checked; });
      if(!elegidos.length){ avisar('No has marcado ninguno.', true); return true; }
      Promise.all(elegidos.map(function(l){
        return sacarFichero(l.id).then(function(f){
          if(!f) return null;
          try{ return new File([f], l.archivo.nombre, {type:f.type||'application/octet-stream'}); }
          catch(e){ return {blob:f, nombre:l.archivo.nombre}; }
        });
      })).then(function(fs){
        fs = fs.filter(Boolean);
        if(!fs.length){ avisar('No he encontrado los ficheros.', true); return; }
        var deVerdad = fs.filter(function(f){ return f instanceof File; });
        if(deVerdad.length===fs.length && navigator.canShare && navigator.canShare({files:fs})){
          navigator.share({files:fs, title:plural(fs.length,'libro','libros')}).catch(function(){});
        }else{
          fs.forEach(function(f, i){
            setTimeout(function(){
              if(f instanceof File) bajar(f, f.name); else bajar(f.blob, f.nombre);
            }, i*400);
          });
          avisar('Te los he descargado para que los adjuntes');
        }
      });
    }, {aceptar:'Enviar'});
}

function quitarFichero(id){
  var l = libroDe(id); if(!l) return;
  confirmar('Quitar el fichero de «'+(l.titulo||'')+'»',
    '<p style="margin:0">El libro se queda en la lista, pero el epub o el pdf se borra '+
    'de este aparato.</p>',
    function(){
      tirarFichero(id).then(function(){
        delete l.archivo; guardar();
        return repasarFicheros();
      }).then(function(){ pintar(); avisar('Fichero quitado'); });
    }, {aceptar:'Quitar', malo:true});
}

/* Del nombre del fichero saco título y autor.
   «Umberto Eco - El nombre de la rosa.epub» */
function deNombreDeFichero(nombre, autorDelante){
  var t = String(nombre||'').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/_/g,' ').trim();
  t = t.replace(/\s*\((?:spanish|castellano|español)[^)]*\)\s*/ig,' ').trim();
  var partes = t.split(/\s+-\s+/);
  if(partes.length < 2) return {titulo:t, autor:''};
  var a = partes[0].trim(), b = partes.slice(1).join(' - ').trim();
  return autorDelante ? {titulo:b, autor:a} : {titulo:a, autor:b};
}

function meterDescargados(ficheros){
  ficheros = Array.prototype.slice.call(ficheros||[]);
  if(!ficheros.length) return;
  var autorDelante = libro.ajustes.autorDelante !== false;

  var v = abrirVentana('Añadir '+plural(ficheros.length,'libro descargado','libros descargados'),
    '<div class="campo" style="margin-bottom:10px">'+
      '<label class="lbl" for="fd_orden">Los ficheros se llaman</label>'+
      '<select id="fd_orden">'+
        '<option value="1"'+(autorDelante?' selected':'')+'>Autor - Título</option>'+
        '<option value="0"'+(autorDelante?'':' selected')+'>Título - Autor</option>'+
      '</select></div>'+
    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="fd_estado">Ponlos como</label>'+
      '<select id="fd_estado">'+ORDEN_ESTADOS.map(function(k){
        return '<option value="'+k+'"'+(k==='porleer'?' selected':'')+'>'+
               ESTADOS[k].icono+' '+ESTADOS[k].nombre+'</option>'; }).join('')+'</select></div>'+
    '<div id="fd_vista"></div>'+
    '<p class="nota" style="margin:10px 0 0">Los ficheros se guardan en este aparato, '+
      'no en GitHub: pesarían demasiado. La ficha del libro sí la verás en el móvil.</p>',
    function(){
      var estado = v.querySelector('#fd_estado').value;
      var delante = v.querySelector('#fd_orden').value === '1';
      libro.ajustes.autorDelante = delante;
      var metidos = 0, pegados = 0, fuera = 0, faenas = [], aceptados = [];
      ficheros.forEach(function(f, i){
        var d = deNombreDeFichero(f.name, delante);
        var tit = v.querySelector('#fd_tit_'+i);
        var aut = v.querySelector('#fd_aut_'+i);
        var ficha = {titulo:(tit&&tit.value.trim())||d.titulo,
                     autor:(aut&&aut.value.trim())||d.autor};
        var repe = yaLoTengo(ficha);
        if(repe){
          /* No lo duplico. Si al que tienes le falta el fichero, se lo pongo. */
          if(!repe.archivo){
            repe.archivo = {nombre:f.name, tipo:f.type||'', tam:f.size};
            if(!repe.donde) repe.donde = 'En el ordenador';
            faenas.push(meterFichero(repe.id, f));
            pegados++;
          }else fuera++;
          return;
        }
        if(estaEntre(aceptados, ficha)){ fuera++; return; }   /* repetido en la misma tanda */
        var chk = v.querySelector('#fd_si_'+i);
        if(chk && !chk.checked) return;
        aceptados.push(ficha);
        var l = {id:uid(), titulo:ficha.titulo, autor:ficha.autor,
                 estado:estado, genero:'', donde:'En el ordenador', prestado:'', nota:0, fecha:'', notas:'',
                 archivo:{nombre:f.name, tipo:f.type||'', tam:f.size}};
        libro.libros.push(l); metidos++;
        faenas.push(meterFichero(l.id, f));
      });
      if(!metidos && !pegados){
        avisar(fuera ? 'Ya los tenías todos' : 'No has marcado ninguno.', true);
        return true;
      }
      guardar();
      Promise.all(faenas).then(repasarFicheros).then(function(){
        pintar();
        avisar([metidos ? plural(metidos,'libro guardado','libros guardados') : '',
                pegados ? plural(pegados,'fichero puesto al que ya tenías',
                                         'ficheros puestos a los que ya tenías') : '',
                fuera ? plural(fuera,'repetido fuera','repetidos fuera') : ''
               ].filter(Boolean).join(' · '));
      }).catch(function(){
        pintar(); avisar('Alguno no ha cabido en el navegador', true);
      });
    }, {aceptar:'Guardarlos'});

  function repasar(){
    var delante = v.querySelector('#fd_orden').value === '1';
    var vistos = [];
    var total = ficheros.reduce(function(a,f){ return a + f.size; }, 0);
    v.querySelector('#fd_vista').innerHTML =
      '<div class="lbl" style="margin:0 0 6px">'+plural(ficheros.length,'fichero','ficheros')+
        ' · '+peso(total)+'</div>'+
      '<div class="tabla-caja" style="max-height:34vh;overflow:auto"><table style="min-width:440px"><tbody>'+
      ficheros.map(function(f,i){
        var d = deNombreDeFichero(f.name, delante);
        var tengo = yaLoTengo(d);
        var aviso = estaEntre(vistos, d) ? 'repetido en esta tanda'
                  : tengo ? (tengo.archivo ? 'ya lo tienes, con fichero'
                                           : 'ya lo tienes: le pongo el fichero')
                  : '';
        if(aviso !== 'repetido en esta tanda') vistos.push(d);
        return '<tr'+(aviso?' style="opacity:.6"':'')+'>'+
          '<td style="width:26px"><input type="checkbox" id="fd_si_'+i+'" '+
            (aviso?'':'checked')+(aviso?' disabled':'')+' style="width:auto"></td>'+
          '<td><input id="fd_tit_'+i+'" value="'+esc(d.titulo)+'" '+
            'style="padding:3px 6px;font-size:12.5px;font-weight:600">'+
            (aviso?'<div class="nota" style="margin:2px 0 0">'+aviso+'</div>':'')+'</td>'+
          '<td style="min-width:140px"><input id="fd_aut_'+i+'" value="'+esc(d.autor)+'" '+
            'style="padding:3px 6px;font-size:12.5px"></td>'+
          '<td class="nota" style="margin:0;white-space:nowrap">'+peso(f.size)+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  v.querySelector('#fd_orden').addEventListener('change', repasar);
  repasar();
}

function pedirFicheros(alTenerlos){
  var e = document.createElement('input');
  e.type = 'file'; e.multiple = true;
  e.accept = '.epub,.pdf,.mobi,.azw,.azw3,.fb2,.txt,.doc,.docx,.rtf,application/pdf,application/epub+zip';
  e.style.display = 'none';
  document.body.appendChild(e);
  e.addEventListener('change', function(){
    var f = e.files; e.remove();
    if(f && f.length) alTenerlos(f);
  });
  e.click();
}

/* ══════════════════════════════════════════════════════════════
   GUARDAR Y CARGAR
   ══════════════════════════════════════════════════════════════ */
function cargar(){
  try{
    var crudo = localStorage.getItem(CLAVE);
    libro = crudo ? JSON.parse(crudo) : JSON.parse(JSON.stringify(VACIO));
  }catch(e){ libro = JSON.parse(JSON.stringify(VACIO)); }
  if(!libro.libros) libro.libros = [];
  if(!libro.ajustes) libro.ajustes = {};
}
function guardar(){ localStorage.setItem(CLAVE, JSON.stringify(libro)); }
function libros(){ return libro.libros || []; }
function libroDe(id){
  for(var i=0;i<libro.libros.length;i++) if(libro.libros[i].id===id) return libro.libros[i];
  return null;
}
function generos(){
  var c={};
  libros().forEach(function(l){ if(l.genero) c[l.genero]=(c[l.genero]||0)+1; });
  return Object.keys(c).sort(function(a,b){ return c[b]-c[a] || a.localeCompare(b,'es'); });
}
function estantes(){
  var c={};
  libros().forEach(function(l){ if(l.donde) c[l.donde]=(c[l.donde]||0)+1; });
  return Object.keys(c).sort(function(a,b){ return a.localeCompare(b,'es'); });
}
function cuantos(estado){
  return libros().filter(function(l){ return (l.estado||'porleer')===estado; }).length;
}
function prestados(){ return libros().filter(function(l){ return (l.prestado||'').trim(); }); }
function conFichero(){ return libros().filter(function(l){ return l.archivo; }); }

/* ══════════════════════════════════════════════════════════════
   PINTAR
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root = document.getElementById('root');
  root.innerHTML =
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Libros</span>'+
        '<span class="sub">La biblioteca de casa</span></div>'+
      boton('todos','Toda la biblioteca', libros().length)+
      boton('porleer','Por leer', cuantos('porleer'))+
      boton('leyendo','Leyendo', cuantos('leyendo'))+
      boton('leido','Leídos', cuantos('leido'))+
      boton('archivos','Descargados', conFichero().length)+
      boton('prestados','Prestados', prestados().length)+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)">Guardado en GitHub</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll('[data-vista]').forEach(function(b){
    b.addEventListener('click', function(){ ui.vista = b.dataset.vista; verLista(); });
  });
  verLista();
}
function boton(vista, texto, cuenta){
  return '<button class="nav" data-vista="'+vista+'"'+
         (ui.vista===vista?' aria-current="true"':'')+'>'+
         '<span>'+esc(texto)+'</span><span class="cuenta">'+cuenta+'</span></button>';
}

function filtrados(){
  var t = ui.busca.trim().toLowerCase();
  return libros().filter(function(l){
    if(ui.vista==='prestados' && !(l.prestado||'').trim()) return false;
    if(ui.vista==='archivos' && !l.archivo) return false;
    if(ORDEN_ESTADOS.indexOf(ui.vista)>=0 && (l.estado||'porleer')!==ui.vista) return false;
    if(ui.genero && l.genero!==ui.genero) return false;
    if(!t) return true;
    return ((l.titulo||'')+' '+(l.autor||'')+' '+(l.genero||'')+' '+(l.donde||'')+' '+
            (l.notas||'')+' '+(l.prestado||'')).toLowerCase().indexOf(t)>=0;
  }).sort(function(a,b){
    if(ui.orden==='autor')  return (a.autor||'').localeCompare(b.autor||'','es') ||
                                   (a.titulo||'').localeCompare(b.titulo||'','es');
    if(ui.orden==='fecha')  return (b.fecha||'').localeCompare(a.fecha||'');
    if(ui.orden==='nota')   return (+b.nota||0)-(+a.nota||0);
    return (a.titulo||'').localeCompare(b.titulo||'','es');
  });
}

function verLista(){
  var main = document.getElementById('main');
  var lista = filtrados();
  var titulo = ui.vista==='todos' ? 'Toda la biblioteca'
             : ui.vista==='prestados' ? 'Prestados'
             : ui.vista==='archivos' ? 'Libros descargados'
             : ESTADOS[ui.vista].nombre;
  var leidosAno = libros().filter(function(l){
    return l.estado==='leido' && (l.fecha||'').slice(0,4)===String(new Date().getFullYear());
  }).length;

  main.innerHTML =
    '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
      '<p>Lo que tienes, lo que te falta por leer y dónde está cada uno.</p></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button class="btn fuerte" id="l_nuevo">+ Añadir libro</button>'+
        '<button class="btn" id="l_bajados">📥 Añadir descargados</button>'+
        (conFichero().length ? '<button class="btn" id="l_enviar">📤 Enviar libros</button>' : '')+
        (repetidos().length
          ? '<button class="btn malo" id="l_repes">⚠ Quitar repetidos</button>' : '')+
        '<button class="btn" id="l_pegar">📋 Pegar una lista</button>'+
        '<button class="btn" id="l_imprimir">🖨 Imprimir</button>'+
      '</div></div>'+

    (libros().length
      ? '<div class="cifras">'+
          '<div class="cifra"><div class="k">Libros</div><div class="v acento">'+libros().length+'</div>'+
            '<div class="n">en la biblioteca</div></div>'+
          '<div class="cifra"><div class="k">Por leer</div><div class="v">'+cuantos('porleer')+'</div></div>'+
          '<div class="cifra"><div class="k">Leídos</div><div class="v">'+cuantos('leido')+'</div>'+
            '<div class="n">'+leidosAno+' este año</div></div>'+
          '<div class="cifra"><div class="k">Descargados</div><div class="v">'+conFichero().length+'</div>'+
            '<div class="n">epub y pdf</div></div>'+
          '<div class="cifra"><div class="k">Prestados</div><div class="v'+(prestados().length?' aviso':'')+'">'+
            prestados().length+'</div>'+
            '<div class="n">'+(prestados().length?'fuera de casa':'todos en casa')+'</div></div>'+
        '</div>'
      : '')+

    '<div class="filtros">'+
      '<input class="buscador" id="l_busca" placeholder="Buscar por título, autor o estante…" '+
        'value="'+esc(ui.busca)+'">'+
      (generos().length
        ? '<select id="l_genero" style="width:auto"><option value="">Cualquier género</option>'+
          generos().map(function(g){
            return '<option value="'+esc(g)+'"'+(ui.genero===g?' selected':'')+'>'+esc(g)+'</option>';
          }).join('')+'</select>'
        : '')+
      '<select id="l_orden" style="width:auto">'+
        [['titulo','Por título'],['autor','Por autor'],['fecha','Por fecha de lectura'],
         ['nota','Por lo que te gustó']].map(function(o){
          return '<option value="'+o[0]+'"'+(ui.orden===o[0]?' selected':'')+'>'+o[1]+'</option>';
        }).join('')+
      '</select>'+
    '</div>'+

    (lista.length
      ? '<div class="fichas">'+lista.map(ficha).join('')+'</div>'
      : '<div class="vacio"><strong>'+
        (libros().length ? 'Nada con esa búsqueda' : 'La biblioteca está vacía')+'</strong>'+
        (libros().length ? 'Prueba con otra palabra.'
                         : 'Dale a «+ Añadir libro», a «Pegar una lista» si ya los tienes escritos, '+
                           'o arrastra aquí los epub y los pdf que tengas descargados.')+
        '</div>');

  var busca = document.getElementById('l_busca');
  busca.addEventListener('input', function(){
    ui.busca = busca.value;
    clearTimeout(window.__espera);
    window.__espera = setTimeout(function(){
      verLista();
      var v=document.getElementById('l_busca');
      if(v){ v.focus(); v.selectionStart=v.value.length; }
    }, 180);
  });
  var g = document.getElementById('l_genero');
  if(g) g.addEventListener('change', function(){ ui.genero=this.value; verLista(); });
  document.getElementById('l_orden').addEventListener('change', function(){ ui.orden=this.value; verLista(); });
  document.getElementById('l_nuevo').addEventListener('click', function(){ editar(null); });
  document.getElementById('l_bajados').addEventListener('click', function(){
    pedirFicheros(meterDescargados);
  });
  var rep = document.getElementById('l_repes');
  if(rep) rep.addEventListener('click', limpiarRepetidos);
  var env = document.getElementById('l_enviar');
  if(env) env.addEventListener('click', enviarVarios);
  document.getElementById('l_pegar').addEventListener('click', pegarLista);
  document.getElementById('l_imprimir').addEventListener('click', imprimir);
  engancharFichas();
}

function estrellas(l){
  var n = +l.nota || 0;
  var s = '<span class="estrellas" data-nota="'+esc(l.id)+'">';
  for(var i=1;i<=5;i++){
    s += '<button type="button" class="'+(i<=n?'on':'')+'" data-poner="'+i+'" '+
         'title="'+i+' de 5">★</button>';
  }
  return s+'</span>';
}

function ficha(l){
  var est = ESTADOS[l.estado||'porleer'];
  return '<div class="libro">'+
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">'+
      '<span class="tit">'+esc(l.titulo||'sin título')+'</span>'+
      '<span class="chapa '+(l.estado==='leido'?'ok':(l.estado==='leyendo'?'acento':'neutra'))+'">'+
        est.icono+' '+esc(est.nombre)+'</span></div>'+
    (l.autor?'<div class="aut">'+esc(l.autor)+'</div>':'')+
    (l.estado==='leido' ? '<div>'+estrellas(l)+'</div>' : '')+
    '<div class="meta">'+
      [l.genero?esc(l.genero):'', l.donde?'📚 '+esc(l.donde):'',
       l.estado==='leido'&&l.fecha?'leído el '+esc(dmy(l.fecha)):''].filter(Boolean).join(' · ')+
    '</div>'+
    ((l.prestado||'').trim()
      ? '<div class="chapa aviso" style="align-self:flex-start">Prestado a '+esc(l.prestado)+'</div>'
      : '')+
    (l.archivo
      ? '<div class="chapa '+(AQUI[l.id]?'acento':'neutra')+'" style="align-self:flex-start">'+
        (AQUI[l.id] ? '📥 '+esc(fin(l.archivo.nombre))+' · '+peso(l.archivo.tam)
                    : '📥 está en el otro aparato')+'</div>'
      : '')+
    (l.notas?'<div class="meta">'+esc(l.notas)+'</div>':'')+
    '<div class="pie">'+
      (l.estado!=='leido'
        ? '<button class="btn sm fuerte" data-leido="'+esc(l.id)+'">Ya lo he leído</button>' : '')+
      (l.estado==='porleer'
        ? '<button class="btn sm" data-leyendo="'+esc(l.id)+'">Lo estoy leyendo</button>' : '')+
      (l.estado==='leido'
        ? '<button class="btn sm" data-porleer="'+esc(l.id)+'">Volver a por leer</button>' : '')+
      (l.archivo && AQUI[l.id]
        ? '<button class="btn sm" data-abrir="'+esc(l.id)+'">Abrir</button>'+
          '<button class="btn sm" data-enviar="'+esc(l.id)+'">Enviar</button>'
        : '<button class="btn suave sm" data-adjuntar="'+esc(l.id)+'">Adjuntar fichero</button>')+
      '<button class="btn suave sm" data-editar="'+esc(l.id)+'">Editar</button>'+
      '<button class="btn suave sm malo" data-borrar="'+esc(l.id)+'">Borrar</button>'+
    '</div></div>';
}

function engancharFichas(){
  var main = document.getElementById('main');
  function cambiar(id, estado){
    var l = libroDe(id); if(!l) return;
    l.estado = estado;
    if(estado==='leido' && !l.fecha) l.fecha = hoyISO();
    if(estado!=='leido') l.fecha = '';
    guardar(); pintar();
    avisar(estado==='leido' ? 'Apuntado como leído' :
           estado==='leyendo' ? 'Lo estás leyendo' : 'Vuelve a la pila de por leer');
  }
  main.querySelectorAll('[data-leido]').forEach(function(b){
    b.addEventListener('click', function(){ cambiar(b.dataset.leido, 'leido'); });
  });
  main.querySelectorAll('[data-leyendo]').forEach(function(b){
    b.addEventListener('click', function(){ cambiar(b.dataset.leyendo, 'leyendo'); });
  });
  main.querySelectorAll('[data-porleer]').forEach(function(b){
    b.addEventListener('click', function(){ cambiar(b.dataset.porleer, 'porleer'); });
  });
  main.querySelectorAll('[data-abrir]').forEach(function(b){
    b.addEventListener('click', function(){ abrirLibro(b.dataset.abrir); });
  });
  main.querySelectorAll('[data-enviar]').forEach(function(b){
    b.addEventListener('click', function(){ enviarLibro(b.dataset.enviar); });
  });
  main.querySelectorAll('[data-adjuntar]').forEach(function(b){
    b.addEventListener('click', function(){
      var l = libroDe(b.dataset.adjuntar); if(!l) return;
      pedirFicheros(function(fs){
        var f = fs[0];
        meterFichero(l.id, f).then(function(){
          l.archivo = {nombre:f.name, tipo:f.type||'', tam:f.size};
          if(!l.donde) l.donde = 'En el ordenador';
          guardar();
          return repasarFicheros();
        }).then(function(){ pintar(); avisar('Fichero guardado'); })
          .catch(function(){ avisar('No he podido guardarlo, puede que no quepa', true); });
      });
    });
  });
  main.querySelectorAll('[data-editar]').forEach(function(b){
    b.addEventListener('click', function(){ editar(b.dataset.editar); });
  });
  main.querySelectorAll('[data-borrar]').forEach(function(b){
    b.addEventListener('click', function(){
      var l = libroDe(b.dataset.borrar); if(!l) return;
      confirmar('Borrar «'+(l.titulo||'')+'»',
        '<p style="margin:0">Se va de la biblioteca y no hay vuelta atrás.</p>',
        function(){
          libro.libros = libros().filter(function(x){ return x.id!==l.id; });
          guardar();
          tirarFichero(l.id).then(repasarFicheros).then(function(){ pintar(); })
            .catch(function(){ pintar(); });
          avisar('Borrado');
        }, {aceptar:'Borrar', malo:true});
    });
  });
  main.querySelectorAll('[data-nota] [data-poner]').forEach(function(b){
    b.addEventListener('click', function(){
      var id = b.closest('[data-nota]').dataset.nota;
      var l = libroDe(id); if(!l) return;
      var n = +b.dataset.poner;
      l.nota = (l.nota === n) ? 0 : n;      /* pulsar la misma la quita */
      guardar(); verLista();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   AÑADIR Y EDITAR
   ══════════════════════════════════════════════════════════════ */
function editar(id){
  var nuevo = !id;
  var l = id ? libroDe(id) : {id:uid(), titulo:'', autor:'', estado:'porleer', genero:'',
                              donde:'', prestado:'', nota:0, fecha:'', notas:''};
  if(!l) return;
  var ventana = null;
  function dentro(x){ return ventana ? ventana.querySelector('#'+x) : document.getElementById(x); }
  function val(x){ var e=dentro(x); return e?e.value.trim():''; }

  ventana = abrirVentana(nuevo?'Añadir libro':'Editar «'+(l.titulo||'')+'»',
    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_titulo">Título</label>'+
      '<input id="e_titulo" value="'+esc(l.titulo||'')+'" autocomplete="off"></div>'+
    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_autor">Autor</label>'+
      '<input id="e_autor" value="'+esc(l.autor||'')+'" autocomplete="off"></div>'+
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_estado">Cómo va</label>'+
        '<select id="e_estado">'+ORDEN_ESTADOS.map(function(k){
          return '<option value="'+k+'"'+((l.estado||'porleer')===k?' selected':'')+'>'+
                 ESTADOS[k].icono+' '+ESTADOS[k].nombre+'</option>'; }).join('')+'</select></div>'+
      '<div class="campo"><label class="lbl" for="e_genero">Género</label>'+
        '<input id="e_genero" list="e_generos" value="'+esc(l.genero||'')+'" '+
        'placeholder="novela, historia, cocina…" autocomplete="off">'+
        '<datalist id="e_generos">'+generos().map(function(g){
          return '<option value="'+esc(g)+'">'; }).join('')+'</datalist></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_donde">Dónde está</label>'+
        '<input id="e_donde" list="e_estantes" value="'+esc(l.donde||'')+'" '+
        'placeholder="salón, dormitorio, el local…" autocomplete="off">'+
        '<datalist id="e_estantes">'+estantes().map(function(g){
          return '<option value="'+esc(g)+'">'; }).join('')+'</datalist></div>'+
      '<div class="campo"><label class="lbl" for="e_prestado">Prestado a</label>'+
        '<input id="e_prestado" value="'+esc(l.prestado||'')+'" placeholder="nadie" '+
        'autocomplete="off"></div>'+
    '</div>'+
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_fecha">Cuándo lo leíste</label>'+
        '<input type="date" id="e_fecha" value="'+esc(l.fecha||'')+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_nota">Te gustó (0 a 5)</label>'+
        '<input type="number" id="e_nota" min="0" max="5" step="1" value="'+(+l.nota||0)+'"></div>'+
    '</div>'+
    '<div class="campo" style="margin-bottom:12px"><label class="lbl">El fichero del libro</label>'+
      (l.archivo
        ? '<div class="nota" style="margin:0">'+esc(l.archivo.nombre)+' · '+peso(l.archivo.tam)+
          (AQUI[l.id]?'':' — no está en este aparato')+
          ' <button type="button" class="btn suave sm malo" id="e_quitarf" '+
          'style="margin-left:6px">Quitar</button></div>'
        : '<button type="button" class="btn suave sm" id="e_ponerf" style="align-self:flex-start">'+
          '📥 Elegir epub o pdf</button>')+
    '</div>'+
    '<div class="campo"><label class="lbl" for="e_notas">Notas</label>'+
      '<textarea id="e_notas" rows="2" placeholder="de qué va, quién te lo recomendó…">'+
      esc(l.notas||'')+'</textarea></div>',
    function(){
      var titulo = val('e_titulo');
      if(!titulo){ avisar('Ponle el título.', true); return true; }
      var repe = yaLoTengo({titulo:titulo, autor:val('e_autor')}, l.id);
      if(repe){
        avisar('Ese ya lo tienes: «'+repe.titulo+'»'+(repe.autor?', de '+repe.autor:''), true);
        return true;
      }
      l.titulo = titulo;
      l.autor = val('e_autor');
      l.estado = val('e_estado') || 'porleer';
      l.genero = val('e_genero');
      l.donde = val('e_donde');
      l.prestado = val('e_prestado');
      l.fecha = val('e_fecha');
      l.nota = Math.max(0, Math.min(5, +val('e_nota')||0));
      l.notas = (dentro('e_notas').value||'').trim();
      if(l.estado==='leido' && !l.fecha) l.fecha = hoyISO();
      if(nuevo) libro.libros.push(l);
      guardar(); pintar();
      avisar(nuevo?'Libro añadido':'Guardado');
    }, {aceptar:nuevo?'Añadir':'Guardar'});

  var poner = ventana.querySelector('#e_ponerf');
  if(poner) poner.addEventListener('click', function(){
    pedirFicheros(function(fs){
      var f = fs[0];
      if(nuevo && !val('e_titulo')){
        var d = deNombreDeFichero(f.name, libro.ajustes.autorDelante !== false);
        dentro('e_titulo').value = d.titulo;
        if(!val('e_autor')) dentro('e_autor').value = d.autor;
      }
      meterFichero(l.id, f).then(function(){
        l.archivo = {nombre:f.name, tipo:f.type||'', tam:f.size};
        AQUI[l.id] = true;
        avisar('Fichero guardado: '+f.name);
        poner.outerHTML = '<div class="nota" style="margin:0">'+esc(f.name)+' · '+peso(f.size)+'</div>';
      }).catch(function(){ avisar('No he podido guardarlo, puede que no quepa', true); });
    });
  });
  var quitar = ventana.querySelector('#e_quitarf');
  if(quitar) quitar.addEventListener('click', function(){
    tirarFichero(l.id).then(function(){
      delete l.archivo; delete AQUI[l.id]; guardar();
      quitar.parentNode.innerHTML = 'quitado';
      avisar('Fichero quitado');
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   PEGAR UNA LISTA
   ══════════════════════════════════════════════════════════════
   «El nombre de la rosa - Umberto Eco», o sólo el título. Se admite
   guion, punto y coma o tabulador entre el título y el autor. */
function leerLineaLibro(linea, estado){
  var t = String(linea||'').trim();
  if(!t) return null;
  if(/^[-—·•*_=]+$/.test(t)) return null;
  t = t.replace(/^\s*\d+[.)-]\s*/,'');          /* «1. » de las listas numeradas */
  var partes = t.split(/\s+[-–—]\s+|\s*[;|\t]\s*/);
  var titulo = (partes[0]||t).trim();
  var autor  = partes.length>1 ? partes.slice(1).join(' ').trim() : '';
  if(!titulo) return null;
  return {id:uid(), titulo:titulo, autor:autor, estado:estado, genero:'', donde:'',
          prestado:'', nota:0, fecha:'', notas:''};
}

function pegarLista(){
  var leidos = [];
  var v = abrirVentana('Pegar una lista de libros',
    '<div class="campo" style="margin-bottom:10px">'+
      '<label class="lbl" for="pg_estado">Ponlos todos como</label>'+
      '<select id="pg_estado">'+ORDEN_ESTADOS.map(function(k){
        return '<option value="'+k+'">'+ESTADOS[k].icono+' '+ESTADOS[k].nombre+'</option>';
      }).join('')+'</select></div>'+
    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="pg_texto">Uno por línea</label>'+
      '<textarea id="pg_texto" rows="8" placeholder="El nombre de la rosa - Umberto Eco&#10;'+
        'Patria - Fernando Aramburu&#10;La sombra del viento"></textarea>'+
      '<span class="nota" style="margin:5px 0 0">Si pones un guion, lo de detrás es el autor. '+
      'Si no, se queda sólo el título y ya lo completas luego.</span></div>'+
    '<div id="pg_vista"></div>',
    function(){
      var metidos = 0, fuera = 0, aceptados = [];
      leidos.forEach(function(x, i){
        var c = v.querySelector('#pg_si_'+i);
        if(c && !c.checked){ return; }
        var t = v.querySelector('#pg_tit_'+i);
        if(t && t.value.trim()) x.titulo = t.value.trim();
        if(yaLoTengo(x) || estaEntre(aceptados, x)){ fuera++; return; }
        aceptados.push(x);
        libro.libros.push(x); metidos++;
      });
      if(!metidos && !fuera){ avisar('No hay nada que añadir.', true); return true; }
      guardar(); pintar();
      avisar(metidos
        ? plural(metidos,'libro añadido','libros añadidos') +
          (fuera ? ' · '+plural(fuera,'repetido fuera','repetidos fuera') : '')
        : 'Ya los tenías todos');
    }, {aceptar:'Añadirlos'});

  var texto = v.querySelector('#pg_texto');
  var estado = v.querySelector('#pg_estado');
  var vista = v.querySelector('#pg_vista');

  function repasar(){
    leidos = String(texto.value||'').split(/\r?\n/)
      .map(function(l){ return leerLineaLibro(l, estado.value); }).filter(Boolean);
    if(!leidos.length){ vista.innerHTML=''; return; }
    var vistos = [];
    vista.innerHTML =
      '<div class="lbl" style="margin:0 0 6px">'+plural(leidos.length,'libro','libros')+'</div>'+
      '<div class="tabla-caja" style="max-height:34vh;overflow:auto">'+
      '<table style="min-width:420px"><tbody>'+
      leidos.map(function(x,i){
        var repe = yaLoTengo(x) ? 'ya lo tienes' :
                   (estaEntre(vistos, x) ? 'repetido en la lista' : '');
        if(!repe) vistos.push(x);
        return '<tr'+(repe?' style="opacity:.55"':'')+'>'+
          '<td style="width:26px"><input type="checkbox" id="pg_si_'+i+'" '+
            (repe?'':'checked')+(repe?' disabled':'')+' style="width:auto"></td>'+
          '<td><input id="pg_tit_'+i+'" value="'+esc(x.titulo)+'" '+
            (repe?'disabled ':'')+'style="padding:3px 6px;font-size:12.5px;font-weight:600">'+
            (repe?'<div class="nota" style="margin:2px 0 0">'+repe+'</div>':'')+'</td>'+
          '<td class="nota" style="margin:0;min-width:130px">'+esc(x.autor||'—')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  texto.addEventListener('input', repasar);
  estado.addEventListener('change', repasar);
  texto.focus();
}

/* ══════════════════════════════════════════════════════════════
   QUITAR LOS REPETIDOS QUE YA HUBIERA
   ══════════════════════════════════════════════════════════════
   De cada grupo se queda el más completo —el que tenga el fichero— y
   se le pasa lo que los otros tuvieran relleno. */
function riqueza(l){
  var n = 0;
  if(l.archivo) n += 10;
  ['autor','genero','donde','prestado','fecha','notas'].forEach(function(c){
    if((l[c]||'').toString().trim()) n++;
  });
  if(+l.nota) n++;
  if(l.estado === 'leido') n++;
  return n;
}
function limpiarRepetidos(){
  var grupos = repetidos();
  if(!grupos.length){ avisar('No hay ninguno repetido'); return; }
  var sobran = grupos.reduce(function(a,g){ return a + g.length - 1; }, 0);

  confirmar('Quitar '+plural(sobran,'repetido','repetidos'),
    '<p style="margin:0 0 10px">De cada libro me quedo con la ficha más completa y borro las demás.</p>'+
    '<div class="tabla-caja" style="max-height:40vh;overflow:auto"><table style="min-width:360px"><tbody>'+
    grupos.map(function(g){
      return '<tr><td><strong style="font-size:13px">'+esc(g[0].titulo||'')+'</strong>'+
        (g[0].autor?'<div class="nota" style="margin:0">'+esc(g[0].autor)+'</div>':'')+'</td>'+
        '<td class="nota" style="margin:0;white-space:nowrap">'+g.length+' fichas</td></tr>';
    }).join('')+'</tbody></table></div>',
    function(){
      var borrar = [];
      grupos.forEach(function(g){
        var mejor = g.slice().sort(function(a,b){ return riqueza(b) - riqueza(a); })[0];
        g.forEach(function(l){
          if(l === mejor) return;
          ['autor','genero','donde','prestado','fecha','notas'].forEach(function(c){
            if(!(mejor[c]||'').toString().trim() && (l[c]||'').toString().trim()) mejor[c] = l[c];
          });
          if(!+mejor.nota && +l.nota) mejor.nota = l.nota;
          if(mejor.estado !== 'leido' && l.estado === 'leido'){
            mejor.estado = 'leido'; if(l.fecha) mejor.fecha = l.fecha;
          }
          if(!mejor.archivo && l.archivo) mejor.archivo = l.archivo;
          borrar.push(l.id);
        });
      });
      libro.libros = libros().filter(function(l){ return borrar.indexOf(l.id) < 0; });
      guardar();
      Promise.all(borrar.map(function(id){
        return tirarFichero(id).catch(function(){});
      })).then(repasarFicheros).then(function(){
        pintar(); avisar(plural(borrar.length,'repetido quitado','repetidos quitados'));
      });
    }, {aceptar:'Quitarlos'});
}

/* ══════════════════════════════════════════════════════════════
   IMPRIMIR
   ══════════════════════════════════════════════════════════════ */
function imprimir(){
  var lista = filtrados();
  if(!lista.length){ avisar('No hay nada que imprimir.', true); return; }
  var caja = document.getElementById('imprimible');
  if(!caja){
    caja = document.createElement('div'); caja.id='imprimible';
    document.body.appendChild(caja);
  }
  var partes = ['<h1>Biblioteca</h1>'];
  ORDEN_ESTADOS.forEach(function(e){
    var suyos = lista.filter(function(l){ return (l.estado||'porleer')===e; });
    if(!suyos.length) return;
    partes.push('<h2>'+ESTADOS[e].nombre+' · '+suyos.length+'</h2>');
    partes.push('<table><tbody>'+suyos.map(function(l){
      return '<tr><td style="width:46%"><strong>'+esc(l.titulo||'')+'</strong></td>'+
        '<td>'+esc(l.autor||'')+'</td>'+
        '<td style="width:22%">'+esc(l.donde||'')+
        ((l.prestado||'').trim()?' · prestado a '+esc(l.prestado):'')+'</td></tr>';
    }).join('')+'</tbody></table>');
  });
  caja.innerHTML = partes.join('');
  window.print();
}

/* ══════════════════════════════════════════════════════════════
   ARRASTRAR LOS FICHEROS A LA PÁGINA
   ══════════════════════════════════════════════════════════════ */
function engancharArrastre(){
  var capa = document.createElement('div');
  capa.style.cssText='position:fixed;inset:0;z-index:200;display:none;align-items:center;'+
    'justify-content:center;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);'+
    'font-family:var(--titulo);font-size:22px;color:#fff;text-align:center;padding:30px';
  capa.textContent='Suelta aquí los libros';
  document.body.appendChild(capa);
  var dentroDe = 0;
  window.addEventListener('dragenter', function(e){
    if(!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')<0) return;
    dentroDe++; capa.style.display='flex';
  });
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('dragleave', function(){
    dentroDe = Math.max(0, dentroDe-1);
    if(!dentroDe) capa.style.display='none';
  });
  window.addEventListener('drop', function(e){
    e.preventDefault(); dentroDe=0; capa.style.display='none';
    var fs = e.dataTransfer && e.dataTransfer.files;
    if(fs && fs.length) meterDescargados(fs);
  });
}

/* ══════════════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════════════ */
cargar();
pintar();
engancharArrastre();
repasarFicheros().then(function(){ pintar(); });

})();
