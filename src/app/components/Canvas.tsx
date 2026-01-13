import React, { useEffect, useRef, useCallback } from 'react';
import { initWebGL, setupShaders, setDepthTest, setCulling, redraw, pickAt } from '../WebGL';
import '../../styles/style.css';

interface CanvasProps {
  bgColor?: string;
  meshes?: any[];
  depthEnabled?: boolean;
  cullingEnabled?: boolean;
  setSelectedMeshId?: (id: number | null) => void;
  selectedMeshId?: number | null;
  bboxColor?: string;
  showLocalBBox?: boolean;
}

const Canvas: React.FC<CanvasProps> = ({ 
  bgColor = 'rgba(0,0,0,1)', 
  meshes = [], 
  depthEnabled = true, 
  cullingEnabled = true,
  setSelectedMeshId, 
  selectedMeshId,
  bboxColor,
  showLocalBBox
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const redrawTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Utilidad para convertir rgba(...) a array [r,g,b,a] - memoizada
  const parseRgba = useCallback((c: string): [number, number, number, number] => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return [0, 0, 0, 1];
    return [
      parseInt(m[1]) / 255,
      parseInt(m[2]) / 255,
      parseInt(m[3]) / 255,
      m[4] ? parseFloat(m[4]) : 1
    ];
  }, []);

  // Función para redibujar con debouncing
  const handleRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancelar redibujado pendiente
    if (redrawTimeoutRef.current) {
      clearTimeout(redrawTimeoutRef.current);
    }

    // Programar nuevo redibujado con debouncing
    redrawTimeoutRef.current = setTimeout(() => {
      const bboxRgb = bboxColor ? parseRgba(bboxColor).slice(0, 3) as [number, number, number] : undefined;
      const localMeshId = showLocalBBox && selectedMeshId !== null && selectedMeshId !== undefined ? selectedMeshId : undefined;
      
      redraw(meshes, parseRgba(bgColor), localMeshId, bboxRgb);
    }, 0); // 0ms para el próximo tick
  }, [meshes, bgColor, bboxColor, selectedMeshId, showLocalBBox, parseRgba]);

  // Efecto para inicialización (solo una vez o cuando cambian configs básicas)
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

    // Redibujar después de inicializar
    handleRedraw();
  }, [depthEnabled, cullingEnabled, handleRedraw]);

  // Efecto para manejar cambios que requieren redibujado
  useEffect(() => {
    handleRedraw();
  }, [meshes, bgColor, selectedMeshId, bboxColor, showLocalBBox, handleRedraw]);

  // Efecto para manejar resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      
      initWebGL(canvas);
      setupShaders();
      setDepthTest(!!depthEnabled);
      setCulling(!!cullingEnabled);
      
      handleRedraw();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      // Limpiar timeout al desmontar
      if (redrawTimeoutRef.current) {
        clearTimeout(redrawTimeoutRef.current);
      }
    };
  }, [depthEnabled, cullingEnabled, handleRedraw]);

  // Efecto para manejar clics (pick)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !setSelectedMeshId) return;

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
        setSelectedMeshId(id);
      } else {
        setSelectedMeshId(null);
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [meshes, bgColor, setSelectedMeshId, parseRgba]);

  return (
    <main className="scene" style={{ background: bgColor }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
};

export default Canvas;