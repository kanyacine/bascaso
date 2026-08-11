/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import { getCanvasDimensions } from "../devices";
import { categoryForFormat, categoryOrder } from "../images";
import { cropForCategory } from "../crop";
import type {
  RenderAssets,
  RenderCanvas,
  RenderEnv,
  RenderImage,
  ScreenshotDoc,
} from "../types";
import { drawBackgroundToContext, drawNoiseToContext } from "./background";
import { drawElementsToContext } from "./elements";
import { drawPopoutsToContext } from "./popouts";
import { drawScreenshotToContext } from "./screenshot";
import { drawTextToContext } from "./text";

// Port of getScreenshotImage (language-utils.js:94-122). Adaptation: the doc stores image refs,
// so the already-resolved bitmaps arrive keyed by language in assets.screenshotImages.
export function resolveScreenshotImage(
  assets: Pick<RenderAssets, "screenshotImages">,
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

  return null;
}

// Port of renderScreenshotToCanvas (app.js:7050-7102). Adaptations: dimensions come from the doc
// instead of a parameter, canvas.style sizing is dropped (preview scaling is a React concern), and
// the 3D branch consumes a bitmap rendered outside this pure pipeline (assets.mockup).
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

  // Draw screenshot – the 3D mockup is pre-rendered outside the pure pipeline (app.js:6824-6840)
  const settings = screenshot.screenshot;
  if (settings.use3D) {
    // absent while the model loads – the mockups hook re-renders when it lands (appscreen
    // draws nothing either, app.js:6830-6839)
    if (assets.mockup) ctx.drawImage(assets.mockup, 0, 0, dims.width, dims.height);
  } else if (img) {
    drawScreenshotToContext(ctx, dims, img, settings);
  }

  // Elements above screenshot
  drawElementsToContext(ctx, dims, elements, "above-screenshot", env, assets);

  // Draw popouts – their crop follows the same device axis as the image they cut into
  const order = categoryOrder(doc);
  const category = categoryForFormat(doc.outputDevice);
  drawPopoutsToContext(
    ctx, dims,
    screenshot.popouts.map((p) => ({ ...p, ...cropForCategory(p, category, order) })),
    img, settings,
  );

  // Draw text
  drawTextToContext(ctx, dims, screenshot.text);

  // Elements above text
  drawElementsToContext(ctx, dims, elements, "above-text", env, assets);
}
