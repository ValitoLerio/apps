/* ══════════════════════════════════════════════════════════════════
   SYNC — guarda los datos de las apps en un repositorio privado
   ══════════════════════════════════════════════════════════════════
   Las apps siguen usando localStorage como siempre. Este módulo:

     1. Al abrir una app, descarga datos.json del repo privado y lo
        vuelca en localStorage ANTES de que la app arranque.
     2. Intercepta localStorage para detectar cambios y subirlos
        solos, agrupados, un par de segundos después del último.
     3. Vigila que nadie haya guardado desde otro dispositivo:
        - si aquí no hay nada sin guardar, trae la versión nueva
        - si lo hay, pregunta antes de pisar nada
     4. Avisa al salir si queda algo sin subir.

   Las credenciales (repo, rama y token) se guardan solo en este
   dispositivo y nunca se suben a ningún sitio.
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// Métodos nativos, capturados antes de interceptar nada
var _get    = Storage.prototype.getItem;
var _set    = Storage.prototype.setItem;
var _remove = Storage.prototype.removeItem;

var TOKEN_KEY  = '__sync_token';
var REPO_KEY   = '__sync_repo';
var BRANCH_KEY = '__sync_branch';
var SHA_KEY    = '__sync_sha';

var ARCHIVO    = 'datos.json';

/* Las secciones que engordan mucho viven en su propio archivo. El de
   las recetas pasaba del mega él solo, y así cada guardado de cualquier
   otra app tenía que subir todo eso otra vez. Cada archivo va por su
   lado: se baja el que hace falta y se sube el que se toca. */
var APARTE     = {recetas: 'datos_recetas.json'};
function archivoDe(seccion){ return APARTE[seccion] || ARCHIVO; }
var RETARDO    = 2500;    // ms de espera tras el último cambio
var REINTENTOS = 3;       // ante conflicto de escritura
var VIGILANCIA = 60000;   // cada cuánto se mira si hay versión nueva

// Qué claves de localStorage pertenecen a cada app
var SECCIONES = {
  piso:    ['piso_cfg','piso_meses','piso_gastos','piso_inq','piso_data_version'],
  horario: ['rsch','rcam','rhid','rvac','rvacmig','rtheme','rwa','rancho'],
  comanda: ['comanda.ledger.v1'],
  casa:    ['casa.libro.v1'],
  caja:    ['caja.libro.v1'],
  coleccion: ['coleccion.libro.v1'],
  patrimonio: ['patrimonio.libro.v1'],
  pedidos: ['pedidos.libro.v1'],
  vacaciones: ['vacaciones.libro.v1'],
  recetas: ['recetas.libro.v1']
};

var seccionActiva = null;
var pendiente     = null;   // temporizador de subida
var haycambios    = false;  // hay algo escrito que aún no está en GitHub
var subiendo      = false;
var elEstado      = null;
var baseRemota    = null;   // cómo estaba mi sección cuando la cargué
var vigilante     = null;
var avisando      = false;  // hay un diálogo de conflicto abierto

// ── Credenciales ──────────────────────────────────────────────────
function token() { return _get.call(localStorage, TOKEN_KEY); }
function repo()  { return _get.call(localStorage, REPO_KEY); }
function rama()  { return _get.call(localStorage, BRANCH_KEY) || 'main'; }
function claveSha(archivo){
  return SHA_KEY + (!archivo || archivo === ARCHIVO ? '' : '_' + archivo.replace(/[^a-z0-9]/gi,''));
}
function sha(archivo)   { return _get.call(localStorage, claveSha(archivo)); }
function guardarSha(s, archivo){ _set.call(localStorage, claveSha(archivo), s || ''); }

function conectado(){ return !!token() && !!repo(); }

function guardarCredenciales(datos){
  _set.call(localStorage, TOKEN_KEY,  datos.token);
  _set.call(localStorage, REPO_KEY,   datos.repo);
  _set.call(localStorage, BRANCH_KEY, datos.rama || 'main');
  _remove.call(localStorage, SHA_KEY);
}

function olvidarCredenciales(){
  [TOKEN_KEY, REPO_KEY, BRANCH_KEY, SHA_KEY].forEach(function(k){
    _remove.call(localStorage, k);
  });
}

