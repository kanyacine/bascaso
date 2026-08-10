import { describe, it, expect } from "vitest";
import { EDITOR_FORMATS, getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { DISPLAY_TYPE_LABELS, DISPLAY_TYPE_SIZES } from "@/lib/asc/display-types";

describe("EDITOR_FORMATS", () => {
  it("covers exactly the agreed display types, in order", () => {
    expect(EDITOR_FORMATS.map((f) => f.key)).toEqual([
      "APP_IPHONE_67", "APP_IPHONE_65", "APP_IPHONE_55",
      "APP_IPAD_PRO_3GEN_129", "APP_IPAD_PRO_3GEN_11", "APP_IPAD_PRO_129",
    ]);
  });

  it("stays consistent with the ASC catalog (labels and sizes)", () => {
    for (const f of EDITOR_FORMATS) {
      expect(f.label).toBe(DISPLAY_TYPE_LABELS[f.key]);
      expect(`${f.width} × ${f.height}`).toBe(DISPLAY_TYPE_SIZES[f.key]);
    }
  });
});

describe("getCanvasDimensions", () => {
  it("returns the format size for a known display type", () => {
    expect(getCanvasDimensions({ outputDevice: "APP_IPHONE_67", customWidth: 1, customHeight: 1 }))
      .toEqual({ width: 1260, height: 2736 });
  });

  it("returns custom dimensions for 'custom'", () => {
    expect(getCanvasDimensions({ outputDevice: "custom", customWidth: 800, customHeight: 600 }))
      .toEqual({ width: 800, height: 600 });
  });

  it("falls back to the first format for an unknown key", () => {
    expect(getCanvasDimensions({ outputDevice: "nope", customWidth: 1, customHeight: 1 }))
      .toEqual({ width: 1260, height: 2736 });
  });
});
