import React, { useRef, useState, useEffect } from 'react';
import '../../styles/Sidebar.css';
import ColorWheel from './ColorWheel';

interface SidebarProps { bgColor: string; setBgColor: (c: string) => void }
const Sidebar: React.FC<SidebarProps> = ({ bgColor, setBgColor }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para simular la selección (esto vendría de tu lógica WebGL)
  const [hasSelection, setHasSelection] = useState(true); 
  const [normalsColor, setNormalsColor] = useState<string>('rgba(0,255,0,1)');
  const [kdColor, setKdColor] = useState<string>('rgba(161,145,255,1)');
  const [openPicker, setOpenPicker] = useState<null | 'bg' | 'normals' | 'kd'>(null);
  const [activeSettings, setActiveSettings] = useState({
    fps: true,
    aa: false,
    zBuffer: true,
    culling: true,
    normals: false,
    bbox: false,
    wireframe: false
  });

  const toggleSetting = (key: string) => {
    setActiveSettings(prev => ({ ...prev, [key]: !prev[key] as any }));
  };

  const openGitHub = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open("https://github.com/YariCB/CG-UCV-Project3D", '_blank');
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

  function hexToRgba(hex: string) {
    if (!hex) return 'rgba(0,0,0,1)';
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},1)`;
  }

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
      setInputs(prev => ({
        r: p.r.toString(),
        g: p.g.toString(),
        b: p.b.toString()
      }));
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

    const inputStyle: React.CSSProperties = {
      width: '56px',
      textAlign: 'center',
      fontSize: '12px',
      background: '#1b1b1b',
      border: '1px solid #444',
      color: '#fff',
      padding: '4px',
      borderRadius: 4
    };

    return (
      <div style={{display: 'flex', gap: 6, marginTop: 8}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <label style={{fontSize: 11}}>R</label>
          <input type="number" min={0} max={255} value={inputs.r} onChange={e => handleChange('r', e.target.value)} style={inputStyle} />
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <label style={{fontSize: 11}}>G</label>
          <input type="number" min={0} max={255} value={inputs.g} onChange={e => handleChange('g', e.target.value)} style={inputStyle} />
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <label style={{fontSize: 11}}>B</label>
          <input type="number" min={0} max={255} value={inputs.b} onChange={e => handleChange('b', e.target.value)} style={inputStyle} />
        </div>
      </div>
    );
  };

  return (
    <aside className="sidebar-container">
      {/* SECCIÓN 1: ARCHIVO */}
      <div className="sidebar-section">
        <div className="file-ops-group">
          <button className="sidebar-button archive-btn" onClick={() => fileInputRef.current?.click()}>
            Archivo
          </button>
          <button className="sidebar-button save-btn" title="Guardar Escena">
            <ion-icon name="save-sharp"></ion-icon>
          </button>
        </div>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept=".obj,.mtl" />
      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 2: ESCENA (Renderizado global) */}
      <div className="sidebar-section">
        <h3 className="section-title">Configuración de Escena</h3>
        <div className="tool-group">
          <button 
            className={`sidebar-button ${activeSettings.fps ? 'active' : ''}`} 
            title="Mostrar FPS" onClick={() => toggleSetting('fps')}>
            <ion-icon name="speedometer-outline"></ion-icon>
          </button>
          <button 
            className={`sidebar-button ${activeSettings.aa ? 'active' : ''}`} 
            title="Antialiasing" onClick={() => toggleSetting('aa')}>
            <span style={{fontSize: '10px', fontWeight: 'bold'}}>AA</span>
          </button>
          <button 
            className={`sidebar-button ${activeSettings.zBuffer ? 'active' : ''}`} 
            title="Z-Buffer (Depth Test)" onClick={() => toggleSetting('zBuffer')}>
            <ion-icon name="layers-outline"></ion-icon>
          </button>
          <button 
            className={`sidebar-button ${activeSettings.culling ? 'active' : ''}`} 
            title="Back-face Culling" onClick={() => toggleSetting('culling')}>
            <ion-icon name="albums-outline"></ion-icon>
          </button>
        </div>
        
        <div className="input-row" style={{position: 'relative'}}>
          <label>Fondo</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'bg' ? null : 'bg')} style={{padding: 4}}>
              <div style={{width: 28, height: 18, background: bgColor, border: '1px solid #000', borderRadius: 4}} />
            </button>
            {openPicker === 'bg' && (
              <div className="color-tooltip" style={{right: 0}}>
                <ColorWheel currentColor={bgColor} size={140} onColorSelect={(c) => setBgColor(c)} />
                <RgbInputs color={bgColor} onColorChange={(c) => setBgColor(c)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 3: VISUALIZACIÓN (Del objeto cargado) */}
      <div className="sidebar-section">
        <h3 className="section-title">Visualización</h3>
        <div className="tool-group">
          <button 
            className={`sidebar-button ${activeSettings.wireframe ? 'active' : ''}`} 
            title="Ver Relleno / Wireframe" onClick={() => toggleSetting('wireframe')}>
            <ion-icon name={activeSettings.wireframe ? "grid-outline" : "square-sharp"}></ion-icon>
          </button>
          <button 
            className={`sidebar-button ${activeSettings.normals ? 'active' : ''}`} 
            title="Ver Normales por Vértice" onClick={() => toggleSetting('normals')}>
            <ion-icon name="git-commit-outline"></ion-icon>
          </button>
          <button 
            className={`sidebar-button ${activeSettings.bbox ? 'active' : ''}`} 
            title="Bounding Box Global" onClick={() => toggleSetting('bbox')}>
            <ion-icon name="cube-outline"></ion-icon>
          </button>
        </div>
        <div className="input-row" style={{position: 'relative'}}>
          <label>Normales</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'normals' ? null : 'normals')} style={{padding: 4}}>
              <div style={{width: 28, height: 18, background: normalsColor, border: '1px solid #000', borderRadius: 4}} />
            </button>
            {openPicker === 'normals' && (
              <div className="color-tooltip" style={{right: 0}}>
                <ColorWheel currentColor={normalsColor} size={140} onColorSelect={(c) => setNormalsColor(c)} />
                <RgbInputs color={normalsColor} onColorChange={(c) => setNormalsColor(c)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 4: SUB-MALLA SELECCIONADA (Solo si hay selección vía Picking) */}
      {hasSelection && (
        <div className="sidebar-section selection-box">
          <h3 className="section-title">Sub-malla Seleccionada</h3>
          
          <div className="input-row" style={{position: 'relative'}}>
            <label>Color (Kd)</label>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <button className="color-preview-button sidebar-button" onClick={() => setOpenPicker(openPicker === 'kd' ? null : 'kd')} style={{padding: 4}}>
                <div style={{width: 28, height: 18, background: kdColor, border: '1px solid #000', borderRadius: 4}} />
              </button>
              {openPicker === 'kd' && (
                <div className="color-tooltip" style={{right: 0}}>
                  <ColorWheel currentColor={kdColor} size={140} onColorSelect={(c) => setKdColor(c)} />
                  <RgbInputs color={kdColor} onColorChange={(c) => setKdColor(c)} />
                </div>
              )}
            </div>
          </div>

          <div className="transform-group">
            <label className="label-small">Traslación</label>
            <div className="xyz-inputs">
              <input type="number" placeholder="X" step="0.1" />
              <input type="number" placeholder="Y" step="0.1" />
              <input type="number" placeholder="Z" step="0.1" />
            </div>
          </div>

          <div className="tool-group" style={{marginTop: '10px'}}>
            <button className="sidebar-button active" title="BBox Local">
              <ion-icon name="scan-outline"></ion-icon>
            </button>
            <button className="sidebar-button delete-btn" title="Eliminar Sub-malla">
              <ion-icon name="trash-outline"></ion-icon>
            </button>
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
  );
};

export default Sidebar;