// ── Base64 con acentos y emojis ───────────────────────────────────
function aBase64(texto){
  var bytes = new TextEncoder().encode(texto);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function deBase64(b64){
  var bin = atob(String(b64).replace(/\s/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── Llamadas a GitHub ─────────────────────────────────────────────
function api(ruta, opciones){
  if (!token()) return Promise.reject(new Error('Falta el token de acceso'));
  if (!repo())  return Promise.reject(new Error('Falta el repositorio de datos'));
  opciones = opciones || {};
  var cabeceras = Object.assign({
    'Authorization': 'Bearer ' + token(),
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }, opciones.headers || {});
  var url = 'https://api.github.com/repos/' + repo() + (ruta ? '/' + ruta : '');
  return fetch(url, Object.assign({}, opciones, {headers: cabeceras}));
}

function errorDe(res){
  var e = new Error(
    res.status === 401 ? 'El token no es válido o ha caducado' :
    res.status === 403 ? 'El token no tiene permiso de escritura sobre ese repositorio' :
    res.status === 404 ? 'No encuentro ese repositorio (revisa usuario/repo y que el token lo incluya)' :
    'GitHub respondió ' + res.status);
  e.status = res.status;
  return e;
}

/* Descarga datos.json. Devuelve {} sólo si el repositorio está vacío
   de verdad.

   Cuidado con el tamaño: pasando de 1 MB, GitHub devuelve la ficha del
   archivo pero con el contenido vacío. Si eso se toma por «no hay
   nada», la app sube sólo su sección y se lleva por delante las de las
   demás. Por eso, cuando no viene contenido pero sí hay sha, se pide el
   blob, que sí lo trae. */
function descargar(archivo){
  archivo = archivo || ARCHIVO;
  return api('contents/' + archivo + '?ref=' + encodeURIComponent(rama()) + '&_=' + Date.now(),
             {cache: 'no-store'})
    .then(function(res){
      if (res.status === 404) { guardarSha('', archivo); return {}; }
      if (!res.ok) throw errorDe(res);
      return res.json().then(function(data){
        guardarSha(data.sha || '', archivo);
        if (data.content && String(data.content).trim()) {
          try { return JSON.parse(deBase64(data.content)); }
          catch(e){ throw new Error('El archivo de datos está corrupto: ' + e.message); }
        }
        if (data.sha) return descargarBlob(data.sha);   // archivo grande (no cabe por esta vía)
        return {};
      });
    });
}

/* Lo que necesita una app: el archivo de siempre —que lleva los
   candados y las demás secciones— y, si la suya vive aparte, también el
   suyo. Mientras quede la copia vieja en datos.json, se hace caso a la
   del archivo nuevo. */
function descargarPara(seccion){
  var archivo = archivoDe(seccion);
  if (archivo === ARCHIVO) return descargar(ARCHIVO);
  return Promise.all([descargar(ARCHIVO), descargar(archivo)])
    .then(function(dos){
      var base = dos[0] || {}, suyo = dos[1] || {};
      var junto = Object.assign({}, base);
      if (suyo[seccion]) junto[seccion] = suyo[seccion];
      return junto;
    });
}

/* Todo junto, para el escritorio: el archivo de siempre más los
   apartados. */
function descargarEntero(){
  var otros = Object.keys(APARTE);
  return Promise.all([descargar(ARCHIVO)].concat(otros.map(function(sec){
    return descargar(APARTE[sec]).catch(function(){ return {}; });
  }))).then(function(todos){
    var junto = Object.assign({}, todos[0] || {});
    otros.forEach(function(sec, i){
      var d = todos[i+1] || {};
      if (d[sec]) junto[sec] = d[sec];
    });
    return junto;
  });
}

/* El archivo entero por el otro camino: los blobs sí llegan completos
   hasta 100 MB. */
function descargarBlob(shaArchivo){
  return api('git/blobs/' + shaArchivo + '?_=' + Date.now(), {cache: 'no-store'})
    .then(function(res){
      if (!res.ok) throw errorDe(res);
      return res.json();
    })
    .then(function(blob){
      if (!blob || !blob.content) {
        throw new Error('GitHub no ha mandado el contenido del archivo de datos');
      }
      try { return JSON.parse(deBase64(blob.content)); }
      catch(e){ throw new Error('El archivo de datos está corrupto: ' + e.message); }
    });
}

function subir(contenido, archivo, intento){
  archivo = archivo || ARCHIVO;
  intento = intento || 0;
  var cuerpo = {
    message: 'datos: ' + new Date().toISOString(),
    content: aBase64(JSON.stringify(contenido, null, 2)),
    branch:  rama()
  };
  if (sha(archivo)) cuerpo.sha = sha(archivo);

  return api('contents/' + archivo, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(cuerpo)
  }).then(function(res){
    // Otro dispositivo escribió justo ahora: recojo lo suyo y reintento
    if ((res.status === 409 || res.status === 422) && intento < REINTENTOS){
      return descargar(archivo).then(function(remoto){
        var fusion = Object.assign({}, remoto);
        Object.keys(contenido).forEach(function(k){ fusion[k] = contenido[k]; });
        return subir(fusion, archivo, intento + 1);
      });
    }
    if (!res.ok) throw errorDe(res);
    return res.json().then(function(data){
      if (data && data.content && data.content.sha) guardarSha(data.content.sha, archivo);
      return data;
    });
  });
}

// ── Volcado entre localStorage y el archivo remoto ────────────────
function leerSeccion(nombre){
  var out = {};
  SECCIONES[nombre].forEach(function(clave){
    var v = _get.call(localStorage, clave);
    if (v !== null) out[clave] = v;
  });
  return out;
}

function escribirSeccion(nombre, datos){
  if (!datos) return;
  SECCIONES[nombre].forEach(function(clave){
    if (Object.prototype.hasOwnProperty.call(datos, clave)) {
      _set.call(localStorage, clave, datos[clave]);
    }
  });
}

/* Huella de una sección: sirve para saber si cambió en GitHub desde
   que la cargué. Las claves se ordenan para que dos volcados iguales
   den siempre la misma cadena. */
function huella(seccion){
  if (!seccion) return '';
  return Object.keys(seccion).sort().map(function(k){
    return k + '=' + seccion[k];
  }).join(' ');
}

// ── Candados por app ──────────────────────────────────────────────
/* La contrasena no se guarda en ningun sitio: de ella se deriva una
   huella con PBKDF2 y sal propia, y eso es lo que viaja al repositorio
   privado, en una seccion aparte que las apps no tocan. */
var ITERACIONES = 200000;

function aleatorio(n){
  var b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
function aHex(bytes){
  return Array.prototype.map.call(new Uint8Array(bytes), function(b){
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}
function deHex(hex){
  var b = new Uint8Array(hex.length / 2);
  for (var i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i*2, 2), 16);
  return b;
}

function derivar(texto, sal, iteraciones){
  return crypto.subtle.importKey('raw', new TextEncoder().encode(texto),
                                 {name:'PBKDF2'}, false, ['deriveBits'])
    .then(function(clave){
      return crypto.subtle.deriveBits(
        {name:'PBKDF2', salt: sal, iterations: iteraciones, hash:'SHA-256'},
        clave, 256);
    })
    .then(aHex);
}

function candadoDe(datos, seccion){
  var seg = (datos && datos.seguridad) || {};
  return seg[seccion] || null;
}

function desbloqueadaEnEstaSesion(seccion){
  try { return sessionStorage.getItem('__abierta_' + seccion) === '1'; }
  catch(e){ return false; }
}
function marcarDesbloqueada(seccion){
  try { sessionStorage.setItem('__abierta_' + seccion, '1'); } catch(e){}
}
function olvidarDesbloqueo(seccion){
  try { sessionStorage.removeItem('__abierta_' + seccion); } catch(e){}
}

/* Sin contrasena acertada no dejamos rastro de los datos en el aparato. */
function borrarSeccionLocal(seccion){
  SECCIONES[seccion].forEach(function(clave){ _remove.call(localStorage, clave); });
}

function comprobarClave(candado, texto){
  if (!candado || !candado.sal || !candado.hash) return Promise.resolve(false);
  return derivar(texto, deHex(candado.sal), candado.iteraciones || ITERACIONES)
    .then(function(h){ return h === candado.hash; });
}

function nuevoCandado(texto){
  var sal = aleatorio(16);
  return derivar(texto, sal, ITERACIONES).then(function(hash){
    return {sal: aHex(sal), hash: hash, iteraciones: ITERACIONES,
            puesta: new Date().toISOString()};
  });
}

// ── Pantalla de contrasena ────────────────────────────────────────
var NOMBRES = {piso:'Piso Soldeu', horario:'Horario Restaurante',
               comanda:'Comanda', casa:'Casa', caja:'Caja',
               coleccion:'Colección', patrimonio:'Patrimonio'};

function pedirClave(seccion, candado){
  return new Promise(function(resolve){
    var fondo = document.createElement('div');
    fondo.setAttribute('data-sync-candado', '');
    fondo.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#101617;color:#eef2f0;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif';

    var caja = document.createElement('div');
    caja.style.cssText = 'width:100%;max-width:330px;text-align:center';
    caja.innerHTML =
      '<div style="font-size:30px;margin-bottom:14px">\uD83D\uDD12</div>' +
      '<div style="font-size:19px;font-weight:600;margin-bottom:6px"></div>' +
      '<div style="font-size:13.5px;color:#93a5a1;margin-bottom:18px">' +
      'Esta app está protegida. Escribe la contraseña para abrirla.</div>';
    caja.children[1].textContent = NOMBRES[seccion] || seccion;

    var form = document.createElement('form');
    form.style.cssText = 'display:flex;flex-direction:column;gap:10px';

    var campo = document.createElement('input');
    campo.type = 'password';
    campo.autocomplete = 'current-password';
    campo.placeholder = 'Contraseña';
    campo.style.cssText =
      'padding:11px 13px;border-radius:9px;border:1px solid #263335;background:#171f21;' +
      'color:#eef2f0;font-size:15px;font-family:inherit;text-align:center';

    var boton = document.createElement('button');
    boton.type = 'submit';
    boton.textContent = 'Entrar';
    boton.style.cssText =
      'padding:11px;border-radius:9px;border:none;background:#5fd3ac;color:#101617;' +
      'font-weight:600;font-size:15px;cursor:pointer;font-family:inherit';

    var error = document.createElement('div');
    error.style.cssText = 'font-size:13px;color:#ef8a76;min-height:18px';

    var volver = document.createElement('a');
    volver.href = 'index.html';
    volver.textContent = 'Volver al escritorio';
    volver.style.cssText = 'font-size:12.5px;color:#93a5a1;margin-top:6px';

    form.appendChild(campo); form.appendChild(boton); form.appendChild(error);
    caja.appendChild(form); caja.appendChild(volver);
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    setTimeout(function(){ campo.focus(); }, 60);

    /* Se comprueba mientras escribe: en cuanto la contrasena esta
       completa entra sola, sin tener que pulsar nada. El boton se queda
       para quien prefiera pulsarlo. */
    var comprobando = false, reloj = null, ultimoFallido = '';

    function intentar(porBoton){
      var texto = campo.value;
      if (!texto || texto.length < 4) return;
      if (comprobando) return;
      if (!porBoton && texto === ultimoFallido) return;
      comprobando = true;
      if (porBoton) { boton.disabled = true; boton.textContent = 'Comprobando…'; }
      comprobarClave(candado, texto).then(function(vale){
        comprobando = false;
        boton.disabled = false; boton.textContent = 'Entrar';
        if (vale) { fondo.remove(); resolve(true); return; }
        if (porBoton) {
          error.textContent = 'No es esa. Vuelve a intentarlo.';
          campo.value = ''; campo.focus();
          ultimoFallido = '';
        } else {
          // Al escribir no molestamos: quiza aun le falta una letra
          ultimoFallido = texto;
        }
      });
    }

    campo.addEventListener('input', function(){
      error.textContent = '';
      clearTimeout(reloj);
      reloj = setTimeout(function(){ intentar(false); }, 180);
    });

    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      clearTimeout(reloj);
      intentar(true);
    });
  });
}

// ── Aviso visual ──────────────────────────────────────────────────
function estado(texto, tipo){
  if (!elEstado) return;
  elEstado.textContent = texto;
  elEstado.dataset.tipo = tipo || '';
  if (tipo === 'ok') {
    clearTimeout(elEstado._t);
    elEstado._t = setTimeout(function(){
      elEstado.textContent = 'Guardado en GitHub';
      elEstado.dataset.tipo = 'reposo';
    }, 2500);
  }
}

// ── Diálogo propio (los de la app no están disponibles aquí) ──────
function preguntar(titulo, cuerpo, botones){
  return new Promise(function(resolve){
    var fondo = document.createElement('div');
    fondo.setAttribute('data-sync-dialogo', '');
    fondo.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:rgba(8,12,12,.62);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif';

    var caja = document.createElement('div');
    caja.style.cssText =
      'background:#fff;color:#161c1e;border-radius:14px;max-width:440px;width:100%;' +
      'padding:22px 24px;box-shadow:0 24px 60px -20px rgba(0,0,0,.55);line-height:1.5';

    var h = document.createElement('div');
    h.textContent = titulo;
    h.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px';

    var p = document.createElement('div');
    p.textContent = cuerpo;
    p.style.cssText = 'font-size:14px;color:#4a5654;margin-bottom:20px';

    var fila = document.createElement('div');
    fila.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end';

    botones.forEach(function(b){
      var btn = document.createElement('button');
      btn.textContent = b.texto;
      btn.style.cssText =
        'border-radius:8px;padding:9px 15px;font-size:14px;cursor:pointer;' +
        'font-family:inherit;font-weight:500;border:1px solid ' +
        (b.principal ? '#0c5a44;background:#0c5a44;color:#fff' : '#d3dad6;background:#fff;color:#161c1e');
      btn.addEventListener('click', function(){
        fondo.remove();
        resolve(b.valor);
      });
      fila.appendChild(btn);
    });

    caja.appendChild(h); caja.appendChild(p); caja.appendChild(fila);
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    var primero = fila.querySelector('button');
    if (primero) primero.focus();
  });
}

// ── Subida agrupada ───────────────────────────────────────────────
function programarSubida(){
  if (!seccionActiva || !conectado()) return;
  haycambios = true;
  clearTimeout(pendiente);
  estado('Sin guardar…', 'pendiente');
  pendiente = setTimeout(hacerSubida, RETARDO);
}

function hacerSubida(){
  if (subiendo || avisando) { programarSubida(); return Promise.resolve(); }
  subiendo = true;
  clearTimeout(pendiente);
  pendiente = null;
  estado('Guardando…', 'trabajando');

  var archivo = archivoDe(seccionActiva);

  return descargar(archivo)
    .then(function(remoto){
      remoto = remoto || {};

      /* Red de seguridad: si el archivo existe —hay sha— pero vuelve
         vacío, algo ha ido mal al leerlo. Subir ahora sería borrar los
         datos de las otras apps, así que no se sube y se reintenta. */
      if (!Object.keys(remoto).length && sha(archivo)) {
        subiendo = false;
        estado('No he podido leer los datos; no guardo para no borrar nada', 'error');
        programarSubida();
        return;
      }

      var suya = huella(remoto[seccionActiva]);

      // Alguien tocó esta misma app desde otro sitio mientras yo trabajaba
      if (baseRemota !== null && suya !== baseRemota) {
        subiendo = false;
        return conflicto(remoto);
      }

      var completo = Object.assign({}, remoto);
      completo[seccionActiva] = leerSeccion(seccionActiva);
      completo.actualizado = new Date().toISOString();
      return subir(completo, archivo).then(function(){
        baseRemota = huella(completo[seccionActiva]);
        haycambios = false;
        estado('Guardado', 'ok');
        /* Si esta sección se ha mudado a su archivo, se limpia del
           antiguo para que no queden dos copias. */
        if (archivo !== ARCHIVO) limpiarDelArchivoViejo(seccionActiva);
      });
    })
    .catch(function(err){
      estado('No se pudo guardar: ' + err.message, 'error');
      console.error('[sync]', err);
    })
    .then(function(){ subiendo = false; });
}

/* La sección ya vive en su archivo: se borra del datos.json de siempre.
   Se hace una vez, en silencio, y si falla no pasa nada: se reintenta
   en el siguiente guardado. */
function limpiarDelArchivoViejo(seccion){
  return descargar(ARCHIVO).then(function(viejo){
    if (!viejo || !viejo[seccion]) return false;
    delete viejo[seccion];
    viejo.actualizado = new Date().toISOString();
    return subir(viejo, ARCHIVO).then(function(){ return true; });
  }).catch(function(){ return false; });
}

// ── Conflicto entre dispositivos ──────────────────────────────────
function conflicto(remoto){
  if (avisando) return Promise.resolve();
  avisando = true;
  estado('Hay otra versión más nueva', 'error');

  return preguntar(
    'Otro dispositivo guardó antes',
    'Alguien ha guardado esta misma app desde otro sitio mientras trabajabas aquí. ' +
    'No puedo juntar las dos versiones sin riesgo: elige con cuál te quedas.',
    [
      {texto: 'Traer lo de GitHub', valor: 'traer', principal: true},
      {texto: 'Guardar lo mío encima', valor: 'pisar'}
    ]
  ).then(function(eleccion){
    avisando = false;
    if (eleccion === 'traer') {
      escribirSeccion(seccionActiva, remoto[seccionActiva]);
      haycambios = false;
      location.reload();
      return;
    }
    // Pisar: adopto su versión como base y vuelvo a subir lo mío
    baseRemota = huella(remoto[seccionActiva]);
    return hacerSubida();
  });
}

// ── Vigilancia de versiones nuevas ────────────────────────────────
function comprobarActualizaciones(){
  if (!conectado() || !seccionActiva || subiendo || avisando) return Promise.resolve(false);

  return descargar(archivoDe(seccionActiva)).then(function(remoto){
    remoto = remoto || {};
    var suya = huella(remoto[seccionActiva]);
    if (baseRemota === null || suya === baseRemota) return false;

    // Versión nueva ahí fuera. Si aquí no hay nada sin guardar, la traigo:
    // es seguro y evita seguir trabajando sobre datos viejos.
    if (!haycambios) {
      estado('Trayendo la última versión…', 'trabajando');
      escribirSeccion(seccionActiva, remoto[seccionActiva]);
      location.reload();
      return true;
    }
    return conflicto(remoto).then(function(){ return true; });
  }).catch(function(){ return false; });
}

function vigilar(){
  clearInterval(vigilante);
  vigilante = setInterval(comprobarActualizaciones, VIGILANCIA);
  // Al volver a la pestaña, comprobar en el acto
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) comprobarActualizaciones();
  });
  window.addEventListener('focus', comprobarActualizaciones);
}

