export interface OBJData {
  vertices: number[][];
  normals: number[][];
  faces: { v: number[]; n?: number[]; material?: string }[];
  mtllib?: string | null;
}

export interface Material { Kd: [number, number, number] }

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
        faces.push({ v: vIdx, material: currentMaterial });
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
      case "Kd":
        if (current) {
          materials[current].Kd = parts.slice(1).map(Number) as [number, number, number];
        }
        break;
    }
  }
  return materials;
}

export function assignMaterials(obj: OBJData, materials: Record<string, Material>) {
  const meshes: { vertices: number[][]; faces: number[][]; color: [number, number, number] }[] = [];

  const grouped = obj.faces.reduce((acc, face) => {
    const mat = face.material || "default";
    if (!acc[mat]) acc[mat] = [];
    acc[mat].push(face);
    return acc;
  }, {} as Record<string, any[]>);

  for (const mat in grouped) {
    meshes.push({
      vertices: obj.vertices,
      faces: grouped[mat].map(f => f.v),
      color: materials[mat]?.Kd || [0.7, 0.7, 0.7]
    });
  }
  return meshes;
}
