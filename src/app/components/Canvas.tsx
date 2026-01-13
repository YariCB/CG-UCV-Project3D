import React, { useEffect, useRef, useCallback, useState } from 'react';
import { initWebGL, setupShaders, setDepthTest, setCulling, redraw, pickAt } from '../WebGL';
import '../../styles/style.css';

interface CanvasProps {
  bgColor?: string;
  meshes?: any[];
  depthEnabled?: boolean;
  cullingEnabled?: boolean;
  setSelectedMeshId?: (id: number | null) => void;
  setMeshes?: React.Dispatch<React.SetStateAction<any[]>>;
  selectedMeshId?: number | null;
  bboxColor?: string;
  showLocalBBox?: boolean;
  toggleBBoxLocal?: () => void;
}

const Canvas: React.FC<CanvasProps> = ({ 
  bgColor = 'rgba(0,0,0,1)', 
  meshes = [], 
  depthEnabled = true, 
  cullingEnabled = true,
  setSelectedMeshId, 
  selectedMeshId,
  setMeshes,
  bboxColor,
  showLocalBBox,
  toggleBBoxLocal
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragCounter, setDragCounter] = useState(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastMouseYRef = useRef(0);

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

  const handleRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !meshes.length) return;

    const bboxRgb = bboxColor ? parseRgba(bboxColor).slice(0, 3) as [number, number, number] : undefined;
    const localMeshId = showLocalBBox && selectedMeshId !== null ? selectedMeshId : undefined;
    
    redraw(meshes, parseRgba(bgColor), localMeshId, bboxRgb);
  }, [meshes, bgColor, bboxColor, selectedMeshId, showLocalBBox, parseRgba]);


  // DRAG START - mousedown sobre sub-malla seleccionada
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedMeshId || !setMeshes) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const px = Math.floor(Math.max(0, Math.min(x, canvas.width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, canvas.height - 1)));
    
    const pickedId = pickAt(px, py, canvas, meshes, parseRgba(bgColor));
    
    // Solo iniciar drag si clickeamos la sub-malla seleccionada
    if (pickedId === selectedMeshId) {
      isDraggingRef.current = true;
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }, [meshes, bgColor, selectedMeshId, setMeshes, parseRgba]);

  // DRAG - mousemove SIMPLE Y PRECISO
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !selectedMeshId || !setMeshes) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const deltaX = e.clientX - lastMouseXRef.current;
    const deltaY = e.clientY - lastMouseYRef.current;

    const sensitivity = 0.01;
    const translateDelta = [
      deltaX * sensitivity,
      -deltaY * sensitivity,
      0
    ];

    setMeshes(prevMeshes =>
      prevMeshes.map(mesh =>
        mesh.id === selectedMeshId
          ? {
              ...mesh,
              translate: [
                (mesh.translate?.[0] || 0) + translateDelta[0],
                (mesh.translate?.[1] || 0) + translateDelta[1],
                (mesh.translate?.[2] || 0) + translateDelta[2]
              ]
            }
          : mesh
      )
    );

    lastMouseXRef.current = e.clientX;
    lastMouseYRef.current = e.clientY;
  }, [selectedMeshId, setMeshes]);

  // DRAG END - mouseup
  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = selectedMeshId ? 'grab' : 'default';
      }
    }
  }, [selectedMeshId]);

  const handleClick = useCallback((e: MouseEvent) => {
    // Ignorar click durante arrastre
    if (isDraggingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas || !setSelectedMeshId || !meshes.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const px = Math.floor(Math.max(0, Math.min(x, canvas.width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, canvas.height - 1)));
    
    const pickedId = pickAt(px, py, canvas, meshes, parseRgba(bgColor));
    console.log("Click → ID:", pickedId, "Current:", selectedMeshId);
    
    if (pickedId !== null) {
      if (pickedId === selectedMeshId) {
        console.log("Toggle BBox OFF");
        toggleBBoxLocal?.();
      } else {
        console.log("Seleccionar nueva malla:", pickedId);
        setSelectedMeshId(pickedId);
      }
    } else {
      console.log("Click fuera → Deseleccionando");
      setSelectedMeshId(null);
    }
  }, [meshes, bgColor, selectedMeshId, setSelectedMeshId, toggleBBoxLocal, parseRgba]);

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
    
    handleRedraw();
  }, []);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
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
    return () => window.removeEventListener('resize', handleResize);
  }, [depthEnabled, cullingEnabled, handleRedraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('click', handleClick as any);
    return () => canvas.removeEventListener('click', handleClick as any);
  }, [handleClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.cursor = selectedMeshId ? 'grab' : 'default';

    canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, selectedMeshId]);

  useEffect(() => {
    handleRedraw();
  }, [handleRedraw, dragCounter, meshes]);

  return (
    <main className="scene" style={{ background: bgColor }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
};

export default Canvas;