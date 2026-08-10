"use client";

import { useEffect, useRef } from "react";
import { renderScreenshotToCanvas } from "@/lib/screenshot-editor/render/compose";
import { getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { assetsForShot } from "@/lib/hooks/use-editor-images";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function EditorCanvas({ doc, images }: { doc: ScreenshotDoc; images: Map<string, RenderImage> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);

  // Never redraw more than once a frame, and only the selected screenshot.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || doc.screenshots.length === 0) return;
      renderScreenshotToCanvas(canvas, doc, doc.selectedIndex, assetsForShot(doc, doc.selectedIndex, images, {}), {
        language: doc.currentLanguage,
        projectLanguages: doc.projectLanguages,
        createCanvas: (w, h) => {
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          return c;
        },
      });
    });
    const pending = frame.current;
    return () => cancelAnimationFrame(pending);
  }, [doc, images]);

  const dims = getCanvasDimensions(doc);
  return (
    <canvas
      ref={canvasRef}
      className="max-h-full max-w-full object-contain"
      style={{ aspectRatio: `${dims.width} / ${dims.height}` }}
    />
  );
}
