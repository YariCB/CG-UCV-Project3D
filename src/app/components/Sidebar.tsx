import React, { useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import '../../styles/Sidebar.css';
import ColorWheel from './ColorWheel';
import ConfirmationModal from './ConfirmationModal';
import {
  parseOBJ,
  parseMTL, 
  assignMaterials, 
  normalizeOBJ, 
  Material
} from '../lib/objLoader';
import {
  setDepthTest,
  setCulling,
  undoGlobalRotation, 
  resetGlobalRotation,
  getGlobalRotationDegrees,
  setGlobalRotationDegrees,
  centerAndNormalizeObject,
  resetView
} from '../WebGL';

interface SidebarProps { 
  bgColor: string; 
  setBgColor: (c: string) => void; 
  meshes: any[];
  setMeshes: React.Dispatch<React.SetStateAction<any[]>>; 
  activeSettings: any; 
  setActiveSettings: React.Dispatch<React.SetStateAction<any>>
  selectedMeshId: number | null;
  setSelectedMeshId?: (id: number | null) => void;
  bboxLocalColor: string;
  setBboxLocalColor: React.Dispatch<React.SetStateAction<string>>;
  bboxGlobalColor: string;
  setBboxGlobalColor: React.Dispatch<React.SetStateAction<string>>;
}

const Sidebar: React.FC<SidebarProps> = ({
  bgColor,
  setBgColor,
  meshes,
  setMeshes,
  activeSettings,
  setActiveSettings,
  selectedMeshId,
  setSelectedMeshId,
  bboxLocalColor,
  setBboxLocalColor,
  bboxGlobalColor,
  setBboxGlobalColor,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para el modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => () => {});
  
  // Estados para la selección (se sincroniza con prop `selectedMeshId`)
  const [hasSelection, setHasSelection] = useState(false); 
  const [normalsColor, setNormalsColor] = useState<string>('rgba(0,255,0,1)');
  const [kdColor, setKdColor] = useState<string>('rgba(161,145,255,1)');
  
  // Estados para inputs de traslación
  // Local: traslación de la sub-malla seleccionada
  const [translateLocalX, setTranslateLocalX] = useState<string>('0');
  const [translateLocalY, setTranslateLocalY] = useState<string>('0');
  const [translateLocalZ, setTranslateLocalZ] = useState<string>('0');

  // Global: traslación del objeto completo
  const [translateGlobalX, setTranslateGlobalX] = useState<string>('0');
  const [translateGlobalY, setTranslateGlobalY] = useState<string>('0');
  const [translateGlobalZ, setTranslateGlobalZ] = useState<string>('0');

  // Estados para inputs de escala
  const [scaleX, setScaleX] = useState<string>('1');
  const [scaleY, setScaleY] = useState<string>('1');
  const [scaleZ, setScaleZ] = useState<string>('1');

  // Estados para inputs de rotación
  const [rotateX, setRotateX] = useState<string>('0');
  const [rotateY, setRotateY] = useState<string>('0');
  const [rotateZ, setRotateZ] = useState<string>('0');

  const [openPicker, setOpenPicker] = useState<null | 'bg' | 'vertex' | 'wireframe' | 'normals' | 'bboxGlobal' | 'kd' | 'bboxLocal'>(null);
  // Set of portal containers (to detect clicks inside portals)
  const portalContainersRef = useRef<Set<HTMLElement>>(new Set());
  // Refs for preview anchors
  const previewBgRef = useRef<HTMLElement | null>(null);
  const previewVertexRef = useRef<HTMLElement | null>(null);
  const previewWireframeRef = useRef<HTMLElement | null>(null);
  const previewNormalsRef = useRef<HTMLElement | null>(null);
  const previewBBoxGlobalRef = useRef<HTMLElement | null>(null);
  const previewKdRef = useRef<HTMLElement | null>(null);
  const previewBBoxLocalRef = useRef<HTMLElement | null>(null);

  // PortalTooltip: render children into body and position relative to anchorRef
  const PortalTooltip: React.FC<{
    anchorRef: React.RefObject<HTMLElement>;
    className?: string;
    preferUp?: boolean;
    children: React.ReactNode;
  }> = ({ anchorRef, className, children, preferUp = false }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    if (containerRef.current === null) containerRef.current = document.createElement('div');

    useEffect(() => {
      const container = containerRef.current!;
      container.className = className || 'color-tooltip';
      container.style.position = 'absolute';
      container.style.zIndex = '2147483647';
      document.body.appendChild(container);
      portalContainersRef.current.add(container);
      return () => {
        portalContainersRef.current.delete(container);
        try { document.body.removeChild(container); } catch (e) {}
      };
    }, [className]);

    // Positioning
    useEffect(() => {
      const container = containerRef.current!;
      function update() {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const aRect = anchor.getBoundingClientRect();
        // measure content size
        const childRect = container.firstElementChild ? (container.firstElementChild as HTMLElement).getBoundingClientRect() : { width: 200, height: 220 };
        const tooltipW = childRect.width || 200;
        const tooltipH = childRect.height || 220;

        const spaceBelow = window.innerHeight - aRect.bottom;
        const offset = 6;
        let top: number;
        if (!preferUp && spaceBelow > tooltipH + 12) {
          top = aRect.bottom + offset + window.scrollY;
        } else {
          // place above
          top = aRect.top - tooltipH - offset + window.scrollY;
          if (top < 0) top = aRect.bottom + offset + window.scrollY; // fallback
        }
        let left = aRect.left + window.scrollX;
        // keep within viewport horizontally
        if (left + tooltipW > window.innerWidth) left = Math.max(8, window.innerWidth - tooltipW - 8);

        container.style.top = `${top}px`;
        container.style.left = `${left}px`;
      }
      // initial update after paint
      const raf = requestAnimationFrame(update);
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    }, [anchorRef, preferUp]);

    return ReactDOM.createPortal(
      <div>{children}</div>,
      containerRef.current!
    );
  };

  useEffect(() => {
    function onGlobalMouseDown(e: MouseEvent) {
      if (!openPicker) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const clickedInsidePortal = Array.from(portalContainersRef.current)
        .some(container => container.contains(target));
      if (clickedInsidePortal) return;

      const clickedPreviewButton = !!target.closest('.color-preview-button');
      if (clickedPreviewButton) return;

      const sidebarContent = document.querySelector('.sidebar-content');
      const clickedInsideSidebar = !!(sidebarContent && sidebarContent.contains(target));

      const clickedInsideInteractive =
        !!target.closest('.input-row') ||
        !!target.closest('.tool-group') ||
        !!target.closest('.dynamic-visualization-controls');

      const isSidebarBackgroundClick = clickedInsideSidebar && !clickedInsideInteractive;

      const isMainCanvasClick =
        target.tagName === 'CANVAS' ||
        !!target.closest('#gl-canvas') ||
        !!target.closest('.webgl-canvas');

      if (isSidebarBackgroundClick || isMainCanvasClick) {
        setOpenPicker(null);
      }
    }

    document.addEventListener('mousedown', onGlobalMouseDown, true);
    return () => document.removeEventListener('mousedown', onGlobalMouseDown, true);
  }, [openPicker]);

  const buttonLabels: Record<string, string> = {
    fps: 'Mostrar FPS',
    aa: 'Anti Aliasing',
    zBuffer: 'Z-Buffer',
    culling: 'Back-face Culling',
    vertex: 'Mostrar Vértices',
    normals: 'Mostrar Normales',
    bbox: 'Bounding Box Global',
    center: 'Centrar Objeto'
  };
  const wireframeLabel = activeSettings.wireframe ? 'Wireframe' : 'Relleno';

  // Centrar objeto

  const handleCenterObject = () => {
    if (meshes.length === 0) return;
    
    // 1. Resetear rotaciones
    resetView();
    setRotateX('0');
    setRotateY('0');
    setRotateZ('0');
    
    // 2. Poner TODAS las submallas en EXACTAMENTE la misma posición (0,0,-3)
    const centeredMeshes = meshes.map(mesh => ({
      ...mesh,
      translate: [0, 0, -3] as [number, number, number], // ¡TODAS IGUALES!
      scale: 1,
      center: [0, 0, 0] as [number, number, number],
    }));
    
    setMeshes(centeredMeshes);
    
    // 3. Resetear todos los inputs
    setTranslateGlobalX('0');
    setTranslateGlobalY('0');
    setTranslateGlobalZ('-3');
    setScaleX('1');
    setScaleY('1');
    setScaleZ('1');
    setTranslateLocalX('0');
    setTranslateLocalY('0');
    setTranslateLocalZ('0');
    
    // 4. Deseleccionar
    if (setSelectedMeshId) setSelectedMeshId(null);
    
    // 5. Desactivar BBox
    setActiveSettings((prev: any) => ({ 
      ...prev, 
      bboxlocal: false,
      bbox: false 
    }));
  };

  // Sincronizar selectedMeshId -> mostrar color actual
  const prevSelectedMeshIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedMeshId === null) {
      setHasSelection(false);
      prevSelectedMeshIdRef.current = null;
      return;
    }
    
    // Solo si el ID cambió realmente
    if (selectedMeshId !== prevSelectedMeshIdRef.current) {
      prevSelectedMeshIdRef.current = selectedMeshId;
      setHasSelection(true);
      const mesh = meshes.find(m => m.id === selectedMeshId);
      if (mesh && mesh.color) {
        const r = Math.round((mesh.color[0] || 0) * 255);
        const g = Math.round((mesh.color[1] || 0) * 255);
        const b = Math.round((mesh.color[2] || 0) * 255);
        setKdColor(`rgba(${r},${g},${b},1)`);
      }
      // Solo activar bboxlocal si no está ya activo (evita toggle forzado)
      setActiveSettings((prev: any) => ({ ...prev, bboxlocal: true }));

      // Desactivar BBox global cuando se selecciona una submalla
      setActiveSettings((prev: any) => ({ ...prev, bbox: false }));
    }
    
    // sync translate inputs for the selected sub-mesh (local translation)
    const mesh2 = meshes.find(m => m.id === selectedMeshId);
    if (mesh2 && mesh2.translate) {
      setTranslateLocalX(String(mesh2.translate[0] || 0));
      setTranslateLocalY(String(mesh2.translate[1] || 0));
      setTranslateLocalZ(String(mesh2.translate[2] || 0));
    } else {
      setTranslateLocalX('0'); setTranslateLocalY('0'); setTranslateLocalZ('0');
    }

    // sync scale inputs
    if (mesh2 && mesh2.scale) {
      // Si scale es un número (escala uniforme)
      if (typeof mesh2.scale === 'number') {
        setScaleX(String(mesh2.scale));
        setScaleY(String(mesh2.scale));
        setScaleZ(String(mesh2.scale));
      } 
      // Si scale es un array [x, y, z] (escala no uniforme)
      else if (Array.isArray(mesh2.scale) && mesh2.scale.length === 3) {
        setScaleX(String(mesh2.scale[0]));
        setScaleY(String(mesh2.scale[1]));
        setScaleZ(String(mesh2.scale[2]));
      }
    } else {
      setScaleX('1'); setScaleY('1'); setScaleZ('1');
    }
  }, [selectedMeshId, meshes]);

  // Mantener los inputs globales sincronizados con las mallas (usar la primera malla como referencia)
  useEffect(() => {
    if (!meshes || meshes.length === 0) {
      setTranslateGlobalX('0'); setTranslateGlobalY('0'); setTranslateGlobalZ('0');
      return;
    }
    const t = meshes[0].translate || [0, 0, 0];
    setTranslateGlobalX(String(t[0] || 0));
    setTranslateGlobalY(String(t[1] || 0));
    setTranslateGlobalZ(String(t[2] || 0));
  }, [meshes]);

  // Sincronizar inputs de rotación global desde el quaternion en WebGL
  useEffect(() => {
    try {
      const [gx, gy, gz] = getGlobalRotationDegrees();
      setRotateX(String(normalizeAngle(Math.round(gx))));
      setRotateY(String(normalizeAngle(Math.round(gy))));
      setRotateZ(String(normalizeAngle(Math.round(gz))));
    } catch (err) {
      // no bloquear si algo falla
    }
  }, [meshes]);

  const toggleSetting = (key: string) => {
    setActiveSettings((prev: any) => {
      const newState = { ...prev, [key]: !prev[key] };

      // BBox global y local mutuamente excluyentes
      if (key === 'bbox' && newState.bbox) {
        newState.bboxlocal = false;
      } else if (key === 'bboxlocal' && newState.bboxlocal) {
        newState.bbox = false;
      }

      if (key === 'zBuffer') {
        setDepthTest(newState.zBuffer);
        setMeshes(prev => [...prev]);
      }
      if (key === 'culling') {
        setCulling(newState.culling);
        setMeshes(prev => [...prev]);
      }

      return newState;
    });
  };

  const openGitHub = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://github.com/YariCB/CG-UCV-Project3D";
    try {
      nw.Shell.openExternal(url);
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  // Helpers
  function parseRgba(colorString: string) {
    const m = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 1 };
    return {
      r: parseInt(m[1]),
      g: parseInt(m[2]),
      b: parseInt(m[3]),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1
    };
  }

  function rgbaStringToNormalizedArray(colorString: string): [number, number, number] {
    const p = parseRgba(colorString);
    return [p.r / 255, p.g / 255, p.b / 255];
  }

  function hexToRgba(hex: string) {
    if (!hex) return 'rgba(0,0,0,1)';
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},1)`;
  }

  // Carga del objeto 3D
  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const objFile = Array.from(files).find(f => f.name.endsWith(".obj"));
    if (!objFile) {
      setModalTitle('Error de carga');
      setModalMessage('Debe seleccionar un archivo OBJ.');
      setModalOnConfirm(() => () => setModalOpen(false));
      setModalOpen(true);
      return;
    }

    const objText = await objFile.text();
    const objData = parseOBJ(objText);

    // Buscar MTL: preferir el mtllib indicado en el OBJ, si existe; intentar emparejar por nombre/base
    let materials: Record<string, Material> = {};
    const fileArray = Array.from(files);
    let mtlFile: File | undefined;

    if (objData.mtllib) {
      // mtllib puede contener rutas, tomar sólo el basename y buscar coincidencias
      const libName = objData.mtllib.split(/[/\\]/).pop();
      if (libName) {
        mtlFile = fileArray.find(f => f.name === libName || f.name.endsWith(libName));
      }
    }

    // si no se encontró aún, intentar buscar un .mtl con mismo nombre que el OBJ
    if (!mtlFile) {
      const guessed = objFile.name.replace(/\.obj$/i, '.mtl');
      mtlFile = fileArray.find(f => f.name === guessed || f.name.endsWith(guessed));
    }

    // fallback: si hay algún .mtl en la lista, tomar el primero
    if (!mtlFile) {
      mtlFile = fileArray.find(f => f.name.toLowerCase().endsWith('.mtl'));
    }

    if (mtlFile) {
      try {
        const mtlText = await mtlFile.text();
        materials = parseMTL(mtlText);
      } catch (err) {
        console.warn('Error leyendo MTL:', err);
        setModalTitle('Error leyendo MTL');
        setModalMessage('Error leyendo archivo MTL. Se asignará color gris por defecto.');
        setModalOnConfirm(() => () => setModalOpen(false));
        setModalOpen(true);
        materials['default'] = { Kd: [0.7, 0.7, 0.7] };
      }
    } else {
      setModalTitle('MTL no encontrado');
      setModalMessage('No se encontró archivo MTL. Se asignará color gris por defecto.');
      setModalOnConfirm(() => () => setModalOpen(false));
      setModalOpen(true);
      materials['default'] = { Kd: [0.7, 0.7, 0.7] };
    }

    // Normalizar ANTES de asignar materiales
    const { center, scale } = normalizeOBJ(objData);
    
    console.log("Normalización calculada:", { center, scale });

    // Aplicar normalización a los vértices
    const normalizedVertices = objData.vertices.map(vertex => {
      // Centrar y escalar
      const x = (vertex[0] - center[0]) * scale;
      const y = (vertex[1] - center[1]) * scale;
      const z = (vertex[2] - center[2]) * scale;
      return [x, y, z];
    });

    // Crear objeto normalizado
    const normalizedObjData = {
      ...objData,
      vertices: normalizedVertices
    };

    // Asignar materiales usando los vértices normalizados
    const meshes = assignMaterials(normalizedObjData, materials);
    
    // Configurar posición inicial en (0, 0, -3)
    const positionedMeshes = meshes.map(m => ({
      ...m,
      center: [0, 0, 0] as [number, number, number],
      scale: 1,
      translate: [0, 0, -3] as [number, number, number] // Posición inicial
    }));

    console.log("Meshes después de normalizar:", positionedMeshes);

    // Ensure depth test and culling are enabled by default on import
    setActiveSettings((prev: any) => ({ ...prev, zBuffer: true, culling: true }));
    setDepthTest(true);
    setCulling(true);
    setMeshes(positionedMeshes);
    // ensure bbox local visible when importing selection defaults
    setActiveSettings((prev:any) => ({ ...prev, bboxlocal: true }));
  };

  // RGB Inputs component (no alpha)
  interface RgbInputsProps { color: string; onColorChange: (c: string) => void }
  const RgbInputs: React.FC<RgbInputsProps> = ({ color, onColorChange }) => {
    const [inputs, setInputs] = useState<{ r: string; g: string; b: string }>({ r: '0', g: '0', b: '0' });

    useEffect(() => {
      const p = parseRgba(color);
      setInputs({ r: p.r.toString(), g: p.g.toString(), b: p.b.toString() });
    }, [color]);

    const handleChange = (comp: 'r' | 'g' | 'b', value: string) => {
      setInputs(prev => ({ ...prev, [comp]: value }));
      if (value === '') return;
      let num = parseFloat(value);
      if (isNaN(num)) return;
      num = Math.min(255, Math.max(0, num));
      const p = parseRgba(color);
      const newR = comp === 'r' ? num : p.r;
      const newG = comp === 'g' ? num : p.g;
      const newB = comp === 'b' ? num : p.b;
      onColorChange(`rgba(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)}, ${p.a})`);
    };

    return (
      <div className="rgb-inputs">
        <div className="rgba-input-item">
          <label>R</label>
          <input className="color-component-input" type="number" min={0} max={255} value={inputs.r} onChange={e => handleChange('r', e.target.value)} />
        </div>
        <div className="rgba-input-item">
          <label>G</label>
          <input className="color-component-input" type="number" min={0} max={255} value={inputs.g} onChange={e => handleChange('g', e.target.value)} />
        </div>
        <div className="rgba-input-item">
          <label>B</label>
          <input className="color-component-input" type="number" min={0} max={255} value={inputs.b} onChange={e => handleChange('b', e.target.value)} />
        </div>
      </div>
    );
  };

  // Función para que cualquier ángulo (ej: -10 o 370) se muestre siempre entre 0 y 360
  const normalizeAngle = (angle: number) => {
    return ((angle % 360) + 360) % 360;
  };

  // Manejador para usar las flechas del teclado (Arriba/Abajo)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentValue: string,
    setter: (v: string) => void,
    onUpdate: (num: number) => void
  ) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1; // Si presionas Shift, aumenta/disminuye de 10 en 10
      const currentNum = parseFloat(currentValue) || 0;
      const nextNum = e.key === 'ArrowUp' ? currentNum + step : currentNum - step;
      
      // Aplicamos el cambio
      setter(nextNum.toString());
      onUpdate(nextNum);
    }
  };

  return (
    <>
    <aside className="sidebar-container">
      <div className="sidebar-content">
        {/* SECCIÓN 1: ARCHIVO */}
        <div className="sidebar-section">
          <div className="file-ops-group">
            <button
              className="sidebar-button archive-btn"
              onClick={() => {
                setModalTitle('Cargar archivo 3D');
                setModalMessage('Para cargar el objeto 3D debe seleccionar tanto el archivo .obj como el archivo .mtl en el explorador.');
                setModalOnConfirm(() => () => fileInputRef.current?.click());
                setModalOpen(true);
              }}
            >
              Archivo
            </button>
            <button className="sidebar-button save-btn" title="Guardar Escena">
              <ion-icon name="save-sharp"></ion-icon>
            </button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden-file-input" multiple accept=".obj,.mtl" onChange={e => handleFileUpload(e.target.files)} />
        </div>

        <div className="sidebar-separator" />

        {/* SECCIÓN 2: ESCENA (Renderizado global) */}
        <div className="sidebar-section">
          <h3 className="section-title">Configuración de Escena</h3>
          <div className="tool-group">
            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.fps ? 'active' : ''}`} 
                title="Mostrar FPS"
                onClick={() => toggleSetting('fps')}
              >
                <ion-icon name="speedometer-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.fps}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.aa ? 'active' : ''}`} 
                title="Antialiasing"
                onClick={() => toggleSetting('aa')}
              >
                <span className="aa-label">AA</span>
              </button>
              <span className="tool-button-label">{buttonLabels.aa}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.zBuffer ? 'active' : ''}`} 
                title="Z-Buffer (Depth Test)"
                onClick={() => toggleSetting('zBuffer')}
              >
                <ion-icon name="layers-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.zBuffer}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.culling ? 'active' : ''}`} 
                title="Back-face Culling"
                onClick={() => toggleSetting('culling')}
              >
                <ion-icon name="albums-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.culling}</span>
            </div>
          </div>
          
          <div className="input-row">
            <label>Fondo</label>
              <div className="color-picker-relative-container">
              <div className="preview-group" ref={previewBgRef as any}>
                <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'bg' ? null : 'bg')}>
                  <div className="color-swatch" style={{background: bgColor}} />
                </button>
                {openPicker === 'bg' && (
                  <PortalTooltip anchorRef={previewBgRef as any}>
                    <div>
                      <ColorWheel currentColor={bgColor} size={140} onColorSelect={(c) => setBgColor(c)} />
                      <RgbInputs color={bgColor} onColorChange={(c) => setBgColor(c)} />
                    </div>
                  </PortalTooltip>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-separator" />

        {/* SECCIÓN 3: VISUALIZACIÓN */}
        <div className="sidebar-section">
          <h3 className="section-title">Visualización</h3>
          <div className="tool-group">

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.vertex ? 'active' : ''}`} 
                title = {buttonLabels.vertex}
                onClick={() => toggleSetting('vertex')}
              >
                <ion-icon name="git-commit-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.vertex}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.wireframe ? 'active' : ''}`} 
                title = {wireframeLabel}
                onClick={() => toggleSetting('wireframe')}
              >
                <ion-icon name={activeSettings.wireframe ? "grid-outline" : "square-sharp"}></ion-icon>
              </button>
              <span className="tool-button-label">{wireframeLabel}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.normals ? 'active' : ''}`} 
                title = {buttonLabels.normals}
                onClick={() => toggleSetting('normals')}
              >
                <ion-icon name="logo-apple-ar"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.normals}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className="sidebar-button center-btn" 
                title= {buttonLabels.center}
                onClick={handleCenterObject}
              >
                <ion-icon name="contract-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.center}</span>
            </div>

            <div className="tool-button-wrapper">
              <button 
                className={`sidebar-button ${activeSettings.bbox ? 'active' : ''}`} 
                title = {buttonLabels.bbox}
                onClick={() => toggleSetting('bbox')}
              >
                <ion-icon name="cube-outline"></ion-icon>
              </button>
              <span className="tool-button-label">{buttonLabels.bbox}</span>
            </div>
          </div>

          {/* Controles dinámicos según lo activado */}
          {(activeSettings.vertex || activeSettings.wireframe || activeSettings.normals || activeSettings.bbox) && (
          <div className="dynamic-visualization-controls">
            {activeSettings.vertex && (
              <>
              <div className="input-row">
                <label>Color de Vértices</label>
                <div className="color-picker-relative-container">
                  <div className="preview-group" ref={previewVertexRef as any}>
                    <button 
                      className="color-preview-button sidebar-button" 
                      onClick={() => setOpenPicker(openPicker === 'vertex' ? null : 'vertex')}
                    >
                      <div className="color-swatch" style={{background: activeSettings.vertexColor}} />
                    </button>
                    {openPicker === 'vertex' && (
                      <PortalTooltip anchorRef={previewVertexRef as any}>
                        <div>
                          <ColorWheel currentColor={activeSettings.vertexColor} size={140} 
                            onColorSelect={(c) => setActiveSettings(prev => ({ ...prev, vertexColor: c }))} />
                          <RgbInputs color={activeSettings.vertexColor} 
                            onColorChange={(c) => setActiveSettings(prev => ({ ...prev, vertexColor: c }))} />
                        </div>
                      </PortalTooltip>
                    )}
                  </div>
                </div>
              </div>
              <div className="input-row slider-row-adjustment">
                <label>Tamaño de Vértices</label>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min={1} 
                    max={10} 
                    value={activeSettings.vertexSize} 
                    onChange={(e) => setActiveSettings(prev => ({ ...prev, vertexSize: parseInt(e.target.value) }))} 
                  />
                  <span className="slider-value">{activeSettings.vertexSize}</span>
                </div>
              </div>
              </>
            )}
                        
            {activeSettings.wireframe && (
              <div className="input-row">
                <label>Color de Wireframe</label>
                <div className="color-picker-relative-container">
                    <div className="preview-group" ref={previewWireframeRef as any}>
                    <button 
                      className="color-preview-button sidebar-button" 
                      onClick={() => setOpenPicker(openPicker === 'wireframe' ? null : 'wireframe')}
                    >
                      <div className="color-swatch" style={{background: '#ffffff'}} />
                    </button>
                    {openPicker === 'wireframe' && (
                      <PortalTooltip anchorRef={previewWireframeRef as any}>
                        <div>
                          <ColorWheel currentColor={'#ffffff'} size={140} onColorSelect={(c) => {/* set wireframe color */}} />
                          <RgbInputs color={'#ffffff'} onColorChange={(c) => {/* set wireframe color */}} />
                        </div>
                      </PortalTooltip>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSettings.normals && (
              <div className="input-row">
                <label>Color de Normales</label>
                <div className="color-picker-relative-container">
                  <div className="preview-group" ref={previewNormalsRef as any}>
                    <button 
                      className="color-preview-button sidebar-button" 
                      onClick={() => setOpenPicker(openPicker === 'normals' ? null : 'normals')}
                    >
                      <div className="color-swatch" style={{background: activeSettings.normalsColor}} />
                    </button>
                    {openPicker === 'normals' && (
                      <PortalTooltip anchorRef={previewNormalsRef as any}>
                        <div>
                          <ColorWheel currentColor={activeSettings.normalsColor} size={140} 
                            onColorSelect={(c) => setActiveSettings(prev => ({ ...prev, normalsColor: c }))} />
                          <RgbInputs color={activeSettings.normalsColor} 
                            onColorChange={(c) => setActiveSettings(prev => ({ ...prev, normalsColor: c }))} />
                        </div>
                      </PortalTooltip>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSettings.bbox && (
              <div className="input-row">
                <label>Color de Bounding Box Global</label>
                <div className="color-picker-relative-container">
                  <div className="preview-group" ref={previewBBoxGlobalRef as any}>
                    <button 
                      className="color-preview-button sidebar-button" 
                      onClick={() => setOpenPicker(openPicker === 'bboxGlobal' ? null : 'bboxGlobal')}
                    >
                      <div className="color-swatch" style={{background: bboxGlobalColor}} />
                    </button>
                    {openPicker === 'bboxGlobal' && (
                      <PortalTooltip anchorRef={previewBBoxGlobalRef as any} preferUp={true}>
                        <div>
                          <ColorWheel currentColor={bboxGlobalColor} size={140} onColorSelect={(c) => setBboxGlobalColor(c)} />
                          <RgbInputs color={bboxGlobalColor} onColorChange={(c) => setBboxGlobalColor(c)} />
                        </div>
                      </PortalTooltip>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
        )}

        <div className="sidebar-separator" />
        
        <h3 className="section-title">Transformaciones</h3>

          <div className="transform-group">
              <label className="label-small">Traslación del Objeto (X, Y, Z)</label>
              <div className="xyz-inputs">
                <input type="number" placeholder="X" step="0.1" value={translateGlobalX} onChange={(e) => {
                  const v = e.target.value; setTranslateGlobalX(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => ({ ...m, translate: [num, m.translate?.[1]||0, m.translate?.[2]||0] })));
                }} />
                <input type="number" placeholder="Y" step="0.1" value={translateGlobalY} onChange={(e) => {
                  const v = e.target.value; setTranslateGlobalY(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => ({ ...m, translate: [m.translate?.[0]||0, num, m.translate?.[2]||0] })));
                }} />
                <input type="number" placeholder="Z" step="0.1" value={translateGlobalZ} onChange={(e) => {
                  const v = e.target.value; setTranslateGlobalZ(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => ({ ...m, translate: [m.translate?.[0]||0, m.translate?.[1]||0, num] })));
                }} />
              </div>
          </div>

          <div className="transform-group">
              <label className="label-small">Escala del Objeto (X, Y, Z)</label>
              <div className="xyz-inputs">
                <input type="number" placeholder="X" step="0.1" value={scaleX} onChange={(e) => {
                  const v = e.target.value; setScaleX(v);
                  const num = parseFloat(v) || 1;
                  setMeshes(prev => prev.map(mesh => ({
                    ...mesh,
                    scale: Array.isArray(mesh.scale) 
                      ? [num, mesh.scale[1] || 1, mesh.scale[2] || 1]
                      : [num, mesh.scale || 1, mesh.scale || 1]
                  })));
                }} />
                <input type="number" placeholder="Y" step="0.1" value={scaleY} onChange={(e) => {
                  const v = e.target.value; setScaleY(v);
                  const num = parseFloat(v) || 1;
                  setMeshes(prev => prev.map(mesh => ({
                    ...mesh,
                    scale: Array.isArray(mesh.scale) 
                      ? [mesh.scale[0] || 1, num, mesh.scale[2] || 1]
                      : [mesh.scale || 1, num, mesh.scale || 1]
                  })));
                }} />
                <input type="number" placeholder="Z" step="0.1" value={scaleZ} onChange={(e) => {
                  const v = e.target.value; setScaleZ(v);
                  const num = parseFloat(v) || 1;
                  setMeshes(prev => prev.map(mesh => ({
                    ...mesh,
                    scale: Array.isArray(mesh.scale) 
                      ? [mesh.scale[0] || 1, mesh.scale[1] || 1, num]
                      : [mesh.scale || 1, mesh.scale || 1, num]
                  })));
                }} />
              </div>
          </div>

          <div className="transform-group">
            <label className="label-small">Rotación del Objeto X, Y, Z (grados)</label>
            <label className="label-small-small">Presione el click derecho y arrastre la figura para activar la rotación.</label>

            <div className="rotation-row">
              <div className="xyz-inputs">
                <div className="xyz-input-with-unit">
                  <input
                    type="number"
                    placeholder="X"
                    step={1}
                    value={rotateX}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRotateX(v);
                      const num = parseFloat(v) || 0;
                      // actualizar rotación global (Euler grados)
                      setGlobalRotationDegrees(num, parseFloat(rotateY) || 0, parseFloat(rotateZ) || 0);
                      // Forzar redraw
                      setMeshes(prev => prev.map(m => ({ ...m })));
                    }}
                  />
                  <span className="xyz-unit">°</span>
                </div>

                <div className="xyz-input-with-unit">
                  <input
                    type="number"
                    placeholder="Y"
                    step={1}
                    value={rotateY}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRotateY(v);
                      const num = parseFloat(v) || 0;
                      setGlobalRotationDegrees(parseFloat(rotateX) || 0, num, parseFloat(rotateZ) || 0);
                      setMeshes(prev => prev.map(m => ({ ...m })));
                    }}
                  />
                  <span className="xyz-unit">°</span>
                </div>

                <div className="xyz-input-with-unit">
                  <input
                    type="number"
                    placeholder="Z"
                    step={1}
                    value={rotateZ}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRotateZ(v);
                      const num = parseFloat(v) || 0;
                      setGlobalRotationDegrees(parseFloat(rotateX) || 0, parseFloat(rotateY) || 0, num);
                      setMeshes(prev => prev.map(m => ({ ...m })));
                    }}
                  />
                  <span className="xyz-unit">°</span>
                </div>
              </div>

              <button
                className="sidebar-button rotation-reset-btn"
                title="Resetear rotación"
                onClick={() => {
                  // Resetear rotación global (cuaternión) y sincronizar inputs
                  resetGlobalRotation();
                  setRotateX('0');
                  setRotateY('0');
                  setRotateZ('0');
                  // Forzar redraw
                  setMeshes((prev) => prev.map(m => ({ ...m })));
                }}
              >
                <ion-icon name="refresh-outline"></ion-icon>
              </button>
              <button
                className="sidebar-button rotation-reset-btn"
                title="Deshacer última rotación global"
                onClick={() => {
                  undoGlobalRotation();
                  // Forzar redraw actualizando meshes sin cambiar datos
                  setMeshes(prev => prev.map(m => ({ ...m })));
                }}
              >
                <ion-icon name="return-up-back-outline"></ion-icon>
              </button>
            </div>
          </div>

        </div>

        <div className="sidebar-separator" />

        {/* SECCIÓN 4: SUB-MALLA SELECCIONADA (Solo si hay selección vía Picking) */}
        {selectedMeshId !== null && !activeSettings.bbox && (
          <div className="sidebar-section selection-box">
            <h3 className="section-title">Sub-malla Seleccionada</h3>

            <div className="input-row">
              <p className="selection-id">ID: {selectedMeshId}</p>
              <label>Color Sub-malla</label>
              <div className="color-picker-relative-container">
                <div className="preview-group" ref={previewKdRef as any}>
                  <button
                    className="color-preview-button sidebar-button"
                    onClick={() => setOpenPicker(openPicker === 'kd' ? null : 'kd')}
                  >
                    <div className="color-swatch" style={{ background: kdColor }} />
                  </button>
                  {openPicker === 'kd' && (
                    <PortalTooltip anchorRef={previewKdRef as any}>
                      <div>
                        <ColorWheel
                          currentColor={kdColor}
                          size={140}
                          onColorSelect={(c) => {
                            setKdColor(c);
                            // actualizar color en meshes
                            setMeshes(prevMeshes =>
                              prevMeshes.map(m =>
                                m.id === selectedMeshId ? { ...m, color: rgbaStringToNormalizedArray(c) } : m
                              )
                            );
                          }}
                        />
                        <RgbInputs
                          color={kdColor}
                          onColorChange={(c) => {
                            setKdColor(c);
                            setMeshes(prevMeshes =>
                              prevMeshes.map(m =>
                                m.id === selectedMeshId ? { ...m, color: rgbaStringToNormalizedArray(c) } : m
                              )
                            );
                          }}
                        />
                      </div>
                    </PortalTooltip>
                  )}
                </div>
              </div>
            </div>
            <div className="transform-group">
              <label className="label-small">Traslación de la Sub-Malla (X, Y, Z)</label>
              <div className="xyz-inputs">
                <input type="number" placeholder="X" step="0.1" value={translateLocalX} onChange={(e) => {
                  const v = e.target.value; setTranslateLocalX(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => m.id === selectedMeshId ? { ...m, translate: [num, m.translate?.[1]||0, m.translate?.[2]||0] } : m));
                }} />
                <input type="number" placeholder="Y" step="0.1" value={translateLocalY} onChange={(e) => {
                  const v = e.target.value; setTranslateLocalY(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => m.id === selectedMeshId ? { ...m, translate: [m.translate?.[0]||0, num, m.translate?.[2]||0] } : m));
                }} />
                <input type="number" placeholder="Z" step="0.1" value={translateLocalZ} onChange={(e) => {
                  const v = e.target.value; setTranslateLocalZ(v);
                  const num = parseFloat(v) || 0;
                  setMeshes(prev => prev.map(m => m.id === selectedMeshId ? { ...m, translate: [m.translate?.[0]||0, m.translate?.[1]||0, num] } : m));
                }} />
              </div>
            </div>

            <div className="mesh-actions-row mt-10">
              <div className="bbox-local-group">
                <div className="tool-button-wrapper">
                  <button 
                    className={`sidebar-button ${activeSettings.bboxlocal ? 'active' : ''}`} 
                    title="BBox Local"
                    onClick={() => toggleSetting('bboxlocal')}
                  >
                    <ion-icon name="scan-outline"></ion-icon>
                  </button>
                  <span className="tool-button-label">BBox Local</span>
                </div>

                {/* Selector de color para BBox Local */}
                <div className="color-picker-relative-container">
                  <div className="preview-group" ref={previewBBoxLocalRef as any}>
                    <div className="tool-button-wrapper">
                      <button 
                        className="color-preview-button sidebar-button" 
                        onClick={() => setOpenPicker(openPicker === 'bboxLocal' ? null : 'bboxLocal')}
                      >
                        <div className="color-swatch" style={{background: bboxLocalColor}} />
                      </button>
                      <span className="tool-button-label">BBox Color</span>
                    </div>
                    
                    {openPicker === 'bboxLocal' && (
                      <PortalTooltip anchorRef={previewBBoxLocalRef as any} className="color-tooltip bbox-tooltip-adjust" preferUp={true}>
                        <div>
                          <ColorWheel currentColor={bboxLocalColor} size={140} onColorSelect={(c) => setBboxLocalColor(c)} />
                          <RgbInputs color={bboxLocalColor} onColorChange={(c) => setBboxLocalColor(c)} />
                        </div>
                      </PortalTooltip>
                    )}
                  </div>
                </div>
              </div>

              <div className="tool-button-wrapper delete-wrapper">
                <button className="sidebar-button delete-btn" title="Eliminar Sub-malla" onClick={() => {
                  if (selectedMeshId !== null) {
                    setMeshes(prev => prev.filter(m => m.id !== selectedMeshId));
                    if (setSelectedMeshId) setSelectedMeshId(null);
                  }
                }}>
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
                <span className="tool-button-label">Eliminar</span>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* BOTÓN GITHUB AL FINAL */}
      <div className="sidebar-footer">
        <a href="#" onClick={openGitHub} className="sidebar-button github-link" title="Ver repositorio en GitHub">
          <ion-icon name="logo-github"></ion-icon>
        </a>
      </div>
    </aside>

    {modalOpen && (
      <ConfirmationModal
        title={modalTitle}
        message={modalMessage}
        onConfirm={() => {
          modalOnConfirm();
          setModalOpen(false);
        }}
        onCancel={() => setModalOpen(false)}
      />
    )}
    </>
  );
};

export default Sidebar;