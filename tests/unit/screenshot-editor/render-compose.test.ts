import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { resolveScreenshotImage, renderScreenshotToCanvas } from "@/lib/screenshot-editor/render/compose";
import { DEFAULTS, createDefaultScreenshot } from "@/lib/screenshot-editor/defaults";
import { makeCanvas, px } from "./helpers";
import type { RenderAssets, RenderEnv, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

function bitmap(color: string, w = 50, h = 100): RenderImage {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  return canvas as unknown as RenderImage;
}

describe("resolveScreenshotImage", () => {
  const red = bitmap("#ff0000"); const blue = bitmap("#0000ff"); const green = bitmap("#00ff00");

  it("prefers the current language", () => {
    expect(resolveScreenshotImage({ screenshotImages: { fr: red, en: blue } }, "fr", ["en", "fr"])).toBe(red);
  });

  it("falls back through project-language order, then any language, then legacy", () => {
    expect(resolveScreenshotImage({ screenshotImages: { fr: red } }, "de", ["en", "fr"])).toBe(red);
    expect(resolveScreenshotImage({ screenshotImages: { ja: green } }, "de", ["en", "fr"])).toBe(green);
    // skips languages whose entry is present but unresolved
    expect(resolveScreenshotImage({ screenshotImages: { it: undefined, ja: green } }, "de", ["en"])).toBe(green);
    expect(resolveScreenshotImage({ screenshotImages: {} }, "de", ["en"])).toBeNull();
    expect(resolveScreenshotImage({ screenshotImages: {} }, "de", ["en"])).toBeNull();
  });
});

function makeDoc(): ScreenshotDoc {
  const shot = createDefaultScreenshot(DEFAULTS, "ref");
  shot.background = { ...shot.background, type: "solid", solid: "#102030", noise: true, noiseIntensity: 10 };
  shot.text.headlines.en = "Reference headline";
  shot.elements.push(
    { id: "behind", type: "text", x: 50, y: 95, width: 60, rotation: 0, opacity: 100,
      layer: "behind-screenshot", text: "behind", font: "sans-serif", fontSize: 12,
      fontWeight: "400", fontColor: "#ffffff", italic: false, frame: "none", frameColor: "#fff", frameScale: 100 },
    { id: "front", type: "graphic", src: "g", x: 20, y: 20, width: 20, rotation: 0, opacity: 100,
      layer: "above-text" },
  );
  shot.popouts.push({
    id: "p1", x: 75, y: 75, width: 30, rotation: 0, opacity: 100, cornerRadius: 0,
    crops: { iPhone: { cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 } },
    shadow: { enabled: false, color: "#000000", blur: 0, opacity: 0, x: 0, y: 0 },
    border: { enabled: false, color: "#00ff00", width: 4, opacity: 100 },
  });
  return {
    screenshots: [shot], selectedIndex: 0,
    outputDevice: "custom", customWidth: 300, customHeight: 600,
    currentLanguage: "en", projectLanguages: ["en"],
    defaults: structuredClone(DEFAULTS),
  };
}

function makeAssets(): RenderAssets {
  return {
    screenshotImages: { en: bitmap("#ff0000", 100, 200) },
    elementImages: { front: bitmap("#00ff00", 20, 20) },
    laurelImages: {},
  };
}

const env: RenderEnv = {
  language: "en", projectLanguages: ["en"],
  createCanvas: (w, h) => createCanvas(w, h) as unknown as ReturnType<RenderEnv["createCanvas"]>,
  rng: () => 0.5, // noise becomes a no-op delta → deterministic
};

describe("renderScreenshotToCanvas", () => {
  it("does nothing for an out-of-range index", () => {
    const canvas = createCanvas(10, 10);
    renderScreenshotToCanvas(canvas as never, makeDoc(), 7, makeAssets(), env);
    expect(canvas.width).toBe(10); // untouched
  });

  it("sizes the canvas from the doc and composes all layers", () => {
    const canvas = createCanvas(1, 1);
    renderScreenshotToCanvas(canvas as never, makeDoc(), 0, makeAssets(), env);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(600);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    expect(px(ctx, 5, 300)).toEqual([16, 32, 48, 255]);       // background #102030 at the edge
    expect(px(ctx, 150, 360)).toEqual([255, 0, 0, 255]);      // 2D screenshot (scale 70, y 60)
    expect(px(ctx, 60, 120)).toEqual([0, 255, 0, 255]);       // above-text graphic on top
    expect(px(ctx, 225, 450)).toEqual([255, 0, 0, 255]);      // popout (full crop of red source)
  });

  it("skips the noise pass when noise is off", () => {
    const doc = makeDoc();
    doc.screenshots[0].background.noise = false;
    const canvas = createCanvas(1, 1);
    renderScreenshotToCanvas(canvas as never, doc, 0, makeAssets(), env);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    expect(px(ctx, 5, 300)).toEqual([16, 32, 48, 255]);
  });

  it("skips the flat screenshot for use3D docs – the mockup bitmap replaces it", () => {
    const doc = makeDoc();
    doc.screenshots[0].screenshot.use3D = true;
    const canvas = createCanvas(1, 1);
    renderScreenshotToCanvas(canvas as never, doc, 0, makeAssets(), env);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    expect(px(ctx, 150, 360)).toEqual([16, 32, 48, 255]); // background, not the 2D screenshot
  });

  it("skips the screenshot layer when no image resolves, but still draws bg/text/elements", () => {
    const doc = makeDoc();
    const canvas = createCanvas(1, 1);
    renderScreenshotToCanvas(canvas as never, doc, 0, { screenshotImages: {}, elementImages: {}, laurelImages: {} }, env);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    expect(px(ctx, 150, 360)).toEqual([16, 32, 48, 255]); // background visible where screenshot would be
  });

  it("is deterministic: two renders produce identical buffers", () => {
    const c1 = createCanvas(1, 1); const c2 = createCanvas(1, 1);
    renderScreenshotToCanvas(c1 as never, makeDoc(), 0, makeAssets(), env);
    renderScreenshotToCanvas(c2 as never, makeDoc(), 0, makeAssets(), env);
    expect(Buffer.from(c1.toBuffer("image/png")).equals(Buffer.from(c2.toBuffer("image/png")))).toBe(true);
  });
});
