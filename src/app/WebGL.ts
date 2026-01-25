import { mat4, vec4, vec3, quat } from 'gl-matrix';
import { computeBoundingBox } from './lib/objLoader';

let gl: WebGLRenderingContext | null = null;
let renderProgram: WebGLProgram | null = null;
let pickingProgram: WebGLProgram | null = null;
let lineProgram: WebGLProgram | null = null;
let pointProgram: WebGLProgram | null = null;
// Post-process program and resources for FXAA / blur-based AA
let fxaaProgram: WebGLProgram | null = null;
let fxaaFBO: WebGLFramebuffer | null = null;
let fxaaTexture: WebGLTexture | null = null;
let fxaaDepthRB: WebGLRenderbuffer | null = null;
let quadVBO: WebGLBuffer | null = null;

// Rotación global (cuaternión) y pila de deshacer
let globalQuat = quat.create();
let globalQuatStack: Float32Array[] = [];
// Centro global (actualizado en redraw)
let globalCenter: [number, number, number] = [0, 0, -3];

// Cámara (por defecto en origen mirando -Z)
let cameraPos: [number, number, number] = [0, 0, 0];
let cameraFront: [number, number, number] = [0, 0, -1];
let cameraUp: [number, number, number] = [0, 1, 0];

// Variable para trackear soporte de antialiasing
let glAntialiasSupported = true;

export function setCamera(pos: [number, number, number], front: [number, number, number], up: [number, number, number]) {
  cameraPos = [pos[0], pos[1], pos[2]];
  cameraFront = [front[0], front[1], front[2]];
  cameraUp = [up[0], up[1], up[2]];
}

export function getCamera() {
  return { pos: cameraPos, front: cameraFront, up: cameraUp };
}

export function pushGlobalRotation() {
  globalQuatStack.push(quat.clone(globalQuat));
}

export function undoGlobalRotation() {
  if (globalQuatStack.length === 0) {
    quat.identity(globalQuat);
  } else {
    const last = globalQuatStack.pop()!;
    quat.copy(globalQuat, last);
  }
}

export function resetGlobalRotation() {
  quat.identity(globalQuat);
  globalQuatStack = [];
}

export function applyDeltaGlobalQuat(delta: quat) {
  const out = quat.create();
  quat.multiply(out, delta, globalQuat);
  quat.copy(globalQuat, out);
}

// Sensibilidad de rotación (grados por 100px)
let rotationSensitivity: [number, number, number] = [6, 6, 6];
export function setRotationSensitivity(x: number, y: number, z: number) {
  rotationSensitivity = [x, y, z];
}
export function getRotationSensitivity() {
  return rotationSensitivity;
}

// Convertir quaternion global a ángulos Euler (grados) - orden X (roll), Y (pitch), Z (yaw)
export function getGlobalRotationDegrees(): [number, number, number] {
  const x = globalQuat[0], y = globalQuat[1], z = globalQuat[2], w = globalQuat[3];
  // roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) pitch = Math.sign(sinp) * Math.PI / 2;
  else pitch = Math.asin(sinp);

  // yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  // Convertir a grados
  return [roll * 180 / Math.PI, pitch * 180 / Math.PI, yaw * 180 / Math.PI];
}

// Establecer la rotación global a partir de ángulos Euler (grados). Orden: X then Y then Z.
export function setGlobalRotationDegrees(rxDeg: number, ryDeg: number, rzDeg: number) {
  const rx = rxDeg * Math.PI / 180;
  const ry = ryDeg * Math.PI / 180;
  const rz = rzDeg * Math.PI / 180;
  const qx = quat.create();
  const qy = quat.create();
  const qz = quat.create();
  quat.setAxisAngle(qx, [1, 0, 0], rx);
  quat.setAxisAngle(qy, [0, 1, 0], ry);
  quat.setAxisAngle(qz, [0, 0, 1], rz);
  // q = qz * qy * qx  (apply X then Y then Z)
  const tmp = quat.create();
  quat.multiply(tmp, qy, qx);
  quat.multiply(globalQuat, qz, tmp);
}

let currentUseAA = false;

// export function initWebGL(canvas: HTMLCanvasElement, useAA: boolean = false): WebGLRenderingContext | null {
//   // Guardar el estado solicitado (para compararlo si se intenta reinit)
//   currentUseAA = !!useAA;

//   console.log(`initWebGL called with useAA: ${useAA}`); // Debug log

//   // Intentar obtener un contexto WebGL con la opción de antialias solicitada
//   gl = canvas.getContext('webgl', {
//     antialias: currentUseAA,
//     preserveDrawingBuffer: true
//   }) as WebGLRenderingContext | null;

//   if (!gl) {
//     console.error("WebGL no soportado");
//     return null;
//   }

//   // Al (re)crear el contexto, los recursos previos (shaders/programs) ya no son válidos.
//   renderProgram = null;
//   pickingProgram = null;
//   lineProgram = null;
//   pointProgram = null;

//   // Estado GL básico
//   const canvasEl = gl.canvas as HTMLCanvasElement;
//   gl.viewport(0, 0, canvasEl.width, canvasEl.height);
//   gl.enable(gl.DEPTH_TEST);

//   return gl;
// }

export function initWebGL(canvas: HTMLCanvasElement, useAA: boolean = false): WebGLRenderingContext | null {
  // Guardar el estado solicitado
  currentUseAA = !!useAA;
  
  console.log(`initWebGL called with useAA: ${useAA}`); // Debug log

  // Intentar obtener un contexto WebGL con la opción de antialias solicitada
  const contextOptions = {
    antialias: currentUseAA,
    preserveDrawingBuffer: true
  };

  // Intentar con antialiasing primero si está solicitado
  if (currentUseAA) {
    gl = canvas.getContext('webgl', contextOptions) as WebGLRenderingContext | null;
    glAntialiasSupported = !!gl;
    
    // Si falla, intentar sin antialiasing
    if (!gl) {
      console.warn("Antialiasing no soportado, intentando sin AA");
      contextOptions.antialias = false;
      gl = canvas.getContext('webgl', contextOptions) as WebGLRenderingContext | null;
    }
  } else {
    // Sin antialiasing
    contextOptions.antialias = false;
    gl = canvas.getContext('webgl', contextOptions) as WebGLRenderingContext | null;
  }

  if (!gl) {
    console.error("WebGL no soportado");
    return null;
  }

  // Al (re)crear el contexto, los recursos previos (shaders/programs) ya no son válidos.
  renderProgram = null;
  pickingProgram = null;
  lineProgram = null;
  pointProgram = null;
  // Limpiar recursos de post-proceso (se recrearán si es necesario)
  fxaaProgram = null;
  fxaaFBO = null;
  fxaaTexture = null;
  fxaaDepthRB = null;
  quadVBO = null;

  // Estado GL básico
  const canvasEl = gl.canvas as HTMLCanvasElement;
  gl.viewport(0, 0, canvasEl.width, canvasEl.height);
  gl.enable(gl.DEPTH_TEST);

  console.log(`Contexto WebGL creado con antialias: ${currentUseAA}`);
  return gl;
}

