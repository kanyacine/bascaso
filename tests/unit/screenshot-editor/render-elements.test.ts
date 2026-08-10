import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { getElementText, drawElementsToContext, drawStar } from "@/lib/screenshot-editor/render/elements";
import { makeCanvas, px } from "./helpers";
import type { EditorElement, RenderEnv, RenderImage } from "@/lib/screenshot-editor/types";

const dims = { width: 200, height: 200 };
const env: RenderEnv = {
  language: "en", projectLanguages: ["en"],
  createCanvas: (w, h) => createCanvas(w, h) as unknown as ReturnType<RenderEnv["createCanvas"]>,
};

function el(overrides: Partial<EditorElement>): EditorElement {
  return {
    id: "e1", type: "text", x: 50, y: 50, width: 40, rotation: 0, opacity: 100,
    layer: "above-screenshot", text: "Hi", font: "sans-serif", fontSize: 20,
    fontWeight: "600", fontColor: "#ff0000", italic: false, frame: "none",
    frameColor: "#00ff00", frameScale: 100,
    ...overrides,
  };
}

function greenSquare(size = 20): RenderImage {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, size, size);
  return canvas as unknown as RenderImage;
}

describe("getElementText", () => {
  it("resolves texts[language] → texts.en → any value → legacy text → empty", () => {
    expect(getElementText(el({ texts: { fr: "Salut", en: "Hi" } }), "fr")).toBe("Salut");
    expect(getElementText(el({ texts: { en: "Hi" } }), "fr")).toBe("Hi");
    expect(getElementText(el({ texts: { de: "Hallo" } }), "fr")).toBe("Hallo");
    expect(getElementText(el({ texts: { de: "" }, text: "legacy" }), "fr")).toBe("legacy");
    expect(getElementText(el({ text: undefined }), "en")).toBe("");
    expect(getElementText(el({ texts: { de: "" }, text: undefined }), "fr")).toBe("");
  });
});

