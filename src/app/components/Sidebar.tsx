import React, { useRef, useState, useEffect } from 'react';
import '../../styles/Sidebar.css';
import ColorWheel from './ColorWheel';
import ConfirmationModal from './ConfirmationModal';
import { parseOBJ, parseMTL, assignMaterials, normalizeOBJ, Material } from '../lib/objLoader';
import { setDepthTest, setCulling } from '../WebGL';

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
  setBboxLocalColor
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
  const [translateX, setTranslateX] = useState<string>('0');
  const [translateY, setTranslateY] = useState<string>('0');
  const [translateZ, setTranslateZ] = useState<string>('0');

  const [openPicker, setOpenPicker] = useState<null | 'bg' | 'normals' | 'kd' | 'bboxLocal'>(null);
  const buttonLabels: Record<string, string> = {
    fps: 'Mostrar FPS',
    aa: 'Anti Aliasing',
    zBuffer: 'Z-Buffer',
    culling: 'Back-face Culling',
    normals: 'Ver Normales',
    bbox: 'Bounding Box Global',
  };
  const wireframeLabel = activeSettings.wireframe ? 'Wireframe' : 'Relleno';

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
      // ← Solo activar bboxlocal si no está ya activo (evita toggle forzado)
      setActiveSettings((prev: any) => ({ ...prev, bboxlocal: true }));
    }
    
    // sync translate inputs (mover aquí para ejecutarse siempre)
    const mesh2 = meshes.find(m => m.id === selectedMeshId);
    if (mesh2 && mesh2.translate) {
      setTranslateX(String(mesh2.translate[0] || 0));
      setTranslateY(String(mesh2.translate[1] || 0));
      setTranslateZ(String(mesh2.translate[2] || 0));
    } else {
      setTranslateX('0'); setTranslateY('0'); setTranslateZ('0');
    }
  }, [selectedMeshId, meshes]);

  const toggleSetting = (key: string) => {
    setActiveSettings((prev: any) => {
      const newState = { ...prev, [key]: !prev[key] };

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

      // Asignar materiales a sub-mallas
      const meshes = assignMaterials(objData, materials);

      // Normalizar
      const { center, scale } = normalizeOBJ(objData);
      const normalizedMeshes = meshes.map(m => ({ ...m, center, scale, translate: [0,0,0] }));

      console.log(meshes);
      console.log(normalizedMeshes);
      // Ensure depth test and culling are enabled by default on import
      setActiveSettings((prev: any) => ({ ...prev, zBuffer: true, culling: true }));
      setDepthTest(true);
      setCulling(true);
      setMeshes(normalizedMeshes);
      // ensure bbox local visible when importing selection defaults
      setActiveSettings((prev:any) => ({ ...prev, bboxlocal: true }));
    };

  // Close picker when clicking outside
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.color-tooltip') || target.closest('.color-preview-button')) return;
      setOpenPicker(null);
    }
    if (openPicker) document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [openPicker]);

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

  return (
    <>
    <aside className="sidebar-container">
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
            <div className="preview-group">
              <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'bg' ? null : 'bg')}>
                <div className="color-swatch" style={{background: bgColor}} />
              </button>
              {openPicker === 'bg' && (
                <div className="color-tooltip">
                  <ColorWheel currentColor={bgColor} size={140} onColorSelect={(c) => setBgColor(c)} />
                  <RgbInputs color={bgColor} onColorChange={(c) => setBgColor(c)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 3: VISUALIZACIÓN */}
      <div className="sidebar-section">
        <h3 className="section-title">Visualización</h3>
        <div className="tool-group"> {/* Solo un tool-group aquí */}
          
          <div className="tool-button-wrapper">
            <button 
              className={`sidebar-button ${activeSettings.wireframe ? 'active' : ''}`} 
              onClick={() => toggleSetting('wireframe')}
            >
              <ion-icon name={activeSettings.wireframe ? "grid-outline" : "square-sharp"}></ion-icon>
            </button>
            <span className="tool-button-label">{wireframeLabel}</span>
          </div>

          <div className="tool-button-wrapper">
            <button 
              className={`sidebar-button ${activeSettings.normals ? 'active' : ''}`} 
              onClick={() => toggleSetting('normals')}
            >
              <ion-icon name="git-commit-outline"></ion-icon>
            </button>
            <span className="tool-button-label">{buttonLabels.normals}</span>
          </div>

          <div className="tool-button-wrapper">
            <button 
              className={`sidebar-button ${activeSettings.bbox ? 'active' : ''}`} 
              onClick={() => toggleSetting('bbox')}
            >
              <ion-icon name="cube-outline"></ion-icon>
            </button>
            <span className="tool-button-label">{buttonLabels.bbox}</span>
          </div>

        </div>

        <div className="input-row">
          <label>Normales</label>
          <div className="color-picker-relative-container">
            <div className="preview-group">
              <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'normals' ? null : 'normals')}>
                <div className="color-swatch" style={{background: normalsColor}} />
              </button>
              {openPicker === 'normals' && (
                <div className="color-tooltip">
                  <ColorWheel currentColor={normalsColor} size={140} onColorSelect={(c) => setNormalsColor(c)} />
                  <RgbInputs color={normalsColor} onColorChange={(c) => setNormalsColor(c)} />
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 4: SUB-MALLA SELECCIONADA (Solo si hay selección vía Picking) */}
      {selectedMeshId !== null && (
        <div className="sidebar-section selection-box">
          <h3 className="section-title">Sub-malla Seleccionada</h3>

          <div className="input-row">
            <p className="selection-id">ID: {selectedMeshId}</p>
            <label>Color (Kd)</label>
            <div className="color-picker-relative-container">
              <div className="preview-group">
                <button
                  className="color-preview-button sidebar-button"
                  onClick={() => setOpenPicker(openPicker === 'kd' ? null : 'kd')}
                >
                  <div className="color-swatch" style={{ background: kdColor }} />
                </button>
                {openPicker === 'kd' && (
                  <div className="color-tooltip">
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
                )}
              </div>
            </div>
          </div>
          <div className="transform-group">
            <label className="label-small">Traslación (X, Y, Z)</label>
            <div className="xyz-inputs">
              <input type="number" placeholder="X" step="0.1" value={translateX} onChange={(e) => {
                const v = e.target.value; setTranslateX(v);
                const num = parseFloat(v) || 0;
                setMeshes(prev => prev.map(m => m.id === selectedMeshId ? { ...m, translate: [num, m.translate?.[1]||0, m.translate?.[2]||0] } : m));
              }} />
              <input type="number" placeholder="Y" step="0.1" value={translateY} onChange={(e) => {
                const v = e.target.value; setTranslateY(v);
                const num = parseFloat(v) || 0;
                setMeshes(prev => prev.map(m => m.id === selectedMeshId ? { ...m, translate: [m.translate?.[0]||0, num, m.translate?.[2]||0] } : m));
              }} />
              <input type="number" placeholder="Z" step="0.1" value={translateZ} onChange={(e) => {
                const v = e.target.value; setTranslateZ(v);
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
                <div className="preview-group">
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
                    <div className="color-tooltip bbox-tooltip-adjust">
                      <ColorWheel currentColor={bboxLocalColor} size={140} onColorSelect={(c) => setBboxLocalColor(c)} />
                      <RgbInputs color={bboxLocalColor} onColorChange={(c) => setBboxLocalColor(c)} />
                    </div>
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