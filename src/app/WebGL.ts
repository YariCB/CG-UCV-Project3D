import { mat4 } from 'gl-matrix';

let gl: WebGLRenderingContext | null = null;

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
    throw new Error(gl!.getShaderInfoLog(shader)!);
  }
  return shader;
}

function createProgram(vsSource: string, fsSource: string): WebGLProgram {
  const vs = createShader(gl!.VERTEX_SHADER, vsSource);
  const fs = createShader(gl!.FRAGMENT_SHADER, fsSource);
  const program = gl!.createProgram()!;
  gl!.attachShader(program, vs);
  gl!.attachShader(program, fs);
  gl!.linkProgram(program);
  if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
    throw new Error(gl!.getProgramInfoLog(program)!);
  }
  return program;
}

// Vertex shader
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

// Fragment shader
const fsSource = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLightDir;
varying vec3 vNormal;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  gl_FragColor = vec4(uColor * diff, 1.0);
}
`;

let program: WebGLProgram | null = null;


// // GLSL mínimo: posición y color uniforme
// const vsSource = `
// attribute vec3 aPosition;
// void main() {
//   gl_Position = vec4(aPosition, 1.0);
// }
// `;

// const fsSource = `
// precision mediump float;
// uniform vec3 uColor;
// void main() {
//   gl_FragColor = vec4(uColor, 1.0);
// }
// `;

// let program: WebGLProgram | null = null;

export function setupShaders() {
  program = createProgram(vsSource, fsSource);
  gl!.useProgram(program);
}

export function drawMesh(mesh: { vertices: number[][]; faces: number[][]; color: [number, number, number] }) {
  if (!gl || !program) return;

  // Flatten vertices y normales
  const flatVerts: number[] = [];
  const flatNormals: number[] = [];
  mesh.faces.forEach(face => {
    face.v.forEach((vidx, i) => {
      flatVerts.push(...mesh.vertices[vidx]);
      if (face.n && face.n[i] !== undefined) {
        flatNormals.push(...mesh.normals[face.n[i]!]);
      } else {
        flatNormals.push(0, 0, 1); // fallback
      }
    });
  });

  // Buffer de posiciones
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatVerts), gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  // Buffer de normales
  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatNormals), gl.STATIC_DRAW);
  const aNormal = gl.getAttribLocation(program, "aNormal");
  gl.enableVertexAttribArray(aNormal);
  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

  // Color difuso
  const uColor = gl.getUniformLocation(program, "uColor");
  gl.uniform3fv(uColor, mesh.color);

  // Luz direccional
  const uLightDir = gl.getUniformLocation(program, "uLightDir");
  gl.uniform3fv(uLightDir, [0.0, 0.0, 1.0]); // luz desde +Z

  // Matriz MVP
  const model = mat4.create();
  if (mesh.center && mesh.scale) {
    mat4.translate(model, model, [0, 0, -3]); // mover atrás
    mat4.scale(model, model, [mesh.scale, mesh.scale, mesh.scale]);
    mat4.translate(model, model, [-mesh.center[0], -mesh.center[1], -mesh.center[2]]);
  }

  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 100);

  const mvp = mat4.create();
  mat4.multiply(mvp, projection, model);

  const uMVP = gl.getUniformLocation(program, "uMVP");
  gl.uniformMatrix4fv(uMVP, false, mvp);

  gl.drawArrays(gl.TRIANGLES, 0, flatVerts.length / 3);
}

// Activar o desactivar z-buffer
export function setDepthTest(enabled: boolean) {
  if (!gl) return;
  if (enabled) {
    gl.enable(gl.DEPTH_TEST);
  } else {
    gl.disable(gl.DEPTH_TEST);
  }
}

// Activar o desactivar back-face culling
export function setCulling(enabled: boolean) {
  if (!gl) return;
  if (enabled) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK); // elimina caras traseras
  } else {
    gl.disable(gl.CULL_FACE);
  }
}