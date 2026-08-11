/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Pure 3D math and data: device configs + frame palettes (three-renderer.js:31-89), the
// state → scene mapping (three-renderer.js:737-810) and the legacy position migration
// (app.js:1554-1571). No three.js import here – the WebGL side lives in three-renderer.ts.
import type { ScreenshotSettings } from "./types";

export interface DeviceModelConfig {
  key: string;
  modelPath: string;
  aspectRatio: number;
  screenHeightFactor: number;
  screenOffset: { x: number; y: number; z: number };
  cornerRadiusFactor: number;
  modelRotation: { x: number; y: number; z: number };
}

/**
 * Apple devices only. appscreen also shipped a Samsung model; a store listing built here is an
 * App Store listing, so it is gone. Docs written before that still carry device3D: "samsung" –
 * deviceModel() falls back to the iPhone for them, which is the whole migration.
 */
export const DEVICE_MODELS: Record<string, DeviceModelConfig> = {
  iphone: {
    key: "iphone",
    modelPath: "/screenshot-editor/models/iphone-15-pro-max.glb",
    aspectRatio: 1290 / 2796,
    screenHeightFactor: 0.826,
    screenOffset: { x: 0.027, y: 0.745, z: 0.098 },
    cornerRadiusFactor: 0.16,
    modelRotation: { x: 0, y: 0, z: 0 },
  },
};

export function deviceModel(key: string | undefined): DeviceModelConfig {
  return (key && DEVICE_MODELS[key]) || DEVICE_MODELS.iphone;
}

export const MOCKUP_CAMERA = { fov: 35, near: 0.1, far: 1000, z: 6 } as const;
export const MOCKUP_BASE_SIZE = { width: 400, height: 700 } as const;
export const MODEL_FIT_SIZE = 3.75; // 2.5 * 1.5 – matches the 2D scale at 100% (three-renderer.js:239)
export const SCREEN_PLANE_BASE_HEIGHT = 4.3;

/** State → pivot transform (three-renderer.js:743-772). y is inverted vs 2D on purpose. */
export function pivotTransform(ss: ScreenshotSettings): {
  position: { x: number; y: number; z: number };
  rotationRad: { x: number; y: number; z: number };
  scale: number;
} {
  const scale = ss.scale / 100;
  const availableSpaceX = (1 - scale) * 0.9;
  const availableSpaceY = (1 - scale) * 2;
  const config = deviceModel(ss.device3D);
  const rotation3D = ss.rotation3D ?? { x: 0, y: 0, z: 0 };
  return {
    scale,
    position: {
      x: ((ss.x - 50) / 50) * availableSpaceX,
      y: -((ss.y - 50) / 50) * availableSpaceY,
      z: 0,
    },
    rotationRad: {
      x: ((rotation3D.x + config.modelRotation.x) * Math.PI) / 180,
      y: ((rotation3D.y + config.modelRotation.y) * Math.PI) / 180,
      z: ((rotation3D.z + config.modelRotation.z) * Math.PI) / 180,
    },
  };
}

export function screenPlaneSize(config: DeviceModelConfig): { width: number; height: number } {
  const height = SCREEN_PLANE_BASE_HEIGHT * config.screenHeightFactor;
  return { width: height * config.aspectRatio, height };
}

export function screenCornerRadius(imageWidth: number, config: DeviceModelConfig): number {
  return Math.round(imageWidth * config.cornerRadiusFactor);
}

export interface FrameColorPreset {
  id: string;
  label: string;
  swatch: string;
  materials: Record<string, string>;
}

/** iPhone finishes. Keyed by device for the legacy fallback in frameColorPreset(). */
export const FRAME_COLOR_PRESETS: Record<string, FrameColorPreset[]> = {
  iphone: [
    { id: "natural", label: "Natural Titanium", swatch: "#9d927f",
      materials: { backpanel: "#9d927f", metalframe: "#5f5950", gray: "#221f1b" } },
    { id: "blue", label: "Blue Titanium", swatch: "#3d4d5c",
      materials: { backpanel: "#394d5f", metalframe: "#3a4553", gray: "#1a1f24" } },
    { id: "white", label: "White Titanium", swatch: "#e3ddd4",
      materials: { backpanel: "#e3ddd4", metalframe: "#c4bdb4", gray: "#2a2825" } },
    { id: "black", label: "Black Titanium", swatch: "#3a3632",
      materials: { backpanel: "#3a3632", metalframe: "#2a2725", gray: "#1a1918" } },
    { id: "desert", label: "Desert Titanium", swatch: "#c4a882",
      materials: { backpanel: "#c4a882", metalframe: "#8a7560", gray: "#2a2218" } },
    { id: "deep-purple", label: "Deep Purple", swatch: "#5b4a6e",
      materials: { backpanel: "#5b4a6e", metalframe: "#3d3348", gray: "#1e1825" } },
    { id: "gold", label: "Gold", swatch: "#e3c8a0",
      materials: { backpanel: "#e3c8a0", metalframe: "#c9a96e", gray: "#2a2418" } },
    { id: "red", label: "Product Red", swatch: "#c1272d",
      materials: { backpanel: "#c1272d", metalframe: "#8a1c20", gray: "#1a0a0a" } },
  ],
};

export function frameColorPreset(device: string, presetId: string | undefined): FrameColorPreset {
  const presets = FRAME_COLOR_PRESETS[device] ?? FRAME_COLOR_PRESETS.iphone;
  return presets.find((p) => p.id === presetId) ?? presets[0];
}

