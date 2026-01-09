let gl: WebGLRenderingContext | null = null;

export function initWebGL(canvas: HTMLCanvasElement): boolean {
  gl = canvas.getContext('webgl');
  if (!gl) {
    console.error('El navegador no soporta WebGL.');
    return false;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.DEPTH_TEST);
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

// GLSL mínimo: posición y color uniforme
const vsSource = `
attribute vec3 aPosition;
void main() {
  gl_Position = vec4(aPosition, 1.0);
}
`;

const fsSource = `
precision mediump float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`;

let program: WebGLProgram | null = null;

export function setupShaders() {
  program = createProgram(vsSource, fsSource);
  gl!.useProgram(program);
}

export function drawMesh(mesh: { vertices: number[][]; faces: number[][]; color: [number, number, number] }) {
  if (!gl || !program) return;

  // Flatten vertices
  const flatVerts = mesh.faces.flat().map(idx => mesh.vertices[idx]).flat();
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatVerts), gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  const uColor = gl.getUniformLocation(program, "uColor");
  gl.uniform3fv(uColor, mesh.color);

  gl.drawArrays(gl.TRIANGLES, 0, flatVerts.length / 3);
}