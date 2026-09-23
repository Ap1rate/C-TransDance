import { useEffect, useRef } from "react";
import { Landmark } from "../domain/types";

const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [24, 26], [26, 28], [28, 30], [30, 32],
  [0, 11], [0, 12],
];

interface Props {
  landmarks: Landmark[] | null;
  mirrored?: boolean;
  compact?: boolean;
  className?: string;
  sourceSize?: { width: number; height: number } | null;
}

export function PoseCanvas({ landmarks, mirrored = false, compact = false, className = "", sourceSize = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!landmarks?.length) return;

    const scale = sourceSize?.width && sourceSize?.height
      ? Math.min(rect.width / sourceSize.width, rect.height / sourceSize.height)
      : 1;
    const renderedWidth = sourceSize?.width ? sourceSize.width * scale : rect.width;
    const renderedHeight = sourceSize?.height ? sourceSize.height * scale : rect.height;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const point = (index: number) => {
      const item = landmarks[index];
      return {
        x: offsetX + (mirrored ? 1 - item.x : item.x) * renderedWidth,
        y: offsetY + item.y * renderedHeight,
        visibility: item.visibility,
      };
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    CONNECTIONS.forEach(([from, to]) => {
      const a = point(from); const b = point(to);
      if (Math.min(a.visibility, b.visibility) < 0.35) return;
      ctx.strokeStyle = "rgba(3, 32, 46, .72)";
      ctx.lineWidth = compact ? 2 : 5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = "rgba(23, 182, 176, .94)";
      ctx.lineWidth = compact ? 1 : 2;
      ctx.stroke();
    });
    [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
      const p = point(index);
      if (p.visibility < 0.35) return;
      const lower = index >= 25;
      ctx.fillStyle = lower ? "#f5a524" : "#17b6b0";
      ctx.strokeStyle = "rgba(255,255,255,.96)";
      ctx.lineWidth = compact ? 1 : 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, compact ? 2.8 : 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }, [landmarks, mirrored, compact, sourceSize]);

  return <canvas ref={canvasRef} className={`pose-canvas ${className}`} aria-label="Detected 33-landmark pose overlay" />;
}
