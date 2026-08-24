/* ══════════════════════════════════════════════════════════════════
   SYNC — guarda los datos de las apps en un repositorio privado
   ══════════════════════════════════════════════════════════════════
   Las apps siguen usando localStorage como siempre. Este módulo:

     1. Al abrir una app, descarga datos.json del repo privado y lo
        vuelca en localStorage ANTES de que la app arranque.
     2. Intercepta localStorage para detectar cambios y subirlos
        solos, agrupados, un par de segundos después del último.

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
var RETARDO    = 2500;   // ms de espera tras el último cambio
var REINTENTOS = 3;      // ante conflicto con otro dispositivo

// Qué claves de localStorage pertenece a cada app
var SECCIONES = {
  piso:    ['piso_cfg','piso_meses','piso_gastos','piso_inq','piso_data_version'],
  horario: ['rsch','rcam','rhid','rtheme']
};

var seccionActiva = null;
var pendiente     = null;
var subiendo      = false;
var elEstado      = null;

// ── Credenciales ──────────────────────────────────────────────────
function token() { return _get.call(localStorage, TOKEN_KEY); }
function repo()  { return _get.call(localStorage, REPO_KEY); }
function rama()  { return _get.call(localStorage, BRANCH_KEY) || 'main'; }
function sha()   { return _get.call(localStorage, SHA_KEY); }
function guardarSha(s){ _set.call(localStorage, SHA_KEY, s || ''); }

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

// Descarga datos.json. Devuelve {} si el repositorio aún está vacío.
function descargar(){
  return api('contents/' + ARCHIVO + '?ref=' + encodeURIComponent(rama()) + '&_=' + Date.now(),
             {cache: 'no-store'})
    .then(function(res){
      if (res.status === 404) { guardarSha(''); return {}; }
      if (!res.ok) throw errorDe(res);
      return res.json().then(function(data){
        guardarSha(data.sha || '');
        if (!data.content) return {};
        try { return JSON.parse(deBase64(data.content)); }
        catch(e){ throw new Error('El archivo de datos está corrupto: ' + e.message); }
      });
    });
}

function subir(contenido, intento){
  intento = intento || 0;
  var cuerpo = {
    message: 'datos: ' + new Date().toISOString(),
    content: aBase64(JSON.stringify(contenido, null, 2)),
    branch:  rama()
  };
  if (sha()) cuerpo.sha = sha();

  return api('contents/' + ARCHIVO, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(cuerpo)
  }).then(function(res){
    // Otro dispositivo escribió primero: recojo lo suyo y reintento
    if ((res.status === 409 || res.status === 422) && intento < REINTENTOS){
      return descargar().then(function(remoto){
        var fusion = Object.assign({}, remoto);
        Object.keys(contenido).forEach(function(k){ fusion[k] = contenido[k]; });
        return subir(fusion, intento + 1);
      });
    }
    if (!res.ok) throw errorDe(res);
    return res.json().then(function(data){
      if (data && data.content && data.content.sha) guardarSha(data.content.sha);
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

// ── Subida agrupada ───────────────────────────────────────────────
function programarSubida(){
  if (!seccionActiva || !conectado()) return;
  clearTimeout(pendiente);
  estado('Cambios sin guardar…', 'pendiente');
  pendiente = setTimeout(hacerSubida, RETARDO);
}

function hacerSubida(){
  if (subiendo) { programarSubida(); return; }
  subiendo = true;
  estado('Guardando…', 'trabajando');

  descargar()
    .then(function(remoto){
      var completo = Object.assign({}, remoto);
      completo[seccionActiva] = leerSeccion(seccionActiva);
      completo.actualizado = new Date().toISOString();
      return subir(completo);
    })
    .then(function(){ estado('Guardado', 'ok'); })
    .catch(function(err){
      estado('No se pudo guardar: ' + err.message, 'error');
      console.error('[sync]', err);
    })
    .then(function(){ subiendo = false; });
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

  /** Comprueba que el repositorio existe y el token puede escribir. */
  probar: function(){
    return api('').then(function(res){
      if (!res.ok) throw errorDe(res);
      return res.json().then(function(info){
        // Algunos tokens no devuelven el bloque de permisos; solo damos
        // el aviso cuando GitHub dice explícitamente que no hay escritura.
        if (info.permissions && info.permissions.push === false) {
          throw new Error('El token llega al repositorio pero no puede escribir. Revisa que tenga Contents: Read and write.');
        }
        return info;
      });
    });
  },

  /**
   * Arranca una app: descarga los datos, los deja en localStorage y
   * activa el guardado automático. Devuelve una promesa.
   */
  iniciar: function(seccion){
    if (!SECCIONES[seccion]) return Promise.reject(new Error('Sección desconocida: ' + seccion));
    seccionActiva = seccion;
    if (!conectado()) return Promise.reject(new Error('sin-credenciales'));
    return descargar().then(function(datos){
      escribirSeccion(seccion, datos[seccion]);
      interceptar();
      return datos;
    });
  },

  /** Elemento donde mostrar el estado del guardado. */
  mostrarEstadoEn: function(el){
    elEstado = el;
    if (elEstado && conectado()) {
      elEstado.textContent = 'Guardado en GitHub';
      elEstado.dataset.tipo = 'reposo';
    }
  },

  /** Fuerza una subida inmediata (por ejemplo antes de cerrar). */
  guardarYa: function(){
    clearTimeout(pendiente);
    hacerSubida();
  },

  /** Descarga el archivo completo, sin tocar localStorage. */
  descargarTodo: descargar
};

// Si quedan cambios sin subir al cerrar la pestaña, avisa
window.addEventListener('beforeunload', function(e){
  if (pendiente && conectado()) {
    clearTimeout(pendiente);
    hacerSubida();
    e.preventDefault();
    e.returnValue = '';
  }
});

})();
