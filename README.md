# Escritorio

Panel privado con tres herramientas: la gestión del piso de Soldeu, el
horario del restaurante y la facturación de comidas de empresa. Publicado
con GitHub Pages en **https://valitolerio.github.io/apps/**

## Cómo está montado

Este repositorio es **público**: contiene solo el código, sin ningún dato
personal. Los datos viven en un repositorio **privado** aparte
(`ValitoLerio/datos`), en un único archivo `datos.json`.

```
Este repo (público)                Repo de datos (privado)
├── index.html   el escritorio     └── datos.json
├── piso.html    + piso.js              ├── piso:    recibos, gastos, inquilinos
├── horario.html + horario.js           ├── horario: turnos, personal, colores
├── comanda.html + comanda.js           └── comanda: empresas, servicios, facturas
└── sync.js      guardado
```

Cada dispositivo se conecta una vez con un token de GitHub que se guarda
solo en ese navegador. A partir de ahí, cualquier cambio en las apps se
sube solo al repositorio de datos un par de segundos después, y al abrir
la web en otro sitio se descarga lo último guardado.

## Trabajar en dos dispositivos sin pisarse

El guardado sustituye la sección entera de cada app, así que dos
dispositivos editando lo mismo podrían machacarse. Para evitarlo:

- **Al abrir** cualquier app, y el escritorio, se descarga primero lo que
  hay en GitHub. Si no se puede comprobar, el escritorio lo dice y no
  sigue: mejor eso que trabajar sobre datos viejos.
- **Mientras trabajas**, cada minuto y al volver a la pestaña se mira si
  alguien guardó desde otro sitio. Si aquí no hay nada sin guardar, se
  trae la versión nueva sola. Si lo hay, pregunta con cuál te quedas.
- **Antes de guardar**, se comprueba que la sección no haya cambiado
  desde que se cargó. Si cambió, vuelve a preguntar en vez de pisar.
- **Al salir** con algo sin subir, el navegador avisa. El indicador de
  estado se puede pulsar para guardar en el acto.

## Contraseña por app

Cada app puede pedir su propia contraseña, desde el botón del candado en
el escritorio. De la contraseña se deriva una huella con PBKDF2 (200.000
iteraciones y sal propia) y solo eso viaja al repositorio de datos, en una
sección `seguridad` que las apps no tocan. La contraseña no se guarda en
ninguna parte, ni aquí ni allí.

Mientras una app esté bloqueada, sus datos **no se descargan al aparato**:
la pantalla de contraseña sale antes, y el escritorio tampoco enseña sus
cifras. Al acertar, queda abierta hasta que cierres la pestaña; "Bloquear
ahora" la cierra en el acto.

Es un candado, no un cifrado: quien sepa manejar las herramientas del
navegador en un dispositivo ya conectado podría saltárselo. Sirve para que
nadie que coja tu móvil desbloqueado curiosee, no contra alguien técnico.
Si olvidas la contraseña, se quita desde otro dispositivo y no se pierde
nada.

## Conectar un dispositivo

1. Abre la web y rellena el formulario de conexión
2. Repositorio: `ValitoLerio/datos` · Rama: `main`
3. Token: uno *fine-grained* de
   `github.com/settings/personal-access-tokens/new`, con acceso **solo** al
   repositorio de datos y permiso **Contents: Read and write**

El token nunca sale del dispositivo. Para retirarlo, usa "Desconectar este
dispositivo", que borra el token y la copia local de los datos.

## Traer los datos que ya tenías

- **Piso**: en el archivo original del Mac, Configuración → Exportar datos.
  En la web, Configuración → Importar datos. Las cifras de la compra se
  rellenan a mano en Configuración → La inversión.
- **Horario**: en el archivo original, botón *Copia*. En la web, *Importar*.
- **Comanda**: en el artefacto de Claude, Ajustes → Descargar copia. En la
  web, Ajustes → Restaurar copia.

Al importar, los datos se suben solos al repositorio privado.

## Tocar el código

Los HTML de este repositorio se generan a partir de los originales con tres
scripts que sacan del código los datos reales y reconectan el guardado.
Viven en el repositorio privado `ValitoLerio/panel`, en `generadores/`.

Comanda venía de un artefacto de Claude y guardaba dentro del propio
documento; aquí guarda en el repositorio de datos, y el PDF de las facturas
lo descarga el navegador en vez de la API del visor.

Si editas aquí a mano, ten presente que **todo lo que subas es público**:
los datos van siempre al repositorio privado, nunca al código.
