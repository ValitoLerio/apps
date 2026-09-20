/* ══════════════════════════════════════════════════════════════════
   FOTOS — el álbum
   ══════════════════════════════════════════════════════════════════
   Con diez mil fotos no hay navegador que las guarde: entre todas son
   treinta o cuarenta gigas y aquí caben unos megas. Así que el álbum
   no se queda las fotos, se queda su ficha —álbum, fecha, sitio, quién
   sale, etiquetas— y una miniatura pequeña para verlas en cuadrícula.

     · La ficha va a GitHub con el resto de las apps: pesa poco y la
       tienes en todos los aparatos.
     · Las miniaturas se quedan en este aparato, en su propio cajón
       (IndexedDB), que aguanta miles sin despeinarse.
     · Las fotos de verdad siguen en su carpeta. En el ordenador se le
       dice una vez dónde están y las vuelve a encontrar solas.

   Las del iPhone vienen en HEIC y Chrome no las sabe abrir: se
   apuntan igual y se avisa, que es mejor que dejarlas fuera.
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var CLAVE = 'fotos.libro.v1';
var VACIO = {fotos:[], albumes:[], ajustes:{mini:150, tam:220}};

var EXT_IMAGEN = ['jpg','jpeg','png','webp','gif','bmp','avif','heic','heif','tif','tiff'];
var EXT_RARAS  = ['heic','heif','tif','tiff'];     /* el navegador no las pinta */

var libro = null;
var ui = {vista:'galeria', album:'', anio:'', etiqueta:'', busca:'', soloFav:false,
          sinClasificar:false, tope:300, sel:{}, verFoto:null, carpetas:[]};

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function esc(t){
  return String(t==null?'':t).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function plural(n, uno, varios){ return n+' '+(n===1?uno:varios); }
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():''; }
function extDe(nombre){
  var p=String(nombre||'').split('.');
  return p.length>1 ? p[p.length-1].toLowerCase() : '';
}
function esImagen(nombre){ return EXT_IMAGEN.indexOf(extDe(nombre))>=0; }
function esRara(nombre){ return EXT_RARAS.indexOf(extDe(nombre))>=0; }
function dmy(iso){
  if(!iso) return '';
  var p=String(iso).slice(0,10).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso;
}
function anioDe(f){ return f && f.fecha ? String(f.fecha).slice(0,4) : ''; }
function pesoCorto(b){
  if(!b) return '';
  if(b < 1024*1024) return Math.round(b/1024)+' kB';
  return (b/1048576).toFixed(1).replace('.',',')+' MB';
}

/* El nombre, el tamaño y la fecha del archivo: con eso una foto es
   siempre la misma aunque se cambie de carpeta o se vuelva a leer. */
function idDeArchivo(nombre, tam, cuando){
  var base = nombre.toLowerCase()+'|'+tam+'|'+(cuando||0);
  var h = 0;
  for (var i=0;i<base.length;i++){ h = ((h<<5)-h + base.charCodeAt(i))|0; }
  return (h>>>0).toString(36)+'-'+tam.toString(36);
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
  caja._t = setTimeout(function(){ caja.style.display='none'; }, 3200);
}

