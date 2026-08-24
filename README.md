# Escritorio de Valeriano

Panel privado con dos herramientas: la gestión del piso de Soldeu y el
horario del restaurante. Publicado con GitHub Pages en
**https://valitolerio.github.io/apps/**

## Cómo está montado

Este repositorio es **público**: contiene solo el código, sin ningún dato
personal. Los datos viven en un repositorio **privado** aparte
(`ValitoLerio/datos`), en un único archivo `datos.json`.

```
Este repo (público)              Repo de datos (privado)
├── index.html   escritorio      └── datos.json
├── piso.html    + piso.js            ├── piso:    recibos, gastos, inquilinos
├── horario.html + horario.js         └── horario: turnos, personal, colores
└── sync.js      guardado
```

Cada dispositivo se conecta una vez con un token de GitHub que se guarda
solo en ese navegador. A partir de ahí, cualquier cambio en las apps se
sube solo al repositorio de datos un par de segundos después, y al abrir
la web en otro sitio se descarga lo último guardado.

## Conectar un dispositivo

1. Abre la web y rellena el formulario de conexión
2. Repositorio: `ValitoLerio/datos` · Rama: `main`
3. Token: uno *fine-grained* de
   `github.com/settings/personal-access-tokens/new`, con acceso **solo** al
   repositorio de datos y permiso **Contents: Read and write**

El token nunca sale del dispositivo. Para retirarlo, usa "Desconectar este
dispositivo", que borra el token y la copia local de los datos.

## Traer los datos que ya tenías

Las versiones originales de estos HTML, con los datos reales dentro, están
en el repositorio privado `ValitoLerio/panel` y en la carpeta
`Escritorio / CLAUDE DOCS` del Mac.

- **Piso**: en el archivo original, Configuración → Exportar datos. En la
  web, Configuración → Importar datos. Las cifras de la compra se rellenan
  a mano en Configuración → La inversión.
- **Horario**: en el archivo original, botón *Copia*. En la web, botón
  *Importar*.

Al importar, los datos se suben solos al repositorio privado.

## Tocar el código

Los HTML de este repositorio se generan a partir de los originales con dos
scripts que sacan del código los datos reales. Esos scripts viven en el
repositorio privado `ValitoLerio/panel`, en la carpeta `generadores/`,
porque contienen justo lo que aquí no debe estar.

Si editas aquí a mano, ten presente que **todo lo que subas es público**:
los datos van siempre al repositorio privado, nunca al código.