// Cambia el estado de antialiasing recreando el contexto si es necesario.
// export function setAntialiasing(enabled: boolean, canvas: HTMLCanvasElement) {
//   // Si ya está en el mismo estado, no hacemos nada
//   if (currentUseAA === !!enabled && gl && (gl.canvas === canvas)) return;

//   // Re-inicializar contexto con nuevo flag de AA
//   const newGl = initWebGL(canvas, !!enabled);
//   if (!newGl) {
//     console.warn('No se pudo (re)inicializar WebGL con antialias=' + enabled);
//     return false;
//   }

//   // Recrear shaders/programas y estado básico (las funciones exportadas pueden llamarse aquí)
//   try {
//     setupShaders();
//   } catch (e) {
//     console.warn('Error re-compilando shaders tras cambio de AA', e);
//   }

//   return true;
// }

export function setAntialiasing(enabled: boolean, canvas: HTMLCanvasElement) {
  console.log(`setAntialiasing: ${enabled}, currentUseAA: ${currentUseAA}`);
  
  // Si ya está en el mismo estado, no hacemos nada
  if (currentUseAA === !!enabled && gl && (gl.canvas === canvas)) {
    console.log("AA ya está en el estado solicitado, saliendo");
    return false;
  }

  // Guardar dimensiones actuales
  const width = canvas.width;
  const height = canvas.height;

  // Re-inicializar contexto con nuevo flag de AA
  const newGl = initWebGL(canvas, !!enabled);
  if (!newGl) {
    console.warn('No se pudo (re)inicializar WebGL con antialias=' + enabled);
    return false;
  }

  // Restaurar dimensiones
  newGl.canvas.width = width;
  newGl.canvas.height = height;
  newGl.viewport(0, 0, width, height);

  // Recrear shaders/programas y estado básico
  try {
    setupShaders();
    // Aplicar estados de depth y culling
    setDepthTest(!!newGl.getParameter(newGl.DEPTH_TEST));
    setCulling(!!newGl.getParameter(newGl.CULL_FACE));
  } catch (e) {
    console.warn('Error re-compilando shaders tras cambio de AA', e);
  }

  return true;
}

function createShader(type: number, source: string): WebGLShader {
  const shader = gl!.createShader(type)!;
  gl!.shaderSource(shader, source);
  gl!.compileShader(shader);
  if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl!.getShaderInfoLog(shader));
    throw new Error(gl!.getShaderInfoLog(shader)!);
  }
  return shader;
}

function createProgram(vsSource: string, fsSource: string): WebGLProgram {
  try {
    const vs = createShader(gl!.VERTEX_SHADER, vsSource);
    const fs = createShader(gl!.FRAGMENT_SHADER, fsSource);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vs);
    gl!.attachShader(program, fs);
    gl!.linkProgram(program);
    if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
      const error = gl!.getProgramInfoLog(program);
      console.error("Program linking error:", error);
      throw new Error(error || "Unknown linking error");
    }
    return program;
  } catch (error) {
    console.error("Error creating program:", error);
    throw error;
  }
}

// Vertex shader (compartido)
const vsSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  gl_Position = uMVP * vec4(aPosition, 1.0);
  
  // Pasar posición y normal en espacio de modelo (para iluminación)
  vPosition = (uModel * vec4(aPosition, 1.0)).xyz;
  vNormal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
}
`;

// Fragment shader de render (con iluminación)
const fsRender = `
precision mediump float;

uniform vec3 uColor;
uniform vec3 uLightDir;  // Dirección de la luz
uniform vec3 uLightColor; // Color de la luz
uniform vec3 uAmbientColor; // Color ambiente

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Normalizar vectores
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDir);
  
  // Componente difusa
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * uLightColor;
  
  // Componente ambiente
  vec3 ambient = uAmbientColor;
  
  // Combinar colores
  vec3 finalColor = (ambient + diffuse) * uColor;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// Fragment shader de picking (color plano, sin iluminación)
const fsPicking = `
precision mediump float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`;

export function setupShaders() {
  renderProgram = createProgram(vsSource, fsRender);
  pickingProgram = createProgram(vsSource, fsPicking);
  gl!.useProgram(renderProgram);
}

// Ensure FXAA / post-process resources exist for current canvas size
function ensureFXAAResources() {
  if (!gl) return;
  const canvas = gl.canvas as HTMLCanvasElement;
  const width = canvas.width;
  const height = canvas.height;

  if (!fxaaProgram) {
    // Vertex shader for fullscreen quad
    const quadVs = `
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;
      void main() {
        vTexCoord = aTexCoord;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    // Simple 3x3 blur as post-process (produces visible smoothing)
    const quadFs = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform vec2 uResolution;

      void main() {
        vec2 texel = 1.0 / uResolution;
        vec3 result = vec3(0.0);
        result += texture2D(uTexture, vTexCoord + texel * vec2(-1.0, -1.0)).rgb * 0.075;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 0.0, -1.0)).rgb * 0.125;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 1.0, -1.0)).rgb * 0.075;

        result += texture2D(uTexture, vTexCoord + texel * vec2(-1.0,  0.0)).rgb * 0.125;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 0.0,  0.0)).rgb * 0.200;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 1.0,  0.0)).rgb * 0.125;

        result += texture2D(uTexture, vTexCoord + texel * vec2(-1.0,  1.0)).rgb * 0.075;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 0.0,  1.0)).rgb * 0.125;
        result += texture2D(uTexture, vTexCoord + texel * vec2( 1.0,  1.0)).rgb * 0.075;

        gl_FragColor = vec4(result, 1.0);
      }
    `;

    fxaaProgram = createProgram(quadVs, quadFs);
  }

  // Create or resize texture + FBO
  if (!fxaaTexture) fxaaTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fxaaTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Evitar repeat en NPOT textures
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (!fxaaDepthRB) fxaaDepthRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, fxaaDepthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  if (!fxaaFBO) fxaaFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fxaaFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fxaaTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fxaaDepthRB);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('FXAA framebuffer not complete: ' + status);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Create quad VBO
  if (!quadVBO) {
    const quadData = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);
    quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

