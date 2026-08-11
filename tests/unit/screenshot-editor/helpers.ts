import { createCanvas } from "@napi-rs/canvas";

/** Node-canvas context, cast once so all render code can type against DOM's CanvasRenderingContext2D. */
export function makeCanvas(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  return { canvas, ctx };
}

/** RGBA of one pixel. */
export function px(ctx: CanvasRenderingContext2D, x: number, y: number): [number, number, number, number] {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}
