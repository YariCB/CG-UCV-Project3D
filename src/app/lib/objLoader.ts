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
export function computeBoundingBox(mesh: { vertices: number[][]; faces: { v: number[] }[] }) {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  mesh.faces.forEach(face => {
    face.v.forEach(idx => {
      const v = mesh.vertices[idx];
      xs.push(v[0]); ys.push(v[1]); zs.push(v[2]);
    });
  });
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)]
  };
}