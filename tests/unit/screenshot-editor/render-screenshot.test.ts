import { describe, it, expect } from "vitest";
import { drawScreenshotToContext, drawDeviceFrameToContext } from "@/lib/screenshot-editor/render/screenshot";
import { makeCanvas, px } from "./helpers";
import type { RenderImage, ScreenshotSettings } from "@/lib/screenshot-editor/types";

const dims = { width: 200, height: 400 };

function settings(overrides: Partial<ScreenshotSettings> = {}): ScreenshotSettings {
  return {
    scale: 50, x: 50, y: 50, rotation: 0, perspective: 0, cornerRadius: 0,
    use3D: false, device3D: "iphone", rotation3D: { x: 0, y: 0, z: 0 },
    shadow: { enabled: false, color: "#000000", blur: 0, opacity: 0, x: 0, y: 0 },
    frame: { enabled: false, color: "#1d1d1f", width: 12, opacity: 100 },
    ...overrides,
  };
}

/** Solid red 100×200 portrait bitmap. */
function redImage(w = 100, h = 200): RenderImage {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, w, h);
  return canvas as unknown as RenderImage;
}

describe("drawScreenshotToContext", () => {
  it("does nothing for a null image", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, null, settings());
    expect(px(ctx, 100, 200)[3]).toBe(0);
  });

  it("centers the image at x=50/y=50 with scale as width fraction", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings());
    // scale 50 → imgWidth = 100, imgHeight = 200; centered → spans x∈[50,150], y∈[100,300]
    expect(px(ctx, 100, 200)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 40, 200)[3]).toBe(0);
    expect(px(ctx, 100, 90)[3]).toBe(0);
  });

  it("clamps height for very tall images (secondary fit branch)", () => {
    const { ctx } = makeCanvas(200, 400);
    // 10×1000 source: imgHeight would exceed dims.height*scale → clamped
    drawScreenshotToContext(ctx, dims, redImage(10, 1000), settings());
    let painted = 0;
    for (let y = 0; y < 400; y += 4) if (px(ctx, 100, y)[3] > 0) painted++;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThanOrEqual(Math.ceil(200 / 4) + 1); // ≤ dims.height*scale worth of rows
  });

  it("moves with x/y within the guaranteed movement range", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({ x: 0, y: 0 }));
    expect(px(ctx, 30, 80)[3]).toBe(255);   // pushed up-left
    expect(px(ctx, 170, 350)[3]).toBe(0);
  });

  it("rotates around the image center", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({ rotation: 90 }));
    // 100×200 rotated 90° → spans x∈[0,200] horizontally at the center line
    expect(px(ctx, 10, 200)[3]).toBe(255);
    expect(px(ctx, 100, 110)[3]).toBe(0); // above the rotated band
  });

  it("applies the perspective shear branch", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({ perspective: 50 }));
    expect(px(ctx, 100, 200)[3]).toBe(255); // still painted, branch executed
  });

  it("clips rounded corners (radius scales with width/400)", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({ cornerRadius: 100 }));
    expect(px(ctx, 51, 101)[3]).toBe(0);   // corner clipped
    expect(px(ctx, 100, 200)[3]).toBe(255);
  });

  it("draws the shadow outside the image when enabled", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({
      shadow: { enabled: true, color: "#000000", blur: 20, opacity: 100, x: 0, y: 0 },
    }));
    expect(px(ctx, 45, 200)[3]).toBeGreaterThan(0); // blur spills left of x=50
  });

  it("strokes the device frame when enabled (with rotation + perspective reapplied)", () => {
    const { ctx } = makeCanvas(200, 400);
    drawScreenshotToContext(ctx, dims, redImage(), settings({
      rotation: 10, perspective: 10,
      frame: { enabled: true, color: "#00ff00", width: 20, opacity: 100 },
    }));
    let foundGreen = false;
    for (let x = 0; x < 200 && !foundGreen; x++) {
      for (let y = 0; y < 400; y += 5) {
        const [r, g, b, a] = px(ctx, x, y);
        if (a > 0 && g > 200 && r < 60 && b < 60) { foundGreen = true; break; }
      }
    }
    expect(foundGreen).toBe(true);
  });
});

describe("drawDeviceFrameToContext", () => {
  it("strokes around the given rect with opacity", () => {
    const { ctx } = makeCanvas(200, 400);
    drawDeviceFrameToContext(ctx, 50, 100, 100, 200, settings({
      frame: { enabled: true, color: "#00ff00", width: 20, opacity: 50 },
    }));
    // frameWidth = 20 * (100/400) = 5 → stroke centred on the outset rect edge (x = 47.5),
    // so it covers x ∈ [45, 50)
    const [, g, , a] = px(ctx, 47, 200);
    expect(g).toBeGreaterThan(200);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(160); // ~50% alpha
  });
});
