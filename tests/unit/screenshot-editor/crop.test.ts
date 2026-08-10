import { describe, it, expect } from "vitest";
import {
  getCropPreviewLayout, hitTestCropHandle, applyCropDrag, MIN_CROP_PCT, CROP_HANDLE_HIT_RADIUS,
  type CropRect,
} from "@/lib/screenshot-editor/crop";

const CROP: CropRect = { cropX: 25, cropY: 25, cropWidth: 30, cropHeight: 30 };

describe("getCropPreviewLayout", () => {
  it("fits a wide image with vertical letterboxing", () => {
    // 400×400 canvas, 200×100 image → drawn 400×200 centered
    expect(getCropPreviewLayout(400, 400, 200, 100)).toEqual({ drawX: 0, drawY: 100, drawW: 400, drawH: 200 });
  });
  it("fits a tall image with horizontal letterboxing", () => {
    expect(getCropPreviewLayout(400, 400, 100, 200)).toEqual({ drawX: 100, drawY: 0, drawW: 200, drawH: 400 });
  });
});

describe("hitTestCropHandle", () => {
  // full-bleed layout for easy math: crop rect at (100,100)-(220,220) on a 400 canvas
  const layout = { drawX: 0, drawY: 0, drawW: 400, drawH: 400 };

  it("hits corners within the radius, corners win over edges", () => {
    expect(hitTestCropHandle(100, 100, layout, CROP)).toBe("top-left");
    expect(hitTestCropHandle(228, 216, layout, CROP)).toBe("bottom-right"); // within 12
    expect(CROP_HANDLE_HIT_RADIUS).toBe(12);
  });

  it("hits edge midpoints", () => {
    expect(hitTestCropHandle(160, 98, layout, CROP)).toBe("top");
    expect(hitTestCropHandle(222, 160, layout, CROP)).toBe("right");
    expect(hitTestCropHandle(160, 222, layout, CROP)).toBe("bottom");
    expect(hitTestCropHandle(98, 160, layout, CROP)).toBe("left");
  });

  it("returns move inside the rect and null outside", () => {
    expect(hitTestCropHandle(160, 160, layout, CROP)).toBe("move");
    expect(hitTestCropHandle(350, 350, layout, CROP)).toBeNull();
  });
});

describe("applyCropDrag", () => {
  it("move shifts and clamps so the rect stays inside", () => {
    expect(applyCropDrag("move", CROP, 10, -50)).toEqual({ cropX: 35, cropY: 0, cropWidth: 30, cropHeight: 30 });
    expect(applyCropDrag("move", CROP, 90, 0).cropX).toBe(70); // 100 - width
  });

  it("right/bottom grow the size, clamped to the far edge", () => {
    expect(applyCropDrag("right", CROP, 20, 0)).toEqual({ ...CROP, cropWidth: 50 });
    expect(applyCropDrag("bottom", CROP, 0, 200).cropHeight).toBe(75); // 100 - cropY
  });

  it("left/top move the origin and pin the far edge", () => {
    expect(applyCropDrag("left", CROP, 10, 0)).toEqual({ ...CROP, cropX: 35, cropWidth: 20 });
    expect(applyCropDrag("top", CROP, 0, -10)).toEqual({ ...CROP, cropY: 15, cropHeight: 40 });
  });

  it("enforces the 5% minimum, pinning the far edge", () => {
    expect(MIN_CROP_PCT).toBe(5);
    // dragging left far right: far edge is at 55, so x pins at 50, width at 5
    expect(applyCropDrag("left", CROP, 60, 0)).toEqual({ ...CROP, cropX: 50, cropWidth: 5 });
    expect(applyCropDrag("right", CROP, -60, 0).cropWidth).toBe(5);
  });

  it("corners combine both axes", () => {
    expect(applyCropDrag("bottom-right", CROP, 10, 10)).toEqual({ ...CROP, cropWidth: 40, cropHeight: 40 });
    expect(applyCropDrag("top-left", CROP, 5, 5)).toEqual({ cropX: 30, cropY: 30, cropWidth: 25, cropHeight: 25 });
  });

  it("never lets the origin go negative", () => {
    expect(applyCropDrag("move", CROP, -90, -90)).toEqual({ ...CROP, cropX: 0, cropY: 0 });
    expect(applyCropDrag("left", CROP, -90, 0)).toEqual({ ...CROP, cropX: 0, cropWidth: 55 });
  });
});
