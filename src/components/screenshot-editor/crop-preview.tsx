"use client";

import { useEffect, useRef } from "react";
import {
  applyCropDrag, getCropPreviewLayout, hitTestCropHandle, type CropHandle, type CropRect,
} from "@/lib/screenshot-editor/crop";
import type { Popout, RenderImage } from "@/lib/screenshot-editor/types";

const CURSORS: Record<CropHandle, string> = {
  "top-left": "nwse-resize", "bottom-right": "nwse-resize",
  "top-right": "nesw-resize", "bottom-left": "nesw-resize",
  top: "ns-resize", bottom: "ns-resize", left: "ew-resize", right: "ew-resize",
  move: "move",
};

export function CropPreview({ image, popout, onCropChange }: {
  image: RenderImage; popout: Popout; onCropChange: (patch: CropRect) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ handle: CropHandle; startX: number; startY: number; orig: CropRect } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const containerWidth = canvas.parentElement?.clientWidth || 280;
    const aspect = image.width / image.height;
    canvas.width = containerWidth * 2; // 2x retina, appscreen parity
    canvas.height = Math.round(canvas.width / aspect);
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${Math.round(containerWidth / aspect)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const layout = getCropPreviewLayout(canvas.width, canvas.height, image.width, image.height);
    const { drawX, drawY, drawW, drawH } = layout;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image as CanvasImageSource, drawX, drawY, drawW, drawH);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rx = drawX + (popout.cropX / 100) * drawW;
    const ry = drawY + (popout.cropY / 100) * drawH;
    const rw = (popout.cropWidth / 100) * drawW;
    const rh = (popout.cropHeight / 100) * drawH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.clearRect(rx, ry, rw, rh);
    ctx.drawImage(image as CanvasImageSource, drawX, drawY, drawW, drawH);
    ctx.restore();
    ctx.strokeStyle = "rgba(10, 132, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    const handleSize = 8;
    const points: [number, number][] = [
      [rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh],
      [rx + rw / 2, ry], [rx + rw / 2, ry + rh], [rx, ry + rh / 2], [rx + rw, ry + rh / 2],
    ];
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(10, 132, 255, 1)";
    ctx.lineWidth = 1.5;
    for (const [hx, hy] of points) {
      ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    }
  }, [image, popout.cropX, popout.cropY, popout.cropWidth, popout.cropHeight]);

  const coords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
      layout: getCropPreviewLayout(canvas.width, canvas.height, image.width, image.height),
    };
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-md"
      onPointerDown={(e) => {
        const { x, y, layout } = coords(e);
        const handle = hitTestCropHandle(x, y, layout, popout);
        if (!handle) return;
        drag.current = { handle, startX: x, startY: y, orig: { ...popout } };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const { x, y, layout } = coords(e);
        if (!drag.current) {
          const handle = hitTestCropHandle(x, y, layout, popout);
          e.currentTarget.style.cursor = handle ? CURSORS[handle] : "default";
          return;
        }
        const dxPct = ((x - drag.current.startX) / layout.drawW) * 100;
        const dyPct = ((y - drag.current.startY) / layout.drawH) * 100;
        onCropChange(applyCropDrag(drag.current.handle, drag.current.orig, dxPct, dyPct));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
}
