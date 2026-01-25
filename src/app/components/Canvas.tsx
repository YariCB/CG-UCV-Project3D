import React, { useEffect, useRef, useCallback, useState } from 'react';
import { quat } from 'gl-matrix';
import { initWebGL, setAntialiasing, setupShaders, setDepthTest, setCulling, redraw, pickAt, pushGlobalRotation, applyDeltaGlobalQuat, getRotationSensitivity, setCamera, getCamera, localToWorld, modelNoTranslateLocalPoint, computeTranslateForDesiredWorld } from '../WebGL';
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
  resetTicket?: number;
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
  setActiveSettings,
  resetTicket = 0
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

  // Cámara estilo FPS: posición, orientación (yaw/pitch), vectores
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const yawRef = useRef(-90); // mirar hacia -Z por defecto
  const pitchRef = useRef(0);
  const frontRef = useRef<[number, number, number]>([0, 0, -1]);
  const upRef = useRef<[number, number, number]>([0, 1, 0]);
  const lookLastXRef = useRef<number | null>(null);
  const lookLastYRef = useRef<number | null>(null);
  const moveSpeedRef = useRef(0.2);
  const mouseSensitivityRef = useRef(0.15); // degrees per pixel

  // Profundidad inicial del objeto
  const initialDepthRef = useRef<number>(-3); 

  // Frames por segundo (FPS)
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    // Solo activar el loop si el ajuste de FPS está habilitado
    if (!activeSettings.fps) {
      setFps(0);
      frameTimesRef.current = [];
      return;
    }

    let requestId: number;

    const calculateFps = () => {
      const now = performance.now();
      frameTimesRef.current.push(now);

      const fiveSecondsAgo = now - 5000;
      while (frameTimesRef.current.length > 0 && frameTimesRef.current[0] < fiveSecondsAgo) {
        frameTimesRef.current.shift();
      }

      // Calculamos del tiempo real que se tiene en el buffer (máximo 5 segundos)
      const durationInSeconds = (now - frameTimesRef.current[0]) / 1000;
      
      const averageFps = durationInSeconds > 0 
        ? frameTimesRef.current.length / durationInSeconds 
        : 0;

      setFps(Math.round(averageFps));
      requestId = requestAnimationFrame(calculateFps);
    };

    requestId = requestAnimationFrame(calculateFps);
    return () => cancelAnimationFrame(requestId);
  }, [activeSettings.fps]);

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
      globalBBoxRgb,
      activeSettings
    );
    // Asegurar que la cámara actual se propague (por si cambió fuera)
    setCamera(cameraPosRef.current, frontRef.current, upRef.current);
  }, [meshes, bgColor, bboxColor, bboxGlobalColor, selectedMeshId, showLocalBBox, parseRgba, activeSettings]);

  useEffect(() => {
    // 1. Limpiamos la memoria del mouse para evitar saltos
    lookLastXRef.current = null;
    lookLastYRef.current = null;

    // 2. Obtener la cámara actual desde WebGL (puede haber sido reseteada)
    try {
      const cam = getCamera();
      if (cam) {
        cameraPosRef.current = [cam.pos[0], cam.pos[1], cam.pos[2]];
        frontRef.current = [cam.front[0], cam.front[1], cam.front[2]];
        upRef.current = [cam.up[0], cam.up[1], cam.up[2]];

        // Actualizar yaw/pitch a partir del vector front
        const fx = frontRef.current[0];
        const fy = frontRef.current[1];
        const fz = frontRef.current[2];
        const yaw = Math.atan2(fz, fx) * 180 / Math.PI;
        const pitch = Math.asin(fy) * 180 / Math.PI;
        yawRef.current = yaw;
        pitchRef.current = pitch;

        // Propagar la cámara a WebGL por coherencia
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
      }
    } catch (err) {
      // si falla, seguir con el redraw
    }

    // 3. Forzamos el redibujado con los valores reseteados de WebGL.ts
    handleRedraw();

    console.log("Canvas: Redibujado por señal de reset");
  }, [resetTicket, handleRedraw]);

  // DRAG START - mousedown sobre sub-malla seleccionada u objeto completo
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !setMeshes) return; // Eliminamos la verificación de selectedMeshId
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const px = Math.floor(Math.max(0, Math.min(x, canvas.width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, canvas.height - 1)));
    
    const pickedId = pickAt(px, py, canvas, meshes, parseRgba(bgColor), activeSettings);

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
    // Primero: si el usuario está en modo 'look' con Alt (o Ctrl) y no está arrastrando/rotando objetos,
    // usar el movimiento del ratón para rotar la cámara.
    if (!isDraggingRef.current && !isRotatingRef.current && (e.altKey || e.ctrlKey)) {
      // Look-around
      const lx = lookLastXRef.current;
      const ly = lookLastYRef.current;
      if (lx === null || ly === null) {
        lookLastXRef.current = e.clientX;
        lookLastYRef.current = e.clientY;
      } else {
        const dx = e.clientX - lx;
        const dy = e.clientY - ly;
        lookLastXRef.current = e.clientX;
        lookLastYRef.current = e.clientY;

        const yaw = yawRef.current + dx * mouseSensitivityRef.current;
        let pitch = pitchRef.current + dy * mouseSensitivityRef.current * -1; // invertir Y para control tipo FPS
        if (pitch > 89) pitch = 89;
        if (pitch < -89) pitch = -89;
        yawRef.current = yaw;
        pitchRef.current = pitch;

        // Recalcular front
        const yawRad = yawRef.current * Math.PI / 180;
        const pitchRad = pitchRef.current * Math.PI / 180;
        const fx = Math.cos(yawRad) * Math.cos(pitchRad);
        const fy = Math.sin(pitchRad);
        const fz = Math.sin(yawRad) * Math.cos(pitchRad);
        // normalizar
        const len = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1;
        frontRef.current = [fx/len, fy/len, fz/len];
        // Propagar a WebGL y redibujar
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
        setDragCounter(prev => prev + 1);
      }
      return;
    }

    // Si no estamos en modo 'look', proceder con lógica existente de arrastre
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
      // Compute world-space delta based on depth at the group's center
      // Use the average of mesh centers transformed to world to get a reference depth
      const refMesh = meshes[0];
      const refLocal = (refMesh && refMesh.center) ? refMesh.center : [0,0,0];
      const refWorld = localToWorld(refMesh, refLocal as [number,number,number]);
      // camera basis
      const camPos = cameraPosRef.current;
      const camFront = frontRef.current;
      const camUp = upRef.current;
      const toRef = [refWorld[0]-camPos[0], refWorld[1]-camPos[1], refWorld[2]-camPos[2]];
      const depth = Math.max(0.0001, Math.abs((toRef[0]*camFront[0] + toRef[1]*camFront[1] + toRef[2]*camFront[2])));

      const worldHeight = 2 * Math.tan(fov / 2) * depth;
      const worldWidth = worldHeight * aspect;
      const moveX = (deltaX / rect.width) * worldWidth;
      const moveY = -(deltaY / rect.height) * worldHeight;

      // camera right vector
      const right = [
        camFront[1]*camUp[2] - camFront[2]*camUp[1],
        camFront[2]*camUp[0] - camFront[0]*camUp[2],
        camFront[0]*camUp[1] - camFront[1]*camUp[0]
      ];
      const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
      right[0]/=rlen; right[1]/=rlen; right[2]/=rlen;

      const upVec = camUp;

      const worldDelta = [ right[0]*moveX + upVec[0]*moveY, right[1]*moveX + upVec[1]*moveY, right[2]*moveX + upVec[2]*moveY ];

      // Apply worldDelta to each mesh by computing the required local translate
      setMeshes(prevMeshes => prevMeshes.map(mesh => {
        const localRef = mesh.center ? mesh.center : [0,0,0];
        const worldRef = localToWorld(mesh, localRef as [number,number,number]);
        const desiredWorld = [worldRef[0]+worldDelta[0], worldRef[1]+worldDelta[1], worldRef[2]+worldDelta[2]];
        const newTranslate = computeTranslateForDesiredWorld(mesh, desiredWorld, localRef as [number,number,number]);
        return { ...mesh, translate: newTranslate };
      }));
    } else {
      // Arrastrar submalla seleccionada
      if (!selectedMeshId) return;
      
      const selectedMesh = meshes.find(m => m.id === selectedMeshId);
      if (!selectedMesh) return;
      
      const localRef = selectedMesh.center ? selectedMesh.center : [0,0,0];
      const worldRef = localToWorld(selectedMesh, localRef as [number,number,number]);
      const toRef = [worldRef[0]-cameraPosRef.current[0], worldRef[1]-cameraPosRef.current[1], worldRef[2]-cameraPosRef.current[2]];
      const depth = Math.max(0.0001, Math.abs((toRef[0]*frontRef.current[0] + toRef[1]*frontRef.current[1] + toRef[2]*frontRef.current[2])));
      const worldHeight = 2 * Math.tan(fov / 2) * depth;
      const worldWidth = worldHeight * aspect;
      const moveX = (deltaX / rect.width) * worldWidth;
      const moveY = -(deltaY / rect.height) * worldHeight;

      // camera right vector
      const camFront = frontRef.current;
      const camUp = upRef.current;
      const right = [
        camFront[1]*camUp[2] - camFront[2]*camUp[1],
        camFront[2]*camUp[0] - camFront[0]*camUp[2],
        camFront[0]*camUp[1] - camFront[1]*camUp[0]
      ];
      const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
      right[0]/=rlen; right[1]/=rlen; right[2]/=rlen;

      const upVec = camUp;
      const worldDelta = [ right[0]*moveX + upVec[0]*moveY, right[1]*moveX + upVec[1]*moveY, right[2]*moveX + upVec[2]*moveY ];

      const desiredWorld = [ worldRef[0] + worldDelta[0], worldRef[1] + worldDelta[1], worldRef[2] + worldDelta[2] ];
      const newTranslate = computeTranslateForDesiredWorld(selectedMesh, desiredWorld, localRef as [number,number,number]);

      setMeshes(prevMeshes => prevMeshes.map(mesh => mesh.id === selectedMeshId ? { ...mesh, translate: newTranslate } : mesh));
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
    
    const pickedId = pickAt(px, py, canvas, meshes, parseRgba(bgColor), activeSettings);
    console.log("Click → ID:", pickedId, "Current:", selectedMeshId, "Wireframe:", activeSettings.wireframe);
    
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

    const ok = initWebGL(canvas, !!activeSettings.aa);
    if (!ok) {
      alert('Tu navegador no soporta WebGL.');
      return;
    }
    setupShaders();
    setDepthTest(!!depthEnabled);
    setCulling(!!cullingEnabled);
    
    // Inicializar cámara por defecto
    frontRef.current = [0, 0, -1];
    upRef.current = [0, 1, 0];
    cameraPosRef.current = [0, 0, 0];
    setCamera(cameraPosRef.current, frontRef.current, upRef.current);
    
    handleRedraw();
  }, []);

  // Teclado: mover adelante/atrás y rotar izquierda/derecha
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        const pos = cameraPosRef.current;
        const f = frontRef.current;
        const speed = moveSpeedRef.current;
        cameraPosRef.current = [pos[0] + f[0]*speed, pos[1] + f[1]*speed, pos[2] + f[2]*speed];
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
        setDragCounter(c => c + 1);
      } else if (e.key === 'ArrowDown') {
        const pos = cameraPosRef.current;
        const f = frontRef.current;
        const speed = moveSpeedRef.current;
        cameraPosRef.current = [pos[0] - f[0]*speed, pos[1] - f[1]*speed, pos[2] - f[2]*speed];
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
        setDragCounter(c => c + 1);
      } else if (e.key === 'ArrowLeft') {
        yawRef.current -= 5;
        const yawRad = yawRef.current * Math.PI / 180;
        const pitchRad = pitchRef.current * Math.PI / 180;
        const fx = Math.cos(yawRad) * Math.cos(pitchRad);
        const fy = Math.sin(pitchRad);
        const fz = Math.sin(yawRad) * Math.cos(pitchRad);
        const len = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1;
        frontRef.current = [fx/len, fy/len, fz/len];
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
        setDragCounter(c => c + 1);
      } else if (e.key === 'ArrowRight') {
        yawRef.current += 5;
        const yawRad = yawRef.current * Math.PI / 180;
        const pitchRad = pitchRef.current * Math.PI / 180;
        const fx = Math.cos(yawRad) * Math.cos(pitchRad);
        const fy = Math.sin(pitchRad);
        const fz = Math.sin(yawRad) * Math.cos(pitchRad);
        const len = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1;
        frontRef.current = [fx/len, fy/len, fz/len];
        setCamera(cameraPosRef.current, frontRef.current, upRef.current);
        setDragCounter(c => c + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      
      initWebGL(canvas, !!activeSettings.aa);
      setupShaders();
      setDepthTest(!!depthEnabled);
      setCulling(!!cullingEnabled);
      handleRedraw();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [depthEnabled, cullingEnabled, handleRedraw, activeSettings.aa]);

  // Cuando cambie la opción de antialiasing, recrear contexto y shaders
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Llamada para recrear contexto si es necesario
    const changed = setAntialiasing(!!activeSettings.aa, canvas);
    if (changed) {
      // Reaplicar estados y forzar un redraw
      setupShaders();
      setDepthTest(!!depthEnabled);
      setCulling(!!cullingEnabled);
      handleRedraw();
    }
  }, [activeSettings.aa, depthEnabled, cullingEnabled, handleRedraw]);

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

  // Limpiar estado de 'look' cuando se suelta Alt/Ctrl
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Control') {
        lookLastXRef.current = null;
        lookLastYRef.current = null;
      }
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  useEffect(() => {
    handleRedraw();
  }, [handleRedraw, dragCounter, meshes]);

  return (
    <main className="scene" style={{ background: bgColor }}>
      {activeSettings.fps && (
        <div className="fps-card">
          <ion-icon name="speedometer-outline" style={{ marginRight: '8px', color: '#a191ff' }}></ion-icon>
          <span className="fps-label">FPS</span>
          <span className="fps-value">{fps}</span>
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
};

export default Canvas;