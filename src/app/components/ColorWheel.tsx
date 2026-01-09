import React, { useRef, useEffect, useState } from 'react';

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ColorWheelProps {
  currentColor: string;
  size?: number;
  onColorSelect: (newColor: string) => void;
}

// --- Utilidades Matemáticas de Color ---
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h: number, s: number, v: number = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }
  return [h * 360, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function parseRgba(colorString: string): RGBA {
  const m = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: parseInt(m[1]),
    g: parseInt(m[2]),
    b: parseInt(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1
  };
}

const ColorWheel: React.FC<ColorWheelProps> = ({ onColorSelect, currentColor, size = 150 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragMode = useRef<{ mode: 'ring' | 'tri' | null; pointerId: number | null }>({ mode: null, pointerId: null });
  const [hue, setHue] = useState<number>(0);

  useEffect(() => {
    const { r, g, b } = parseRgba(currentColor);
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s > 0.01 && v > 0.01) {
      setHue(h);
    }
  }, [currentColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const outerR = radius * 0.95;
    const innerR = outerR * 0.80;
    const triR = innerR * 0.90;

    const v1 = { x: cx, y: cy - triR };
    const v2 = { x: cx - triR * 0.866, y: cy + triR * 0.5 };
    const v3 = { x: cx + triR * 0.866, y: cy + triR * 0.5 };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    for (let i = 0; i < 360; i++) {
      const startAngle = (i - 0.5) * Math.PI / 180 - Math.PI / 2;
      const endAngle = (i + 1.5) * Math.PI / 180 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, startAngle, endAngle);
      ctx.lineWidth = outerR - innerR;
      ctx.strokeStyle = `hsl(${i}, 100%, 50%)`;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.lineTo(v3.x, v3.y);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, size, size);

    const gradWhite = ctx.createLinearGradient(v2.x, v2.y, (v1.x + v3.x) / 2, (v1.y + v3.y) / 2);
    gradWhite.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradWhite.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, size, size);

    const gradBlack = ctx.createLinearGradient(v3.x, v3.y, (v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
    gradBlack.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradBlack.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    const hueRad = (hue - 90) * Math.PI / 180;
    const barInX = cx + innerR * Math.cos(hueRad);
    const barInY = cy + innerR * Math.sin(hueRad);
    const barOutX = cx + outerR * Math.cos(hueRad);
    const barOutY = cy + outerR * Math.sin(hueRad);

    ctx.beginPath();
    ctx.moveTo(barInX, barInY);
    ctx.lineTo(barOutX, barOutY);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.stroke();

    const { r, g, b } = parseRgba(currentColor);
    const [, s, v] = rgbToHsv(r, g, b);
    const px = v3.x * (1 - v) + v2.x * v * (1 - s) + v1.x * v * s;
    const py = v3.y * (1 - v) + v2.y * v * (1 - s) + v1.y * v * s;

    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    function getMousePos(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    function barycentricColor(px: number, py: number): RGBA | null {
      const p = { x: px, y: py };
      const a = v1, b = v2, c = v3;
      const v0 = { x: b.x - a.x, y: b.y - a.y };
      const v1v = { x: c.x - a.x, y: c.y - a.y };
      const v2v = { x: p.x - a.x, y: p.y - a.y };

      const d00 = v0.x * v0.x + v0.y * v0.y;
                  const d01 = v0.x * v1v.x + v0.y * v1v.y;
            const d11 = v1v.x * v1v.x + v1v.y * v1v.y;
            const d20 = v2v.x * v0.x + v2v.y * v0.y;
            const d21 = v2v.x * v1v.x + v2v.y * v1v.y;

            const denom = d00 * d11 - d01 * d01;
            if (denom === 0) return null;

            let v = (d11 * d20 - d01 * d21) / denom;
            let w = (d00 * d21 - d01 * d20) / denom;
            let u = 1 - v - w;

            if (u < 0 || v < 0 || w < 0) {
                u = Math.max(0, u); v = Math.max(0, v); w = Math.max(0, w);
                const sum = u + v + w || 1;
                u /= sum; v /= sum; w /= sum;
            }

            const [hr, hg, hb] = hsvToRgb(hue, 1, 1);
            const colR = Math.round(u * hr + v * 255 + w * 0);
            const colG = Math.round(u * hg + v * 255 + w * 0);
            const colB = Math.round(u * hb + v * 255 + w * 0);

            return { r: colR, g: colG, b: colB, a: 1 };
        }

        function updateFromPointer(x: number, y: number, mode: 'ring' | 'tri' | null) {
            const dx = x - cx;
            const dy = y - cy;

            if (mode === 'ring') {
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const newHue = (angle + 90 + 360) % 360;
                setHue(newHue);

                const { r, g, b, a } = parseRgba(currentColor);
                const [, curS, curV] = rgbToHsv(r, g, b);
                const [nR, nG, nB] = hsvToRgb(newHue, curS, curV);
                onColorSelect(`rgba(${nR}, ${nG}, ${nB}, ${a})`);
            } else if (mode === 'tri') {
                const bc = barycentricColor(x, y);
                if (bc) {
                    const { a } = parseRgba(currentColor);
                    onColorSelect(`rgba(${bc.r}, ${bc.g}, ${bc.b}, ${a})`);
                }
            }
        }

        function onPointerDown(e: PointerEvent) {
            const { x, y } = getMousePos(e);
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= innerR && dist <= outerR) {
                dragMode.current.mode = 'ring';
            } else if (dist < innerR) {
                dragMode.current.mode = 'tri';
            } else {
                dragMode.current.mode = null;
            }

            if (dragMode.current.mode) {
                dragMode.current.pointerId = e.pointerId;
                try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
                updateFromPointer(x, y, dragMode.current.mode);
            }
        }

        function onPointerMove(e: PointerEvent) {
            if (!dragMode.current.mode) return;
            if (dragMode.current.pointerId != null && e.pointerId !== dragMode.current.pointerId) return;
            const { x, y } = getMousePos(e);
            updateFromPointer(x, y, dragMode.current.mode);
        }

        function onPointerUp(e: PointerEvent) {
            if (dragMode.current.pointerId != null && e && e.pointerId !== dragMode.current.pointerId) return;
            if (dragMode.current.pointerId != null) {
                try { canvas.releasePointerCapture(dragMode.current.pointerId); } catch (err) {}
            }
            dragMode.current.mode = null;
            dragMode.current.pointerId = null;
        }

        canvas.addEventListener('pointerdown', onPointerDown as any);
        canvas.addEventListener('pointermove', onPointerMove as any);
        canvas.addEventListener('pointerup', onPointerUp as any);
        canvas.addEventListener('pointercancel', onPointerUp as any);

        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown as any);
            canvas.removeEventListener('pointermove', onPointerMove as any);
            canvas.removeEventListener('pointerup', onPointerUp as any);
            canvas.removeEventListener('pointercancel', onPointerUp as any);
        };

    }, [onColorSelect, currentColor, size, hue]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                borderRadius: '50%',
                cursor: 'crosshair',
                touchAction: 'none'
            }}
        />
    );
};

export default ColorWheel;