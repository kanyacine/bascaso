import { describe, expect, it } from "vitest";
import { GRADIENT_PRESETS, parseGradientPreset } from "@/lib/screenshot-editor/gradient-presets";

describe("gradient presets", () => {
  it("parses every preset into an angle and ordered stops", () => {
    for (const preset of GRADIENT_PRESETS) {
      const parsed = parseGradientPreset(preset.css);
      expect(parsed, preset.label).not.toBeNull();
      expect(parsed!.angle).toBeGreaterThanOrEqual(0);
      expect(parsed!.angle).toBeLessThanOrEqual(360);
      expect(parsed!.stops.length).toBeGreaterThanOrEqual(2);
      expect(parsed!.stops.map((s) => s.position))
        .toEqual([...parsed!.stops.map((s) => s.position)].sort((a, b) => a - b));
    }
  });

  it("reads the appscreen preset shape verbatim", () => {
    expect(parseGradientPreset("linear-gradient(160deg, #0a0a0f 0%, #1a1033 50%, #0d1b2a 100%)")).toEqual({
      angle: 160,
      stops: [
        { color: "#0a0a0f", position: 0 },
        { color: "#1a1033", position: 50 },
        { color: "#0d1b2a", position: 100 },
      ],
    });
  });

  it("rejects a gradient it cannot use", () => {
    expect(parseGradientPreset("linear-gradient(90deg, #ffffff 0%)")).toBeNull();
    expect(parseGradientPreset("radial-gradient(#000000 0%, #ffffff 100%)")).toBeNull();
  });
});
