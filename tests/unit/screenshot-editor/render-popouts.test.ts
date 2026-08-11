import { describe, it, expect } from "vitest";
import { drawPopoutsToContext } from "@/lib/screenshot-editor/render/popouts";
import { makeCanvas, px } from "./helpers";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import type { RenderImage, ResolvedPopout } from "@/lib/screenshot-editor/types";

const dims = { width: 200, height: 200 };

/** 100×100 source: top half red, bottom half blue. */
function source(): RenderImage {
  const { canvas, ctx } = makeCanvas(100, 100);
  ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 100, 50);
  ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 50, 100, 50);
  return canvas as unknown as RenderImage;
}

function popout(overrides: Partial<ResolvedPopout> = {}): ResolvedPopout {
  return {
    id: "p1", x: 50, y: 50, width: 50, rotation: 0, opacity: 100, crops: {},
    cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 50, cornerRadius: 0,
    shadow: { enabled: false, color: "#000000", blur: 0, opacity: 0, x: 0, y: 0 },
    border: { enabled: false, color: "#00ff00", width: 4, opacity: 100 },
    ...overrides,
  };
}

describe("drawPopoutsToContext", () => {
  it("returns early for null image or empty list", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout()], null, DEFAULTS.screenshot);
    drawPopoutsToContext(ctx, dims, [], source(), DEFAULTS.screenshot);
    expect(px(ctx, 100, 100)[3]).toBe(0);
  });

  it("crops the requested region (top half → red) at the display position/size", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout()], source(), DEFAULTS.screenshot);
    // width 50% → 100px wide; crop aspect 50/100 → 50px tall; centered at (100,100)
    expect(px(ctx, 100, 100)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 100, 130)[3]).toBe(0); // below the 50px band
  });

  it("crops the bottom half → blue", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout({ cropY: 50 })], source(), DEFAULTS.screenshot);
    expect(px(ctx, 100, 100)).toEqual([0, 0, 255, 255]);
  });

  it("applies rotation and opacity", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout({ rotation: 90, opacity: 50 })], source(), DEFAULTS.screenshot);
    // rotated 90°: the 100×50 band is now vertical
    const [r, , , a] = px(ctx, 100, 140);
    expect(r).toBeGreaterThan(200);
    expect(a).toBeGreaterThan(80);
    expect(a).toBeLessThan(180);
  });

  it("rounds corners (radius scales with displayW/300)", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout({ cornerRadius: 60 })], source(), DEFAULTS.screenshot);
    expect(px(ctx, 51, 76)[3]).toBe(0); // clipped corner of the 100×50 band at (50..150, 75..125)
    expect(px(ctx, 100, 100)[3]).toBe(255);
  });

  it("falls back to black for a shadow with no colour (legacy docs)", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout({
      shadow: { enabled: true, color: "", blur: 20, opacity: 100, x: 0, y: 0 },
    })], source(), DEFAULTS.screenshot);
    expect(px(ctx, 100, 135)[3]).toBeGreaterThan(0); // shadow spill below the band
  });

  it("draws shadow and border branches", () => {
    const { ctx } = makeCanvas(200, 200);
    drawPopoutsToContext(ctx, dims, [popout({
      shadow: { enabled: true, color: "#000000", blur: 20, opacity: 100, x: 0, y: 0 },
      border: { enabled: true, color: "#00ff00", width: 6, opacity: 100 },
    })], source(), DEFAULTS.screenshot);
    expect(px(ctx, 100, 129)[1]).toBeGreaterThan(200); // border just below the band
    expect(px(ctx, 100, 145)[3]).toBeGreaterThan(0);   // shadow spill beyond border
  });
});
