import { describe, it, expect } from "vitest";
import { EDITOR_FORMATS, getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { DISPLAY_TYPE_LABELS, DISPLAY_TYPE_SIZES, sortDisplayTypes } from "@/lib/asc/display-types";

describe("EDITOR_FORMATS", () => {
  it("covers every sized display type, in catalog order", () => {
    expect(EDITOR_FORMATS.map((f) => f.key)).toEqual(sortDisplayTypes(Object.keys(DISPLAY_TYPE_SIZES)));
    expect(EDITOR_FORMATS[0].key).toBe("APP_IPHONE_67");
    // Watch, Mac, TV and Vision Pro are formats too – only iMessage (no size entry) is out.
    expect(EDITOR_FORMATS.map((f) => f.key)).toContain("APP_WATCH_ULTRA");
    expect(EDITOR_FORMATS.map((f) => f.key)).toContain("APP_DESKTOP");
    expect(EDITOR_FORMATS.some((f) => f.key.startsWith("IMESSAGE_"))).toBe(false);
  });

  it("stays consistent with the ASC catalog (labels and sizes)", () => {
    for (const f of EDITOR_FORMATS) {
      expect(f.label).toBe(DISPLAY_TYPE_LABELS[f.key]);
      expect(`${f.width} × ${f.height}`).toBe(DISPLAY_TYPE_SIZES[f.key]);
      expect(Number.isInteger(f.width) && f.width > 0).toBe(true);
      expect(Number.isInteger(f.height) && f.height > 0).toBe(true);
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
