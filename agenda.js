/* ══════════════════════════════════════════════════════════════════
   AGENDA — teléfonos, claves y correos
   ══════════════════════════════════════════════════════════════════
   Una libreta, no un programa: se apunta, se busca y se copia. Tres
   clases de apunte —teléfono, clave y correo— y dos sitios donde pasan
   las cosas: el trabajo y la casa.

   Las claves no se guardan como están escritas. Se cifran con una
   contraseña maestra que sólo sabes tú: en el repositorio queda un
   churro de letras que no sirve de nada sin ella. Los teléfonos y los
   correos van en claro, que no son secreto.

   Si no quieres contraseña maestra, se puede: se avisa de lo que
   supone y las claves se guardan tal cual.
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var CLAVE = 'agenda.libro.v1';
var VACIO = {apuntes:[], ajustes:{cifrar:null}};

var TIPOS = {
  telefono: {nombre:'Teléfono', plural:'Teléfonos', icono:'📞'},
  clave:    {nombre:'Contraseña', plural:'Contraseñas', icono:'🔑'},
  correo:   {nombre:'Correo',   plural:'Correos',   icono:'✉️'}
};
var ORDEN_TIPOS = ['telefono','clave','correo'];
var AMBITOS = {trabajo:{nombre:'Trabajo', icono:'🍽️'}, casa:{nombre:'Casa', icono:'🏠'}};

var libro = null;
var ui = { tipo:'todos', ambito:'todos', busca:'', verClave:{} };
var maestra = null;          /* la contraseña maestra, sólo en memoria */

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function esc(t){
  return String(t==null?'':t).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function plural(n, uno, varios){ return n+' '+(n===1?uno:varios); }
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():''; }

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
  var d=document.createElement('dialog');
  d.style.cssText='border:1px solid var(--linea);border-radius:12px;background:var(--sup);'+
    'color:var(--tinta);padding:0;max-width:min(520px,94vw);width:100%;box-shadow:var(--sombra)';
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

function copiar(texto, queEs){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(function(){ avisar((queEs||'Copiado')+' copiado'); })
      .catch(function(){ avisar('No se pudo copiar.', true); });
  } else avisar('Este navegador no deja copiar.', true);
}

/* ══════════════════════════════════════════════════════════════
   GUARDAR Y CARGAR
   ══════════════════════════════════════════════════════════════ */
function cargar(){
  try{
    var crudo = localStorage.getItem(CLAVE);
    libro = crudo ? JSON.parse(crudo) : JSON.parse(JSON.stringify(VACIO));
  }catch(e){ libro = JSON.parse(JSON.stringify(VACIO)); }
  if(!libro.apuntes) libro.apuntes = [];
  if(!libro.ajustes) libro.ajustes = {};
  if(libro.ajustes.cifrar === undefined) libro.ajustes.cifrar = null;
}
function guardar(){ localStorage.setItem(CLAVE, JSON.stringify(libro)); }
function apuntes(){ return libro.apuntes || []; }
function apunteDe(id){
  for(var i=0;i<libro.apuntes.length;i++) if(libro.apuntes[i].id===id) return libro.apuntes[i];
  return null;
}

/* ══════════════════════════════════════════════════════════════
   EL CIFRADO DE LAS CLAVES
   ══════════════════════════════════════════════════════════════
   Contraseña maestra → PBKDF2 → llave AES. De cada clave se guarda el
   churro cifrado y su sal; sin la contraseña no hay manera de leerlo.
   Si se pierde la contraseña, se pierden las claves: no hay puerta de
   atrás, y eso es precisamente lo que la hace segura. */
function aHex(buf){
  return Array.prototype.map.call(new Uint8Array(buf), function(b){
    return ('0'+b.toString(16)).slice(-2); }).join('');
}
function deHex(hex){
  var b = new Uint8Array(hex.length/2);
  for(var i=0;i<b.length;i++) b[i] = parseInt(hex.substr(i*2,2),16);
  return b;
}
function llaveDe(texto, sal){
  var enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(texto), 'PBKDF2', false, ['deriveKey'])
    .then(function(base){
      return crypto.subtle.deriveKey(
        {name:'PBKDF2', salt:sal, iterations:200000, hash:'SHA-256'},
        base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    });
}
function cifrar(texto, contrasena){
  var sal = crypto.getRandomValues(new Uint8Array(16));
  var iv  = crypto.getRandomValues(new Uint8Array(12));
  return llaveDe(contrasena, sal).then(function(llave){
    return crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, llave, new TextEncoder().encode(texto));
  }).then(function(cifrado){
    return {sal:aHex(sal), iv:aHex(iv), dato:aHex(cifrado)};
  });
}
function descifrar(paquete, contrasena){
  return llaveDe(contrasena, deHex(paquete.sal)).then(function(llave){
    return crypto.subtle.decrypt({name:'AES-GCM', iv:deHex(paquete.iv)}, llave, deHex(paquete.dato));
  }).then(function(plano){
    return new TextDecoder().decode(plano);
  });
}

