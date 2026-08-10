import { describe, it, expect } from "vitest";
import { drawBackgroundToContext, drawNoiseToContext } from "@/lib/screenshot-editor/render/background";
import { makeCanvas, px } from "./helpers";
import type { Background, RenderImage } from "@/lib/screenshot-editor/types";

const dims = { width: 100, height: 100 };

function baseBg(overrides: Partial<Background>): Background {
  return {
    type: "solid",
    gradient: { angle: 135, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 100 }] },
    solid: "#00ff00", image: null, imageFit: "cover", imageBlur: 0,
    overlayColor: "#000000", overlayOpacity: 0, noise: false, noiseIntensity: 10,
    ...overrides,
  };
}

/** 40×20 test bitmap: left half red, right half blue. */
function twoToneImage(): RenderImage {
  const { canvas, ctx } = makeCanvas(40, 20);
  ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 20, 20);
  ctx.fillStyle = "#0000ff"; ctx.fillRect(20, 0, 20, 20);
  return canvas as unknown as RenderImage;
}

describe("drawBackgroundToContext", () => {
  it("fills solid color", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(ctx, dims, baseBg({ type: "solid" }));
    expect(px(ctx, 50, 50)).toEqual([0, 255, 0, 255]);
  });

  it("renders a gradient whose extremes match the stops (angle 0 = left→right)", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(ctx, dims, baseBg({
      type: "gradient",
      gradient: { angle: 0, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 100 }] },
    }));
    const left = px(ctx, 1, 50);
    const right = px(ctx, 98, 50);
    expect(left[0]).toBeGreaterThan(left[2]);   // red side
    expect(right[2]).toBeGreaterThan(right[0]); // blue side
  });

  it("cover crops the source horizontally on a taller canvas", () => {
    const { ctx } = makeCanvas(100, 100);
    // 2:1 image on 1:1 canvas → cover crops left/right, center column of image fills canvas
    drawBackgroundToContext(ctx, dims, baseBg({ type: "image" }), twoToneImage());
    expect(px(ctx, 25, 50)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 75, 50)).toEqual([0, 0, 255, 255]);
  });

  it("contain letterboxes with black bars", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(ctx, dims, baseBg({ type: "image", imageFit: "contain" }), twoToneImage());
    expect(px(ctx, 50, 5)).toEqual([0, 0, 0, 255]);  // top bar
    expect(px(ctx, 25, 50)).toEqual([255, 0, 0, 255]); // image band
  });

  it("applies the overlay with its opacity", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(
      ctx, dims,
      baseBg({ type: "image", overlayColor: "#000000", overlayOpacity: 50 }),
      twoToneImage(),
    );
    const [r] = px(ctx, 25, 50);
    expect(r).toBeGreaterThan(80);
    expect(r).toBeLessThan(180); // red darkened by ~50% black overlay
  });

  it("sets and resets the blur filter without throwing", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(ctx, dims, baseBg({ type: "image", imageBlur: 4 }), twoToneImage());
    expect(ctx.filter === "none" || ctx.filter === "").toBe(true);
  });

  it("draws nothing for type image without a bitmap", () => {
    const { ctx } = makeCanvas(100, 100);
    drawBackgroundToContext(ctx, dims, baseBg({ type: "image" }), null);
    expect(px(ctx, 50, 50)[3]).toBe(0);
  });
});

describe("drawNoiseToContext", () => {
  it("is deterministic under an injected rng and bounded by intensity", () => {
    const seeded = () => 0.75; // constant rng → uniform +noise
    const { ctx } = makeCanvas(10, 10);
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 10, 10);
    drawNoiseToContext(ctx, { width: 10, height: 10 }, 10, seeded);
    const [r1] = px(ctx, 5, 5);
    expect(r1).toBe(134); // 128 + (0.75 - 0.5) * 255 * 0.1 = 134.375 → Uint8ClampedArray rounds to 134
    const { ctx: ctx2 } = makeCanvas(10, 10);
    ctx2.fillStyle = "#808080"; ctx2.fillRect(0, 0, 10, 10);
    drawNoiseToContext(ctx2, { width: 10, height: 10 }, 10, seeded);
    expect(px(ctx2, 5, 5)).toEqual(px(ctx, 5, 5)); // deterministic
  });

  it("clamps to [0, 255]", () => {
    const { ctx } = makeCanvas(4, 4);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 4, 4);
    drawNoiseToContext(ctx, { width: 4, height: 4 }, 100, () => 1);
    expect(px(ctx, 2, 2)[0]).toBe(255); // would overflow without clamp
  });

  it("defaults rng to Math.random", () => {
    const { ctx } = makeCanvas(4, 4);
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 4, 4);
    expect(() => drawNoiseToContext(ctx, { width: 4, height: 4 }, 10)).not.toThrow();
  });
});