// ── Intercepción de localStorage ──────────────────────────────────
function interceptar(){
  var claves = SECCIONES[seccionActiva];
  Storage.prototype.setItem = function(clave, valor){
    _set.call(this, clave, valor);
    if (this === window.localStorage && claves.indexOf(clave) >= 0) programarSubida();
  };
  Storage.prototype.removeItem = function(clave){
    _remove.call(this, clave);
    if (this === window.localStorage && claves.indexOf(clave) >= 0) programarSubida();
  };
}

// ══════════════════════════════════════════════════════════════════
// API pública
// ══════════════════════════════════════════════════════════════════
window.Sync = {
  conectado: conectado,
  repo: repo,
  rama: rama,
  guardarCredenciales: guardarCredenciales,
  olvidarCredenciales: olvidarCredenciales,

  /** ¿Queda algo escrito que todavía no está en GitHub? */
  hayCambiosSinGuardar: function(){ return haycambios; },

  /** Comprueba y pinta el estado. */
  probar: function(){
    return api('').then(function(res){
      if (!res.ok) throw errorDe(res);
      return res.json().then(function(info){
        if (info.permissions && info.permissions.push === false) {
          throw new Error('El token llega al repositorio pero no puede escribir. Revisa que tenga Contents: Read and write.');
        }
        return info;
      });
    });
  },

  /**
   * Arranca una app: descarga los datos, los deja en localStorage,
   * activa el guardado automático y la vigilancia de versiones.
   */
  iniciar: function(seccion){
    if (!SECCIONES[seccion]) return Promise.reject(new Error('Sección desconocida: ' + seccion));
    seccionActiva = seccion;
    if (!conectado()) return Promise.reject(new Error('sin-credenciales'));

    return descargarPara(seccion).then(function(datos){
      datos = datos || {};
      var candado = candadoDe(datos, seccion);

      function arrancar(){
        escribirSeccion(seccion, datos[seccion]);
        baseRemota = huella(datos[seccion]);
        haycambios = false;
        interceptar();
        vigilar();
        return datos;
      }

      if (!candado || desbloqueadaEnEstaSesion(seccion)) return arrancar();

      // Bloqueada: ni un dato en el aparato hasta que acierte
      borrarSeccionLocal(seccion);
      return pedirClave(seccion, candado).then(function(){
        marcarDesbloqueada(seccion);
        return arrancar();
      });
    });
  },

  /** Todo lo que necesita una app: su sección y los candados. */
  tieneCandado: function(datos, seccion){ return !!candadoDe(datos, seccion); },

  /** Pone o cambia la contraseña de una app. */
  ponerClave: function(seccion, texto){
    if (!SECCIONES[seccion]) return Promise.reject(new Error('Sección desconocida'));
    if (!texto || texto.length < 4) return Promise.reject(new Error('Usa al menos 4 caracteres'));
    return nuevoCandado(texto).then(function(candado){
      return descargar().then(function(datos){
        datos = datos || {};
        datos.seguridad = datos.seguridad || {};
        datos.seguridad[seccion] = candado;
        datos.actualizado = new Date().toISOString();
        return subir(datos).then(function(){
          olvidarDesbloqueo(seccion);
          return true;
        });
      });
    });
  },

  /** Quita la contraseña, comprobando antes la actual. */
  quitarClave: function(seccion, texto){
    return descargar().then(function(datos){
      datos = datos || {};
      var candado = candadoDe(datos, seccion);
      if (!candado) return true;
      return comprobarClave(candado, texto).then(function(vale){
        if (!vale) throw new Error('La contraseña no es correcta');
        delete datos.seguridad[seccion];
        datos.actualizado = new Date().toISOString();
        return subir(datos).then(function(){
          olvidarDesbloqueo(seccion);
          return true;
        });
      });
    });
  },

  /** Cierra los desbloqueos de esta sesión. */
  cerrarCandados: function(){
    Object.keys(SECCIONES).forEach(olvidarDesbloqueo);
  },

  /** Elemento donde mostrar el estado. Al pulsarlo, guarda ya. */
  mostrarEstadoEn: function(el){
    elEstado = el;
    if (!elEstado) return;
    if (conectado()) {
      elEstado.textContent = haycambios ? 'Sin guardar…' : 'Guardado en GitHub';
      elEstado.dataset.tipo = haycambios ? 'pendiente' : 'reposo';
    }
    if (!elEstado._clic) {
      elEstado._clic = true;
      elEstado.style.cursor = 'pointer';
      elEstado.title = 'Guardar ahora';
      elEstado.addEventListener('click', function(){ if (haycambios) hacerSubida(); });
    }
  },

  /** Fuerza una subida inmediata. */
  guardarYa: function(){ return hacerSubida(); },

  /** Mira si hay una versión más nueva en GitHub. */
  comprobarActualizaciones: comprobarActualizaciones,

  /** Descarga el archivo completo, sin tocar localStorage. */
  descargarTodo: descargarEntero,

  /**
   * Ajustes del escritorio, que no son de ninguna app: por ejemplo en
   * qué orden van las tarjetas. Van en su propia sección para que el
   * orden que pongas en el móvil lo tengas también en el ordenador.
   * Se funde con lo que ya hubiera; no pisa la sección entera.
   */
  guardarEscritorio: function(cambios){
    return descargar().then(function(datos){
      datos = datos || {};
      var antes = datos.escritorio || {};
      var ahora = {};
      Object.keys(antes).forEach(function(k){ ahora[k] = antes[k]; });
      Object.keys(cambios || {}).forEach(function(k){ ahora[k] = cambios[k]; });
      datos.escritorio = ahora;
      datos.actualizado = new Date().toISOString();
      return subir(datos).then(function(){ return true; });
    });
  }
};