function drawPostProcess() {
  if (!gl || !fxaaProgram || !fxaaTexture || !quadVBO) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const canvas = gl.canvas as HTMLCanvasElement;
  gl.viewport(0, 0, canvas.width, canvas.height);
  // Guardar estados previos
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  const wasCull = gl.isEnabled(gl.CULL_FACE);

  // Limpiar color y profundidad del framebuffer por defecto
  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Deshabilitar depth/cull para dibujar el quad en pantalla completa
  if (wasDepth) gl.disable(gl.DEPTH_TEST);
  if (wasCull) gl.disable(gl.CULL_FACE);

  gl.useProgram(fxaaProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fxaaTexture);
  const uTex = gl.getUniformLocation(fxaaProgram, 'uTexture');
  const uRes = gl.getUniformLocation(fxaaProgram, 'uResolution');
  if (uTex) gl.uniform1i(uTex, 0);
  if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  const aPos = gl.getAttribLocation(fxaaProgram, 'aPosition');
  const aTex = gl.getAttribLocation(fxaaProgram, 'aTexCoord');
  if (aPos >= 0) {
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  }
  if (aTex >= 0) {
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  // Restaurar estados previos
  if (wasCull) gl.enable(gl.CULL_FACE);
  if (wasDepth) gl.enable(gl.DEPTH_TEST);
}

type Mesh = {
  id?: number;
  vertices: number[][];
  normals?: number[][];
  faces: { v: number[]; n?: number[] }[];
  color: [number, number, number];
  center?: [number, number, number];
  scale?: number;
};

function buildBuffers(mesh: Mesh, program: WebGLProgram) {
  // Triangulación tipo fan y aplanado
  const flatVerts: number[] = [];
  const flatNormals: number[] = [];

  mesh.faces.forEach(face => {
    const verts = face.v;
    if (verts.length < 3) return;

    // Calculamos la normal de la CARA (Flat Shading)
    const v0 = mesh.vertices[verts[0]];
    const v1 = mesh.vertices[verts[1]];
    const v2 = mesh.vertices[verts[2]];
    
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    
    // Producto cruz para obtener la normal de la superficie
    const nx = edge1[1] * edge2[2] - edge1[2] * edge2[1];
    const ny = edge1[2] * edge2[0] - edge1[0] * edge2[2];
    const nz = edge1[0] * edge2[1] - edge1[1] * edge2[0];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    const faceNormal = [nx/len, ny/len, nz/len];

    // Triangulación (Fan)
    for (let i = 1; i < verts.length - 1; i++) {
      const indices = [0, i, i + 1];
      indices.forEach(idx => {
        const vIdx = verts[idx];
        flatVerts.push(...mesh.vertices[vIdx]);
        flatNormals.push(...faceNormal);
      });
    }
  });

  // Buffer de posiciones
  const aPosition = gl!.getAttribLocation(program, "aPosition");
  const vertexBuffer = gl!.createBuffer();
  gl!.bindBuffer(gl!.ARRAY_BUFFER, vertexBuffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(flatVerts), gl!.STATIC_DRAW);
  if (aPosition >= 0) {
    gl!.enableVertexAttribArray(aPosition);
    gl!.vertexAttribPointer(aPosition, 3, gl!.FLOAT, false, 0, 0);
  }

  // Buffer de normales
  const aNormal = gl!.getAttribLocation(program, "aNormal");
  const normalBuffer = gl!.createBuffer();
  gl!.bindBuffer(gl!.ARRAY_BUFFER, normalBuffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(flatNormals), gl!.STATIC_DRAW);
  if (aNormal >= 0) {
    gl!.enableVertexAttribArray(aNormal);
    gl!.vertexAttribPointer(aNormal, 3, gl!.FLOAT, false, 0, 0);
  }

  return { vertexCount: flatVerts.length / 3 };
}

// En WebGL.ts, modifica la función applyMVP:
function applyMVP(program: WebGLProgram, mesh: Mesh) {
  const model = calculateModelMatrix(mesh);

  // Proyección
  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 4, gl!.canvas.width / gl!.canvas.height, 0.1, 100);

  // Transformación global por rotación alrededor de `globalCenter`
  const globalTransform = mat4.create();
  mat4.translate(globalTransform, globalTransform, globalCenter);
  const rotMat = mat4.create();
  mat4.fromQuat(rotMat, globalQuat);
  mat4.multiply(globalTransform, globalTransform, rotMat);
  mat4.translate(globalTransform, globalTransform, [-globalCenter[0], -globalCenter[1], -globalCenter[2]]);

  // View (usar cámara si está disponible)
  const view = mat4.create();
  const eye = cameraPos;
  const center = vec3.create();
  vec3.set(center, cameraPos[0] + cameraFront[0], cameraPos[1] + cameraFront[1], cameraPos[2] + cameraFront[2]);
  const up = cameraUp;
  mat4.lookAt(view, eye as any, center as any, up as any);

  // MVP = projection * view * globalTransform * model
  const temp = mat4.create();
  mat4.multiply(temp, globalTransform, model);
  const tmp2 = mat4.create();
  mat4.multiply(tmp2, view, temp);
  const mvp = mat4.create();
  mat4.multiply(mvp, projection, tmp2);

  const uMVP = gl!.getUniformLocation(program, "uMVP");
  gl!.uniformMatrix4fv(uMVP, false, mvp);
}