describe("drawElementsToContext", () => {
  it("only draws elements on the requested layer", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(ctx, dims, [el({ layer: "above-text" })], "behind-screenshot", env, {
      elementImages: {}, laurelImages: {},
    });
    expect(px(ctx, 100, 100)[3]).toBe(0);
  });

  it("draws a text element centered with wrapping", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(ctx, dims, [el({})], "above-screenshot", env, {
      elementImages: {}, laurelImages: {},
    });
    let painted = 0;
    for (let x = 60; x < 140; x += 2) for (let y = 80; y < 120; y += 2) if (px(ctx, x, y)[3] > 0) painted++;
    expect(painted).toBeGreaterThan(0);
  });

  it("skips a text element whose resolved text is empty, but still draws later elements", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(
      ctx, dims,
      [el({ id: "empty", text: "" }), el({ id: "icon1", type: "icon", src: "x" })],
      "above-screenshot", env,
      { elementImages: { icon1: greenSquare() }, laurelImages: {} },
    );
    expect(px(ctx, 100, 100)).toEqual([0, 255, 0, 255]); // icon drawn despite earlier empty text
  });

  it("draws an icon square (1:1) with optional shadow branch", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(
      ctx, dims,
      [el({ id: "icon1", type: "icon", src: "x", width: 40,
            iconShadow: { enabled: true, color: "#000000", opacity: 100, blur: 10, x: 0, y: 0 } })],
      "above-screenshot", env,
      { elementImages: { icon1: greenSquare() }, laurelImages: {} },
    );
    // icon spans 80×80 centered at (100,100)
    expect(px(ctx, 100, 100)).toEqual([0, 255, 0, 255]);
    expect(px(ctx, 55, 100)[3]).toBeGreaterThan(0); // shadow spill
  });

  it("falls back to black/zero for an icon shadow with no colour or offsets (legacy docs)", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(
      ctx, dims,
      [el({ id: "icon1", type: "icon", src: "x", width: 40, iconShadow: { enabled: true } })],
      "above-screenshot", env,
      { elementImages: { icon1: greenSquare() }, laurelImages: {} },
    );
    expect(px(ctx, 100, 100)).toEqual([0, 255, 0, 255]); // icon still drawn
  });

  it("offsets an icon shadow by x/y when set", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(
      ctx, dims,
      [el({ id: "icon1", type: "icon", src: "x", width: 40,
            iconShadow: { enabled: true, color: "#000000", opacity: 100, blur: 4, x: 12, y: 12 } })],
      "above-screenshot", env,
      { elementImages: { icon1: greenSquare() }, laurelImages: {} },
    );
    expect(px(ctx, 148, 148)[3]).toBeGreaterThan(0); // shadow pushed past the icon's bottom-right
  });

  it("draws italic text elements", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(ctx, dims, [el({ italic: true })], "above-screenshot", env, {
      elementImages: {}, laurelImages: {},
    });
    let painted = 0;
    for (let x = 60; x < 140; x += 2) for (let y = 80; y < 120; y += 2) if (px(ctx, x, y)[3] > 0) painted++;
    expect(painted).toBeGreaterThan(0);
  });

  it("ignores an unknown frame name", () => {
    const { ctx } = makeCanvas(200, 200);
    drawElementsToContext(ctx, dims, [el({ frame: "unknown-frame" })], "above-screenshot", env, {
      elementImages: {}, laurelImages: {},
    });
    let stroked = 0;
    for (let x = 0; x < 200; x += 2) for (let y = 0; y < 200; y += 2) {
      const [r, g] = px(ctx, x, y); if (g > 200 && r < 100) stroked++;
    }
    expect(stroked).toBe(0); // no frame drawn, only the red text
  });

  it("draws a graphic with preserved aspect ratio and applies opacity + rotation branches", () => {
    const { ctx } = makeCanvas(200, 200);
    const wide = (() => { // 40×10 green bitmap
      const { canvas, ctx: c } = makeCanvas(40, 10);
      c.fillStyle = "#00ff00"; c.fillRect(0, 0, 40, 10);
      return canvas as unknown as RenderImage;
    })();
    drawElementsToContext(
      ctx, dims,
      [el({ id: "g1", type: "graphic", src: "x", width: 40, rotation: 45, opacity: 50 })],
      "above-screenshot", env,
      { elementImages: { g1: wide }, laurelImages: {} },
    );
    const [, g, , a] = px(ctx, 100, 100);
    expect(g).toBeGreaterThan(200);
    expect(a).toBeGreaterThan(80);
    expect(a).toBeLessThan(180); // ~50% opacity
  });

  it("draws an emoji element without throwing (glyph rasterization is platform-dependent)", () => {
    const { ctx } = makeCanvas(200, 200);
    expect(() =>
      drawElementsToContext(ctx, dims, [el({ id: "em", type: "emoji", emoji: "🎉" })],
        "above-screenshot", env, { elementImages: {}, laurelImages: {} }),
    ).not.toThrow();
  });

  it("draws badge-circle and badge-ribbon frames around text", () => {
    for (const frame of ["badge-circle", "badge-ribbon"] as const) {
      const { ctx } = makeCanvas(200, 200);
      drawElementsToContext(ctx, dims, [el({ frame })], "above-screenshot", env, {
        elementImages: {}, laurelImages: {},
      });
      let stroked = 0;
      for (let x = 0; x < 200; x += 2) for (let y = 0; y < 200; y += 2) {
        const [r, g] = px(ctx, x, y); if (g > 200 && r < 100) stroked++;
      }
      expect(stroked).toBeGreaterThan(0);
    }
  });

  it("draws laurel frames (simple, detailed, star variants) from provided bitmaps", () => {
    const laurel = greenSquare(10);
    for (const frame of ["laurel-simple", "laurel-detailed-star"]) {
      const { ctx } = makeCanvas(200, 200);
      drawElementsToContext(ctx, dims, [el({ frame, frameColor: "#0000ff" })], "above-screenshot", env, {
        elementImages: {},
        laurelImages: { "laurel-simple-left": laurel, "laurel-detailed-left": laurel },
      });
      let blue = 0;
      for (let x = 0; x < 200; x += 2) for (let y = 0; y < 200; y += 2) {
        const [r, , b] = px(ctx, x, y); if (b > 200 && r < 100) blue++;
      }
      expect(blue).toBeGreaterThan(0); // recolored branches (and star for the -star variant)
    }
  });

  it("skips the laurel silently when no bitmap is provided", () => {
    const { ctx } = makeCanvas(200, 200);
    expect(() =>
      drawElementsToContext(ctx, dims, [el({ frame: "laurel-simple" })], "above-screenshot", env, {
        elementImages: {}, laurelImages: {},
      }),
    ).not.toThrow();
  });
});

describe("drawStar", () => {
  it("fills a 5-point star at the given center", () => {
    const { ctx } = makeCanvas(100, 100);
    drawStar(ctx, 50, 50, 30, "#ff0000");
    expect(px(ctx, 50, 45)[0]).toBe(255); // inside the star
    expect(px(ctx, 5, 5)[3]).toBe(0);
  });
});
