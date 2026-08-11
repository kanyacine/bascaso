"use client";

import { useEffect, useRef, useState } from "react";
import { CornersOut, CrosshairSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { categoryForFormat, categoryOrder } from "@/lib/screenshot-editor/images";
import { cropForCategory } from "@/lib/screenshot-editor/crop";
import { useTranslations } from "@/lib/i18n/locale-context";
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
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const drag = useRef<DragState | null>(null);
  const drag3D = useRef<{
    startClientX: number; startClientY: number; alt: boolean;
    origRotation: { x: number; y: number; z: number }; origX: number; origY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  // Zoom/pan is pure CSS on the canvas element. canvasPoint reads getBoundingClientRect, which
  // already accounts for the transform, so hit testing and element dragging need no changes.
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pan = useRef<{ startClientX: number; startClientY: number; origX: number; origY: number } | null>(null);
  // scale 1 already means "contained in the frame", so fitting is the identity view.
  const fitted = view.scale === 1 && view.x === 0 && view.y === 0;

  // Nothing to undo at the default view, so the controls fade out and only come back on hover.
  // Every view change goes through setViewAwake, which brings them back immediately.
  const [idle, setIdle] = useState(false);
  const setViewAwake: typeof setView = (next) => { setIdle(false); setView(next); };
  useEffect(() => {
    if (!fitted) return;
    const timer = setTimeout(() => setIdle(true), 12_000);
    return () => clearTimeout(timer);
  }, [view, fitted]);

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewAwake((v) => {
      const scale = Math.min(8, Math.max(0.25, v.scale * factor));
      const f = scale / v.scale; // clamped, so recompute the effective factor
      // Scaling happens about the element's centre – shift by the residual so the point under the
      // cursor stays put.
      return {
        scale,
        x: v.x + (clientX - (rect.left + rect.width / 2)) * (1 - f),
        y: v.y + (clientY - (rect.top + rect.height / 2)) * (1 - f),
      };
    });
  };

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
    const popoutCategory = categoryForFormat(doc.outputDevice);
    const popoutOrder = categoryOrder(doc);
    const popoutId = hitTestPopouts(
      shot.popouts.map((p) => ({ ...p, ...cropForCategory(p, popoutCategory, popoutOrder) })),
      dims, x, y, img,
    );
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
    <div className="group relative flex size-full items-center justify-center">
    <canvas
      ref={canvasRef}
      className="max-h-full max-w-full object-contain"
      style={{
        aspectRatio: `${dims.width} / ${dims.height}`,
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        cursor: dragging ? "grabbing" : hovering || is3D ? "grab" : "default",
        touchAction: "none",
      }}
      onWheel={(e) => zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)}
      onDoubleClick={() => setViewAwake({ scale: 1, x: 0, y: 0 })}
      onPointerDown={(e) => {
        // Middle button pans from anywhere; in 2D an empty-space drag pans too, since nothing else
        // claims it (3D keeps empty space for orbiting the mockup).
        const emptyPan = e.button === 1;
        const { x, y } = canvasPoint(e);
        const hit = emptyPan ? null : hitTest(x, y);
        if (!hit) {
          const shot3D = doc.screenshots[doc.selectedIndex];
          if (emptyPan || !shot3D?.screenshot.use3D) {
            pan.current = { startClientX: e.clientX, startClientY: e.clientY, origX: view.x, origY: view.y };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
            return;
          }
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
        if (pan.current) {
          const p = pan.current;
          setViewAwake((v) => ({
            ...v,
            x: p.origX + (e.clientX - p.startClientX),
            y: p.origY + (e.clientY - p.startClientY),
          }));
          return;
        }
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
        pan.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />

      <div className={`absolute right-2 bottom-2 flex items-center gap-1 rounded-md border bg-background/90 p-1 shadow-sm transition-opacity ${
        idle ? "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100" : ""}`}>
        <span className="px-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-7" disabled={view.x === 0 && view.y === 0}
                    aria-label={t("screenshotEditor.recenter")}
                    onClick={() => setViewAwake((v) => ({ ...v, x: 0, y: 0 }))}>
              <CrosshairSimple size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("screenshotEditor.recenter")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-7" disabled={fitted}
                    aria-label={t("screenshotEditor.fitToFrame")}
                    onClick={() => setViewAwake({ scale: 1, x: 0, y: 0 })}>
              <CornersOut size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("screenshotEditor.fitToFrame")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