function abrirVentana(titulo, cuerpoHTML, alGuardar, opciones){
  opciones = opciones || {};
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
    if(d.returnValue==='ok' && alGuardar){ if(alGuardar()===true) return; }
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
   EL CAJÓN DE LAS MINIATURAS (IndexedDB)
   ══════════════════════════════════════════════════════════════
   Aquí van las miniaturas y el permiso de la carpeta. No se sube nada
   de esto: es de este aparato. */
var BD = null;
function bd(){
  if (BD) return Promise.resolve(BD);
  return new Promise(function(ok, mal){
    var p = indexedDB.open('fotos-album', 1);
    p.onupgradeneeded = function(){
      var d = p.result;
      if(!d.objectStoreNames.contains('miniaturas')) d.createObjectStore('miniaturas');
      if(!d.objectStoreNames.contains('cosas'))      d.createObjectStore('cosas');
    };
    p.onsuccess = function(){ BD = p.result; ok(BD); };
    p.onerror   = function(){ mal(p.error || new Error('No se pudo abrir el cajón de miniaturas')); };
  });
}
function guardarEn(cajon, clave, valor){
  return bd().then(function(d){
    return new Promise(function(ok, mal){
      var t = d.transaction(cajon, 'readwrite');
      t.objectStore(cajon).put(valor, clave);
      t.oncomplete = function(){ ok(true); };
      t.onerror    = function(){ mal(t.error); };
    });
  });
}
function leerDe(cajon, clave){
  return bd().then(function(d){
    return new Promise(function(ok, mal){
      var t = d.transaction(cajon, 'readonly');
      var r = t.objectStore(cajon).get(clave);
      r.onsuccess = function(){ ok(r.result); };
      r.onerror   = function(){ mal(r.error); };
    });
  });
}
function vaciarCajon(cajon){
  return bd().then(function(d){
    return new Promise(function(ok, mal){
      var t = d.transaction(cajon, 'readwrite');
      t.objectStore(cajon).clear();
      t.oncomplete = function(){ ok(true); };
      t.onerror    = function(){ mal(t.error); };
    });
  });
}
function contarCajon(cajon){
  return bd().then(function(d){
    return new Promise(function(ok, mal){
      var t = d.transaction(cajon, 'readonly');
      var r = t.objectStore(cajon).count();
      r.onsuccess = function(){ ok(r.result); };
      r.onerror   = function(){ mal(r.error); };
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   GUARDAR Y CARGAR LA FICHA
   ══════════════════════════════════════════════════════════════ */
function cargar(){
  try{
    var crudo = localStorage.getItem(CLAVE);
    libro = crudo ? JSON.parse(crudo) : JSON.parse(JSON.stringify(VACIO));
  }catch(e){ libro = JSON.parse(JSON.stringify(VACIO)); }
  if(!libro.fotos)   libro.fotos = [];
  if(!libro.albumes) libro.albumes = [];
  if(!libro.ajustes) libro.ajustes = {};
  if(!libro.ajustes.mini) libro.ajustes.mini = 150;
  if(!libro.ajustes.tam)  libro.ajustes.tam  = 220;
}
function guardar(){ localStorage.setItem(CLAVE, JSON.stringify(libro)); }

function fotos(){ return libro.fotos || []; }
function fotoDe(id){
  for (var i=0;i<libro.fotos.length;i++) if (libro.fotos[i].id===id) return libro.fotos[i];
  return null;
}
function etiquetasTodas(){
  var c = {};
  fotos().forEach(function(f){ (f.etiquetas||[]).forEach(function(e){ c[e]=(c[e]||0)+1; }); });
  return Object.keys(c).sort(function(a,b){ return c[b]-c[a] || a.localeCompare(b,'es'); });
}
function aniosTodos(){
  var c = {};
  fotos().forEach(function(f){ var a=anioDe(f); if(a) c[a]=(c[a]||0)+1; });
  return Object.keys(c).sort().reverse();
}

/* ══════════════════════════════════════════════════════════════
   MINIATURAS
   ══════════════════════════════════════════════════════════════ */
function hacerMiniatura(archivo, lado){
  return new Promise(function(ok, mal){
    var url = URL.createObjectURL(archivo);
    var img = new Image();
    img.onload = function(){
      var w = img.naturalWidth, h = img.naturalHeight;
      var escala = Math.min(1, lado / Math.max(w, h));
      var cw = Math.max(1, Math.round(w*escala)), ch = Math.max(1, Math.round(h*escala));
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      cv.toBlob(function(b){
        if (b) ok({blob:b, w:w, h:h});
        else mal(new Error('no se pudo reducir'));
      }, 'image/jpeg', 0.72);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); mal(new Error('no se puede ver')); };
    img.src = url;
  });
}

/* Mete en el cajón la miniatura de un archivo y devuelve la ficha */
function apuntarArchivo(archivo, ruta, carpeta, listo){
  var cuando = archivo.lastModified || 0;
  var id = idDeArchivo(archivo.name, archivo.size, cuando);
  var ya = fotoDe(id);
  var fecha = new Date(cuando || Date.now());
  var ficha = ya || {
    id: id,
    nombre: archivo.name,
    ruta: ruta || '',
    tam: archivo.size,
    fecha: fecha.toISOString().slice(0,10),
    album: '',
    lugar: '',
    quien: '',
    etiquetas: [],
    fav: false,
    ancho: 0, alto: 0,
    carpeta: carpeta || '',
    verse: true
  };
  if (ya) { ficha.ruta = ruta || ficha.ruta; if (carpeta) ficha.carpeta = carpeta; }

  if (esRara(archivo.name)) {
    /* HEIC del iPhone: se apunta, pero el navegador no la pinta */
    ficha.verse = false;
    listo(ficha, false);
    return;
  }
  leerDe('miniaturas', id).then(function(hay){
    if (hay) { listo(ficha, false); return; }
    hacerMiniatura(archivo, libro.ajustes.tam || 220).then(function(r){
      ficha.ancho = r.w; ficha.alto = r.h; ficha.verse = true;
      return guardarEn('miniaturas', id, r.blob).then(function(){ listo(ficha, true); });
    }).catch(function(){
      ficha.verse = false;
      listo(ficha, false);
    });
  }).catch(function(){ listo(ficha, false); });
}

/* Va metiendo archivos de poco en poco: con diez mil no se puede de
   golpe, se queda el navegador tieso. */
function meterArchivos(lista, alAcabar){
  var total = lista.length, hechas = 0, nuevas = 0, sinVer = 0;
  var caja = document.getElementById('progreso');
  var barra = caja ? caja.querySelector('i') : null;
  var texto = document.getElementById('progreso-txt');

  function pintarProgreso(){
    if (barra) barra.style.width = Math.round(hechas*100/total)+'%';
    if (texto) texto.textContent = hechas+' de '+total+(nuevas?' · '+nuevas+' nuevas':'');
  }
  if (caja) caja.style.display='';

  var i = 0;
  function siguiente(){
    if (i >= total){
      guardar();
      if (caja) caja.style.display='none';
      alAcabar({total:total, nuevas:nuevas, sinVer:sinVer});
      return;
    }
    var paso = Math.min(i+8, total);   /* de ocho en ocho */
    var pendientes = 0;
    for (var k=i; k<paso; k++){
      pendientes++;
      (function(entrada){
        apuntarArchivo(entrada.archivo, entrada.ruta, entrada.carpeta, function(ficha, esNueva){
          if (!fotoDe(ficha.id)) { libro.fotos.push(ficha); nuevas++; }
          if (!ficha.verse) sinVer++;
          hechas++; pendientes--;
          if (pendientes===0){ pintarProgreso(); setTimeout(siguiente, 0); }
        });
      })(lista[k]);
    }
    i = paso;
  }
  siguiente();
}

/* ══════════════════════════════════════════════════════════════
   LA CARPETA DEL ORDENADOR
   ══════════════════════════════════════════════════════════════ */
function hayCarpetas(){ return typeof window.showDirectoryPicker === 'function'; }

/* Las fotos están en varios sitios: el ordenador, un disco de fuera, la
   carpeta de las del móvil que se pasaron. Se apuntan todas las carpetas
   que haga falta y el álbum las lee una detrás de otra. */
function guardarCarpetas(){
  return guardarEn('cosas','carpetas', ui.carpetas.map(function(c){ return c.mango; }))
    .then(function(){
      libro.ajustes.carpetas = ui.carpetas.map(function(c){ return c.nombre; });
      guardar();
    });
}

function recuperarCarpetas(){
  if (!hayCarpetas()) return Promise.resolve([]);
  return leerDe('cosas','carpetas').then(function(mangos){
    if (!mangos || !mangos.length) return [];
    ui.carpetas = mangos.map(function(m){ return {mango:m, nombre:m.name}; });
    return ui.carpetas;
  }).catch(function(){ return []; });
}

function anadirCarpeta(){
  if (!hayCarpetas()){
    avisar('Este navegador no deja elegir carpetas. Usa «Añadir fotos».', true);
    return;
  }
  window.showDirectoryPicker({id:'album-fotos', mode:'read'}).then(function(mango){
    var repetida = ui.carpetas.some(function(c){ return c.nombre === mango.name; });
    if (repetida){ avisar('Esa carpeta ya estaba puesta.', true); return; }
    ui.carpetas.push({mango:mango, nombre:mango.name});
    return guardarCarpetas().then(function(){
      avisar('Carpeta añadida: '+mango.name);
      leerCarpeta(mango, mango.name);
    });
  }).catch(function(e){
    if (e && e.name === 'AbortError') return;
    avisar('No se pudo abrir la carpeta: '+e.message, true);
  });
}

/* Recorre una carpeta y todo lo que tenga dentro */
async function juntarDeCarpeta(mango, ruta, saco){
  for await (var entrada of mango.values()){
    if (entrada.kind === 'file'){
      if (!esImagen(entrada.name)) continue;
      var archivo = await entrada.getFile();
      saco.push({archivo:archivo, ruta:(ruta?ruta+'/':'')+entrada.name});
    } else if (entrada.kind === 'directory'){
      await juntarDeCarpeta(entrada, (ruta?ruta+'/':'')+entrada.name, saco);
    }
  }
}

function leerCarpeta(mango, nombre){
  var texto = document.getElementById('progreso-txt');
  var caja  = document.getElementById('progreso');
  if (caja) caja.style.display='';
  if (texto) texto.textContent = 'Mirando «'+nombre+'»…';
  var saco = [];
  return juntarDeCarpeta(mango, '', saco).then(function(){
    if (!saco.length){
      if (caja) caja.style.display='none';
      avisar('En «'+nombre+'» no hay fotos.', true);
      return {total:0, nuevas:0, sinVer:0};
    }
    saco.forEach(function(x){ x.carpeta = nombre; });
    return new Promise(function(ok){
      meterArchivos(saco, function(r){ ok(r); });
    });
  }).catch(function(e){
    if (caja) caja.style.display='none';
    avisar('No se pudo leer «'+nombre+'»: '+e.message, true);
    return {total:0, nuevas:0, sinVer:0};
  });
}

/* Todas las carpetas apuntadas, una detrás de otra */
function leerTodasLasCarpetas(){
  if (!ui.carpetas.length){ anadirCarpeta(); return; }
  var total=0, nuevas=0, sinVer=0;
  var i = 0;
  function siguiente(){
    if (i >= ui.carpetas.length){
      pintar();
      avisar(plural(nuevas,'foto nueva','fotos nuevas')+' de '+total+
             (sinVer?' · '+sinVer+' no se pueden ver aquí':''));
      return;
    }
    var c = ui.carpetas[i++];
    permisoDe(c.mango).then(function(vale){
      if (!vale){ avisar('«'+c.nombre+'» ya no deja leerla: vuelve a añadirla.', true); siguiente(); return; }
      leerCarpeta(c.mango, c.nombre).then(function(r){
        total+=r.total; nuevas+=r.nuevas; sinVer+=r.sinVer;
        siguiente();
      });
    });
  }
  siguiente();
}

function permisoDe(mango){
  if (!mango.queryPermission) return Promise.resolve(true);
  return mango.queryPermission({mode:'read'}).then(function(p){
    if (p === 'granted') return true;
    return mango.requestPermission({mode:'read'}).then(function(q){ return q === 'granted'; });
  }).catch(function(){ return false; });
}

/* ══════════════════════════════════════════════════════════════
   PINTAR
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root = document.getElementById('root');
  root.innerHTML =
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Fotos</span>'+
        '<span class="sub">El álbum de casa</span></div>'+
      boton('galeria','Todas', fotos().length)+
      boton('albumes','Álbumes', (libro.albumes||[]).length)+
      boton('anios','Por años', aniosTodos().length)+
      boton('ajustes','Ajustes', null)+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)">Las fotos no se suben</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll('[data-vista]').forEach(function(b){
    b.addEventListener('click', function(){
      ui.vista = b.dataset.vista; ui.tope = 300; ui.sel = {}; pintar();
    });
  });

  if (ui.vista === 'albumes')      verAlbumes();
  else if (ui.vista === 'anios')   verAnios();
  else if (ui.vista === 'ajustes') verAjustes();
  else                              verGaleria();
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
         '<div style="display:flex;gap:8px;flex-wrap:wrap">'+(botones||'')+'</div></div>';
}

function barraDeEntrada(){
  /* El botón es una etiqueta pegada al campo de archivos: así abre el
     cuadro de elegir en todos los navegadores, también en el iPhone.
     El campo no se esconde con display:none —hay navegadores que
     entonces no lo abren—, se aparta de la vista y ya está. */
  return '<div class="filtros">'+
      '<label class="btn fuerte" for="f_archivos" style="cursor:pointer">+ Añadir fotos</label>'+
      '<input type="file" id="f_archivos" accept="image/*" multiple '+
        'style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">'+
      '<label class="btn" for="f_carpetaHTML" style="cursor:pointer">📁 Una carpeta entera</label>'+
      '<input type="file" id="f_carpetaHTML" webkitdirectory directory multiple '+
        'style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">'+
      (hayCarpetas()
        ? '<button class="btn" id="f_carpeta">📂 Recordar una carpeta</button>'+
          (ui.carpetas.length
            ? '<button class="btn" id="f_releer">🔄 Volver a leer '+
              (ui.carpetas.length===1 ? '«'+esc(ui.carpetas[0].nombre)+'»'
                                      : plural(ui.carpetas.length,'carpeta','carpetas'))+'</button>'
            : '')
        : '')+
    '</div>'+
    '<div class="nota" style="margin:-6px 0 12px">También puedes <strong>arrastrar</strong> '+
      'fotos o una carpeta y soltarlas aquí.</div>'+
    '<div id="progreso" style="display:none">'+
      '<div class="progreso"><i></i></div>'+
      '<div class="nota" id="progreso-txt" style="margin:0 0 10px"></div>'+
    '</div>';
}

function tragarArchivos(archivos){
  var lista = Array.prototype.slice.call(archivos || [])
    .filter(function(a){ return esImagen(a.name); })
    .map(function(a){ return {archivo:a, ruta:a.webkitRelativePath||a.name, carpeta:''}; });
  if (!lista.length){ avisar('Ahí no venía ninguna foto.', true); return; }
  meterArchivos(lista, function(r){
    pintar();
    avisar(plural(r.nuevas,'foto nueva','fotos nuevas')+' de '+r.total+
           (r.sinVer?' · '+r.sinVer+' no se pueden ver aquí':''));
  });
}

function engancharEntrada(){
  var inp = document.getElementById('f_archivos');
  var inpDir = document.getElementById('f_carpetaHTML');
  var bC  = document.getElementById('f_carpeta');

  if (inp) inp.addEventListener('change', function(){
    var f = inp.files; inp.value='';
    tragarArchivos(f);
  });
  if (inpDir) inpDir.addEventListener('change', function(){
    var f = inpDir.files; inpDir.value='';
    tragarArchivos(f);
  });
  engancharArrastre();
  if (bC) bC.addEventListener('click', anadirCarpeta);
  var bR = document.getElementById('f_releer');
  if (bR) bR.addEventListener('click', leerTodasLasCarpetas);
}

/* Arrastrar desde el Finder y soltar en la página: lo más cómodo en el
   ordenador, y admite carpetas enteras. */
function engancharArrastre(){
  var main = document.getElementById('main');
  if (!main || main.dataset.arrastre) return;
  main.dataset.arrastre = '1';

  ['dragenter','dragover'].forEach(function(ev){
    main.addEventListener(ev, function(e){
      e.preventDefault();
      main.style.outline = '3px dashed var(--acento)';
      main.style.outlineOffset = '-8px';
    });
  });
  ['dragleave','drop'].forEach(function(ev){
    main.addEventListener(ev, function(){ main.style.outline = ''; });
  });

  main.addEventListener('drop', function(e){
    e.preventDefault();
    var saco = [];
    var items = e.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry){
      var pendientes = 0, acabado = false;
      function quizaListo(){
        if (acabado && pendientes === 0){
          if (!saco.length){ avisar('Ahí no venía ninguna foto.', true); return; }
          meterArchivos(saco, function(r){
            pintar();
            avisar(plural(r.nuevas,'foto nueva','fotos nuevas')+' de '+r.total+
                   (r.sinVer?' · '+r.sinVer+' no se pueden ver aquí':''));
          });
        }
      }
      function meterEntrada(entrada, ruta){
        if (!entrada) return;
        if (entrada.isFile){
          pendientes++;
          entrada.file(function(archivo){
            if (esImagen(archivo.name)) saco.push({archivo:archivo, ruta:ruta+archivo.name, carpeta:''});
            pendientes--; quizaListo();
          }, function(){ pendientes--; quizaListo(); });
        } else if (entrada.isDirectory){
          pendientes++;
          var lector = entrada.createReader();
          (function leerTanda(){
            lector.readEntries(function(hijos){
              if (!hijos.length){ pendientes--; quizaListo(); return; }
              hijos.forEach(function(h){ meterEntrada(h, ruta+entrada.name+'/'); });
              leerTanda();
            }, function(){ pendientes--; quizaListo(); });
          })();
        }
      }
      var hubo = false;
      for (var i=0;i<items.length;i++){
        var en = items[i].webkitGetAsEntry();
        if (en){ hubo = true; meterEntrada(en, ''); }
      }
      if (hubo){
        acabado = true;
        quizaListo();
        return;
      }
      /* Sin entradas: se tira de la lista de archivos de toda la vida */
    }
    tragarArchivos(e.dataTransfer.files);
  });
}

/* ── Las que salen con los filtros puestos ───────────────────────── */
function filtradas(){
  var t = ui.busca.trim().toLowerCase();
  return fotos().filter(function(f){
    if (ui.soloFav && !f.fav) return false;
    if (ui.album && f.album !== ui.album) return false;
    if (ui.anio && anioDe(f) !== ui.anio) return false;
    if (ui.etiqueta && (f.etiquetas||[]).indexOf(ui.etiqueta) < 0) return false;
    if (ui.sinClasificar && (f.album || (f.etiquetas||[]).length)) return false;
    if (!t) return true;
    return ((f.nombre||'')+' '+(f.lugar||'')+' '+(f.quien||'')+' '+
            (f.album||'')+' '+(f.etiquetas||[]).join(' ')).toLowerCase().indexOf(t) >= 0;
  }).sort(function(a,b){
    return (b.fecha||'').localeCompare(a.fecha||'') || (a.nombre||'').localeCompare(b.nombre||'','es');
  });
}

function verGaleria(){
  var main = document.getElementById('main');
  var lista = filtradas();
  var recortada = lista.length > ui.tope;
  var mostradas = recortada ? lista.slice(0, ui.tope) : lista;
  var anios = aniosTodos(), etiquetas = etiquetasTodas();

  main.innerHTML =
    cabecera('Todas las fotos',
      fotos().length
        ? plural(fotos().length,'foto apuntada','fotos apuntadas')+
          '. Las fotos se quedan en su carpeta; aquí va su ficha y una miniatura.'
        : 'Añade fotos o elige la carpeta donde las tengas. No se suben a ningún sitio.',
      '')+
    barraDeEntrada()+

    (fotos().length
      ? '<div class="filtros">'+
          '<input class="buscador" id="g_busca" placeholder="Buscar por nombre, sitio, quién o etiqueta…" '+
            'value="'+esc(ui.busca)+'">'+
          '<div class="grupo">'+
            '<button data-fav="0" aria-pressed="'+(!ui.soloFav && !ui.sinClasificar)+'">Todas</button>'+
            '<button data-fav="1" aria-pressed="'+ui.soloFav+'">★ Favoritas</button>'+
            '<button data-sin="1" aria-pressed="'+ui.sinClasificar+'">Sin clasificar</button>'+
          '</div>'+
          (anios.length
            ? '<select id="g_anio" style="width:auto"><option value="">Cualquier año</option>'+
              anios.map(function(a){
                return '<option value="'+a+'"'+(ui.anio===a?' selected':'')+'>'+a+'</option>';
              }).join('')+'</select>'
            : '')+
          (libro.albumes.length
            ? '<select id="g_album" style="width:auto"><option value="">Cualquier álbum</option>'+
              libro.albumes.map(function(a){
                return '<option value="'+esc(a)+'"'+(ui.album===a?' selected':'')+'>'+esc(a)+'</option>';
              }).join('')+'</select>'
            : '')+
          (etiquetas.length
            ? '<select id="g_etiqueta" style="width:auto"><option value="">Cualquier etiqueta</option>'+
              etiquetas.map(function(e){
                return '<option value="'+esc(e)+'"'+(ui.etiqueta===e?' selected':'')+'>'+esc(e)+'</option>';
              }).join('')+'</select>'
            : '')+
        '</div>'
      : '')+

    (lista.length
      ? '<div class="nota">'+plural(lista.length,'foto','fotos')+
        (recortada ? ' · se enseñan las '+ui.tope+' primeras' : '')+'</div>'+
        '<div class="rejaFotos'+(Object.keys(ui.sel).length?' marcando':'')+'" id="reja" '+
          'style="--miniatura:'+(libro.ajustes.mini||150)+'px">'+
          mostradas.map(fichaMini).join('')+
        '</div>'+
        (recortada
          ? '<div style="text-align:center;margin-top:16px">'+
            '<button class="btn" id="g_mas">Ver '+Math.min(300, lista.length-ui.tope)+' más</button></div>'
          : '')
      : (fotos().length
          ? '<div class="vacio"><strong>Nada con esos filtros</strong>Prueba a quitar alguno.</div>'
          : '<div class="vacio"><strong>El álbum está vacío</strong>'+
            'Dale a «Añadir fotos» y elige las que quieras, o «Elegir carpeta» y las coge todas.</div>'))+

    (Object.keys(ui.sel).length ? barraSeleccion() : '');

  engancharEntrada();
  engancharGaleria();
}

function fichaMini(f){
  var marcada = !!ui.sel[f.id];
  return '<button class="mini" data-foto="'+esc(f.id)+'" aria-pressed="'+marcada+'" '+
    'title="'+esc(f.nombre)+'">'+
    (f.verse
      ? '<img data-mini="'+esc(f.id)+'" alt="">'
      : '<span class="sinver">📄<span>'+esc(extDe(f.nombre).toUpperCase())+'</span>'+
        '<span>no se ve aquí</span></span>')+
    (f.fav?'<span class="fav">★</span>':'')+
    '<span class="marca"></span>'+
    '<span class="pieMini">'+esc(f.album || dmy(f.fecha) || f.nombre)+'</span>'+
  '</button>';
}

/* Las miniaturas se van pidiendo al cajón según entran en pantalla:
   con diez mil, pedirlas todas de golpe no acaba nunca. */
var mirador = null;
function engancharGaleria(){
  var main = document.getElementById('main');
  var busca = document.getElementById('g_busca');
  if (busca) busca.addEventListener('input', function(){
    ui.busca = busca.value;
    clearTimeout(window.__esperaFotos);
    window.__esperaFotos = setTimeout(function(){
      ui.tope = 300; verGaleria();
      var v = document.getElementById('g_busca');
      if (v){ v.focus(); v.selectionStart = v.value.length; }
    }, 220);
  });
  var selAnio = document.getElementById('g_anio');
  if (selAnio) selAnio.addEventListener('change', function(){ ui.anio = this.value; ui.tope=300; verGaleria(); });
  var selAlbum = document.getElementById('g_album');
  if (selAlbum) selAlbum.addEventListener('change', function(){ ui.album = this.value; ui.tope=300; verGaleria(); });
  var selEtiqueta = document.getElementById('g_etiqueta');
  if (selEtiqueta) selEtiqueta.addEventListener('change', function(){ ui.etiqueta = this.value; ui.tope=300; verGaleria(); });

  main.querySelectorAll('[data-fav]').forEach(function(b){
    b.addEventListener('click', function(){
      ui.soloFav = b.dataset.fav === '1'; ui.sinClasificar = false; ui.tope=300; verGaleria();
    });
  });
  main.querySelectorAll('[data-sin]').forEach(function(b){
    b.addEventListener('click', function(){
      ui.sinClasificar = !ui.sinClasificar; ui.soloFav = false; ui.tope=300; verGaleria();
    });
  });
  var mas = document.getElementById('g_mas');
  if (mas) mas.addEventListener('click', function(){ ui.tope += 300; verGaleria(); });

  main.querySelectorAll('[data-foto]').forEach(function(b){
    b.addEventListener('click', function(e){
      if (e.shiftKey || e.metaKey || e.ctrlKey || Object.keys(ui.sel).length){
        marcar(b.dataset.foto);
      } else {
        abrirVisor(b.dataset.foto);
      }
    });
    /* Mantener pulsado en el móvil = marcar */
    var reloj = null;
    b.addEventListener('pointerdown', function(){
      reloj = setTimeout(function(){ marcar(b.dataset.foto); }, 500);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
      b.addEventListener(ev, function(){ clearTimeout(reloj); });
    });
  });

  engancharBarraSeleccion();
  cargarMiniaturasVisibles();
}

function cargarMiniaturasVisibles(){
  if (mirador) mirador.disconnect();
  mirador = new IntersectionObserver(function(entradas){
    entradas.forEach(function(e){
      if (!e.isIntersecting) return;
      var img = e.target;
      mirador.unobserve(img);
      var id = img.dataset.mini;
      leerDe('miniaturas', id).then(function(blob){
        if (!blob) return;
        img.src = URL.createObjectURL(blob);
        img.onload = function(){ img.classList.add('puesta'); };
      }).catch(function(){});
    });
  }, {rootMargin:'400px'});
  document.querySelectorAll('img[data-mini]').forEach(function(img){ mirador.observe(img); });
}

/* ── Marcar varias y hacerles algo a todas ───────────────────────── */
function marcar(id){
  if (ui.sel[id]) delete ui.sel[id]; else ui.sel[id] = true;
  verGaleria();
}
function barraSeleccion(){
  var n = Object.keys(ui.sel).length;
  return '<div class="barraSel">'+
    '<strong>'+plural(n,'foto marcada','fotos marcadas')+'</strong>'+
    '<button class="btn sm fuerte" id="s_mandar">📤 Mandar</button>'+
    '<button class="btn sm" id="s_album">Poner en un álbum</button>'+
    '<button class="btn sm" id="s_etiqueta">Poner etiqueta</button>'+
    '<button class="btn sm" id="s_fecha">Cambiar la fecha</button>'+
    '<button class="btn sm" id="s_fav">★ Favoritas</button>'+
    '<button class="btn sm malo" id="s_quitar">Quitar del álbum</button>'+
    '<button class="btn suave sm" id="s_nada" style="margin-left:auto">Desmarcar</button>'+
  '</div>';
}
function marcadas(){ return Object.keys(ui.sel).map(fotoDe).filter(Boolean); }

function engancharBarraSeleccion(){
  var b;
  b = document.getElementById('s_nada');
  if (b) b.addEventListener('click', function(){ ui.sel = {}; verGaleria(); });

  b = document.getElementById('s_mandar');
  if (b) b.addEventListener('click', function(){ mandarFotos(marcadas()); });

  b = document.getElementById('s_fav');
  if (b) b.addEventListener('click', function(){
    var todas = marcadas(), poner = todas.some(function(f){ return !f.fav; });
    todas.forEach(function(f){ f.fav = poner; });
    guardar(); verGaleria();
    avisar(poner ? plural(todas.length,'foto en favoritas','fotos en favoritas')
                 : 'Fuera de favoritas');
  });

  b = document.getElementById('s_album');
  if (b) b.addEventListener('click', function(){
    var todas = marcadas();
    abrirVentana('Poner en un álbum',
      '<div class="campo"><label class="lbl" for="sa_nombre">Álbum</label>'+
      '<input id="sa_nombre" list="sa_lista" placeholder="Soldeu, Bodas, El restaurante…" autocomplete="off">'+
      '<datalist id="sa_lista">'+libro.albumes.map(function(a){
        return '<option value="'+esc(a)+'">'; }).join('')+'</datalist>'+
      '<span class="nota" style="margin:6px 0 0">Van '+plural(todas.length,'foto','fotos')+
      '. Si el álbum no existe, se crea.</span></div>',
      function(){
        var nombre = valor('sa_nombre');
        if (!nombre){ avisar('Ponle nombre al álbum.', true); return true; }
        if (libro.albumes.indexOf(nombre) < 0) libro.albumes.push(nombre);
        todas.forEach(function(f){ f.album = nombre; });
        ui.sel = {}; guardar(); pintar();
        avisar(plural(todas.length,'foto','fotos')+' en «'+nombre+'»');
      }, {aceptar:'Ponerlas'});
  });

  b = document.getElementById('s_etiqueta');
  if (b) b.addEventListener('click', function(){
    var todas = marcadas();
    abrirVentana('Poner etiqueta',
      '<div class="campo"><label class="lbl" for="se_txt">Etiquetas</label>'+
      '<input id="se_txt" list="se_lista" placeholder="verano, familia, cocina…" autocomplete="off">'+
      '<datalist id="se_lista">'+etiquetasTodas().map(function(e){
        return '<option value="'+esc(e)+'">'; }).join('')+'</datalist>'+
      '<span class="nota" style="margin:6px 0 0">Separadas por comas. Se añaden a las que ya tengan.</span></div>',
      function(){
        var txt = valor('se_txt');
        if (!txt){ avisar('Escribe alguna etiqueta.', true); return true; }
        var nuevas = txt.split(/[,;]+/).map(function(x){ return x.trim(); }).filter(Boolean);
        todas.forEach(function(f){
          f.etiquetas = f.etiquetas || [];
          nuevas.forEach(function(e){ if (f.etiquetas.indexOf(e) < 0) f.etiquetas.push(e); });
        });
        ui.sel = {}; guardar(); verGaleria();
        avisar('Etiquetas puestas');
      }, {aceptar:'Ponerlas'});
  });

  b = document.getElementById('s_fecha');
  if (b) b.addEventListener('click', function(){
    var todas = marcadas();
    abrirVentana('Cambiar la fecha',
      '<div class="campo"><label class="lbl" for="sf_fecha">Fecha</label>'+
      '<input type="date" id="sf_fecha">'+
      '<span class="nota" style="margin:6px 0 0">Va a '+plural(todas.length,'foto','fotos')+
      '. La fecha que trae cada archivo no siempre es la buena.</span></div>',
      function(){
        var f = valor('sf_fecha');
        if (!f){ avisar('Elige una fecha.', true); return true; }
        todas.forEach(function(x){ x.fecha = f; });
        ui.sel = {}; guardar(); verGaleria();
        avisar('Fecha cambiada');
      }, {aceptar:'Cambiarla'});
  });

  b = document.getElementById('s_quitar');
  if (b) b.addEventListener('click', function(){
    var todas = marcadas();
    confirmar('Quitar del álbum',
      '<p style="margin:0 0 8px">Se van '+plural(todas.length,'foto','fotos')+' de la lista.</p>'+
      '<p class="nota" style="margin:0">Los archivos no se tocan: siguen en su carpeta. '+
      'Si vuelves a leer la carpeta, vuelven a salir.</p>',
      function(){
        var fuera = {};
        todas.forEach(function(f){ fuera[f.id] = true; });
        libro.fotos = fotos().filter(function(f){ return !fuera[f.id]; });
        ui.sel = {}; guardar(); pintar();
        avisar(plural(todas.length,'foto quitada','fotos quitadas'));
      }, {aceptar:'Quitarlas', malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════
   VER UNA FOTO
   ══════════════════════════════════════════════════════════════ */
function abrirVisor(id){
  var lista = filtradas();
  var i = 0;
  for (var k=0;k<lista.length;k++) if (lista[k].id === id) { i = k; break; }

  var capa = document.createElement('div');
  capa.className = 'visor';
  capa.innerHTML =
    '<div class="barraV">'+
      '<span class="nom" id="v_nom"></span>'+
      '<button class="btn sm" id="v_fav">★</button>'+
      '<button class="btn sm" id="v_mandar">📤 Mandar</button>'+
      '<button class="btn sm" id="v_copiar">Copiar</button>'+
      '<button class="btn sm" id="v_editar">Ficha</button>'+
      '<button class="btn sm" id="v_cerrar">Cerrar</button>'+
    '</div>'+
    '<div class="lienzo">'+
      '<button class="flecha izq" id="v_antes">‹</button>'+
      '<img id="v_img" alt="">'+
      '<div id="v_aviso" style="position:absolute;color:#ddd;font-size:14px;text-align:center;padding:20px"></div>'+
      '<button class="flecha der" id="v_luego">›</button>'+
    '</div>'+
    '<div class="fichaV" id="v_ficha" style="display:none"></div>';
  document.body.appendChild(capa);

  function pintarFoto(){
    var f = lista[i];
    if (!f) return;
    document.getElementById('v_nom').textContent =
      (f.album ? f.album+' · ' : '') + (dmy(f.fecha) || f.nombre);
    document.getElementById('v_fav').textContent = f.fav ? '★' : '☆';
    var img = document.getElementById('v_img');
    var aviso = document.getElementById('v_aviso');
    img.style.display='none'; aviso.textContent='';
    /* La grande sólo si tenemos la carpeta a mano; si no, la miniatura */
    grandeDe(f).then(function(url){
      if (!url){
        img.style.display='none';
        aviso.innerHTML = f.verse
          ? 'La foto está en tu carpeta.<br>Dale a «Elegir carpeta» para verla grande.'
          : 'Esta foto es '+esc(extDe(f.nombre).toUpperCase())+' y el navegador no la abre.<br>'+
            'Está apuntada igual: álbum, fecha y etiquetas se guardan.';
        return;
      }
      img.src = url; img.style.display='';
    });
    var fichaAbierta = document.getElementById('v_ficha').style.display !== 'none';
    if (fichaAbierta) pintarFicha();
  }

  function pintarFicha(){
    var f = lista[i];
    var caja = document.getElementById('v_ficha');
    caja.style.display = '';
    caja.innerHTML =
      '<div class="campo"><label class="lbl">Álbum</label>'+
        '<input id="vf_album" list="vf_albumes" value="'+esc(f.album||'')+'">'+
        '<datalist id="vf_albumes">'+libro.albumes.map(function(a){
          return '<option value="'+esc(a)+'">'; }).join('')+'</datalist></div>'+
      '<div class="campo"><label class="lbl">Fecha</label>'+
        '<input type="date" id="vf_fecha" value="'+esc(f.fecha||'')+'"></div>'+
      '<div class="campo"><label class="lbl">Dónde</label>'+
        '<input id="vf_lugar" value="'+esc(f.lugar||'')+'" placeholder="Soldeu, la playa…"></div>'+
      '<div class="campo"><label class="lbl">Quién sale</label>'+
        '<input id="vf_quien" value="'+esc(f.quien||'')+'" placeholder="Cristina, los niños…"></div>'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl">Etiquetas</label>'+
        '<input id="vf_etiquetas" value="'+esc((f.etiquetas||[]).join(', '))+'" '+
        'placeholder="verano, familia, cocina"></div>'+
      '<div class="campo" style="grid-column:1/-1;flex-direction:row;gap:8px;align-items:center">'+
        '<button class="btn fuerte sm" id="vf_guardar">Guardar la ficha</button>'+
        '<span class="nota" style="margin:0;color:#a79c96">'+esc(f.nombre)+' · '+
        pesoCorto(f.tam)+(f.ancho?' · '+f.ancho+'×'+f.alto:'')+
        (f.ruta?' · '+esc(f.ruta):'')+'</span></div>';
    document.getElementById('vf_guardar').addEventListener('click', function(){
      f.album = valor('vf_album');
      f.fecha = valor('vf_fecha');
      f.lugar = valor('vf_lugar');
      f.quien = valor('vf_quien');
      f.etiquetas = valor('vf_etiquetas').split(/[,;]+/).map(function(x){ return x.trim(); }).filter(Boolean);
      if (f.album && libro.albumes.indexOf(f.album) < 0) libro.albumes.push(f.album);
      guardar(); pintarFoto();
      avisar('Ficha guardada');
    });
  }

  function mover(paso){
    i = (i + paso + lista.length) % lista.length;
    pintarFoto();
  }
  function cerrar(){
    document.removeEventListener('keydown', teclas);
    capa.remove();
    verGaleria();
  }
  function teclas(e){
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowLeft') mover(-1);
    else if (e.key === 'ArrowRight') mover(1);
  }

  document.getElementById('v_cerrar').addEventListener('click', cerrar);
  document.getElementById('v_antes').addEventListener('click', function(){ mover(-1); });
  document.getElementById('v_luego').addEventListener('click', function(){ mover(1); });
  document.getElementById('v_editar').addEventListener('click', function(){
    var caja = document.getElementById('v_ficha');
    if (caja.style.display === 'none') pintarFicha(); else caja.style.display='none';
  });
  document.getElementById('v_mandar').addEventListener('click', function(){
    mandarFotos([lista[i]]);
  });
  document.getElementById('v_copiar').addEventListener('click', function(){
    copiarFoto(lista[i]);
  });
  document.getElementById('v_fav').addEventListener('click', function(){
    var f = lista[i]; f.fav = !f.fav; guardar(); pintarFoto();
  });
  document.addEventListener('keydown', teclas);

  /* Pasar con el dedo */
  var x0 = null;
  capa.addEventListener('touchstart', function(e){ x0 = e.touches[0].clientX; });
  capa.addEventListener('touchend', function(e){
    if (x0 == null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) mover(dx < 0 ? 1 : -1);
    x0 = null;
  });

  pintarFoto();
}

/* La foto grande: se busca en la carpeta si la tenemos; si no, se
   enseña la miniatura, que para mirar de qué es sirve. */
function grandeDe(f){
  if (!f.verse) return Promise.resolve(null);
  if (ui.carpetas.length && f.ruta){
    /* primero la carpeta de donde salió; si no aparece, se mira en las otras */
    var orden = ui.carpetas.slice().sort(function(a,b){
      return (b.nombre===f.carpeta?1:0) - (a.nombre===f.carpeta?1:0);
    });
    var i = 0;
    function probar(){
      if (i >= orden.length) return miniaturaUrl(f.id);
      return archivoDeRuta(orden[i++].mango, f.ruta).then(function(archivo){
        return archivo ? URL.createObjectURL(archivo) : probar();
      }).catch(probar);
    }
    return probar();
  }
  return miniaturaUrl(f.id);
}
function miniaturaUrl(id){
  return leerDe('miniaturas', id).then(function(b){ return b ? URL.createObjectURL(b) : null; });
}
async function archivoDeRuta(mango, ruta){
  var partes = String(ruta).split('/').filter(Boolean);
  var actual = mango;
  try{
    for (var i=0;i<partes.length-1;i++) actual = await actual.getDirectoryHandle(partes[i]);
    var fh = await actual.getFileHandle(partes[partes.length-1]);
    return await fh.getFile();
  }catch(e){ return null; }
}

/* ══════════════════════════════════════════════════════════════
   MANDAR FOTOS
   ══════════════════════════════════════════════════════════════
   En el móvil sale el botón de compartir de siempre —WhatsApp, correo,
   AirDrop— porque el navegador lo deja. En el ordenador no lo deja: ahí
   las fotos se bajan a la carpeta de Descargas y desde allí se arrastran
   al WhatsApp o se adjuntan al correo. Y para una sola, se puede copiar
   y pegarla directamente en la conversación. */

/* El archivo de verdad si tenemos su carpeta; si no, la miniatura */
function archivoDe(f){
  if (ui.carpetas.length && f.ruta){
    var orden = ui.carpetas.slice().sort(function(a,b){
      return (b.nombre===f.carpeta?1:0) - (a.nombre===f.carpeta?1:0);
    });
    var i = 0;
    function probar(){
      if (i >= orden.length) return miniaturaArchivo(f);
      return archivoDeRuta(orden[i++].mango, f.ruta).then(function(archivo){
        return archivo || probar();
      }).catch(probar);
    }
    return probar();
  }
  return miniaturaArchivo(f);
}
function miniaturaArchivo(f){
  return leerDe('miniaturas', f.id).then(function(b){
    if (!b) return null;
    var nombre = f.nombre.replace(/\.[^.]+$/,'') + ' (pequeña).jpg';
    var archivo = new File([b], nombre, {type:'image/jpeg'});
    archivo.esMini = true;      /* es la miniatura, no el original */
    return archivo;
  }).catch(function(){ return null; });
}

function sePuedeCompartir(archivos){
  try { return !!(navigator.canShare && navigator.canShare({files:archivos})); }
  catch(e){ return false; }
}

function bajarArchivo(archivo){
  var url = URL.createObjectURL(archivo);
  var a = document.createElement('a');
  a.href = url; a.download = archivo.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

function mandarFotos(lista){
  if (!lista.length) return;
  if (lista.length > 30){
    avisar('De golpe, treinta como mucho: marca menos.', true);
    return;
  }
  avisar('Preparando '+plural(lista.length,'foto','fotos')+'…');
  Promise.all(lista.map(archivoDe)).then(function(archivos){
    archivos = archivos.filter(Boolean);
    if (!archivos.length){
      var raras = lista.filter(function(f){ return !f.verse; }).length;
      avisar(raras === lista.length
        ? 'Esa foto es '+extDe(lista[0].nombre).toUpperCase()+' y aquí no hay copia. '+
          'Añade su carpeta y ya se puede mandar.'
        : 'No tengo el archivo a mano. Añade la carpeta donde estén.', true);
      return;
    }
    var faltan = lista.length - archivos.length;
    var pequenas = archivos.filter(function(a){ return a.esMini; }).length;
    var aviso = (faltan ? ' · '+faltan+' sin encontrar' : '')+
                (pequenas ? ' · '+pequenas+' en pequeño, porque no tengo su carpeta' : '');

    if (sePuedeCompartir(archivos)){
      navigator.share({files:archivos, title:'Fotos'}).then(function(){
        avisar(plural(archivos.length,'foto mandada','fotos mandadas')+aviso, pequenas>0);
      }).catch(function(e){
        if (e && e.name === 'AbortError') return;
        archivos.forEach(bajarArchivo);
        avisar('Te las he bajado a Descargas');
      });
      return;
    }
    /* Ordenador: a la carpeta de Descargas, de una en una */
    archivos.forEach(function(a, i){ setTimeout(function(){ bajarArchivo(a); }, i*250); });
    avisar(plural(archivos.length,'foto bajada','fotos bajadas')+' a Descargas. '+
           (archivos.length===1?'Arrástrala':'Arrástralas')+' al WhatsApp'+aviso+'.', pequenas>0);
  });
}

/* Una sola, al portapapeles: se pega en el chat sin bajarla */
function copiarFoto(f){
  if (!navigator.clipboard || !window.ClipboardItem){
    avisar('Este navegador no deja copiar fotos; usa «Bajar».', true);
    return;
  }
  archivoDe(f).then(function(archivo){
    if (!archivo){ avisar('No tengo el archivo a mano.', true); return; }
    /* el portapapeles sólo admite PNG: se repinta */
    var url = URL.createObjectURL(archivo);
    var img = new Image();
    img.onload = function(){
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img,0,0);
      URL.revokeObjectURL(url);
      cv.toBlob(function(b){
        navigator.clipboard.write([new ClipboardItem({'image/png': b})]).then(function(){
          avisar('Copiada: pégala en el WhatsApp o en el correo');
        }).catch(function(e){ avisar('No se pudo copiar: '+e.message, true); });
      }, 'image/png');
    };
    img.onerror = function(){ URL.revokeObjectURL(url); avisar('Esa foto no se puede copiar.', true); };
    img.src = url;
  });
}

/* ══════════════════════════════════════════════════════════════
   ÁLBUMES Y AÑOS
   ══════════════════════════════════════════════════════════════ */
function verAlbumes(){
  var main = document.getElementById('main');
  var cuenta = {};
  fotos().forEach(function(f){ if (f.album) cuenta[f.album] = (cuenta[f.album]||0)+1; });
  var sinAlbum = fotos().filter(function(f){ return !f.album; }).length;

  main.innerHTML =
    cabecera('Álbumes',
      'Cada foto va en un álbum. Se marcan varias en «Todas» y se ponen de golpe.',
      '<button class="btn" id="a_nuevo">+ Álbum</button>')+

    (libro.albumes.length
      ? '<div class="rejilla">'+
        libro.albumes.slice().sort(function(a,b){ return a.localeCompare(b,'es'); })
        .map(function(a){
          return '<button class="tarjeta" data-album="'+esc(a)+'" style="text-align:left;cursor:pointer;'+
            'padding:14px 16px;font:inherit;color:inherit">'+
            '<div style="font-family:var(--titulo);font-size:17px;font-weight:600">'+esc(a)+'</div>'+
            '<div class="nota" style="margin:4px 0 0">'+plural(cuenta[a]||0,'foto','fotos')+'</div>'+
          '</button>';
        }).join('')+'</div>'
      : '<div class="vacio"><strong>Todavía no hay álbumes</strong>'+
        'Marca unas cuantas fotos en «Todas» y dale a «Poner en un álbum».</div>')+

    (sinAlbum
      ? '<div class="nota" style="margin-top:16px">'+plural(sinAlbum,'foto','fotos')+
        ' sin álbum. <button class="btn sm" id="a_sin">Verlas</button></div>'
      : '');

  main.querySelectorAll('[data-album]').forEach(function(b){
    b.addEventListener('click', function(){
      ui.album = b.dataset.album; ui.vista = 'galeria'; ui.tope = 300; pintar();
    });
  });
  var sin = document.getElementById('a_sin');
  if (sin) sin.addEventListener('click', function(){
    ui.sinClasificar = true; ui.album=''; ui.vista='galeria'; ui.tope=300; pintar();
  });
  document.getElementById('a_nuevo').addEventListener('click', function(){
    abrirVentana('Álbum nuevo',
      '<div class="campo"><label class="lbl" for="an_nombre">Cómo se llama</label>'+
      '<input id="an_nombre" placeholder="Soldeu 2026"></div>',
      function(){
        var n = valor('an_nombre');
        if (!n){ avisar('Ponle nombre.', true); return true; }
        if (libro.albumes.indexOf(n) < 0) libro.albumes.push(n);
        guardar(); pintar(); avisar('Álbum «'+n+'» creado');
      }, {aceptar:'Crearlo'});
  });
}

function verAnios(){
  var main = document.getElementById('main');
  var cuenta = {};
  fotos().forEach(function(f){ var a = anioDe(f) || 'sin fecha'; cuenta[a] = (cuenta[a]||0)+1; });
  var anios = Object.keys(cuenta).sort().reverse();

  main.innerHTML =
    cabecera('Por años', 'Las fotos por el año que tienen puesto.', '')+
    (anios.length
      ? '<div class="rejilla">'+anios.map(function(a){
          return '<button class="tarjeta" data-anio="'+esc(a==='sin fecha'?'':a)+'" '+
            'style="text-align:left;cursor:pointer;padding:14px 16px;font:inherit;color:inherit">'+
            '<div style="font-family:var(--titulo);font-size:20px;font-weight:600">'+esc(a)+'</div>'+
            '<div class="nota" style="margin:4px 0 0">'+plural(cuenta[a],'foto','fotos')+'</div>'+
          '</button>';
        }).join('')+'</div>'
      : '<div class="vacio"><strong>Aún no hay fotos</strong>Añade unas cuantas y salen por años.</div>');

  main.querySelectorAll('[data-anio]').forEach(function(b){
    b.addEventListener('click', function(){
      ui.anio = b.dataset.anio; ui.vista='galeria'; ui.tope=300; pintar();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function verAjustes(){
  var main = document.getElementById('main');
  main.innerHTML =
    cabecera('Ajustes', 'Cómo se ve el álbum y dónde están las fotos.', '')+

    '<div class="tarjeta" style="max-width:600px;margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Las fotos</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota">Las fotos no se suben a ningún sitio: se quedan donde las tengas. '+
        'Aquí sólo se guarda su ficha —álbum, fecha, sitio, quién sale, etiquetas— y una '+
        'miniatura en este aparato.</p>'+
        (hayCarpetas()
          ? '<div class="nota" style="margin-bottom:6px">Carpetas apuntadas:</div>'+
            (ui.carpetas.length
              ? '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">'+
                ui.carpetas.map(function(c,i){
                  var n = fotos().filter(function(f){ return f.carpeta === c.nombre; }).length;
                  return '<div style="display:flex;align-items:center;gap:8px">'+
                    '<span style="flex:1">📂 '+esc(c.nombre)+
                    ' <span class="nota" style="margin:0">· '+plural(n,'foto','fotos')+'</span></span>'+
                    '<button class="btn suave sm malo" data-quitarCarpeta="'+i+'">Quitar</button></div>';
                }).join('')+'</div>'
              : '<p class="nota">Ninguna todavía.</p>')+
            '<button class="btn" id="aj_carpeta">📂 Añadir una carpeta</button> '+
            (ui.carpetas.length?'<button class="btn" id="aj_releer">🔄 Volver a leerlas</button>':'')
          : '<p class="nota">Este navegador no deja elegir carpetas: usa «Añadir fotos» '+
            'y elige las que quieras a mano.</p>')+
        '<div class="rejilla" style="margin-top:12px">'+
          '<div class="campo"><label class="lbl" for="aj_mini">Tamaño en la cuadrícula</label>'+
            '<input type="number" id="aj_mini" min="90" max="320" step="10" value="'+
            (libro.ajustes.mini||150)+'"></div>'+
          '<div class="campo"><label class="lbl" for="aj_tam">Lado de la miniatura guardada</label>'+
            '<input type="number" id="aj_tam" min="120" max="600" step="20" value="'+
            (libro.ajustes.tam||220)+'"></div>'+
        '</div>'+
        '<p class="nota" style="margin-top:8px">Cuanto más grande la miniatura, mejor se ve y '+
        'más ocupa. Con 220 px, diez mil fotos son unos 200 MB en este aparato.</p>'+
        '<button class="btn fuerte" id="aj_guardar" style="margin-top:10px">Guardar</button>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:600px;margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>Lo que hay</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div class="cifras" style="margin:0">'+
          '<div class="cifra"><div class="k">Fotos apuntadas</div>'+
            '<div class="v acento">'+fotos().length+'</div></div>'+
          '<div class="cifra"><div class="k">Miniaturas aquí</div>'+
            '<div class="v" id="aj_minis">…</div></div>'+
          '<div class="cifra"><div class="k">Favoritas</div>'+
            '<div class="v">'+fotos().filter(function(f){ return f.fav; }).length+'</div></div>'+
          '<div class="cifra"><div class="k">Sin poder ver</div>'+
            '<div class="v">'+fotos().filter(function(f){ return !f.verse; }).length+'</div></div>'+
        '</div>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:600px;border-color:var(--malo)">'+
      '<div class="tarjeta-cab"><h2 style="color:var(--malo)">Borrar</h2>'+
        '<span class="pista">Las fotos de tu carpeta no se tocan</span></div>'+
      '<div class="tarjeta-cuerpo" style="display:flex;flex-direction:column;gap:12px">'+
        '<div><button class="btn malo" id="aj_minisFuera">Borrar las miniaturas</button>'+
          '<div class="nota" style="margin-top:4px">Se vuelven a hacer al leer la carpeta otra vez.</div></div>'+
        '<div style="border-top:1px solid var(--linea);padding-top:12px">'+
          '<button class="btn malo fuerte" id="aj_todo">Vaciar el álbum</button>'+
          '<div class="nota" style="margin-top:4px">Se van las fichas de las '+
          plural(fotos().length,'foto','fotos')+' y los álbumes.</div></div>'+
      '</div></div>';

  contarCajon('miniaturas').then(function(n){
    var e = document.getElementById('aj_minis');
    if (e) e.textContent = n;
  }).catch(function(){});

  var bc = document.getElementById('aj_carpeta');
  if (bc) bc.addEventListener('click', anadirCarpeta);
  var br = document.getElementById('aj_releer');
  if (br) br.addEventListener('click', leerTodasLasCarpetas);
  main.querySelectorAll('[data-quitarCarpeta]').forEach(function(b){
    b.addEventListener('click', function(){
      var i = +b.dataset.quitarcarpeta;
      var c = ui.carpetas[i];
      confirmar('Quitar «'+c.nombre+'»',
        '<p style="margin:0">Se deja de mirar esa carpeta. Las fichas de sus fotos se quedan, '+
        'y las fotos tampoco se tocan.</p>',
        function(){
          ui.carpetas.splice(i,1);
          guardarCarpetas().then(function(){ pintar(); avisar('Carpeta quitada'); });
        }, {aceptar:'Quitarla', malo:true});
    });
  });

  document.getElementById('aj_guardar').addEventListener('click', function(){
    libro.ajustes.mini = Math.max(90, Math.min(320, +valor('aj_mini')||150));
    libro.ajustes.tam  = Math.max(120, Math.min(600, +valor('aj_tam')||220));
    guardar(); pintar(); avisar('Ajustes guardados');
  });
  document.getElementById('aj_minisFuera').addEventListener('click', function(){
    confirmar('Borrar las miniaturas',
      '<p style="margin:0">Se van las miniaturas de este aparato. Las fichas se quedan y las '+
      'fotos de tu carpeta no se tocan.</p>',
      function(){
        vaciarCajon('miniaturas').then(function(){ pintar(); avisar('Miniaturas borradas'); });
      }, {aceptar:'Borrarlas', malo:true});
  });
  document.getElementById('aj_todo').addEventListener('click', function(){
    confirmar('Vaciar el álbum',
      '<p style="margin:0 0 8px">Se van las fichas de las '+plural(fotos().length,'foto','fotos')+
      ' y los álbumes.</p><p class="nota" style="margin:0">Las fotos siguen en tu carpeta: '+
      'volviendo a leerla, vuelven a salir (sin álbum ni etiquetas).</p>',
      function(){
        libro = JSON.parse(JSON.stringify(VACIO));
        guardar();
        vaciarCajon('miniaturas').then(function(){ pintar(); avisar('Álbum vacío'); });
      }, {aceptar:'Vaciar', malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════════════ */
cargar();
pintar();
recuperarCarpetas().then(function(cs){
  if (cs.length) pintar();   /* ya se sabe qué carpetas hay: sale el botón de releer */
});

})();
