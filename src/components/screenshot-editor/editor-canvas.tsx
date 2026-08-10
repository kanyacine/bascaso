"use client";

import { useEffect, useRef, useState } from "react";
import { renderScreenshotToCanvas, resolveScreenshotImage } from "@/lib/screenshot-editor/render/compose";
import { getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import {
  dragPosition, drawSnapGuides, hitTestElements, hitTestPopouts, move3DFromDrag, rotate3DFromDrag,
  type DragState,
} from "@/lib/screenshot-editor/interaction";
import { assetsForShot } from "@/lib/hooks/use-editor-images";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { LaurelVariant, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function EditorCanvas({
  doc, images, laurelImages, fontsVersion, mockup, dispatch, onSelectElement, onSelectPopout,
}: {
  doc: ScreenshotDoc;
  images: Map<string, RenderImage>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
  fontsVersion: number;
  mockup: RenderImage | null;
  dispatch: (a: EditorAction) => void;
  onSelectElement: (id: string) => void;
  onSelectPopout: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const drag = useRef<DragState | null>(null);
  const drag3D = useRef<{
    startClientX: number; startClientY: number; alt: boolean;
    origRotation: { x: number; y: number; z: number }; origX: number; origY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);

  // Never redraw more than once a frame, and only the selected screenshot.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || doc.screenshots.length === 0) return;
      renderScreenshotToCanvas(
        canvas, doc, doc.selectedIndex,
        { ...assetsForShot(doc, doc.selectedIndex, images, laurelImages), mockup },
        {
          language: doc.currentLanguage,
          projectLanguages: doc.projectLanguages,
          createCanvas: (w, h) => {
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            return c;
          },
        },
      );
      if (drag.current) {
        const shot = doc.screenshots[doc.selectedIndex];
        const item = drag.current.isPopout
          ? shot.popouts.find((p) => p.id === drag.current!.id)
          : shot.elements.find((e) => e.id === drag.current!.id);
        const ctx = canvas.getContext("2d");
        if (item && ctx) drawSnapGuides(ctx, getCanvasDimensions(doc), { x: item.x, y: item.y });
      }
    });
    const pending = frame.current;
    return () => cancelAnimationFrame(pending);
  }, [doc, images, laurelImages, dragging, fontsVersion, mockup]);

  const canvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const hitTest = (x: number, y: number): { id: string; isPopout: boolean } | null => {
    const shot = doc.screenshots[doc.selectedIndex];
    if (!shot) return null;
    const dims = getCanvasDimensions(doc);
    // appscreen order: popouts first, then elements front-to-back (app.js:2886)
    const img = resolveScreenshotImage(
      assetsForShot(doc, doc.selectedIndex, images, {}), doc.currentLanguage, doc.projectLanguages,
    );
    const popoutId = hitTestPopouts(shot.popouts, dims, x, y, img);
    if (popoutId) return { id: popoutId, isPopout: true };
    const sizes: Record<string, { width: number; height: number } | undefined> = {};
    for (const el of shot.elements) {
      const bitmap = el.src ? images.get(el.src) : undefined;
      sizes[el.id] = bitmap ? { width: bitmap.width, height: bitmap.height } : undefined;
    }
    const elementId = hitTestElements(shot.elements, dims, x, y, sizes);
    return elementId ? { id: elementId, isPopout: false } : null;
  };

  const dims = getCanvasDimensions(doc);
  const is3D = doc.screenshots[doc.selectedIndex]?.screenshot.use3D ?? false;
  return (
    <canvas
      ref={canvasRef}
      className="max-h-full max-w-full object-contain"
      style={{
        aspectRatio: `${dims.width} / ${dims.height}`,
        cursor: dragging ? "grabbing" : hovering || is3D ? "grab" : "default",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        const { x, y } = canvasPoint(e);
        const hit = hitTest(x, y);
        if (!hit) {
          const shot3D = doc.screenshots[doc.selectedIndex];
          if (!shot3D?.screenshot.use3D) return;
          drag3D.current = {
            startClientX: e.clientX, startClientY: e.clientY, alt: e.altKey,
            origRotation: { ...shot3D.screenshot.rotation3D },
            origX: shot3D.screenshot.x, origY: shot3D.screenshot.y,
          };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
        const shot = doc.screenshots[doc.selectedIndex];
        const item = hit.isPopout
          ? shot.popouts.find((p) => p.id === hit.id)!
          : shot.elements.find((el) => el.id === hit.id)!;
        drag.current = {
          id: hit.id, isPopout: hit.isPopout,
          startX: x, startY: y, origX: item.x, origY: item.y, dims: getCanvasDimensions(doc),
        };
        setDragging(true);
        if (hit.isPopout) onSelectPopout(hit.id); else onSelectElement(hit.id);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (drag3D.current) {
          const d = drag3D.current;
          const dx = e.clientX - d.startClientX;
          const dy = e.clientY - d.startClientY;
          // absolute from the drag origin – no per-event compounding
          const patch = d.alt
            ? move3DFromDrag({ x: d.origX, y: d.origY }, dx, dy)
            : { rotation3D: rotate3DFromDrag(d.origRotation, dx, dy) };
          dispatch({ type: "set-screenshot-setting", index: doc.selectedIndex, patch });
          return;
        }
        const { x, y } = canvasPoint(e);
        if (!drag.current) {
          setHovering(hitTest(x, y) !== null);
          return;
        }
        const pos = dragPosition(drag.current, x, y);
        const { id, isPopout } = drag.current;
        if (isPopout) {
          dispatch({ type: "update-popout", index: doc.selectedIndex, popoutId: id, patch: pos });
        } else {
          dispatch({ type: "update-element", index: doc.selectedIndex, elementId: id, patch: pos });
        }
      }}
      onPointerUp={(e) => {
        drag.current = null;
        drag3D.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
}