// Función auxiliar para calcular matriz de modelo
function calculateModelMatrix(mesh: Mesh): mat4 {
  const model = mat4.create();
  
  // 1. Centrar el mesh (si hay centro definido)
  if (mesh.center && (mesh.center[0] !== 0 || mesh.center[1] !== 0 || mesh.center[2] !== 0)) {
    mat4.translate(model, model, [-mesh.center[0], -mesh.center[1], -mesh.center[2]]);
  }
  
  // 2. Escalar el mesh (si hay escala)
  if (mesh.scale) {
    if (typeof mesh.scale === 'number') {
      // Escala uniforme
      mat4.scale(model, model, [mesh.scale, mesh.scale, mesh.scale]);
    } else if (Array.isArray(mesh.scale) && mesh.scale.length === 3) {
      // Escala no uniforme [x, y, z]
      mat4.scale(model, model, [mesh.scale[0], mesh.scale[1], mesh.scale[2]]);
    }
  }
  
  // 3. Aplicar traslación del mesh
  if (mesh.translate) {
    const t = mesh.translate as [number, number, number];
    mat4.translate(model, model, t);
  }
  
  return model;
}

export function drawMesh(mesh: Mesh) {
  if (!gl || !renderProgram) return;

  gl.useProgram(renderProgram);
  const { vertexCount } = buildBuffers(mesh, renderProgram);

  // Color del material
  const uColor = gl.getUniformLocation(renderProgram, "uColor");
  if (uColor) {
    const colorArr = new Float32Array(mesh.color as [number, number, number]);
    gl.uniform3fv(uColor, colorArr);
  }
  
  // Dirección de la luz (desde arriba y un poco al frente)
  const uLightDir = gl.getUniformLocation(renderProgram, "uLightDir");
  if (uLightDir) {
    gl.uniform3fv(uLightDir, new Float32Array([0.3, 0.5, 1.0]));
  }
  
  // Color de la luz (blanco)
  const uLightColor = gl.getUniformLocation(renderProgram, "uLightColor");
  if (uLightColor) {
    gl.uniform3fv(uLightColor, new Float32Array([1.0, 1.0, 1.0]));
  }
  
  // Color ambiente (gris claro para evitar superficies completamente negras)
  const uAmbientColor = gl.getUniformLocation(renderProgram, "uAmbientColor");
  if (uAmbientColor) {
    gl.uniform3fv(uAmbientColor, new Float32Array([0.3, 0.3, 0.3]));
  }

  // Aplicar MVP y también pasar la matriz de modelo separadamente
  applyMVP(renderProgram, mesh);
  
  // Pasar matriz de modelo también
  const uModel = gl.getUniformLocation(renderProgram, "uModel");
  if (uModel) {
    const model = calculateModelMatrix(mesh);
    gl.uniformMatrix4fv(uModel, false, model);
  }

  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

export function redraw(
  meshes: Mesh[], 
  bgColor: [number, number, number, number] = [0,0,0,0], 
  selectedMeshId?: number | null, 
  bboxColor?: [number, number, number],
  showGlobalBBox?: boolean,
  globalBBoxColor?: [number, number, number],
  activeSettings?: any
) {
  console.log("redraw llamado con:", { 
    meshesCount: meshes.length, 
    selectedMeshId, 
    bboxColor, 
    showGlobalBBox,
    wireframe: activeSettings?.wireframe
  });
  
  if (!gl || !renderProgram) {
    console.warn("WebGL no inicializado en redraw");
    return;
  }
  
  const canvas = gl.canvas as HTMLCanvasElement;

  // Si AA por post-proceso está activo, renderizamos la escena a un FBO
  if (currentUseAA) {
    ensureFXAAResources();
    if (fxaaFBO && fxaaTexture) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fxaaFBO);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
      // fallback to default framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  // Calcular centro global (necesario para rotaciones globales)
  if (meshes.length > 0) {
    const gb = computeGlobalBoundingBox(meshes);
    globalCenter = [ (gb.min[0] + gb.max[0]) / 2, (gb.min[1] + gb.max[1]) / 2, (gb.min[2] + gb.max[2]) / 2 ];
  } else {
    globalCenter = [0,0,-3];
  }

  meshes.forEach(m => {
    // Antes de dibujar, asegurarnos de que haya normales por vértice si es necesario
    try {
      if ((!m.normals || m.normals.length === 0) && m.vertices && m.vertices.length > 0) {
        // compute and attach per-vertex normals (O(n))
        computePerVertexNormals(m);
      }
    } catch (e) {
      console.warn('Error computing vertex normals', e);
    }

    // CASO 1: Solo relleno (wireframe desactivado)
    if (activeSettings?.filling && !activeSettings?.wireframe) {
      const needOverlay = !!(activeSettings && (activeSettings.vertex || activeSettings.normals));
      if (needOverlay) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.0, 1.0);
      }
      drawMesh(m);
      if (needOverlay) {
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
    }
    // CASO 2: Solo wireframe (relleno desactivado)
    else if (!activeSettings?.filling && activeSettings?.wireframe) {
      const wfColor = parseColorInput(activeSettings.wireframeColor || 'rgba(255,255,255,1)');
      drawWireframe(m, wfColor);
    }
    // CASO 3: Ambos activados (wireframe sobre relleno)
    else if (activeSettings?.filling && activeSettings?.wireframe) {
      // Primero dibujar el relleno
      drawMesh(m);
      // Luego dibujar wireframe sobre el relleno
      const wfColor = parseColorInput(activeSettings.wireframeColor || 'rgba(255,255,255,1)');
      // Aplicar offset para que el wireframe se dibuje encima
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1.0, -1.0);
      drawWireframe(m, wfColor);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // CASO 4: Ambos desactivados (no se dibuja nada)
    else {
      // No dibujar nada
    }

    // Vertices overlay
    if (activeSettings && activeSettings.vertex) {
      const vColor = parseColorInput(activeSettings.vertexColor || 'rgb(23,178,209)');
      const vSize = activeSettings.vertexSize || 3;
      drawPoints(m, vColor, vSize);
    }

    // Normals overlay
    if (activeSettings && activeSettings.normals) {
      const percent = (activeSettings.normalsLengthPercent !== undefined) ? activeSettings.normalsLengthPercent : 0.05;
      const nColor = parseColorInput(activeSettings.normalsColor || 'rgb(0,0,255)');
      drawNormals(m, nColor, percent);
    }
  });

  // Dibujar BBox local si hay una malla seleccionada
  if (selectedMeshId != null && bboxColor) {
    const mesh = meshes.find(m => m.id === selectedMeshId);
    if (mesh) {
      drawBoundingBox(mesh, bboxColor);
    }
  }

  // Dibujar BBox global si está activa
  if (showGlobalBBox && meshes.length > 0) {
    const globalColor: [number, number, number] = globalBBoxColor || [1, 0, 0];
    drawGlobalBoundingBox(meshes, globalColor);
  }

  // Si estábamos renderizando a FBO por AA, aplicar post-process y presentar
  if (currentUseAA && fxaaFBO && fxaaTexture) {
    // Asegurarnos de que la textura del FBO está actualizada (ya lo está al renderizar a FBO)
    drawPostProcess();
  }
}

