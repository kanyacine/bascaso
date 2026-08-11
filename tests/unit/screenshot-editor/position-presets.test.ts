import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { POSITION_PRESETS, matchPositionPreset } from "@/lib/screenshot-editor/position-presets";

describe("position presets", () => {
  it("every preset round-trips through matchPositionPreset", () => {
    for (const preset of POSITION_PRESETS) {
      expect(matchPositionPreset({ ...DEFAULTS.screenshot, ...preset.values })).toBe(preset.id);
    }
  });

  it("reports no preset once a single value drifts", () => {
    const centered = POSITION_PRESETS[0];
    const settings = { ...DEFAULTS.screenshot, ...centered.values };
    expect(matchPositionPreset({ ...settings, rotation: 3 })).toBeNull();
  });

  it("keeps the bleed presets inside the slider range", () => {
    for (const { values } of POSITION_PRESETS) {
      expect(values.x).toBeGreaterThanOrEqual(-80);
      expect(values.x).toBeLessThanOrEqual(180);
      expect(values.y).toBeGreaterThanOrEqual(-80);
      expect(values.y).toBeLessThanOrEqual(180);
    }
  });
});
