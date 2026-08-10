import { describe, it, expect } from "vitest";
import {
  SNAP_THRESHOLD, snapToGuides, dragPosition, hitTestElements, hitTestPopouts, drawSnapGuides,
  move3DFromDrag, rotate3DFromDrag,
  type DragState,
} from "@/lib/screenshot-editor/interaction";
import { createEmojiElement, createTextElement, createGraphicElement, createPopout } from "@/lib/screenshot-editor/elements";
import { makeCanvas, px } from "./helpers";

const DIMS = { width: 1000, height: 2000 };

describe("snapToGuides", () => {
  it("snaps each axis to 50 within the threshold and leaves the rest alone", () => {
    expect(snapToGuides(49, 80)).toEqual({ x: 50, y: 80 });
    expect(snapToGuides(80, 51.4)).toEqual({ x: 80, y: 50 });
    expect(snapToGuides(48.4, 51.6)).toEqual({ x: 48.4, y: 51.6 }); // just outside 1.5
    expect(SNAP_THRESHOLD).toBe(1.5);
  });
});

describe("dragPosition", () => {
  const drag: DragState = { id: "e", isPopout: false, startX: 500, startY: 1000, origX: 30, origY: 30, dims: DIMS };

  it("converts the pixel delta to percent on each axis", () => {
    // +100px on a 1000px wide canvas = +10%; +100px on 2000px high = +5%
    expect(dragPosition(drag, 600, 1100)).toEqual({ x: 40, y: 35 });
  });

  it("clamps to 0-100 before snapping", () => {
    expect(dragPosition(drag, -5000, 9000)).toEqual({ x: 0, y: 100 });
  });

  it("snaps the result to center guides", () => {
    expect(dragPosition(drag, 700, 1000)).toEqual({ x: 50, y: 30 }); // raw x would be 50 exactly
    expect(dragPosition(drag, 710, 1000)).toEqual({ x: 50, y: 30 }); // raw 51 → snapped
  });
});

describe("hitTestElements", () => {
  it("hits an emoji inside its square box and misses outside", () => {
    const el = { ...createEmojiElement("⭐", "Star"), x: 50, y: 50, width: 20 };
    // box: 200px wide/tall centered at (500, 1000)
    expect(hitTestElements([el], DIMS, 500, 1000, {})).toBe(el.id);
    expect(hitTestElements([el], DIMS, 595, 1095, {})).toBe(el.id);
    expect(hitTestElements([el], DIMS, 500, 1110, {})).toBeNull();
  });

  it("uses the image aspect for graphics", () => {
    const el = { ...createGraphicElement("a.png", "a"), x: 50, y: 50, width: 20 };
    const sizes = { [el.id]: { width: 100, height: 50 } }; // 2:1 → box 200×100
    expect(hitTestElements([el], DIMS, 500, 1045, sizes)).toBe(el.id);
    expect(hitTestElements([el], DIMS, 500, 1060, sizes)).toBeNull();
    expect(hitTestElements([el], DIMS, 500, 1095, {})).toBe(el.id); // unknown size → square fallback
  });

  it("uses fontSize * 1.5 for text height", () => {
    const el = { ...createTextElement("en"), x: 50, y: 50, width: 40, fontSize: 100 };
    expect(hitTestElements([el], DIMS, 500, 1070, {})).toBe(el.id); // half-height 75px
    expect(hitTestElements([el], DIMS, 500, 1080, {})).toBeNull();
    const noSize = { ...createTextElement("en"), x: 50, y: 50, width: 40, fontSize: undefined };
    expect(hitTestElements([noSize], DIMS, 500, 1040, {})).toBe(noSize.id); // default 60 → half-height 45px
    expect(hitTestElements([noSize], DIMS, 500, 1050, {})).toBeNull();
  });

  it("prefers front layers, and later array entries within a layer", () => {
    const back = { ...createEmojiElement("a", "a"), layer: "behind-screenshot" as const };
    const frontEarly = { ...createEmojiElement("b", "b") };
    const frontLate = { ...createEmojiElement("c", "c") };
    expect(hitTestElements([back, frontEarly, frontLate], DIMS, 500, 1000, {})).toBe(frontLate.id);
    expect(hitTestElements([back, frontEarly], DIMS, 500, 1000, {})).toBe(frontEarly.id);
    expect(hitTestElements([back], DIMS, 500, 1000, {})).toBe(back.id);
  });
});

describe("hitTestPopouts", () => {
  const IMG = { width: 400, height: 400 };

  it("hits inside the displayed crop box, topmost (last) first", () => {
    const a = { ...createPopout(), x: 50, y: 50, width: 30 };
    const b = { ...createPopout(), x: 50, y: 50, width: 30 };
    // crop 30%×30% of a square image → square crop; display 300px wide, 300px tall
    expect(hitTestPopouts([a, b], DIMS, 500, 1000, IMG)).toBe(b.id);
    expect(hitTestPopouts([a], DIMS, 640, 1140, IMG)).toBe(a.id);
    expect(hitTestPopouts([a], DIMS, 660, 1000, IMG)).toBeNull();
  });

  it("returns null without a source image or popouts", () => {
    const a = createPopout();
    expect(hitTestPopouts([a], DIMS, 500, 1000, null)).toBeNull();
    expect(hitTestPopouts([], DIMS, 500, 1000, IMG)).toBeNull();
  });
});

describe("drawSnapGuides", () => {
  it("draws the vertical center line only when x is snapped", () => {
    const { canvas, ctx } = makeCanvas(400, 800);
    drawSnapGuides(ctx, { width: canvas.width, height: canvas.height }, { x: 50, y: 30 });
    expect(px(ctx, 200, 4)[3]).toBeGreaterThan(0); // on the dash
    expect(px(ctx, 200, 14)[3]).toBe(0); // in the gap (dash 12, gap 8 at scale 1)
    expect(px(ctx, 100, 400)[3]).toBe(0); // no horizontal line
  });

  it("draws the horizontal line when y is snapped and nothing when neither is", () => {
    const { canvas, ctx } = makeCanvas(400, 800);
    drawSnapGuides(ctx, { width: canvas.width, height: canvas.height }, { x: 10, y: 50 });
    expect(px(ctx, 4, 400)[3]).toBeGreaterThan(0);
    const { canvas: c2, ctx: ctx2 } = makeCanvas(400, 800);
    drawSnapGuides(ctx2, { width: c2.width, height: c2.height }, { x: 10, y: 10 });
    expect(px(ctx2, 200, 400)[3]).toBe(0);
  });
});

describe("3D drag", () => {
  it("rotates 0.5° per pixel and clamps at ±45", () => {
    expect(rotate3DFromDrag({ x: 0, y: 0, z: 5 }, 20, -10)).toEqual({ x: -5, y: 10, z: 5 });
    expect(rotate3DFromDrag({ x: 44, y: -44, z: 0 }, -10, 10)).toEqual({ x: 45, y: -45, z: 0 });
  });

  it("moves 0.2% per pixel and clamps 0-100", () => {
    expect(move3DFromDrag({ x: 50, y: 60 }, 100, -50)).toEqual({ x: 70, y: 50 });
    expect(move3DFromDrag({ x: 99, y: 1 }, 100, -100)).toEqual({ x: 100, y: 0 });
  });
});