export function setDepthTest(enabled: boolean) {
  if (!gl) return;
  if (enabled) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);
}

export function setCulling(enabled: boolean) {
  if (!gl) return;
  if (enabled) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  } else {
    gl.disable(gl.CULL_FACE);
  }
}

// Picking helpers
function idToColor(id: number): [number, number, number] {
  const r = (id & 0x000000FF) / 255.0;
  const g = ((id & 0x0000FF00) >> 8) / 255.0;
  const b = ((id & 0x00FF0000) >> 16) / 255.0;
  return [r, g, b];
}

function drawMeshPicking(mesh: Mesh) {
  if (!gl || !pickingProgram) return;

  gl.useProgram(pickingProgram);
  const { vertexCount } = buildBuffers(mesh, pickingProgram);

  const uColor = gl.getUniformLocation(pickingProgram, "uColor");
  const pickColor = idToColor(mesh.id || 0);
  if (uColor) {
    gl.uniform3fv(uColor, new Float32Array(pickColor));
  }

  applyMVP(pickingProgram, mesh);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

function renderForPicking(meshes: Mesh[]) {
  if (!gl || !pickingProgram) return;
  const canvas = gl.canvas as HTMLCanvasElement;
  // Ensure rendering to default framebuffer for accurate pixel picking
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  // Fondo negro sólido para el picking
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  meshes.forEach(m => drawMeshPicking(m));
}

// Renderiza pasada de picking, lee el pixel y luego RESTAURA la escena normal
export function pickAt(x: number, y: number, canvas: HTMLCanvasElement, meshes: Mesh[], bgColor: [number, number, number, number] = [0,0,0,0], activeSettings?: any): number | null {
  if (!gl) return null;

  // Pasada de picking
  renderForPicking(meshes);

  // Leer pixel
  const pixel = new Uint8Array(4);
  gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const id = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
  const result = id === 0 ? null : id;

  // Restaurar escena normal
  redraw(meshes, bgColor, undefined, undefined, undefined, undefined, activeSettings);

  return result;
}

// Función auxiliar para obtener MVP completa
function getFullMVP(mesh: Mesh): mat4 {
  const model = calculateModelMatrix(mesh);
  
  // Proyección
  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 4, gl!.canvas.width / gl!.canvas.height, 0.1, 100);
  
  // Transformación global por rotación alrededor de `globalCenter`
  const globalTransform = mat4.create();
  mat4.translate(globalTransform, globalTransform, globalCenter);
  const rotMat = mat4.create();
  mat4.fromQuat(rotMat, globalQuat);
  mat4.multiply(globalTransform, globalTransform, rotMat);
  mat4.translate(globalTransform, globalTransform, [-globalCenter[0], -globalCenter[1], -globalCenter[2]]);
  
  // View (usar cámara)
  const view = mat4.create();
  const eye = cameraPos;
  const center = vec3.create();
  vec3.set(center, cameraPos[0] + cameraFront[0], cameraPos[1] + cameraFront[1], cameraPos[2] + cameraFront[2]);
  const up = cameraUp;
  mat4.lookAt(view, eye as any, center as any, up as any);

  // MVP = projection * view * globalTransform * model
  const temp = mat4.create();
  mat4.multiply(temp, globalTransform, model);
  const tmp2 = mat4.create();
  mat4.multiply(tmp2, view, temp);
  const mvp = mat4.create();
  mat4.multiply(mvp, projection, tmp2);
  
  return mvp;
}

function parseColorInput(c: any): [number, number, number] {
  if (!c) return [1,1,1];
  if (Array.isArray(c)) return [c[0], c[1], c[2]];
  if (typeof c === 'string') {
    // accept formats: rgba(r,g,b,a) or rgb(r,g,b) or #rrggbb
    const rgba = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgba) {
      return [parseInt(rgba[1])/255, parseInt(rgba[2])/255, parseInt(rgba[3])/255];
    }
    // hex
    const hex = c.replace('#','');
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      const bigint = parseInt(hex, 16);
      return [(bigint>>16 & 255)/255, (bigint>>8 & 255)/255, (bigint & 255)/255];
    }
  }
  return [1,1,1];
}

// Compute per-vertex normals by averaging face normals (O(n))
function computePerVertexNormals(mesh: Mesh) {
  const vCount = mesh.vertices.length;
  const accum: number[][] = new Array(vCount);
  const counts: number[] = new Array(vCount).fill(0);
  for (let i = 0; i < vCount; i++) accum[i] = [0,0,0];

  mesh.faces.forEach(face => {
    const verts = face.v;
    if (verts.length < 3) return;

    // Triangularizar en abanico
    for (let i = 1; i < verts.length - 1; i++) {
      const i0 = verts[0], i1 = verts[i], i2 = verts[i+1];
      const v0 = mesh.vertices[i0];
      const v1 = mesh.vertices[i1];
      const v2 = mesh.vertices[i2];

      const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const nx = edge1[1]*edge2[2] - edge1[2]*edge2[1];
      const ny = edge1[2]*edge2[0] - edge1[0]*edge2[2];
      const nz = edge1[0]*edge2[1] - edge1[1]*edge2[0];
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      const fn = [nx/len, ny/len, nz/len];

      [i0, i1, i2].forEach(idx => {
        accum[idx][0] += fn[0];
        accum[idx][1] += fn[1];
        accum[idx][2] += fn[2];
        counts[idx]++;
      });
    }
  });

  const result: number[][] = new Array(vCount);
  for (let i = 0; i < vCount; i++) {
    const c = counts[i] || 1;
    const ax = accum[i][0] / c;
    const ay = accum[i][1] / c;
    const az = accum[i][2] / c;
    const l = Math.sqrt(ax*ax + ay*ay + az*az) || 1;
    result[i] = [ax / l, ay / l, az / l];
  }

  mesh.normals = result;
}

