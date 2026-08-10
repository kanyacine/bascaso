/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Port of the crop-preview math (getCropPreviewLayout app.js:3218, hitTestCropHandle
// app.js:3333, moveCropDrag app.js:3389). Pure percent/pixel geometry.

export interface CropRect { cropX: number; cropY: number; cropWidth: number; cropHeight: number }
export interface CropLayout { drawX: number; drawY: number; drawW: number; drawH: number }
export type CropHandle =
  | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  | "top" | "bottom" | "left" | "right" | "move";

export const MIN_CROP_PCT = 5;
export const CROP_HANDLE_HIT_RADIUS = 12; // canvas px

export function getCropPreviewLayout(
  canvasW: number, canvasH: number, imgW: number, imgH: number,
): CropLayout {
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return { drawX: (canvasW - drawW) / 2, drawY: (canvasH - drawH) / 2, drawW, drawH };
}

function cropRectPx(layout: CropLayout, crop: CropRect) {
  return {
    rx: layout.drawX + (crop.cropX / 100) * layout.drawW,
    ry: layout.drawY + (crop.cropY / 100) * layout.drawH,
    rw: (crop.cropWidth / 100) * layout.drawW,
    rh: (crop.cropHeight / 100) * layout.drawH,
  };
}

export function hitTestCropHandle(
  x: number, y: number, layout: CropLayout, crop: CropRect, hitRadius = CROP_HANDLE_HIT_RADIUS,
): CropHandle | null {
  const { rx, ry, rw, rh } = cropRectPx(layout, crop);
  const near = (px: number, py: number) => Math.abs(x - px) <= hitRadius && Math.abs(y - py) <= hitRadius;
  const corners: [CropHandle, number, number][] = [
    ["top-left", rx, ry], ["top-right", rx + rw, ry],
    ["bottom-left", rx, ry + rh], ["bottom-right", rx + rw, ry + rh],
  ];
  for (const [handle, px, py] of corners) if (near(px, py)) return handle;
  const edges: [CropHandle, number, number][] = [
    ["top", rx + rw / 2, ry], ["bottom", rx + rw / 2, ry + rh],
    ["left", rx, ry + rh / 2], ["right", rx + rw, ry + rh / 2],
  ];
  for (const [handle, px, py] of edges) if (near(px, py)) return handle;
  if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return "move";
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function applyCropDrag(handle: CropHandle, orig: CropRect, dxPct: number, dyPct: number): CropRect {
  let { cropX: x, cropY: y, cropWidth: w, cropHeight: h } = orig;
  if (handle === "move") {
    return { cropX: clamp(x + dxPct, 0, 100 - w), cropY: clamp(y + dyPct, 0, 100 - h), cropWidth: w, cropHeight: h };
  }
  const left = handle === "left" || handle === "top-left" || handle === "bottom-left";
  const right = handle === "right" || handle === "top-right" || handle === "bottom-right";
  const top = handle === "top" || handle === "top-left" || handle === "top-right";
  const bottom = handle === "bottom" || handle === "bottom-left" || handle === "bottom-right";
  if (left) {
    const farEdge = x + w;
    x = clamp(x + dxPct, 0, farEdge - MIN_CROP_PCT);
    w = farEdge - x;
  } else if (right) {
    w = clamp(w + dxPct, MIN_CROP_PCT, 100 - x);
  }
  if (top) {
    const farEdge = y + h;
    y = clamp(y + dyPct, 0, farEdge - MIN_CROP_PCT);
    h = farEdge - y;
  } else if (bottom) {
    h = clamp(h + dyPct, MIN_CROP_PCT, 100 - y);
  }
  return { cropX: x, cropY: y, cropWidth: w, cropHeight: h };
}
