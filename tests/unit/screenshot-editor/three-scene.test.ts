import { describe, it, expect } from "vitest";
import {
  DEVICE_MODELS, FRAME_COLOR_PRESETS, MOCKUP_CAMERA, deviceModel, frameColorPreset,
  pivotTransform, screenCornerRadius, screenPlaneSize,
} from "@/lib/screenshot-editor/three-scene";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import type { ScreenshotSettings } from "@/lib/screenshot-editor/types";

function ss(patch: Partial<ScreenshotSettings> = {}): ScreenshotSettings {
  return { ...structuredClone(DEFAULTS.screenshot), ...patch };
}

describe("device configs", () => {
  it("ports the appscreen device configs", () => {
    expect(DEVICE_MODELS.iphone.modelPath).toBe("/screenshot-editor/models/iphone-15-pro-max.glb");
    expect(DEVICE_MODELS.iphone.aspectRatio).toBeCloseTo(1290 / 2796);
    expect(DEVICE_MODELS.iphone.screenOffset).toEqual({ x: 0.027, y: 0.745, z: 0.098 });
    // Apple only – a doc written when the Samsung model existed still renders, as an iPhone.
    expect(DEVICE_MODELS.samsung).toBeUndefined();
    expect(deviceModel("samsung")).toBe(DEVICE_MODELS.iphone);
    expect(deviceModel(undefined)).toBe(DEVICE_MODELS.iphone);
    expect(deviceModel("nope")).toBe(DEVICE_MODELS.iphone);
    expect(MOCKUP_CAMERA.fov).toBe(35);
  });

  it("derives screen plane and corner radius from the config", () => {
    const plane = screenPlaneSize(DEVICE_MODELS.iphone);
    expect(plane.height).toBeCloseTo(4.3 * 0.826);
    expect(plane.width).toBeCloseTo(plane.height * (1290 / 2796));
    expect(screenCornerRadius(1290, DEVICE_MODELS.iphone)).toBe(Math.round(1290 * 0.16));
    expect(screenCornerRadius(1440, DEVICE_MODELS.iphone)).toBe(Math.round(1440 * 0.16));
  });
});

describe("pivotTransform", () => {
  it("centers at 50/50 and scales the pivot", () => {
    const t = pivotTransform(ss({ scale: 70, x: 50, y: 50, rotation3D: { x: 0, y: 0, z: 0 } }));
    expect(t.scale).toBeCloseTo(0.7);
    expect(t.position).toEqual({ x: 0, y: -0, z: 0 });
    expect(t.rotationRad).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("maps position with the 0.9/2 factors and inverts y (three-renderer.js:753-761)", () => {
    const t = pivotTransform(ss({ scale: 70, x: 100, y: 0 }));
    expect(t.position.x).toBeCloseTo(((100 - 50) / 50) * (1 - 0.7) * 0.9);
    expect(t.position.y).toBeCloseTo(-((0 - 50) / 50) * (1 - 0.7) * 2);
  });

  it("adds the model base rotation in radians", () => {
    const t = pivotTransform(ss({ rotation3D: { x: 10, y: -20, z: 45 } }));
    expect(t.rotationRad.x).toBeCloseTo((10 * Math.PI) / 180);
    expect(t.rotationRad.y).toBeCloseTo((-20 * Math.PI) / 180);
    expect(t.rotationRad.z).toBeCloseTo((45 * Math.PI) / 180);
  });

  it("falls back to a neutral rotation when the doc predates rotation3D", () => {
    const legacy = ss();
    delete (legacy as { rotation3D?: unknown }).rotation3D;
    expect(pivotTransform(legacy).rotationRad).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("frame color presets", () => {
  it("ports both palettes and falls back to the first preset", () => {
    expect(FRAME_COLOR_PRESETS.iphone).toHaveLength(8);
    expect(FRAME_COLOR_PRESETS.samsung).toBeUndefined();
    expect(FRAME_COLOR_PRESETS.iphone[0]).toEqual({
      id: "natural", label: "Natural Titanium", swatch: "#9d927f",
      materials: { backpanel: "#9d927f", metalframe: "#5f5950", gray: "#221f1b" },
    });
    expect(frameColorPreset("iphone", "red").id).toBe("red");
    expect(frameColorPreset("iphone", undefined).id).toBe("natural");
    expect(frameColorPreset("samsung", "gray").id).toBe("natural"); // legacy doc → iPhone finish
    expect(frameColorPreset("nope", undefined).id).toBe("natural"); // unknown device → iphone palette
  });
});
