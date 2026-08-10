/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type { MessageKey } from "@/lib/i18n/messages";
import type { ScreenshotSettings } from "./types";

export type PositionPreset = Pick<
  ScreenshotSettings, "scale" | "x" | "y" | "rotation" | "perspective"
>;

// Verbatim port of applyPositionPreset (app.js:5974-5985). 2D only – appscreen hides the whole
// section in 3D mode (app.js:2301).
export const POSITION_PRESETS: { id: string; key: MessageKey; values: PositionPreset }[] = [
  { id: "centered", key: "screenshotEditor.presetCentered", values: { scale: 70, x: 50, y: 50, rotation: 0, perspective: 0 } },
  { id: "bleed-bottom", key: "screenshotEditor.presetBleedBottom", values: { scale: 85, x: 50, y: 120, rotation: 0, perspective: 0 } },
  { id: "bleed-top", key: "screenshotEditor.presetBleedTop", values: { scale: 85, x: 50, y: -20, rotation: 0, perspective: 0 } },
  { id: "float-center", key: "screenshotEditor.presetFloatCenter", values: { scale: 60, x: 50, y: 50, rotation: 0, perspective: 0 } },
  { id: "tilt-left", key: "screenshotEditor.presetTiltLeft", values: { scale: 65, x: 50, y: 60, rotation: -8, perspective: 0 } },
  { id: "tilt-right", key: "screenshotEditor.presetTiltRight", values: { scale: 65, x: 50, y: 60, rotation: 8, perspective: 0 } },
  { id: "perspective", key: "screenshotEditor.presetPerspective", values: { scale: 65, x: 50, y: 50, rotation: 0, perspective: 15 } },
  { id: "float-bottom", key: "screenshotEditor.presetFloatBottom", values: { scale: 55, x: 50, y: 70, rotation: 0, perspective: 0 } },
];

/** Which preset the current settings match, if any – appscreen only tracks it while you click. */
export function matchPositionPreset(s: ScreenshotSettings): string | null {
  const hit = POSITION_PRESETS.find((p) =>
    (Object.keys(p.values) as (keyof PositionPreset)[]).every((k) => s[k] === p.values[k]));
  return hit?.id ?? null;
}
