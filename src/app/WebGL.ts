import { mat4 } from 'gl-matrix';
import { computeBoundingBox } from './lib/objLoader';

let gl: WebGLRenderingContext | null = null;
let renderProgram: WebGLProgram | null = null;
let pickingProgram: WebGLProgram | null = null;
let lineProgram: WebGLProgram | null = null;

export function initWebGL(canvas: HTMLCanvasElement): boolean {
  gl = canvas.getContext('webgl');
  if (!gl) {
    console.error('El navegador no soporta WebGL.');
    return false;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
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
varying vec3 vNormal;
void main() {
  gl_Position = uMVP * vec4(aPosition, 1.0);
  vNormal = aNormal;
}
`;

// Fragment shader de render (con iluminación)
const fsRender = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLightDir;
varying vec3 vNormal;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  gl_FragColor = vec4(uColor * diff, 1.0);
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
    const norms = face.n || [];
    if (verts.length < 3) return;

    if (verts.length === 3) {
      for (let i = 0; i < 3; i++) {
        const vidx = verts[i];
        flatVerts.push(...mesh.vertices[vidx]);
        if (norms[i] !== undefined && mesh.normals && mesh.normals[norms[i]!] ) {
          flatNormals.push(...mesh.normals[norms[i]!]!);
        } else {
          flatNormals.push(0, 0, 1);
        }
      }
    } else {
      for (let i = 1; i < verts.length - 1; i++) {
        const tri = [0, i, i + 1];
        for (const t of tri) {
          const vidx = verts[t];
          flatVerts.push(...mesh.vertices[vidx]);
          if (norms[t] !== undefined && mesh.normals && mesh.normals[norms[t]!] ) {
            flatNormals.push(...mesh.normals[norms[t]!]!);
          } else {
            flatNormals.push(0, 0, 1);
          }
        }
      }
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

function applyMVP(program: WebGLProgram, mesh: Mesh) {
  const model = mat4.create();
  if (mesh.center && mesh.scale) {
    mat4.translate(model, model, [0, 0, -3]);
    mat4.scale(model, model, [mesh.scale, mesh.scale, mesh.scale]);
    mat4.translate(model, model, [-mesh.center[0], -mesh.center[1], -mesh.center[2]]);
    if ((mesh as any).translate) {
      const t = (mesh as any).translate as [number, number, number];
      mat4.translate(model, model, t);
    }
  }
  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 4, gl!.canvas.width / gl!.canvas.height, 0.1, 100);
  const mvp = mat4.create();
  mat4.multiply(mvp, projection, model);

  const uMVP = gl!.getUniformLocation(program, "uMVP");
  gl!.uniformMatrix4fv(uMVP, false, mvp);
}

export function drawMesh(mesh: Mesh) {
  if (!gl || !renderProgram) return;

  gl.useProgram(renderProgram);
  const { vertexCount } = buildBuffers(mesh, renderProgram);

  // Color y luz
  const uColor = gl.getUniformLocation(renderProgram, "uColor");
  if (uColor) {
    const colorArr = new Float32Array(mesh.color as [number, number, number]);
    gl.uniform3fv(uColor, colorArr);
  }
  const uLightDir = gl.getUniformLocation(renderProgram, "uLightDir");
  if (uLightDir) {
    gl.uniform3fv(uLightDir, new Float32Array([0.0, 0.0, 1.0]));
  }

  applyMVP(renderProgram, mesh);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

export function redraw(meshes: Mesh[], bgColor: [number, number, number, number] = [0,0,0,0], selectedMeshId?: number | null, bboxColor?: [number, number, number]) {
  console.log("redraw llamado con:", { 
    meshesCount: meshes.length, 
    selectedMeshId, 
    bboxColor, 
    drawBoundingBox: selectedMeshId != null && bboxColor 
  });
  
  if (!gl || !renderProgram) {
    console.warn("WebGL no inicializado en redraw");
    return;
  }
  
  const canvas = gl.canvas as HTMLCanvasElement;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  meshes.forEach(m => {
    console.log("Dibujando malla id:", m.id);
    drawMesh(m);
  });

  if (selectedMeshId != null && bboxColor) {
    console.log("Intentando dibujar BBox para malla:", selectedMeshId);
    const mesh = meshes.find(m => m.id === selectedMeshId);
    if (mesh) {
      console.log("Malla encontrada para BBox:", mesh);
      drawBoundingBox(mesh, bboxColor);
    } else {
      console.warn("Malla no encontrada para BBox:", selectedMeshId);
    }
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
  gl.viewport(0, 0, canvas.width, canvas.height);
  // Fondo negro sólido para el picking
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  meshes.forEach(m => drawMeshPicking(m));
}

// Renderiza pasada de picking, lee el pixel y luego RESTAURA la escena normal
export function pickAt(x: number, y: number, canvas: HTMLCanvasElement, meshes: Mesh[], bgColor: [number, number, number, number] = [0,0,0,0]): number | null {
  if (!gl) return null;

  // Pasada de picking
  renderForPicking(meshes);

  // Leer pixel
  const pixel = new Uint8Array(4);
  gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const id = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
  const result = id === 0 ? null : id;

  // Restaurar escena normal
  redraw(meshes, bgColor);

  return result;
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

  // Aplica las transformaciones
  const uMVP = gl.getUniformLocation(lineProgram, "uMVP");
  if (uMVP) {
    const model = mat4.create();
    if (mesh.center && mesh.scale) {
      mat4.translate(model, model, [0, 0, -3]);
      mat4.scale(model, model, [mesh.scale, mesh.scale, mesh.scale]);
      mat4.translate(model, model, [-mesh.center[0], -mesh.center[1], -mesh.center[2]]);
      if (mesh.translate) {
        const t = mesh.translate as [number, number, number];
        mat4.translate(model, model, t);
      }
    }
    const projection = mat4.create();
    mat4.perspective(projection, Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 100);
    const mvp = mat4.create();
    mat4.multiply(mvp, projection, model);
    gl.uniformMatrix4fv(uMVP, false, mvp);
  }

  // Dibujar aristas como líneas
  gl.drawArrays(gl.LINES, 0, 24); // 12 aristas * 2 vértices = 24 vértices
  
  // Vuelve al programa de renderizado normal
  gl.useProgram(renderProgram);
}