function ensureLineProgram() {
  if (lineProgram) return;
  const lineVsSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
      }
    `;
  const lineFsSource = `
      precision mediump float;
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `;
  lineProgram = createProgram(lineVsSource, lineFsSource);
}

function ensurePointProgram() {
  if (pointProgram) return;
  const vs = `
    attribute vec3 aPosition;
    uniform mat4 uMVP;
    uniform float uPointSize;
    void main() {
      gl_Position = uMVP * vec4(aPosition, 1.0);
      gl_PointSize = uPointSize;
    }
  `;
  const fs = `
    precision mediump float;
    uniform vec3 uColor;
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5); 
      if (length(coord) > 0.5) {
        discard;
      }
      gl_FragColor = vec4(uColor, 1.0);
    }
  `;
  pointProgram = createProgram(vs, fs);
}

// Draw wireframe by extracting unique edges (lines in model space, transformed by uMVP)
function drawWireframe(mesh: Mesh, color: [number, number, number]) {
  if (!gl) return;
  ensureLineProgram();
  if (!lineProgram) return;
  gl.useProgram(lineProgram);

  // Build unique edges
  const edgeSet = new Set<string>();
  const lines: number[] = [];
  mesh.faces.forEach(face => {
    const verts = face.v;
    if (verts.length < 3) return;
    // fan triangulation
    for (let i = 1; i < verts.length - 1; i++) {
      const tri = [verts[0], verts[i], verts[i+1]];
      const pairs = [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]];
      pairs.forEach(p => {
        const a = Math.min(p[0], p[1]);
        const b = Math.max(p[0], p[1]);
        const key = a+"_"+b;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          const va = mesh.vertices[a];
          const vb = mesh.vertices[b];
          lines.push(va[0], va[1], va[2], vb[0], vb[1], vb[2]);
        }
      });
    }
  });

  const aPosition = gl.getAttribLocation(lineProgram, 'aPosition');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
  if (aPosition >= 0) {
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  }

  const uColor = gl.getUniformLocation(lineProgram, 'uColor');
  if (uColor) gl.uniform3fv(uColor, new Float32Array(color));

  const uMVP = gl.getUniformLocation(lineProgram, 'uMVP');
  if (uMVP) gl.uniformMatrix4fv(uMVP, false, getFullMVP(mesh));

  gl.drawArrays(gl.LINES, 0, lines.length / 3);
}

function drawPoints(mesh: Mesh, color: [number, number, number], size: number) {
  if (!gl) return;
  ensurePointProgram();
  if (!pointProgram) return;
  gl.useProgram(pointProgram);

  const flat: number[] = [];
  mesh.vertices.forEach(v => flat.push(v[0], v[1], v[2]));

  const aPosition = gl.getAttribLocation(pointProgram, 'aPosition');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flat), gl.STATIC_DRAW);
  if (aPosition >= 0) {
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  }

  const uColor = gl.getUniformLocation(pointProgram, 'uColor');
  if (uColor) gl.uniform3fv(uColor, new Float32Array(color));
  const uPointSize = gl.getUniformLocation(pointProgram, 'uPointSize');
  if (uPointSize) gl.uniform1f(uPointSize, size);

  const uMVP = gl.getUniformLocation(pointProgram, 'uMVP');
  if (uMVP) gl.uniformMatrix4fv(uMVP, false, getFullMVP(mesh));

  gl.drawArrays(gl.POINTS, 0, mesh.vertices.length);
}

// Compute world-space diagonal (after model + global transforms) and draw normals with given percent
function getWorldBBoxDiagonal(mesh: Mesh) {
  const bbox = computeBoundingBox(mesh);
  const [mx0, my0, mz0] = bbox.min;
  const [mx1, my1, mz1] = bbox.max;
  const corners = [
    [mx0,my0,mz0],[mx1,my0,mz0],[mx1,my1,mz0],[mx0,my1,mz0],[mx0,my0,mz1],[mx1,my0,mz1],[mx1,my1,mz1],[mx0,my1,mz1]
  ];
  const model = calculateModelMatrix(mesh);
  const tmp = vec4.create();
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  corners.forEach(c => {
    vec4.transformMat4(tmp, vec4.fromValues(c[0],c[1],c[2],1), model);
    const tx = tmp[0], ty = tmp[1], tz = tmp[2];
    minX = Math.min(minX, tx); minY = Math.min(minY, ty); minZ = Math.min(minZ, tz);
    maxX = Math.max(maxX, tx); maxY = Math.max(maxY, ty); maxZ = Math.max(maxZ, tz);
  });
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function drawNormals(mesh: Mesh, color: [number, number, number], percent: number) {
  if (!gl) return;
  ensureLineProgram();
  if (!lineProgram) return;
  gl.useProgram(lineProgram);

  // Ensure per-vertex normals
  if (!mesh.normals || mesh.normals.length === 0) computePerVertexNormals(mesh);

  const diagonal = getWorldBBoxDiagonal(mesh) || 1.0;
  const length = diagonal * percent;

  const lines: number[] = [];
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const n = mesh.normals && mesh.normals[i] ? mesh.normals[i] : [0,0,1];
    lines.push(v[0], v[1], v[2], v[0] + n[0]*length, v[1] + n[1]*length, v[2] + n[2]*length);
  }

  const aPosition = gl.getAttribLocation(lineProgram, 'aPosition');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
  if (aPosition >= 0) {
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  }

  const uColor = gl.getUniformLocation(lineProgram, 'uColor');
  if (uColor) gl.uniform3fv(uColor, new Float32Array(color));

  const uMVP = gl.getUniformLocation(lineProgram, 'uMVP');
  if (uMVP) gl.uniformMatrix4fv(uMVP, false, getFullMVP(mesh));

  gl.drawArrays(gl.LINES, 0, lines.length / 3);
}

export function drawBoundingBox(mesh: any, color: [number, number, number]) {
  console.log("Estoy en drawBoundingBox - mesh id:", mesh?.id, "color:", color);
  
  if (!gl || !renderProgram) {
    console.log("WebGL no está inicializado");
    return;
  }

  // Obtener bbox de forma optimizada
  const bbox = computeBoundingBox(mesh);
  let [minX, minY, minZ] = bbox.min;
  let [maxX, maxY, maxZ] = bbox.max;

  // Expandir ligeramente la caja
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ, 1e-6);
  const eps = maxDim * 0.002;
  
  // Crear vértices directamente sin arrays intermedios grandes
  const vertices = new Float32Array(72); // 12 aristas * 2 puntos * 3 componentes = 72
  
  // Ajustar coordenadas con epsilon
  minX -= eps; minY -= eps; minZ -= eps;
  maxX += eps; maxY += eps; maxZ += eps;
  
  // Llenar el array directamente (más eficiente)
  let idx = 0;
  
  // Aristas en Z mínimo
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  
  // Aristas en Z máximo
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  // Aristas verticales
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;

  // Crea el programa de líneas si no existe
  if (!lineProgram) {
    const lineVsSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
      }
    `;
    
    const lineFsSource = `
      precision mediump float;
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `;
    
    try {
      lineProgram = createProgram(lineVsSource, lineFsSource);
      console.log("Programa de líneas creado");
    } catch (error) {
      console.error("Error creando programa de líneas:", error);
      return;
    }
  }
  
  if (!lineProgram) {
    console.error("No se pudo crear el programa de líneas");
    return;
  }
  
  gl.useProgram(lineProgram);

  const aPosition = gl.getAttribLocation(lineProgram, "aPosition");
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  
  if (aPosition >= 0) {
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  }

  const uColor = gl.getUniformLocation(lineProgram, "uColor");
  if (uColor) {
    gl.uniform3fv(uColor, new Float32Array(color));
  }

  // Aplica las mismas transformaciones que se usan al renderizar
  const uMVP = gl.getUniformLocation(lineProgram, "uMVP");
  if (uMVP) {
    const mvp = getFullMVP(mesh); // Función auxiliar
    gl.uniformMatrix4fv(uMVP, false, mvp);
  }

  // Dibujar aristas como líneas
  gl.drawArrays(gl.LINES, 0, 24); // 12 aristas * 2 vértices = 24 vértices
  
  // Vuelve al programa de renderizado normal
  gl.useProgram(renderProgram);
}

