"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  allImageRefs, categoryForFormat, categoryOrder, imagesForCategory,
} from "@/lib/screenshot-editor/images";
import type {
  LaurelVariant, RenderAssets, RenderImage, ScreenshotDoc,
} from "@/lib/screenshot-editor/types";

/** Collect every image ref used by the doc – screenshots, backgrounds, element bitmaps. */
export function collectRefs(doc: ScreenshotDoc): string[] {
  const refs = new Set<string>();
  for (const shot of doc.screenshots) {
    for (const ref of allImageRefs(shot)) refs.add(ref);
    if (shot.background.image) refs.add(shot.background.image);
    for (const el of shot.elements) {
      if (el.src) refs.add(el.src);
    }
  }
  return [...refs];
}

export interface EditorImages {
  images: Map<string, RenderImage>;
  /** Refs whose load failed. A ref is requested once, so these never resolve on their own –
   *  callers that wait on the whole set (export) have to treat them as settled, not pending. */
  failed: Set<string>;
}

export function useEditorImages(appId: string, doc: ScreenshotDoc | null): EditorImages {
  // Decoded once per ref; the ref set is write-only outside render, the map is state so a new
  // identity is what tells the canvas effect a bitmap landed.
  const requested = useRef(new Set<string>());
  const [images, setImages] = useState<Map<string, RenderImage>>(() => new Map());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const refs = useMemo(() => (doc ? collectRefs(doc) : []), [doc]);

  useEffect(() => {
    for (const ref of refs) {
      if (requested.current.has(ref)) continue;
      requested.current.add(ref);
      const img = new Image();
      img.onload = () => {
        setImages((prev) => new Map(prev).set(ref, img as unknown as RenderImage));
      };
      // A deleted or corrupt asset used to leave the ref pending forever, and the export
      // readiness check then refused every export with "images are still loading".
      img.onerror = () => {
        setFailed((prev) => new Set(prev).add(ref));
      };
      img.src = ref.startsWith("data:") ? ref : `/api/apps/${appId}/screenshot-doc/assets/${ref}`;
    }
  }, [appId, refs]);

  return { images, failed };
}

const LAUREL_VARIANTS: LaurelVariant[] = ["laurel-simple-left", "laurel-detailed-left"];

/** Load the two laurel SVGs (static public assets) once. */
export function useLaurelImages(): Partial<Record<LaurelVariant, RenderImage>> {
  const [laurels, setLaurels] = useState<Partial<Record<LaurelVariant, RenderImage>>>({});
  useEffect(() => {
    for (const variant of LAUREL_VARIANTS) {
      const img = new Image();
      img.onload = () => {
        setLaurels((prev) => ({ ...prev, [variant]: img as unknown as RenderImage }));
      };
      img.src = `/screenshot-editor/${variant}.svg`;
    }
  }, []);
  return laurels;
}

/** Build the RenderAssets for one screenshot from the shared bitmap cache. */
export function assetsForShot(
  doc: ScreenshotDoc,
  index: number,
  images: Map<string, RenderImage>,
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>,
): RenderAssets {
  const shot = doc.screenshots[index];
  const screenshotImages: Record<string, RenderImage | undefined> = {};
  const elementImages: Record<string, RenderImage | undefined> = {};
  if (shot) {
    // Scoped to the device on screen; the renderer resolves the language inside it.
    const forDevice = imagesForCategory(shot, categoryForFormat(doc.outputDevice), categoryOrder(doc));
    for (const [lang, entry] of Object.entries(forDevice)) {
      if (entry?.src) screenshotImages[lang] = images.get(entry.src);
    }
    for (const el of shot.elements) {
      if (el.src) elementImages[el.id] = images.get(el.src);
    }
  }
  return {
    screenshotImages,
    backgroundImage: shot?.background.image ? images.get(shot.background.image) : undefined,
    elementImages,
    laurelImages,
  };
}
