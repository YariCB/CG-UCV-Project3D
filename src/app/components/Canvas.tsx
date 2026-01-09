import React from 'react';
import '../../styles/style.css';

interface CanvasProps { bgColor?: string }
const Canvas: React.FC<CanvasProps> = ({ bgColor = 'rgba(0,0,0,1)' }) => {
  return (
    <main className="scene" style={{ background: bgColor }}>
    </main>
  );
};

export default Canvas;