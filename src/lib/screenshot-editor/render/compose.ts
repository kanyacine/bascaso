/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import { getCanvasDimensions } from "../devices";
import type { RenderAssets, RenderCanvas, RenderEnv, RenderImage, ScreenshotDoc } from "../types";
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
