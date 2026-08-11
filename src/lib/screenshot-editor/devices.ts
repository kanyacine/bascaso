/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import {
  DEVICE_CATEGORY_TYPES, DISPLAY_TYPE_LABELS, DISPLAY_TYPE_SIZES, PLATFORM_DEVICE_CATEGORIES,
  sortDisplayTypes,
} from "@/lib/asc/display-types";
import type { Dimensions, ScreenshotDoc } from "./types";

export interface EditorFormat {
  key: string;
  label: string;
  width: number;
  height: number;
}

/** Working formats a new doc starts on when the app has no screenshots in App Store Connect yet. */
export const DEFAULT_WORKING_FORMATS = ["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"];

/**
 * Every display type bascaso knows the pixel size of, in the catalog's own order – derived so the
 * editor cannot drift from `display-types.ts`. The iMessage types are out: they carry no size entry
 * (ASC reuses the iPhone/iPad dimensions for them).
 */
export const EDITOR_FORMATS: EditorFormat[] = sortDisplayTypes(Object.keys(DISPLAY_TYPE_SIZES))
  .map((key) => {
    const [width, height] = DISPLAY_TYPE_SIZES[key].split("×").map((n) => Number(n.trim()));
    return { key, label: DISPLAY_TYPE_LABELS[key] ?? key, width, height };
  });

/**
 * The formats worth offering for the platforms an app declares – iPhone/iPad/Watch for an iOS app,
 * Mac for a macOS one, the union of both for an app shipping on both. Unknown or empty platforms
 * fall back to the whole catalog rather than locking the picker down to nothing.
 */
export function formatsForPlatforms(platforms: string[]): EditorFormat[] {
  const categories = new Set(platforms.flatMap((p) => PLATFORM_DEVICE_CATEGORIES[p] ?? []));
  if (categories.size === 0) return EDITOR_FORMATS;
  const allowed = new Set([...categories].flatMap((c) => DEVICE_CATEGORY_TYPES[c]));
  return EDITOR_FORMATS.filter((f) => allowed.has(f.key));
}

/** Where a brand-new doc starts: the usual pair when the platform has it, its first format if not. */
export function defaultWorkingFormats(platforms: string[]): string[] {
  const allowed = formatsForPlatforms(platforms).map((f) => f.key);
  const usual = DEFAULT_WORKING_FORMATS.filter((key) => allowed.includes(key));
  return usual.length > 0 ? usual : allowed.slice(0, 1);
}

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
