/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import { DISPLAY_TYPE_LABELS } from "@/lib/asc/display-types";
import type { Dimensions, ScreenshotDoc } from "./types";

export interface EditorFormat {
  key: string;
  label: string;
  width: number;
  height: number;
}

/** Working formats a new doc starts on when the app has no screenshots in App Store Connect yet. */
export const DEFAULT_WORKING_FORMATS = ["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"];

// Sizes match DISPLAY_TYPE_SIZES in src/lib/asc/display-types.ts (asserted by test).
export const EDITOR_FORMATS: EditorFormat[] = [
  { key: "APP_IPHONE_67", label: DISPLAY_TYPE_LABELS.APP_IPHONE_67, width: 1260, height: 2736 },
  { key: "APP_IPHONE_65", label: DISPLAY_TYPE_LABELS.APP_IPHONE_65, width: 1284, height: 2778 },
  { key: "APP_IPHONE_55", label: DISPLAY_TYPE_LABELS.APP_IPHONE_55, width: 1242, height: 2208 },
  { key: "APP_IPAD_PRO_3GEN_129", label: DISPLAY_TYPE_LABELS.APP_IPAD_PRO_3GEN_129, width: 2064, height: 2752 },
  { key: "APP_IPAD_PRO_3GEN_11", label: DISPLAY_TYPE_LABELS.APP_IPAD_PRO_3GEN_11, width: 1668, height: 2388 },
  { key: "APP_IPAD_PRO_129", label: DISPLAY_TYPE_LABELS.APP_IPAD_PRO_129, width: 2048, height: 2732 },
];

// Port of getCanvasDimensions (app.js:6793-6798), doc passed explicitly instead of global state.
export function getCanvasDimensions(
  doc: Pick<ScreenshotDoc, "outputDevice" | "customWidth" | "customHeight">,
): Dimensions {
  if (doc.outputDevice === "custom") {
    return { width: doc.customWidth, height: doc.customHeight };
  }
  const format = EDITOR_FORMATS.find((f) => f.key === doc.outputDevice) ?? EDITOR_FORMATS[0];
  return { width: format.width, height: format.height };
}
