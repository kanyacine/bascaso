// Screenshot sources live on two axes: the device the shot was taken on and the language it was
// taken in. A cell is an override; anything missing falls back, device first – a capture in the
// wrong device frame reads as broken, a capture in the wrong language reads as a detail.
//
//   (this device, this language) → (this device, another language) → (another device, …)
//
// The device axis is the ASC device *category*, not the display type: nobody shoots one capture
// per iPad size, and "the iPad image" is what the user means.
import { getDeviceCategory } from "@/lib/asc/display-types";
import { EDITOR_FORMATS } from "./devices";
import { workingFormats } from "./export";
import type { EditorScreenshot, ScreenshotDoc } from "./types";

export type LocalizedImages = Record<string, { src: string | null }>;

/** A custom canvas size belongs to no ASC category – it gets its own bucket. */
export const OTHER_CATEGORY = "Other";

export function categoryForFormat(format: string): string {
  return getDeviceCategory(format) ?? OTHER_CATEGORY;
}

/** Categories to try in order: the one on screen, then the doc's own working formats. */
export function categoryOrder(doc: ScreenshotDoc): string[] {
  const current = categoryForFormat(doc.outputDevice);
  const working = workingFormats(doc)
    .slice()
    .sort((a, b) => EDITOR_FORMATS.findIndex((f) => f.key === a) - EDITOR_FORMATS.findIndex((f) => f.key === b))
    .map(categoryForFormat);
  return [...new Set([current, ...working])];
}

export function allImageRefs(shot: EditorScreenshot): string[] {
  return Object.values(shot.images ?? {})
    .flatMap((byLanguage) => Object.values(byLanguage ?? {}))
    .map((entry) => entry?.src)
    .filter((ref): ref is string => Boolean(ref));
}

function hasAny(map: LocalizedImages | undefined): boolean {
  return Boolean(map && Object.values(map).some((entry) => entry?.src));
}

/**
 * The language map that feeds the canvas for a category: its own if it holds anything, otherwise
 * the first category that does. The language fallback inside the map is the renderer's job
 * (resolveScreenshotImage) – and imageSourceFor below, which mirrors it on refs.
 */
export function imagesForCategory(
  shot: EditorScreenshot,
  category: string,
  order: string[],
): LocalizedImages {
  const images = shot.images ?? {};
  if (hasAny(images[category])) return images[category];
  for (const other of order) {
    if (hasAny(images[other])) return images[other];
  }
  for (const other of Object.keys(images).sort()) {
    if (hasAny(images[other])) return images[other];
  }
  return {};
}

export interface ImageSource {
  src: string;
  category: string;
  language: string;
}

/** Which cell actually feeds the canvas – the panel tells the user what it is inheriting. */
export function imageSourceFor(
  doc: ScreenshotDoc,
  shot: EditorScreenshot,
  language: string,
): ImageSource | null {
  const order = categoryOrder(doc);
  const category = categoryForFormat(doc.outputDevice);
  const map = imagesForCategory(shot, category, order);
  const from = Object.entries(shot.images ?? {}).find(([, m]) => m === map)?.[0];
  const pick = map[language]?.src
    ? language
    : doc.projectLanguages.find((l) => map[l]?.src) ?? Object.keys(map).find((l) => map[l]?.src);
  if (!from || !pick || !map[pick]?.src) return null;
  return { src: map[pick].src, category: from, language: pick };
}

/** True when this exact cell holds an override, as opposed to inheriting one. */
export function hasOwnImage(shot: EditorScreenshot, category: string, language: string): boolean {
  return Boolean(shot.images?.[category]?.[language]?.src);
}

export function setImage(
  shot: EditorScreenshot,
  category: string,
  language: string,
  ref: string,
): EditorScreenshot {
  const images = shot.images ?? {};
  return {
    ...shot,
    images: { ...images, [category]: { ...images[category], [language]: { src: ref } } },
  };
}

export function clearImage(
  shot: EditorScreenshot,
  category: string,
  language: string,
): EditorScreenshot {
  const images = shot.images ?? {};
  const { [language]: _dropped, ...rest } = images[category] ?? {};
  return { ...shot, images: { ...images, [category]: rest } };
}