/* Pide la maestra una vez por sesión y comprueba que es la buena
   descifrando cualquier clave que ya haya. */
function conMaestra(sigue){
  if(maestra != null) { sigue(maestra); return; }
  var conCifrado = apuntes().filter(function(a){ return a.tipo==='clave' && a.cifrada; })[0];

  abrirVentana('Contraseña maestra',
    '<div class="campo"><label class="lbl" for="cm_txt">Escríbela</label>'+
    '<input type="password" id="cm_txt" autocomplete="current-password"></div>'+
    '<p class="nota" style="margin:10px 0 0">Es la que abre tus contraseñas. No se guarda en ningún '+
    'sitio: se pide una vez cada vez que abres la agenda.</p>',
    function(){
      var txt = valor('cm_txt');
      if(!txt){ avisar('Escribe la contraseña.', true); return true; }
      if(!conCifrado){ maestra = txt; sigue(maestra); return; }
      descifrar(conCifrado.cifrada, txt).then(function(){
        maestra = txt; sigue(maestra);
      }).catch(function(){
        avisar('Esa no es la contraseña.', true);
      });
    }, {aceptar:'Abrir'});
}

/* El valor que se enseña: los teléfonos y correos tal cual; las claves,
   sólo si él lo pide y con la maestra puesta. */