/* ── ¿Hay una version mas nueva de la propia app? ─────────────────
   GitHub Pages manda el HTML con cache-control de diez minutos, y un
   movil con la pagina en la pantalla de inicio se la puede quedar
   bastante mas. Resultado: subo un arreglo, le digo que ya esta, y el
   abre la app y sigue viendo la de ayer. Ha pasado varias veces.

   Asi que la pagina lo comprueba sola. Cada HTML carga este archivo con
   un ?v=... que subo en cada publicacion; en el repositorio hay un
   version.txt con ese mismo numero, y se pide sin cache. Si el numero de
   ahi es mas nuevo que el que trae la pagina cargada, es que el
   navegador esta sirviendo una copia vieja, y se dice.

   No se recarga solo: recargar por su cuenta a alguien que esta
   escribiendo es peor que el problema. Se ofrece y el decide. */
function miVersion(){
  try {
    var yo = document.currentScript || (function(){
      var t = document.getElementsByTagName('script');
      for (var i = t.length - 1; i >= 0; i--) {
        if ((t[i].src || '').indexOf('sync.js') >= 0) return t[i];
      }
      return null;
    })();
    var m = /[?&]v=([0-9]+)/.exec((yo && yo.src) || '');
    return m ? m[1] : null;
  } catch (e) { return null; }
}
var MI_VERSION = miVersion();

