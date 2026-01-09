import React, { useRef, useState } from 'react';
import '../../styles/Sidebar.css';

const Sidebar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para simular la selección (esto vendría de tu lógica WebGL)
  const [hasSelection, setHasSelection] = useState(true); 
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
        
        <div className="input-row">
          <label>Fondo</label>
          <input type="color" defaultValue="#cccccc" title="Color de fondo" />
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
        <div className="input-row">
          <label>Normales</label>
          <input type="color" defaultValue="#00ff00" />
        </div>
      </div>

      <div className="sidebar-separator" />

      {/* SECCIÓN 4: SUB-MALLA SELECCIONADA (Solo si hay selección vía Picking) */}
      {hasSelection && (
        <div className="sidebar-section selection-box">
          <h3 className="section-title">Sub-malla Seleccionada</h3>
          
          <div className="input-row">
            <label>Color (Kd)</label>
            <input type="color" defaultValue="#A191FF" />
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