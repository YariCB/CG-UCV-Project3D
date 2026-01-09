import React, {useEffect, useRef} from 'react';
import { initWebGL, setupShaders, drawMesh } from '../WebGL';
import '../../styles/style.css';

interface CanvasProps { bgColor?: string }
interface CanvasProps { meshes: any[] }

const Canvas: React.FC<CanvasProps> = ({ bgColor = 'rgba(0,0,0,1)', meshes }) => {
const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const ok = initWebGL(canvasRef.current);
      if (!ok) {
        alert("Tu navegador no soporta WebGL.");
      }
      setupShaders();
      meshes.forEach(m => drawMesh(m));
    }
  }, []);

  return (
    <main className="scene" style={{ background: bgColor }}>
    </main>
  );
};

export default Canvas;