function valorVisible(a, listo){
  if(a.tipo!=='clave'){ listo(a.valor||''); return; }
  if(!a.cifrada){ listo(a.valor||''); return; }
  conMaestra(function(clave){
    descifrar(a.cifrada, clave).then(listo).catch(function(){
      avisar('No he podido abrir esa clave.', true); listo('');
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   PINTAR
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root = document.getElementById('root');
  var cuenta = function(t){ return apuntes().filter(function(a){ return a.tipo===t; }).length; };
  root.innerHTML =
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Agenda</span>'+
        '<span class="sub">Teléfonos y contraseñas</span></div>'+
      boton('todos','Todo', apuntes().length)+
      boton('telefono','Teléfonos', cuenta('telefono'))+
      boton('clave','Contraseñas', cuenta('clave'))+
      boton('correo','Correos', cuenta('correo'))+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)">Guardado en GitHub</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll('[data-vista]').forEach(function(b){
    b.addEventListener('click', function(){ ui.tipo = b.dataset.vista; verLista(); });
  });
  verLista();
}

function boton(tipo, texto, cuenta){
  return '<button class="nav" data-vista="'+tipo+'"'+
         (ui.tipo===tipo?' aria-current="true"':'')+'>'+
         '<span>'+esc(texto)+'</span>'+
         '<span class="cuenta">'+cuenta+'</span></button>';
}

function filtrados(){
  var t = ui.busca.trim().toLowerCase();
  return apuntes().filter(function(a){
    if(ui.tipo!=='todos' && a.tipo!==ui.tipo) return false;
    if(ui.ambito!=='todos' && a.ambito!==ui.ambito) return false;
    if(!t) return true;
    return ((a.nombre||'')+' '+(a.usuario||'')+' '+(a.sitio||'')+' '+(a.notas||'')+' '+
            (a.tipo!=='clave'?(a.valor||''):'')).toLowerCase().indexOf(t)>=0;
  }).sort(function(a,b){
    return (a.nombre||'').localeCompare(b.nombre||'','es');
  });
}

function verLista(){
  var main = document.getElementById('main');
  var lista = filtrados();
  var titulo = ui.tipo==='todos' ? 'Todo' : TIPOS[ui.tipo].plural;

  main.innerHTML =
    '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
      '<p>Teléfonos, contraseñas y correos, del trabajo y de casa. '+
      (ui.tipo==='clave'
        ? 'Aquí van las contraseñas de Facebook, del correo, del banco, del wifi… '+
          'Se guardan cifradas y se copian de un toque para pegarlas donde haga falta.'
        : 'Se apunta, se busca y se copia.')+'</p></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button class="btn fuerte" id="a_nuevo">+ Apuntar</button>'+
        '<button class="btn" id="a_pegar">📋 Pegar una lista</button>'+
        '<button class="btn" id="a_imprimir">🖨 Imprimir</button>'+
        '<button class="btn" id="a_ajustes">Ajustes</button>'+
      '</div></div>'+

    '<div class="filtros">'+
      '<input class="buscador" id="a_busca" placeholder="Buscar por nombre, usuario o sitio…" '+
        'value="'+esc(ui.busca)+'">'+
      '<div class="grupo">'+
        ['todos','trabajo','casa'].map(function(k){
          var etiqueta = k==='todos' ? 'Los dos' : AMBITOS[k].icono+' '+AMBITOS[k].nombre;
          return '<button data-ambito="'+k+'" aria-pressed="'+(ui.ambito===k)+'">'+
                 esc(etiqueta)+'</button>';
        }).join('')+
      '</div>'+
    '</div>'+

    (lista.length
      ? (ui.tipo==='todos'
          ? ORDEN_TIPOS.map(function(t){
              var suyos = lista.filter(function(a){ return a.tipo===t; });
              if(!suyos.length) return '';
              return '<div class="grupoTipo">'+TIPOS[t].icono+' '+esc(TIPOS[t].plural)+
                     '<span>'+suyos.length+'</span></div>'+
                     '<div class="fichas" style="margin-bottom:22px">'+
                     suyos.map(ficha).join('')+'</div>';
            }).join('')
          : '<div class="fichas">'+lista.map(ficha).join('')+'</div>')
      : '<div class="vacio"><strong>'+
        (apuntes().length ? 'Nada con esa búsqueda' : 'La agenda está vacía')+'</strong>'+
        (apuntes().length ? 'Prueba con otra palabra.'
                          : 'Dale a «+ Apuntar» —o a «Pegar una lista» si ya las tienes escritas— '+
                            'y empieza por lo que más uses: el teléfono del proveedor, la contraseña '+
                            'del correo, el wifi…')+
        '</div>');

  var busca = document.getElementById('a_busca');
  busca.addEventListener('input', function(){
    ui.busca = busca.value;
    clearTimeout(window.__espera);
    window.__espera = setTimeout(function(){
      verLista();
      var v = document.getElementById('a_busca');
      if(v){ v.focus(); v.selectionStart = v.value.length; }
    }, 180);
  });
  main.querySelectorAll('[data-ambito]').forEach(function(b){
    b.addEventListener('click', function(){ ui.ambito = b.dataset.ambito; verLista(); });
  });
  document.getElementById('a_nuevo').addEventListener('click', function(){ editar(null); });
  document.getElementById('a_pegar').addEventListener('click', pegarLista);
  document.getElementById('a_imprimir').addEventListener('click', imprimir);
  document.getElementById('a_ajustes').addEventListener('click', verAjustes);
  engancharFichas();
}

function ficha(a){
  var info = TIPOS[a.tipo] || TIPOS.telefono;
  var amb  = AMBITOS[a.ambito] || AMBITOS.trabajo;
  var vista;
  if(a.tipo==='clave'){
    vista = ui.verClave[a.id]
      ? '<span id="v_'+esc(a.id)+'">'+esc(ui.verClave[a.id])+'</span>'
      : '<span class="oculto">••••••••</span>';
  } else if(a.tipo==='telefono'){
    vista = '<a href="tel:'+esc(String(a.valor||'').replace(/\s/g,''))+'">'+esc(a.valor||'')+'</a>';
  } else {
    vista = '<a href="mailto:'+esc(a.valor||'')+'">'+esc(a.valor||'')+'</a>';
  }

  return '<div class="apunte">'+
    '<div style="display:flex;align-items:center;gap:7px;justify-content:space-between">'+
      '<span class="nom">'+esc(a.nombre||'sin nombre')+'</span>'+
      '<span class="chapa neutra">'+amb.icono+' '+esc(amb.nombre)+'</span></div>'+
    '<div class="val">'+vista+'</div>'+
    (a.usuario?'<div class="meta">usuario: <span class="mono">'+esc(a.usuario)+'</span></div>':'')+
    (a.sitio?'<div class="meta">'+esc(a.sitio)+'</div>':'')+
    (a.notas?'<div class="meta">'+esc(a.notas)+'</div>':'')+
    '<div class="pie">'+
      (a.tipo==='clave'
        ? '<button class="btn sm" data-ver="'+esc(a.id)+'">'+
          (ui.verClave[a.id]?'Ocultar':'Ver')+'</button>'
        : '')+
      '<button class="btn sm" data-copiar="'+esc(a.id)+'">Copiar</button>'+
      (a.usuario?'<button class="btn sm" data-copiaruser="'+esc(a.id)+'">Copiar usuario</button>':'')+
      '<button class="btn suave sm" data-editar="'+esc(a.id)+'">Editar</button>'+
      '<button class="btn suave sm malo" data-borrar="'+esc(a.id)+'">Borrar</button>'+
    '</div></div>';
}

function engancharFichas(){
  var main = document.getElementById('main');
  main.querySelectorAll('[data-ver]').forEach(function(b){
    b.addEventListener('click', function(){
      var a = apunteDe(b.dataset.ver); if(!a) return;
      if(ui.verClave[a.id]){ delete ui.verClave[a.id]; verLista(); return; }
      valorVisible(a, function(texto){
        ui.verClave[a.id] = texto;
        verLista();
        /* Se vuelve a tapar sola: una clave a la vista en la barra es
           una clave que acaba viendo quien pasa por al lado. */
        setTimeout(function(){
          if(ui.verClave[a.id]){ delete ui.verClave[a.id]; verLista(); }
        }, 20000);
      });
    });
  });
  main.querySelectorAll('[data-copiar]').forEach(function(b){
    b.addEventListener('click', function(){
      var a = apunteDe(b.dataset.copiar); if(!a) return;
      valorVisible(a, function(texto){
        if(texto) copiar(texto, TIPOS[a.tipo].nombre);
      });
    });
  });
  main.querySelectorAll('[data-copiaruser]').forEach(function(b){
    b.addEventListener('click', function(){
      var a = apunteDe(b.dataset.copiaruser); if(!a) return;
      copiar(a.usuario||'', 'Usuario');
    });
  });
  main.querySelectorAll('[data-editar]').forEach(function(b){
    b.addEventListener('click', function(){ editar(b.dataset.editar); });
  });
  main.querySelectorAll('[data-borrar]').forEach(function(b){
    b.addEventListener('click', function(){
      var a = apunteDe(b.dataset.borrar); if(!a) return;
      confirmar('Borrar '+(a.nombre||'este apunte'),
        '<p style="margin:0">Se va de la agenda y no hay vuelta atrás.</p>',
        function(){
          libro.apuntes = apuntes().filter(function(x){ return x.id!==a.id; });
          guardar(); pintar(); avisar('Borrado');
        }, {aceptar:'Borrar', malo:true});
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   APUNTAR Y EDITAR
   ══════════════════════════════════════════════════════════════ */
function editar(id){
  var nuevo = !id;
  var a = id ? apunteDe(id) : {id:uid(), tipo:'telefono', ambito:'trabajo', nombre:'',
                               valor:'', usuario:'', sitio:'', notas:''};
  if(!a) return;

  function pintarValor(tipo){
    var campo = document.getElementById('e_valor');
    var etiqueta = document.getElementById('e_valorLbl');
    if(!campo) return;
    campo.type = tipo==='clave' ? 'password' : (tipo==='correo' ? 'email' : 'tel');
    campo.placeholder = tipo==='clave' ? 'la contraseña'
                      : tipo==='correo' ? 'alguien@sitio.com' : '+376 000 000';
    etiqueta.textContent = tipo==='clave' ? 'Contraseña' : TIPOS[tipo].nombre;
    document.getElementById('e_usuarioCampo').style.display = tipo==='telefono' ? 'none' : '';
  }

  abrirVentana(nuevo?'Apuntar':'Editar '+(a.nombre||''),
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo"><label class="lbl" for="e_tipo">Qué es</label>'+
        '<select id="e_tipo">'+ORDEN_TIPOS.map(function(t){
          return '<option value="'+t+'"'+(a.tipo===t?' selected':'')+'>'+
                 TIPOS[t].icono+' '+TIPOS[t].nombre+'</option>'; }).join('')+'</select></div>'+
      '<div class="campo"><label class="lbl" for="e_ambito">De dónde</label>'+
        '<select id="e_ambito">'+Object.keys(AMBITOS).map(function(k){
          return '<option value="'+k+'"'+(a.ambito===k?' selected':'')+'>'+
                 AMBITOS[k].icono+' '+AMBITOS[k].nombre+'</option>'; }).join('')+'</select></div>'+
    '</div>'+
    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_nombre">Cómo se llama</label>'+
      '<input id="e_nombre" value="'+esc(a.nombre||'')+'" placeholder="Pescadería, la luz, el banco…" '+
      'autocomplete="off">'+
      /* Los de siempre, de un toque: es lo que más se apunta */
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">'+
        ['Facebook','Instagram','WhatsApp','Correo','Banco','Wifi de casa','Wifi del local',
         'Datáfono','Luz','Agua','Internet','Móvil','Hacienda','CASS','Seguro']
        .map(function(x){
          return '<button type="button" class="btn suave sm" data-sitio="'+esc(x)+'" '+
                 'style="padding:2px 8px">'+esc(x)+'</button>'; }).join('')+
      '</div></div>'+
    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_valor" id="e_valorLbl">Teléfono</label>'+
      '<input id="e_valor" value="'+esc(a.tipo==='clave'?'':(a.valor||''))+'" autocomplete="off">'+
      (a.tipo==='clave' && a.cifrada
        ? '<span class="nota" style="margin:5px 0 0">Ya tiene una guardada. Déjalo en blanco '+
          'para no cambiarla.</span>' : '')+'</div>'+
    '<div class="campo" style="margin-bottom:12px" id="e_usuarioCampo">'+
      '<label class="lbl" for="e_usuario">Usuario</label>'+
      '<input id="e_usuario" value="'+esc(a.usuario||'')+'" placeholder="el nombre con el que entras" '+
      'autocomplete="off"></div>'+
    '<div class="campo" style="margin-bottom:12px"><label class="lbl" for="e_sitio">Dónde se usa</label>'+
      '<input id="e_sitio" value="'+esc(a.sitio||'')+'" placeholder="andorratelecom.ad, el datáfono…" '+
      'autocomplete="off"></div>'+
    '<div class="campo"><label class="lbl" for="e_notas">Notas</label>'+
      '<textarea id="e_notas" rows="2">'+esc(a.notas||'')+'</textarea></div>',

    function(){
      var nombre = valor('e_nombre');
      if(!nombre){ avisar('Ponle nombre.', true); return true; }
      var tipo = valor('e_tipo') || 'telefono';
      var v = document.getElementById('e_valor').value.trim();
      if(!v && !(tipo==='clave' && a.cifrada)){ avisar('Falta el dato.', true); return true; }

      a.tipo = tipo;
      a.ambito = valor('e_ambito') || 'trabajo';
      a.nombre = nombre;
      a.usuario = valor('e_usuario');
      a.sitio = valor('e_sitio');
      a.notas = (document.getElementById('e_notas').value||'').trim();

      function terminar(){
        if(nuevo) libro.apuntes.push(a);
        guardar(); pintar();
        avisar(nuevo?'Apuntado':'Guardado');
      }

      if(tipo!=='clave'){ a.valor = v; delete a.cifrada; terminar(); return; }
      if(!v){ terminar(); return; }           /* clave sin tocar */

      if(libro.ajustes.cifrar === false){     /* él ha dicho que sin contraseña */
        a.valor = v; delete a.cifrada; terminar(); return;
      }
      conMaestra(function(clave){
        cifrar(v, clave).then(function(paquete){
          a.cifrada = paquete; delete a.valor; terminar();
        }).catch(function(){ avisar('No se pudo cifrar.', true); });
      });
    }, {aceptar:nuevo?'Apuntar':'Guardar'});

  document.getElementById('e_tipo').addEventListener('change', function(){ pintarValor(this.value); });
  document.querySelectorAll('[data-sitio]').forEach(function(b){
    b.addEventListener('click', function(){
      var campo = document.getElementById('e_nombre');
      campo.value = b.dataset.sitio;
      campo.focus();
    });
  });
  pintarValor(a.tipo);
}


/* ══════════════════════════════════════════════════════════════
   PEGAR UNA LISTA
   ══════════════════════════════════════════════════════════════
   Los teléfonos y las claves ya están escritos en algún sitio: en las
   notas del móvil, en un papel pasado a limpio, en un correo. Aquí se
   pegan de golpe y la app reparte cada línea en su sitio, enseñándolo
   antes por si algo hay que cambiar. */

var RE_CORREO = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
var RE_TELEFONO = /(\+?\d[\d\s().-]{5,}\d)/;
var PALABRA_CLAVE = /(clave|contrase|password|pass\b|pin\b|usuario\b|user\b)/i;

/* Una línea suelta: «Pescadería Ordino: 812 345» o «luz 376800800» o
   «Creand / vff.ad / miClave». Se parte por dos puntos, tabulador,
   barra o punto y coma, y si no hay separador se busca el dato dentro
   del texto. */
function leerLinea(linea, ambito){
  var t = String(linea||'').trim();
  if(!t) return null;
  if(/^[-—·•*]+$/.test(t)) return null;

  var partes = t.split(/\s*[:;\t|]\s*|\s{3,}|\s+\/\s+/).filter(function(x){ return x.trim(); });
  var nombre = '', resto = t, usuario = '';

  if(partes.length >= 2){
    nombre = partes[0].trim();
    resto  = partes.slice(1).join(' ').trim();
    if(partes.length >= 3){ usuario = partes[1].trim(); resto = partes.slice(2).join(' ').trim(); }
  }

  var correo = (resto.match(RE_CORREO) || t.match(RE_CORREO) || [])[0] || '';
  var tel    = (resto.match(RE_TELEFONO) || t.match(RE_TELEFONO) || [])[0] || '';

  var tipo, valor;
  if(correo){ tipo='correo'; valor=correo; }
  else if(tel && tel.replace(/\D/g,'').length >= 6 && !PALABRA_CLAVE.test(t)){
    tipo='telefono'; valor=tel.trim();
  } else { tipo='clave'; valor=resto || t; }

  if(!nombre){
    /* Sin separador: el nombre es lo que queda al quitar el dato */
    nombre = t.replace(valor, '').replace(/[-–—:;,]+$/,'').trim() || valor;
  }
  if(tipo!=='clave' && usuario && !RE_CORREO.test(usuario) && !RE_TELEFONO.test(usuario)){
    /* en teléfonos y correos, el del medio suele ser parte del nombre */
    nombre = (nombre+' '+usuario).trim(); usuario = '';
  }
  return {id:uid(), tipo:tipo, ambito:ambito, nombre:nombre, valor:valor,
          usuario:usuario, sitio:'', notas:''};
}

function leerLista(texto, ambito){
  return String(texto||'').split(/\r?\n/).map(function(l){ return leerLinea(l, ambito); })
    .filter(Boolean);
}

function pegarLista(){
  var leidos = [];

  var d = abrirVentana('Pegar una lista',
    '<div class="campo" style="margin-bottom:10px">'+
      '<label class="lbl" for="pg_ambito">De dónde es todo esto</label>'+
      '<select id="pg_ambito">'+Object.keys(AMBITOS).map(function(k){
        return '<option value="'+k+'">'+AMBITOS[k].icono+' '+AMBITOS[k].nombre+'</option>';
      }).join('')+'</select></div>'+
    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="pg_texto">Pega aquí la lista</label>'+
      '<textarea id="pg_texto" rows="7" placeholder="Pescadería Ordino: 812 345&#10;'+
        'Luz: 376 800 800&#10;correo del gestor: gestor@despacho.ad&#10;'+
        'Banco Creand: vff.ad: miClaveSecreta"></textarea>'+
      '<span class="nota" style="margin:5px 0 0">Una por línea. Vale con dos puntos, tabulador '+
      'o barra entre el nombre y el dato; si no hay separador, lo busca igual.</span></div>'+
    '<div id="pg_vista"></div>',
    function(){
      var buenos = leidos.filter(function(x, i){
        var c = document.getElementById('pg_si_'+i);
        return !c || c.checked;
      });
      if(!buenos.length){ avisar('No hay nada que apuntar.', true); return true; }
      /* cada fila puede haber cambiado de tipo a mano */
      buenos.forEach(function(x, i){
        var sel = document.getElementById('pg_tipo_'+leidos.indexOf(x));
        if(sel) x.tipo = sel.value;
      });
      var claves = buenos.filter(function(x){ return x.tipo==='clave'; });

      function terminar(){
        buenos.forEach(function(x){ libro.apuntes.push(x); });
        guardar(); pintar();
        avisar(plural(buenos.length,'apunte nuevo','apuntes nuevos'));
      }
      if(!claves.length || libro.ajustes.cifrar === false){ terminar(); return; }

      conMaestra(function(maestraOk){
        Promise.all(claves.map(function(x){
          return cifrar(x.valor, maestraOk).then(function(p){ x.cifrada = p; delete x.valor; });
        })).then(terminar).catch(function(){ avisar('No se pudieron cifrar las claves.', true); });
      });
    }, {aceptar:'Apuntarlo todo'});

  var texto  = document.getElementById('pg_texto');
  var ambito = document.getElementById('pg_ambito');
  var vista  = document.getElementById('pg_vista');

  function repasar(){
    leidos = leerLista(texto.value, ambito.value);
    if(!leidos.length){ vista.innerHTML = ''; return; }
    vista.innerHTML =
      '<div class="lbl" style="margin:0 0 6px">Así queda ('+plural(leidos.length,'línea','líneas')+')</div>'+
      '<div class="tabla-caja" style="max-height:34vh;overflow:auto"><table><tbody>'+
      leidos.map(function(x, i){
        return '<tr><td style="width:26px"><input type="checkbox" id="pg_si_'+i+'" checked '+
            'style="width:auto"></td>'+
          '<td><strong>'+esc(x.nombre)+'</strong>'+
            (x.usuario?'<div class="nota" style="margin:0">usuario: '+esc(x.usuario)+'</div>':'')+
            '</td>'+
          '<td style="width:108px"><select id="pg_tipo_'+i+'" style="padding:3px 5px;font-size:12px">'+
            ORDEN_TIPOS.map(function(t){
              return '<option value="'+t+'"'+(x.tipo===t?' selected':'')+'>'+
                     TIPOS[t].icono+' '+TIPOS[t].nombre+'</option>'; }).join('')+
            '</select></td>'+
          '<td class="mono" style="font-size:12px;word-break:break-all">'+
            (x.tipo==='clave' ? '••••••••' : esc(x.valor))+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  texto.addEventListener('input', repasar);
  ambito.addEventListener('change', repasar);
  texto.focus();
}


/* ══════════════════════════════════════════════════════════════
   IMPRIMIR
   ══════════════════════════════════════════════════════════════
   Un papel en el cajón vale más que una app el día que se cae el
   internet. Sale lo que se está viendo, ordenado por trabajo y casa.
   Las claves sólo si él lo pide: un papel con las contraseñas es un
   papel que hay que guardar bien, y se avisa. */
function imprimir(){
  var lista = filtrados();
  if(!lista.length){ avisar('No hay nada que imprimir.', true); return; }
  var hayClaves = lista.some(function(a){ return a.tipo==='clave'; });

  abrirVentana('Imprimir',
    '<p class="nota" style="margin:0 0 10px">Se imprime lo que estás viendo: '+
      plural(lista.length,'apunte','apuntes')+
      (ui.ambito!=='todos' ? ' de '+AMBITOS[ui.ambito].nombre.toLowerCase() : '')+
      (ui.tipo!=='todos' ? ' · sólo '+TIPOS[ui.tipo].plural.toLowerCase() : '')+'.</p>'+
    (hayClaves
      ? '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer">'+
        '<input type="checkbox" id="im_claves" style="width:auto;margin-top:3px">'+
        '<span>Imprimir también <strong>las contraseñas</strong><br>'+
        '<span class="nota" style="margin:0">Salen escritas en el papel. Guárdalo donde guardarías '+
        'el dinero.</span></span></label>'
      : ''),
    function(){
      var conClaves = hayClaves && document.getElementById('im_claves').checked;
      if(!conClaves){ hacerPapel(lista, {}); return; }
      conMaestra(function(clave){
        var claves = lista.filter(function(a){ return a.tipo==='clave'; });
        Promise.all(claves.map(function(a){
          if(!a.cifrada) return Promise.resolve([a.id, a.valor||'']);
          return descifrar(a.cifrada, clave).then(function(t){ return [a.id, t]; })
                 .catch(function(){ return [a.id, '(no se pudo abrir)']; });
        })).then(function(pares){
          var abiertas = {};
          pares.forEach(function(p){ abiertas[p[0]] = p[1]; });
          hacerPapel(lista, abiertas);
        });
      });
    }, {aceptar:'Imprimir'});
}

function hacerPapel(lista, clavesAbiertas){
  var caja = document.getElementById('imprimible');
  if(!caja){
    caja = document.createElement('div');
    caja.id = 'imprimible';
    document.body.appendChild(caja);
  }
  var hoy = new Date();
  var partes = ['<h1>Agenda</h1>',
    '<div class="cuando">'+plural(lista.length,'apunte','apuntes')+' · '+
    hoy.getDate()+'/'+(hoy.getMonth()+1)+'/'+hoy.getFullYear()+'</div>'];

  Object.keys(AMBITOS).forEach(function(amb){
    ORDEN_TIPOS.forEach(function(tipo){
      var suyos = lista.filter(function(a){ return a.ambito===amb && a.tipo===tipo; });
      if(!suyos.length) return;
      partes.push('<h2>'+AMBITOS[amb].nombre+' · '+TIPOS[tipo].plural+'</h2>');
      partes.push('<table><tbody>'+suyos.map(function(a){
        var dato = a.tipo==='clave'
          ? (clavesAbiertas[a.id] !== undefined ? clavesAbiertas[a.id] : '············')
          : (a.valor||'');
        return '<tr><td style="width:38%"><strong>'+esc(a.nombre||'')+'</strong>'+
          (a.usuario?'<br><span style="font-size:9pt;color:#555">usuario: '+esc(a.usuario)+'</span>':'')+
          (a.sitio?'<br><span style="font-size:9pt;color:#555">'+esc(a.sitio)+'</span>':'')+
          '</td><td class="dato">'+esc(dato)+
          (a.notas?'<br><span style="font-size:9pt;color:#555">'+esc(a.notas)+'</span>':'')+
          '</td></tr>';
      }).join('')+'</tbody></table>');
    });
  });

  caja.innerHTML = partes.join('');
  window.print();
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function verAjustes(){
  var conCifrado = apuntes().filter(function(a){ return a.tipo==='clave' && a.cifrada; }).length;
  var enClaro    = apuntes().filter(function(a){ return a.tipo==='clave' && !a.cifrada; }).length;

  abrirVentana('Ajustes',
    '<p class="nota" style="margin:0 0 12px">Los teléfonos y los correos se guardan tal cual: '+
    'no son secreto. Las contraseñas, cifradas con tu contraseña maestra.</p>'+
    '<div class="cifras" style="margin:0 0 14px">'+
      '<div class="cifra"><div class="k">Cifradas</div><div class="v acento">'+conCifrado+'</div></div>'+
      '<div class="cifra"><div class="k">Sin cifrar</div><div class="v'+(enClaro?' malo':'')+'">'+
        enClaro+'</div></div>'+
      '<div class="cifra"><div class="k">Apuntes</div><div class="v">'+apuntes().length+'</div></div>'+
    '</div>'+
    '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer">'+
      '<input type="checkbox" id="aj_sin" style="width:auto;margin-top:3px"'+
      (libro.ajustes.cifrar===false?' checked':'')+'>'+
      '<span>Guardar las contraseñas <strong>sin cifrar</strong><br>'+
      '<span class="nota" style="margin:0">Más cómodo —no pide nada— pero cualquiera que entre '+
      'a tu repositorio las lee. Las que ya estén cifradas se quedan como están.</span></span></label>'+
    '<p class="nota" style="margin:14px 0 0"><strong>Ojo con la contraseña maestra:</strong> no se '+
    'guarda en ningún sitio. Si se te olvida, esas contraseñas no las abre nadie, ni yo.</p>',
    function(){
      libro.ajustes.cifrar = document.getElementById('aj_sin').checked ? false : null;
      guardar();
      avisar(libro.ajustes.cifrar===false ? 'Las contraseñas nuevas se guardarán sin cifrar'
                                          : 'Las contraseñas nuevas se cifrarán');
    }, {aceptar:'Guardar'});
}

/* ══════════════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
