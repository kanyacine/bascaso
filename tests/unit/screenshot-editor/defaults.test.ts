import { describe, it, expect } from "vitest";
import { DEFAULTS, createDefaultScreenshot } from "@/lib/screenshot-editor/defaults";

describe("DEFAULTS parity with appscreen state.defaults", () => {
  it("matches the gradient background verbatim", () => {
    expect(DEFAULTS.background).toEqual({
      type: "gradient",
      gradient: {
        angle: 135,
        stops: [
          { color: "#667eea", position: 0 },
          { color: "#764ba2", position: 100 },
        ],
      },
      solid: "#1a1a2e",
      image: null,
      imageFit: "cover",
      imageBlur: 0,
      overlayColor: "#000000",
      overlayOpacity: 0,
      noise: false,
      noiseIntensity: 10,
    });
  });

  it("matches the screenshot settings verbatim", () => {
    expect(DEFAULTS.screenshot).toEqual({
      scale: 70, y: 60, x: 50, rotation: 0, perspective: 0, cornerRadius: 24,
      use3D: false, device3D: "iphone", rotation3D: { x: 0, y: 0, z: 0 },
      shadow: { enabled: true, color: "#000000", blur: 40, opacity: 30, x: 0, y: 20 },
      frame: { enabled: false, color: "#1d1d1f", width: 12, opacity: 100 },
    });
  });

  it("matches the key text defaults verbatim", () => {
    const t = DEFAULTS.text;
    expect(t.headlineEnabled).toBe(true);
    expect(t.headlineFont).toBe("-apple-system, BlinkMacSystemFont, 'SF Pro Display'");
    expect(t.headlineSize).toBe(100);
    expect(t.headlineWeight).toBe("600");
    expect(t.headlineColor).toBe("#ffffff");
    expect(t.position).toBe("top");
    expect(t.offsetY).toBe(12);
    expect(t.lineHeight).toBe(110);
    expect(t.languageSettings).toEqual({
      en: { headlineSize: 100, subheadlineSize: 50, position: "top", offsetY: 12, lineHeight: 110 },
    });
    expect(t.subheadlineEnabled).toBe(false);
    expect(t.subheadlineSize).toBe(50);
    expect(t.subheadlineWeight).toBe("400");
    expect(t.subheadlineOpacity).toBe(70);
    expect(DEFAULTS.elements).toEqual([]);
    expect(DEFAULTS.popouts).toEqual([]);
  });
});

describe("createDefaultScreenshot", () => {
  it("deep-clones defaults so edits never leak back", () => {
    const s = createDefaultScreenshot(DEFAULTS, "Shot 1");
    expect(s.name).toBe("Shot 1");
    expect(s.localizedImages).toEqual({});
    s.background.gradient.stops[0].color = "#000000";
    s.text.headlines.en = "edited";
    expect(DEFAULTS.background.gradient.stops[0].color).toBe("#667eea");
    expect(DEFAULTS.text.headlines.en).toBe("");
  });

  it("works without a name", () => {
    expect(createDefaultScreenshot(DEFAULTS).name).toBeUndefined();
  });
});
