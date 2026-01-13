import React, { useEffect, useRef } from 'react';
import { initWebGL, setupShaders, setDepthTest, setCulling, redraw, pickAt } from '../WebGL';
import '../../styles/style.css';

interface CanvasProps { bgColor?: string; meshes?: any[]; depthEnabled?: boolean; cullingEnabled?: boolean; setSelectedMeshId?: (id: number | null) => void; setMeshes?: React.Dispatch<React.SetStateAction<any[]>> }

const Canvas: React.FC<CanvasProps> = ({ 
  bgColor = 'rgba(0,0,0,1)', 
  meshes = [], 
  depthEnabled = true, 
  cullingEnabled = true,
  setSelectedMeshId, 
  setMeshes
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Utilidad para convertir rgba(...) a array [r,g,b,a]
  const parseRgba = (c: string): [number, number, number, number] => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return [0,0,0,1];
    return [parseInt(m[1])/255, parseInt(m[2])/255, parseInt(m[3])/255, m[4] ? parseFloat(m[4]) : 1];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    const ok = initWebGL(canvas);
    if (!ok) {
      alert('Tu navegador no soporta WebGL.');
      return;
    }
    setupShaders();

    setDepthTest(!!depthEnabled);
    setCulling(!!cullingEnabled);

    redraw(meshes, parseRgba(bgColor));

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      initWebGL(canvas);
      setupShaders();
      setDepthTest(!!depthEnabled);
      setCulling(!!cullingEnabled);
      redraw(meshes, parseRgba(bgColor));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [meshes, depthEnabled, cullingEnabled, bgColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.floor(x * dpr);
      const py = Math.floor(y * dpr);

      const id = pickAt(px, py, canvas, meshes, parseRgba(bgColor));
      if (id) {
        console.log("Sub-malla seleccionada:", id);
        setSelectedMeshId && setSelectedMeshId(id);
        // Do NOT change mesh color here; Sidebar will read current color and allow edits
      } else {
        setSelectedMeshId(null);
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [meshes, bgColor]);

  return (
    <main className="scene" style={{ background: bgColor }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
};

export default Canvas;