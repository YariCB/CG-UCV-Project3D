import React, { useEffect, useRef } from 'react';
import { initWebGL, setupShaders, drawMesh, setDepthTest, setCulling, redraw } from '../WebGL';
import '../../styles/style.css';

interface CanvasProps { bgColor?: string; meshes?: any[]; depthEnabled?: boolean; cullingEnabled?: boolean }

const Canvas: React.FC<CanvasProps> = ({ bgColor = 'rgba(0,0,0,1)', meshes = [], depthEnabled = true, cullingEnabled = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ensure proper canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    const ok = initWebGL(canvas);
    if (!ok) {
      alert('Tu navegador no soporta WebGL.');
      return;
    }
    setupShaders();

    // Apply desired depth/culling state (ensures defaults on import)
    setDepthTest(!!depthEnabled);
    setCulling(!!cullingEnabled);

    // clear and draw
    redraw(meshes);

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      initWebGL(canvas);
      setupShaders();
      setDepthTest(!!depthEnabled);
      setCulling(!!cullingEnabled);
      redraw(meshes);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [meshes, depthEnabled, cullingEnabled]);

  return (
    <main className="scene" style={{ background: bgColor }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
};

export default Canvas;