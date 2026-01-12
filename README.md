# cg2-app

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