// Función para calcular la bounding box global de todas las meshes
export function computeGlobalBoundingBox(meshes: Mesh[]) {
  if (meshes.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0]
    };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Para cada mesh, transformamos las 8 esquinas de su bbox usando la misma
  // matriz de modelo que se usa en el render (calculateModelMatrix).
  meshes.forEach(mesh => {
    const bbox = computeBoundingBox(mesh);
    const [mx0, my0, mz0] = bbox.min;
    const [mx1, my1, mz1] = bbox.max;

    const corners = [
      [mx0, my0, mz0], [mx1, my0, mz0], [mx1, my1, mz0], [mx0, my1, mz0],
      [mx0, my0, mz1], [mx1, my0, mz1], [mx1, my1, mz1], [mx0, my1, mz1]
    ];

    const model = calculateModelMatrix(mesh);
    const tmp = vec4.create();

    for (const c of corners) {
      vec4.transformMat4(tmp, vec4.fromValues(c[0], c[1], c[2], 1), model);
      const tx = tmp[0], ty = tmp[1], tz = tmp[2];
      minX = Math.min(minX, tx);
      minY = Math.min(minY, ty);
      minZ = Math.min(minZ, tz);
      maxX = Math.max(maxX, tx);
      maxY = Math.max(maxY, ty);
      maxZ = Math.max(maxZ, tz);
    }
  });

  if (minX === Infinity) {
    return {
      min: [0, 0, 0],
      max: [1, 1, 1]
    };
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ]
  };
}

// Función auxiliar para aplicar transformaciones a un punto
function applyMeshTransform(mesh: Mesh, point: [number, number, number]): [number, number, number] {
  let x = point[0];
  let y = point[1];
  let z = point[2];
  
  // Aplicar centro (si existe)
  if (mesh.center) {
    x -= mesh.center[0];
    y -= mesh.center[1];
    z -= mesh.center[2];
  }
  
  // Aplicar escala (si existe)
  if (mesh.scale) {
    if (typeof mesh.scale === 'number') {
      x *= mesh.scale;
      y *= mesh.scale;
      z *= mesh.scale;
    } else if (Array.isArray(mesh.scale) && mesh.scale.length === 3) {
      x *= mesh.scale[0];
      y *= mesh.scale[1];
      z *= mesh.scale[2];
    }
  }
  
  // Aplicar traslación (si existe)
  if (mesh.translate) {
    x += mesh.translate[0];
    y += mesh.translate[1];
    z += mesh.translate[2];
  }
  
  return [x, y, z];
}

