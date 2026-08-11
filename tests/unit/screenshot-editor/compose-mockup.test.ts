import { describe, it, expect } from "vitest";
import { renderScreenshotToCanvas } from "@/lib/screenshot-editor/render/compose";
import { editorReducer } from "@/lib/screenshot-editor/reducer";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import { makeCanvas, px } from "./helpers";
import type { RenderAssets, RenderImage } from "@/lib/screenshot-editor/types";

function docWithShot(use3D: boolean) {
  let doc = createEmptyDoc();
  doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
  doc = editorReducer(doc, { type: "set-screenshot-setting", index: 0, patch: { use3D } });
  // solid background so the "nothing drawn" case is distinguishable
  doc = editorReducer(doc, { type: "set-background", index: 0, patch: { type: "solid", solid: "#000000" } });
  return doc;
}

function redMockup(width: number, height: number): RenderImage {
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width, height);
  return canvas as unknown as RenderImage;
}

function assets(mockup: RenderImage | null): RenderAssets {
  return { screenshotImages: {}, elementImages: {}, laurelImages: {}, mockup };
}

const env = {
  language: "en-US",
  projectLanguages: ["en-US"],
  createCanvas: (w: number, h: number) => makeCanvas(w, h).canvas as never,
};

describe("compose – 3D mockup", () => {
  it("draws the mockup bitmap full-size when use3D", () => {
    const doc = docWithShot(true);
    const { canvas } = makeCanvas(1260, 2736);
    renderScreenshotToCanvas(canvas as never, doc, 0, assets(redMockup(1260, 2736)), env);
    expect(px(canvas.getContext("2d") as unknown as CanvasRenderingContext2D, 630, 1368)).toEqual([255, 0, 0, 255]);
  });

  it("draws only the background while the mockup is absent", () => {
    const doc = docWithShot(true);
    const { canvas } = makeCanvas(1260, 2736);
    renderScreenshotToCanvas(canvas as never, doc, 0, assets(null), env);
    expect(px(canvas.getContext("2d") as unknown as CanvasRenderingContext2D, 630, 1368)).toEqual([0, 0, 0, 255]);
  });

  it("ignores the mockup in 2D mode", () => {
    const doc = docWithShot(false);
    const { canvas } = makeCanvas(1260, 2736);
    renderScreenshotToCanvas(canvas as never, doc, 0, assets(redMockup(1260, 2736)), env);
    expect(px(canvas.getContext("2d") as unknown as CanvasRenderingContext2D, 630, 1368)).toEqual([0, 0, 0, 255]); // no screenshot image loaded → background
  });
});