function avisarVersionNueva(nueva){
  if (document.getElementById('avisoVersion')) return;
  var d = document.createElement('div');
  d.id = 'avisoVersion';
  d.setAttribute('style',
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;' +
    'background:#0f1618;color:#fbfcfb;border-radius:12px;padding:12px 16px;' +
    'box-shadow:0 12px 34px -12px rgba(0,0,0,.6);display:flex;gap:12px;' +
    'align-items:center;justify-content:space-between;flex-wrap:wrap;' +
    'font:500 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto');
  d.innerHTML =
    '<span>Hay una versión más nueva. La que estás viendo es de antes.</span>' +
    '<span style="display:flex;gap:8px">' +
      '<button type="button" data-luego style="background:transparent;border:1px solid #4a5654;' +
        'color:#c3cecb;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit">Luego</button>' +
      '<button type="button" data-ahora style="background:#fbfcfb;border:0;color:#0f1618;' +
        'border-radius:8px;padding:7px 14px;cursor:pointer;font:inherit;font-weight:600">Actualizar</button>' +
    '</span>';
  document.body.appendChild(d);
  d.querySelector('[data-luego]').addEventListener('click', function(){ d.remove(); });
  d.querySelector('[data-ahora]').addEventListener('click', function(){
    /* Con un parametro nuevo en la direccion, el navegador no puede
       darnos la copia guardada: para el es otra pagina. */
    var u = location.href.split('#')[0].replace(/[?&]nueva=\d+/, '');
    location.href = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'nueva=' + nueva;
  });
}

function comprobarVersionApp(){
  if (!MI_VERSION) return;
  var base = (location.pathname.replace(/[^/]*$/, '')) + 'version.txt';
  fetch(base + '?t=' + Date.now(), {cache: 'no-store'})
    .then(function(r){ return r.ok ? r.text() : null; })
    .then(function(t){
      if (!t) return;
      var nueva = t.trim();
      if (/^[0-9]+$/.test(nueva) && nueva > MI_VERSION) avisarVersionNueva(nueva);
    })
    .catch(function(){});
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', comprobarVersionApp);
} else {
  comprobarVersionApp();
}

// ── Al salir: avisar si queda algo sin subir ──────────────────────
window.addEventListener('beforeunload', function(e){
  if (!haycambios || !conectado()) return;
  hacerSubida();               // se intenta, aunque puede no dar tiempo
  e.preventDefault();
  e.returnValue = '';          // el navegador muestra su propio aviso
  return '';
});

})();
