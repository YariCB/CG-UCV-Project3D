export interface OBJData {
  vertices: number[][];
  normals: number[][];
  faces: { v: number[]; n?: number[]; material?: string }[];
  mtllib?: string | null;
}

export interface Material {
  Kd: [number, number, number];   // Diffuse color (se usa en render)
  Ka?: [number, number, number];  // Ambient color (solo lectura)
  Ks?: [number, number, number];  // Specular color (solo lectura)
  Ke?: [number, number, number];  // Emissive color (solo lectura)
  Ns?: number;                    // Shininess
  d?: number;                     // Transparency (alpha)
  illum?: number;                 // Illumination model
  Ni?: number;                    // Optical density
}

export function parseOBJ(text: string): OBJData {
  const lines = text.split("\n");
  const vertices: number[][] = [];
  const normals: number[][] = [];
  const faces: any[] = [];
  let currentMaterial: string | undefined;
  let mtllib: string | null = null;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) continue;
    switch (parts[0]) {
      case "v":
        vertices.push(parts.slice(1).map(Number));
        break;
      case "vn":
        normals.push(parts.slice(1).map(Number));
        break;
      case "f":
        const vIdx = parts.slice(1).map(p => parseInt(p.split("/")[0]) - 1);
        const nIdx = parts.slice(1).map(p => {
          const comps = p.split("/");
          return comps[2] ? parseInt(comps[2]) - 1 : undefined;
        });
        faces.push({ v: vIdx, n: nIdx, material: currentMaterial });
        break;
      case "usemtl":
        currentMaterial = parts[1];
        break;
      case "mtllib":
        mtllib = parts.slice(1).join(' ');
        break;
    }
  }
  return { vertices, normals, faces, mtllib };
}

export function parseMTL(text: string): Record<string, Material> {
  const lines = text.split("\n");
  const materials: Record<string, Material> = {};
  let current: string | null = null;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) continue;
    switch (parts[0]) {
      case "newmtl":
        current = parts[1];
        materials[current] = { Kd: [0.7, 0.7, 0.7] };
        break;
      case "Ka":
        if (current) {
          materials[current].Ka = parts.slice(1).map(Number) as [number, number, number];
        }
        break;
      case "Kd":
        if (current) {
          materials[current].Kd = parts.slice(1).map(Number) as [number, number, number];
        }
        break;
      case "Ks":
        if (current) {
          materials[current].Ks = parts.slice(1).map(Number) as [number, number, number];
        }
        break;
      case "Ke":
        if (current) {
          materials[current].Ke = parts.slice(1).map(Number) as [number, number, number];
        }
        break;
      case "Ns":
        if (current) {
          materials[current].Ns = parseFloat(parts[1]);
        }
        break;
      case "d":
        if (current) {
          materials[current].d = parseFloat(parts[1]);
        }
        break;
      case "illum":
        if (current) {
          materials[current].illum = parseInt(parts[1]);
        }
        break;
      case "Ni":
        if (current) {
          materials[current].Ni = parseFloat(parts[1]);
        }
        break;
    }
  }
  return materials;
}

export function assignMaterials(obj: OBJData, materials: Record<string, Material>) {
  const meshes: { id: number; vertices: number[][]; normals: number[][]; faces: { v: number[]; n?: number[] }[]; color: [number, number, number] }[] = [];
  let counter = 1;

  const grouped = obj.faces.reduce((acc, face) => {
    const mat = face.material || "default";
    if (!acc[mat]) acc[mat] = [];
    acc[mat].push(face);
    return acc;
  }, {} as Record<string, { v: number[]; n?: number[]; material?: string }[]>);

  for (const mat in grouped) {
    meshes.push({
      id: counter++,
      vertices: obj.vertices,
      normals: obj.normals,
      faces: grouped[mat],
      color: materials[mat]?.Kd || [0.7, 0.7, 0.7]
    });
  }
  return meshes;
}

// Normalización del modelo OBJ para centrarlo y escalarlo
export function normalizeOBJ(obj: OBJData) {
  const xs = obj.vertices.map(v => v[0]);
  const ys = obj.vertices.map(v => v[1]);
  const zs = obj.vertices.map(v => v[2]);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);

  const scale = 2.0 / maxSize; // Escala para que quepa en [-1,1]

  return { center, scale };
}

// Cálculo de bounding box
// En objLoader.ts, modifica la función computeBoundingBox:

export function computeBoundingBox(mesh: { vertices: number[][]; faces: { v: number[] }[] }) {
  // Verificar si el mesh es válido
  if (!mesh || !mesh.vertices || !mesh.faces || mesh.faces.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0]
    };
  }

  // Inicializar con valores extremos
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  // Usar un Set para evitar procesar el mismo vértice múltiples veces
  const processedVertices = new Set<number>();
  
  // Iterar sobre un número limitado de caras para evitar overflow
  // Para modelos muy grandes, muestreamos las caras
  const sampleSize = Math.min(mesh.faces.length, 10000); // Limitar a 10,000 caras
  
  for (let i = 0; i < sampleSize; i++) {
    const face = mesh.faces[i];
    if (!face || !face.v) continue;
    
    for (const idx of face.v) {
      // Evitar procesar el mismo vértice múltiples veces
      if (processedVertices.has(idx)) continue;
      processedVertices.add(idx);
      
      const v = mesh.vertices[idx];
      if (!v || v.length < 3) continue;
      
      const [x, y, z] = v;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    
    // Salir temprano si ya hemos procesado suficientes vértices
    if (processedVertices.size > 5000) break;
  }
  
  // Si no encontramos vértices válidos, usar valores por defecto
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