# CG2 App - Visor de Objetos 3D

Aplicación de visualización y manipulación de objetos 3D con soporte para transformaciones y herramientas de inspección geométrica implementada con herramientas web (React y TypeScript, manejando WebGL y GLSL, y siendo empaquetada con NW.js para su portabilidad).

Elaborada en la asignatura de Introducción a la Computación Gráfica de la Escuela de Computación de la Universidad Central de Venezuela durante el semestre 2-2025.

## Índice

* [Requisitos](#requisitos)
* [Instalación y Ejecución](#instalación-y-ejecución)
* [Guía de Uso y Opciones](#guía-de-uso-y-opciones)
    * [Importación y Exportación](#importación-y-exportación)
    * [Configuración de Escena](#configuración-de-escena)
    * [Visualización](#visualización)
    * [Transformaciones](#transformaciones)
    * [Submalla Seleccionada](#submalla-seleccionada)


## Requisitos

Instrucciones para desarrollo y empaquetado (Vite + NW.js)

**Requisitos**
- Node.js (recomendado >= 16)
- npm

**Dependencias principales (se instalan con `npm install`)**
- `react`
- `react-dom`
- `react-icons`
- `gl-matrix`

**Dependencias de desarrollo**
- `vite`
- `@vitejs/plugin-react`
- `nw` (opcional para ejecución local de NW)
- `nw-builder` (para crear ejecutables)


## Instalación y Ejecución

**Instalación**
Desde la raíz del proyecto:

```powershell
npm install
```

**Ejecución** (usando PowerShell desde la raíz del proyecto)

- `npm run dev` — Levanta el servidor de desarrollo Vite (HMR). Abre `http://localhost:5173`.
- `npm run build` — Genera el bundle de producción en `./dist`.
- `npm run preview` — Sirve la versión construida localmente (Vite preview).
- `npm run nw-preview` — Construye (`vite build`) y abre la carpeta `dist` en una instancia de NW (útil para verificar cómo se verá dentro de NW sin crear un instalador).
- `npm run prod` — Ejecuta el pipeline de empaquetado: `vite build` + `nw-builder` para generar el ejecutable (equivalente a `build:nw`) que será ubicado en la carpeta `./out`.


## Guía de Uso y Opciones


### Importación y Exportación

**Importación**

Para cargar un objeto 3D, debe presionar el botón "Importar Obj". Dado que se trata de una aplicación web, es necesario que al abrir el explorador de archivos seleccione tanto el archivo .obj como el .mtl, para su carga en la misma. De no seleccionar un archivo .mtl, el objeto se verá

**Exportación**

La aplicación permite exportar el objeto actual incluyendo las transformaciones aplicadas. Para ello, presione el botón con ícono de guardado "Exportar Obj". Debido a que se trata de una aplicación web, el explorador de archivos se abrirá dos veces seguidas, para guardar tanto el archivo .obj como el .mtl.

### Configuración de Escena

**Controles de Cámara**

La interacción de la cámara se realiza haciendo uso del mouse y de las teclas de acceso rápido:
- Tecla Up (↑): Mueve la cámara hacia el frente.
- Tecla Down (↓): Mueve la cámara hacia atrás.
- Tecla Left (←): Mueve la cámara hacia la izquierda.
- Tecla Right (→): Mueve la cámara hacia la derecha.
- Mouse: Cambia la dirección de la cámara según el movimiento del cursor. Para lograrlo, debe hacer click sobre el canvas.

**Mostrar FPS**

Muestra un card con los frames por segundo como promedio de los últimos 5 segundos.

**Antialiasing**

Suaviza los bordes dentados (aliasing) del objeto 3D y del wireframe, mejorando la calidad visual de la escena.

**Z-Buffer**

Habilita la prueba de profundidad (Depth Test), permitiendo que el motor gráfico determine correctamente qué píxeles están delante de otros, evitando que las caras traseras se dibujen sobre las frontales.

**Back-face Culling**

Descarta el renderizado de las caras que no miran hacia la cámara. Útil para sólidos cerrados donde las caras internas nunca son visibles. Puede probarlo acercando la cámara hacia un objeto cerrado, donde podrá apreciar que al activarlo, el sólido quedará vacío.

**Color de Fondo**

Permite personalizar el color del canvas mediante un selector de color RGB. Para seleccionar el color, aparecerá un portal con una colorwheel, dar click sobre la rueda cromática o escribir en los inputs los valores RGB.


### Visualización

**Mostrar Vértices**

Dibuja los puntos que componen la geometría de la malla. Permite ajustar el tamaño de los puntos y su color.

**Relleno**

Activa el renderizado de las caras (triángulos) de la malla. Es el modo de visualización por defecto para ver superficies sólidas.

**Wireframe**

Muestra la estructura de del objeto. De seleccionarla junto al relleno, se verá sobre este; de deshabilitar el relleno, se apreciará el alambrado completo, visualizando tanto la parte frontal como la trasera. Permite ajustar el color del alambrado.

**Mostrar Normales**

Dibuja líneas vectoriales que representan la dirección de las normales en cada vértice. Permite cambiar el color de las líneas.

**Centrar Objeto**

Reposiciona el objeto en la posición inicial $(0,0,-3)$ y ajusta nuevamente su escala para que sea visible dentro de un cubo unitario. Deshace transformaciones de traslación, escala y rotación del objeto completo, pero mantiene las traslaciones de los submallados. También regresa la cámara a su posición inicial.

**Bounding Box Global**

Dibuja una caja alineada con los ejes que encierra la totalidad de los objetos cargados en la escena. Para deshabilitarla es necesario volver a presionar el botón. Permite cambiar el color de la misma.

**Reiniciar**

Deshace todas las transformaciones aplicadas sobre el objeto cargado. Devuelve el mismo a su estado inicial.


### Transformaciones

**Traslación del Objeto (X,Y,Z)**

Desplaza la totalidad de la escena en los tres ejes espaciales. Los inputs permiten incrementos de 0.1 mediante las flechas del teclado o los controles en pantalla. Además, puede arrastrar el objeto seleccionado con el cursor, para una traslación libre.

**Escala del Objeto (X,Y,Z)**

Modifica el tamaño del objeto de forma global o independiente por eje. Un valor de $1.0$ representa el tamaño original. Los inputs permiten incrementos de 0.1 mediante las flechas del teclado o los controles en pantalla.

**Rotación del Objeto (X,Y,Z)**

Aplica rotaciones al objeto. Presione el click derecho y arrastre la figura para activar la rotación. Los inputs permiten ingresar valores desde $0°$ hasta $359°$. Además, es posible deshacer la última rotación y resetear todas las rotaciones.


### Submalla Seleccionada

Estas opciones sólo se activan al hacer click sobre una parte específica (submalla) del objeto cargado.

**Color Submalla**

Permite cambiar el color base de la parte seleccionada mediante una rueda de color.

**Traslación de Submalla (X,Y,Z)**

A diferencia de la traslación global, esta opción mueve únicamente la pieza seleccionada, permitiendo "desarmar" o reajustar partes de un modelo complejo.

**BBox Local y BBox Color**

Muestra la caja delimitadora específica de la submalla seleccionada. Permite cambiar el color de la misma.

**Eliminar**

Remueve permanentemente la submalla seleccionada de la escena actual.