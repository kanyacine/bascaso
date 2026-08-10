/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Port of the canvas interaction layer (setupElementCanvasDrag, app.js:2741-3050):
// hit-testing, drag math and snap guides. Pure – the React canvas component supplies
// pointer coords already scaled to canvas pixels.
import type { Dimensions, EditorElement, ElementLayer, Popout } from "./types";

export const SNAP_THRESHOLD = 1.5; // canvas-percent units (app.js:2747)

export interface DragState {
  id: string;
  isPopout: boolean;
  startX: number; // canvas px at pointer-down
  startY: number;
  origX: number; // percent at pointer-down
  origY: number;
  dims: Dimensions;
}

export function snapToGuides(x: number, y: number, threshold = SNAP_THRESHOLD): { x: number; y: number } {
  return {
    x: Math.abs(x - 50) < threshold ? 50 : x,
    y: Math.abs(y - 50) < threshold ? 50 : y,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function dragPosition(drag: DragState, canvasX: number, canvasY: number): { x: number; y: number } {
  const rawX = drag.origX + ((canvasX - drag.startX) / drag.dims.width) * 100;
  const rawY = drag.origY + ((canvasY - drag.startY) / drag.dims.height) * 100;
  return snapToGuides(clamp(rawX, 0, 100), clamp(rawY, 0, 100));
}

const HIT_LAYER_ORDER: ElementLayer[] = ["above-text", "above-screenshot", "behind-screenshot"];

export function hitTestElements(
  elements: EditorElement[],
  dims: Dimensions,
  x: number,
  y: number,
  imageSizes: Record<string, { width: number; height: number } | undefined>,
): string | null {
  for (const layer of HIT_LAYER_ORDER) {
    const inLayer = elements.filter((el) => el.layer === layer).reverse();
    for (const el of inLayer) {
      const cx = dims.width * (el.x / 100);
      const cy = dims.height * (el.y / 100);
      const w = dims.width * (el.width / 100);
      let h = w;
      if (el.type === "graphic") {
        const size = imageSizes[el.id];
        if (size) h = w * (size.height / size.width);
      } else if (el.type === "text") {
        h = (el.fontSize ?? 60) * 1.5; // appscreen heuristic, raw canvas px (app.js:2827)
      }
      if (Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2) return el.id;
    }
  }
  return null;
}

export function hitTestPopouts(
  popouts: Popout[],
  dims: Dimensions,
  x: number,
  y: number,
  image: { width: number; height: number } | null,
): string | null {
  if (!image) return null;
  for (let i = popouts.length - 1; i >= 0; i--) {
    const p = popouts[i];
    const cx = dims.width * (p.x / 100);
    const cy = dims.height * (p.y / 100);
    const displayW = dims.width * (p.width / 100);
    const sw = (p.cropWidth / 100) * image.width;
    const sh = (p.cropHeight / 100) * image.height;
    const displayH = displayW * (sh / sw);
    if (Math.abs(x - cx) <= displayW / 2 && Math.abs(y - cy) <= displayH / 2) return p.id;
  }
  return null;
}

export function drawSnapGuides(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  pos: { x: number; y: number },
): void {
  const snappedX = Math.abs(pos.x - 50) < 0.01;
  const snappedY = Math.abs(pos.y - 50) < 0.01;
  if (!snappedX && !snappedY) return;
  const scale = dims.width / 400; // 400 = appscreen preview reference width (app.js:3021)
  context.save();
  context.strokeStyle = "rgba(120, 170, 255, 0.45)";
  context.lineWidth = Math.max(1, 1.5 * scale);
  context.setLineDash([12 * scale, 8 * scale]);
  if (snappedX) {
    const gx = Math.round(dims.width * 0.5);
    context.beginPath();
    context.moveTo(gx, 0);
    context.lineTo(gx, dims.height);
    context.stroke();
  }
  if (snappedY) {
    const gy = Math.round(dims.height * 0.5);
    context.beginPath();
    context.moveTo(0, gy);
    context.lineTo(dims.width, gy);
    context.stroke();
  }
  context.restore();
}
