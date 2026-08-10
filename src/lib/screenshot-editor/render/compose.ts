/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import { getCanvasDimensions } from "../devices";
import { migrate3DPosition } from "../three-scene";
import type {
  Background,
  Dimensions,
  EditorElement,
  EditorScreenshot,
  Popout,
  RenderAssets,
  RenderCanvas,
  RenderEnv,
  RenderImage,
  ScreenshotDefaults,
  ScreenshotDoc,
  ScreenshotSettings,
  TextSettings,
} from "../types";
import { drawBackgroundToContext, drawNoiseToContext } from "./background";
import { drawElementsToContext } from "./elements";
import { drawPopoutsToContext } from "./popouts";
import { drawScreenshotToContext } from "./screenshot";
import { drawTextToContext } from "./text";

// Port of getScreenshotImage (language-utils.js:94-122). Adaptation: the doc stores image refs,
// so the already-resolved bitmaps arrive keyed by language in assets.screenshotImages.
export function resolveScreenshotImage(
  assets: Pick<RenderAssets, "screenshotImages" | "legacyImage">,
  language: string,
  projectLanguages: string[],
): RenderImage | null {
  // Try current language first
  if (assets.screenshotImages[language]) {
    return assets.screenshotImages[language];
  }

  // Fallback to first available language in project order
  for (const l of projectLanguages) {
    if (assets.screenshotImages[l]) {
      return assets.screenshotImages[l];
    }
  }

  // Fallback to any available language
  for (const l of Object.keys(assets.screenshotImages)) {
    if (assets.screenshotImages[l]) {
      return assets.screenshotImages[l];
    }
  }

  // Legacy fallback for old screenshot format
  return assets.legacyImage || null;
}

// Port of renderScreenshotToCanvas (app.js:7050-7102). Adaptations: dimensions come from the doc
// instead of a parameter, canvas.style sizing is dropped (preview scaling is a React concern), and
// the 3D branch is not ported in phase 1 — use3D docs render through the 2D path.
export function renderScreenshotToCanvas(
  canvas: RenderCanvas,
  doc: ScreenshotDoc,
  index: number,
  assets: RenderAssets,
  env: RenderEnv,
): void {
  const screenshot = doc.screenshots[index];
  if (!screenshot) return;

  const dims = getCanvasDimensions(doc);

  // Get localized image for current language
  const img = resolveScreenshotImage(assets, env.language, env.projectLanguages);

  // Set canvas size (this also clears the canvas)
  canvas.width = dims.width;
  canvas.height = dims.height;

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  // Clear canvas explicitly
  ctx.clearRect(0, 0, dims.width, dims.height);

  // Draw background for this screenshot
  const bg = screenshot.background;
  drawBackgroundToContext(ctx, dims, bg, assets.backgroundImage);

  // Draw noise if enabled
  if (bg.noise) {
    drawNoiseToContext(ctx, dims, bg.noiseIntensity, env.rng);
  }

  const elements = screenshot.elements;

  // Elements behind screenshot
  drawElementsToContext(ctx, dims, elements, "behind-screenshot", env, assets);

  // Draw screenshot (2D — the 3D path lands in phase 5)
  const settings = screenshot.screenshot;
  if (img) {
    drawScreenshotToContext(ctx, dims, img, settings);
  }

  // Elements above screenshot
  drawElementsToContext(ctx, dims, elements, "above-screenshot", env, assets);

  // Draw popouts
  drawPopoutsToContext(ctx, dims, screenshot.popouts, img, settings);

  // Draw text
  drawTextToContext(ctx, dims, screenshot.text);

  // Elements above text
  drawElementsToContext(ctx, dims, elements, "above-text", env, assets);
}

// ---- appscreen project import ----

/** One project entry of an appscreen backup, as written by saveState (app.js:1508-1536). */
interface AppscreenProject {
  screenshots: {
    src?: string;
    name?: string;
    localizedImages?: Record<string, { src?: string } | undefined>;
    background: Background;
    screenshot: ScreenshotSettings;
    text: TextSettings;
    elements?: EditorElement[];
    popouts?: Popout[];
  }[];
  selectedIndex: number;
  formatVersion?: number;
  outputDevice: string;
  customWidth: number;
  customHeight: number;
  currentLanguage: string;
  projectLanguages: string[];
  defaults: ScreenshotDefaults;
}

// appscreen device sizes (app.js:1239-1242). Editor formats are ASC display types now, so an
// imported appscreen device becomes a custom format of the same pixel size.
const APPSCREEN_DEVICE_SIZES: Record<string, Dimensions> = {
  "iphone-6.9": { width: 1320, height: 2868 },
  "iphone-6.7": { width: 1290, height: 2796 },
  "iphone-6.5": { width: 1284, height: 2778 },
  "iphone-5.5": { width: 1242, height: 2208 },
};

export interface ParsedAppscreenProject {
  doc: ScreenshotDoc;
  /**
   * Every image ref the doc points at, keyed for asset resolution:
   * `screenshot:<index>:<lang>`, `background:<index>`, `element:<elementId>`.
   */
  imageRefs: Map<string, string>;
}

/** Map one appscreen project onto the doc model. Pure data mapping — no bitmap decoding. */
export function parseAppscreenProject(raw: unknown): ParsedAppscreenProject {
  const project = raw as AppscreenProject;
  const needs3DMigration = !project.formatVersion || project.formatVersion < 2;
  const currentLanguage = project.currentLanguage;
  const imageRefs = new Map<string, string>();

  const screenshots: EditorScreenshot[] = project.screenshots.map((s, index) => {
    const localizedImages: Record<string, { src: string | null }> = {};
    for (const [lang, entry] of Object.entries(s.localizedImages ?? {})) {
      if (!entry?.src) continue;
      localizedImages[lang] = { src: entry.src };
      imageRefs.set(`screenshot:${index}:${lang}`, entry.src);
    }

    // Pre-localizedImages docs carry their single image in `src`
    if (s.src && !localizedImages[currentLanguage]) {
      localizedImages[currentLanguage] = { src: s.src };
      imageRefs.set(`screenshot:${index}:${currentLanguage}`, s.src);
    }

    if (s.background.image) {
      imageRefs.set(`background:${index}`, s.background.image);
    }

    const elements = s.elements ?? [];
    for (const el of elements) {
      if (el.src) imageRefs.set(`element:${el.id}`, el.src);
    }

    return {
      name: s.name,
      localizedImages,
      background: s.background,
      screenshot: needs3DMigration ? migrate3DPosition(s.screenshot) : s.screenshot,
      text: s.text,
      elements,
      popouts: s.popouts ?? [],
    };
  });

  const size = APPSCREEN_DEVICE_SIZES[project.outputDevice];
  return {
    doc: {
      screenshots,
      selectedIndex: project.selectedIndex,
      outputDevice: "custom",
      customWidth: size ? size.width : project.customWidth,
      customHeight: size ? size.height : project.customHeight,
      currentLanguage,
      projectLanguages: project.projectLanguages,
      defaults: project.defaults,
    },
    imageRefs,
  };
}