// Función para dibujar bounding box global
export function drawGlobalBoundingBox(meshes: Mesh[], color: [number, number, number]) {
  console.log("Dibujando BBox Global para", meshes.length, "meshes");
  
  if (!gl || !renderProgram) {
    console.log("WebGL no está inicializado");
    return;
  }

  // Calcular bounding box global
  const bbox = computeGlobalBoundingBox(meshes);
  let [minX, minY, minZ] = bbox.min;
  let [maxX, maxY, maxZ] = bbox.max;

  // Expandir ligeramente la caja
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ, 1e-6);
  const eps = maxDim * 0.002;
  
  // Crear vértices
  const vertices = new Float32Array(72);
  
  // Ajustar coordenadas con epsilon
  minX -= eps; minY -= eps; minZ -= eps;
  maxX += eps; maxY += eps; maxZ += eps;
  
  // Llenar el array (mismo código que drawBoundingBox pero sin transformaciones)
  let idx = 0;
  
  // Aristas en Z mínimo
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  
  // Aristas en Z máximo
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  // Aristas verticales
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = minY; vertices[idx++] = maxZ;
  
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = maxX; vertices[idx++] = maxY; vertices[idx++] = maxZ;
  
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = minZ;
  vertices[idx++] = minX; vertices[idx++] = maxY; vertices[idx++] = maxZ;

  // Usar programa de líneas
  if (!lineProgram) {
    const lineVsSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
      }
    `;
    
    const lineFsSource = `
      precision mediump float;
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `;
    
    try {
      lineProgram = createProgram(lineVsSource, lineFsSource);
    } catch (error) {
      console.error("Error creando programa de líneas:", error);
      return;
    }
  }
  
  if (!lineProgram) return;
  
  gl.useProgram(lineProgram);

  const aPosition = gl.getAttribLocation(lineProgram, "aPosition");
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  
  if (aPosition >= 0) {
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  }

  const uColor = gl.getUniformLocation(lineProgram, "uColor");
  if (uColor) {
    gl.uniform3fv(uColor, new Float32Array(color));
  }

  // Matriz MVP que incluye la rotación global alrededor de globalCenter
  const uMVP = gl.getUniformLocation(lineProgram, "uMVP");
  if (uMVP) {
    const projection = mat4.create();
    mat4.perspective(projection, Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 100);

    const globalTransform = mat4.create();
    mat4.translate(globalTransform, globalTransform, globalCenter);
    const rotMat = mat4.create();
    mat4.fromQuat(rotMat, globalQuat);
    mat4.multiply(globalTransform, globalTransform, rotMat);
    mat4.translate(globalTransform, globalTransform, [-globalCenter[0], -globalCenter[1], -globalCenter[2]]);

    // View (usar cámara)
    const view = mat4.create();
    const eye = cameraPos;
    const center = vec3.create();
    vec3.set(center, cameraPos[0] + cameraFront[0], cameraPos[1] + cameraFront[1], cameraPos[2] + cameraFront[2]);
    const up = cameraUp;
    mat4.lookAt(view, eye as any, center as any, up as any);

    // MVP = projection * view * globalTransform * I
    const temp = mat4.create();
    mat4.multiply(temp, globalTransform, mat4.create());
    const tmp2 = mat4.create();
    mat4.multiply(tmp2, view, temp);
    const mvp = mat4.create();
    mat4.multiply(mvp, projection, tmp2);
    gl.uniformMatrix4fv(uMVP, false, mvp);
  }

  // Dibujar aristas
  gl.drawArrays(gl.LINES, 0, 24);
  
  // Volver al programa de renderizado normal
  gl.useProgram(renderProgram);
}

// Centrado del Objeto

// Función para calcular el centro y tamaño del bounding box global transformado
export function computeTransformedBoundingBox(meshes: Mesh[]): {
  center: [number, number, number];
  size: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
} {
  if (meshes.length === 0) {
    return {
      center: [0, 0, 0],
      size: [1, 1, 1],
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5]
    };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Transformar cada vértice de cada mesh con sus transformaciones actuales
  meshes.forEach(mesh => {
    const model = calculateModelMatrix(mesh);
    
    // Calcular bounding box local del mesh
    const localBBox = computeBoundingBox(mesh);
    const [lx0, ly0, lz0] = localBBox.min;
    const [lx1, ly1, lz1] = localBBox.max;
    
    // Esquinas de la bounding box local
    const corners = [
      [lx0, ly0, lz0], [lx1, ly0, lz0], [lx1, ly1, lz0], [lx0, ly1, lz0],
      [lx0, ly0, lz1], [lx1, ly0, lz1], [lx1, ly1, lz1], [lx0, ly1, lz1]
    ];
    
    // Transformar cada esquina y expandir la bbox global
    const tmp = vec4.create();
    for (const c of corners) {
      vec4.transformMat4(tmp, vec4.fromValues(c[0], c[1], c[2], 1), model);
      const tx = tmp[0], ty = tmp[1], tz = tmp[2];
      minX = Math.min(minX, tx);
      minY = Math.min(minY, ty);
      minZ = Math.min(minZ, tz);
      maxX = Math.max(maxX, tx);
      maxY = Math.max(maxY, ty);
      maxZ = Math.max(maxZ, tz);
    }
  });

  if (minX === Infinity) {
    return {
      center: [0, 0, 0],
      size: [1, 1, 1],
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5]
    };
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  ];
  
  const size: [number, number, number] = [
    maxX - minX,
    maxY - minY,
    maxZ - minZ
  ];

  return { center, size, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// Centrar Objeto

export function centerAndNormalizeObject(meshes: any[]): any[] {
  if (meshes.length === 0) return [];

  // 1. Calcular el Bounding Box global del objeto completo en su estado actual
  // computeTransformedBoundingBox ya considera las traslaciones y escalas individuales actuales
  const bbox = computeTransformedBoundingBox(meshes);
  
  // 2. Determinar el factor de escala para que la dimensión más grande del objeto sea 1.0
  const maxDim = Math.max(bbox.size[0], bbox.size[1], bbox.size[2]);
  const scaleFactor = maxDim > 0 ? 1.0 / maxDim : 1.0;
  
  // 3. Posición de destino solicitada
  const targetTranslate: [number, number, number] = [0, 0, -3];

  return meshes.map(mesh => {
    // Obtenemos la matriz de transformación actual de esta submalla (T * S * Centering)
    const modelMatrix = calculateModelMatrix(mesh);

    // Transformamos los vértices para consolidar su posición actual en la geometría
    const newVertices = mesh.vertices.map((v: number[]) => {
      // Pasamos el vértice de espacio local a espacio "mundo" (relativo al grupo)
      const worldV = vec3.transformMat4(vec3.create(), v as vec3, modelMatrix);
      
      // Lo centramos respecto al centro del grupo y aplicamos la escala de normalización
      return [
        (worldV[0] - bbox.center[0]) * scaleFactor,
        (worldV[1] - bbox.center[1]) * scaleFactor,
        (worldV[2] - bbox.center[2]) * scaleFactor
      ];
    });

    // Devolvemos la malla con los vértices normalizados y las propiedades reseteadas
    return {
      ...mesh,
      vertices: newVertices,
      translate: [...targetTranslate], // Ahora todas están en (0, 0, -3)
      scale: 1.0,                      // Ahora todas tienen escala 1.0
      center: [0, 0, 0]                // El centro local ahora es el origen
    };
  });
}

// Función para resetear rotaciones
export function resetView() {
  resetGlobalRotation();
  globalCenter = [0, 0, -3];
}

export function resetCameraToDefault() {
  setCamera([0, 0, 0], [0, 0, -1], [0, 1, 0]);
}