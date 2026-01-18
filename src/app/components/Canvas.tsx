import React, { useEffect, useRef, useCallback, useState } from 'react';
import { quat } from 'gl-matrix';
import { initWebGL, setupShaders, setDepthTest, setCulling, redraw, pickAt, pushGlobalRotation, applyDeltaGlobalQuat, getRotationSensitivity } from '../WebGL';
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
  bboxGlobalColor?: string;
  showLocalBBox?: boolean;
  toggleBBoxLocal?: () => void;
  activeSettings?: any;
  setActiveSettings?: React.Dispatch<React.SetStateAction<any>>;
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
  bboxGlobalColor,
  showLocalBBox,
  toggleBBoxLocal,
  activeSettings = {},
  setActiveSettings
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragCounter, setDragCounter] = useState(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastMouseYRef = useRef(0);

  // Arrastre del objeto completo
  const isDraggingObjectRef = useRef(false);

  // Rotación global con botón derecho
  const isRotatingRef = useRef(false);
  const [isRotating, setIsRotating] = useState(false);

  // Profundidad inicial del objeto
  const initialDepthRef = useRef<number>(-3); 

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
    if (!canvas) return;

    const bboxRgb = bboxColor ? parseRgba(bboxColor).slice(0, 3) as [number, number, number] : undefined;
    const localMeshId = showLocalBBox && selectedMeshId !== null ? selectedMeshId : undefined;
    
    let globalBBoxRgb: [number, number, number] | undefined;
    if (activeSettings.bbox) {
      const globalColor = parseRgba(bboxGlobalColor || 'rgba(255,0,0,1)');
      globalBBoxRgb = [globalColor[0], globalColor[1], globalColor[2]]; // Solo RGB
    }
    
    redraw(
      meshes, 
      parseRgba(bgColor), 
      localMeshId, 
      bboxRgb,
      activeSettings.bbox,
      globalBBoxRgb
    );
  }, [meshes, bgColor, bboxColor, bboxGlobalColor, selectedMeshId, showLocalBBox, parseRgba, activeSettings]);

  // DRAG START - mousedown sobre sub-malla seleccionada u objeto completo
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !setMeshes) return; // Eliminamos la verificación de selectedMeshId
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const px = Math.floor(Math.max(0, Math.min(x, canvas.width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, canvas.height - 1)));
    
    const pickedId = pickAt(px, py, canvas, meshes, parseRgba(bgColor));

    // Si el botón derecho está presionado, iniciar rotación global
    if (e.button === 2) {
      if (meshes.length === 0) return;
      pushGlobalRotation();
      isRotatingRef.current = true;
      setIsRotating(true);
      document.body.classList.add('no-select');
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Si BBox global está activa, siempre arrastrar objeto completo
    if (activeSettings.bbox) {
      // Arrastrar objeto completo (siempre que haya meshes)
      if (meshes.length === 0) return;
      
      isDraggingRef.current = true;
      isDraggingObjectRef.current = true;
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      
      // Usar profundidad promedio de todos los meshes
      const totalZ = meshes.reduce((sum, mesh) => sum + (mesh.translate?.[2] || -3), 0);
      initialDepthRef.current = totalZ / meshes.length;
      
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Si no hay BBox global activa, usar la lógica anterior
    const shouldDragObject = 
      // Si no hay submalla seleccionada
      selectedMeshId === null || 
      // O si clickeamos fuera de la submalla seleccionada
      (pickedId !== selectedMeshId);
    
    if (shouldDragObject && meshes.length > 0) {
      // Arrastrar objeto completo
      isDraggingRef.current = true;
      isDraggingObjectRef.current = true;
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      
      // Usar profundidad promedio de todos los meshes
      const totalZ = meshes.reduce((sum, mesh) => sum + (mesh.translate?.[2] || -3), 0);
      initialDepthRef.current = totalZ / meshes.length;
      
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    } else if (pickedId === selectedMeshId) {
      // Arrastrar submalla seleccionada
      isDraggingRef.current = true;
      isDraggingObjectRef.current = false;
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      
      // Guardar la profundidad del objeto seleccionado
      const mesh = meshes.find(m => m.id === selectedMeshId);
      if (mesh && mesh.translate) {
        initialDepthRef.current = mesh.translate[2] || -3;
      }
      
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }, [meshes, bgColor, selectedMeshId, setMeshes, parseRgba, activeSettings]);

  // DRAG - mousemove
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if ((!isDraggingRef.current && !isRotatingRef.current) || !setMeshes) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const deltaX = e.clientX - lastMouseXRef.current;
    const deltaY = e.clientY - lastMouseYRef.current;

    // Calcular el factor de movimiento
    const rect = canvas.getBoundingClientRect();
    const fov = Math.PI / 4; // 45 grados
    const aspect = rect.width / rect.height;
    
    if (isRotatingRef.current) {
      // Rotación global basada en movimiento del ratón
      const deltaX = e.clientX - lastMouseXRef.current;
      const deltaY = e.clientY - lastMouseYRef.current;
      const NORMALIZED_OBJECT_FACTOR = 0.1;
      const sens = getRotationSensitivity();
      
      const angDegY = (deltaX * sens[1]) * NORMALIZED_OBJECT_FACTOR; // rotar alrededor de Y por movimiento horizontal
      const angDegX = (deltaY * sens[0]) * NORMALIZED_OBJECT_FACTOR; // rotar alrededor de X por movimiento vertical
      const angRadX = angDegX * Math.PI / 180;
      const angRadY = angDegY * Math.PI / 180;

      const qx = quat.create();
      const qy = quat.create();
      quat.setAxisAngle(qx, [1, 0, 0], angRadX);
      quat.setAxisAngle(qy, [0, 1, 0], angRadY);
      const deltaQ = quat.create();
      quat.multiply(deltaQ, qy, qx);
      applyDeltaGlobalQuat(deltaQ);
      // Forzar redraw
      setMeshes(prev => prev.map(m => ({ ...m })));
      lastMouseXRef.current = e.clientX;
      lastMouseYRef.current = e.clientY;
      return;
    }

    if (isDraggingObjectRef.current) {
      // Arrastrar objeto completo
      if (meshes.length === 0) return;
      
      // Usar profundidad promedio
      const totalZ = meshes.reduce((sum, mesh) => sum + (mesh.translate?.[2] || -3), 0);
      const currentZ = totalZ / meshes.length;
      
      // Calcular movimiento
      const worldHeight = 2 * Math.tan(fov / 2) * Math.abs(currentZ);
      const worldWidth = worldHeight * aspect;
      
      const moveX = (deltaX / rect.width) * worldWidth;
      const moveY = -(deltaY / rect.height) * worldHeight;

      // Aplicar a todas las submallas
      setMeshes(prevMeshes =>
        prevMeshes.map(mesh => ({
          ...mesh,
          translate: [
            (mesh.translate?.[0] || 0) + moveX,
            (mesh.translate?.[1] || 0) + moveY,
            (mesh.translate?.[2] || -3)
          ]
        }))
      );
    } else {
      // Arrastrar submalla seleccionada
      if (!selectedMeshId) return;
      
      const selectedMesh = meshes.find(m => m.id === selectedMeshId);
      if (!selectedMesh) return;
      
      const currentZ = selectedMesh.translate?.[2] || initialDepthRef.current;
      
      const worldHeight = 2 * Math.tan(fov / 2) * Math.abs(currentZ);
      const worldWidth = worldHeight * aspect;
      
      const moveX = (deltaX / rect.width) * worldWidth;
      const moveY = -(deltaY / rect.height) * worldHeight;

      setMeshes(prevMeshes =>
        prevMeshes.map(mesh =>
          mesh.id === selectedMeshId
            ? {
                ...mesh,
                translate: [
                  (mesh.translate?.[0] || 0) + moveX,
                  (mesh.translate?.[1] || 0) + moveY,
                  currentZ
                ]
              }
            : mesh
        )
      );
    }

    lastMouseXRef.current = e.clientX;
    lastMouseYRef.current = e.clientY;
    
    // Forzar redraw
    setDragCounter(prev => prev + 1);
  }, [selectedMeshId, setMeshes, meshes]);

  // DRAG END - mouseup
  const handleMouseUp = useCallback(() => {
    if (isRotating) {
      setIsRotating(false);
      document.body.classList.remove('cursor-rotating');
    }

    if (isRotatingRef.current) {
      isRotatingRef.current = false;
      isDraggingRef.current = false;
      isDraggingObjectRef.current = false;
      return;
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      isDraggingObjectRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        // Restaurar cursor según el contexto actual
        if (activeSettings.bbox) {
          canvas.style.cursor = 'move';
        } else if (selectedMeshId) {
          canvas.style.cursor = 'grab';
        } else if (meshes.length > 0) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'default';
        }
      }
    }
  }, [selectedMeshId, activeSettings, meshes]);

  // Actualizar cursor según el contexto
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isRotating) {
      canvas.style.cursor = 'none'; // Ocultamos el default
      canvas.classList.add('cursor-rotating');
    } else {
      canvas.classList.remove('cursor-rotating');
      // Prioridad 2: Si hay algo seleccionado (mano) o default
      canvas.style.cursor = selectedMeshId ? 'grab' : 'default';
    }
    
    // Si BBox global está activa, mostrar cursor de movimiento para objeto completo
    if (activeSettings.bbox) {
      canvas.style.cursor = 'move';
    } else if (selectedMeshId) {
      canvas.style.cursor = 'grab';
    } else if (meshes.length > 0) {
      // Si hay objetos pero no hay submalla seleccionada, también permitir arrastre
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = 'default';
    }
  }, [selectedMeshId, activeSettings, meshes]);

  const handleClick = useCallback((e: MouseEvent) => {
    // Ignorar click durante arrastre
    if (isDraggingRef.current) return;

    // Si BBox global está activa, no hacer picking (solo arrastre)
    if (activeSettings.bbox) {
      console.log("BBox global activa - click ignorado para picking");
      return;
    }

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
        // Si se selecciona una nueva malla, desactivar BBox global
        if (setActiveSettings) {
          setActiveSettings((prev: any) => ({ ...prev, bbox: false }));
        }
      }
    } else {
      console.log("Click fuera → Deseleccionando");
      setSelectedMeshId(null);
      // Click fuera: desactivar tanto BBox local como global
      toggleBBoxLocal?.();
      if (setActiveSettings) {
        setActiveSettings((prev: any) => ({ ...prev, bbox: false }));
      }
    }
  }, [meshes, bgColor, selectedMeshId, setSelectedMeshId, toggleBBoxLocal, parseRgba, setActiveSettings, activeSettings, isDraggingRef]);
  

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
    // Evitar menú contextual para usar botón derecho en rotación
    const ctx = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', ctx);
    return () => canvas.removeEventListener('click', handleClick as any);
  }, [handleClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = (e: Event) => e.preventDefault();
    return () => canvas.removeEventListener('contextmenu', ctx);
  }, []);

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