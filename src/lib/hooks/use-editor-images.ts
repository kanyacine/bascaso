"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderAssets, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

/** Collect every image ref used by the doc (screenshot bitmaps only in phase 2). */
function collectRefs(doc: ScreenshotDoc): string[] {
  const refs = new Set<string>();
  for (const shot of doc.screenshots) {
    for (const entry of Object.values(shot.localizedImages)) {
      if (entry?.src) refs.add(entry.src);
    }
    if (shot.src) refs.add(shot.src);
  }
  return [...refs];
}

export function useEditorImages(appId: string, doc: ScreenshotDoc | null): Map<string, RenderImage> {
  // Decoded once per ref; the ref set is write-only outside render, the map is state so a new
  // identity is what tells the canvas effect a bitmap landed.
  const requested = useRef(new Set<string>());
  const [images, setImages] = useState<Map<string, RenderImage>>(() => new Map());
  const refs = useMemo(() => (doc ? collectRefs(doc) : []), [doc]);

  useEffect(() => {
    for (const ref of refs) {
      if (requested.current.has(ref)) continue;
      requested.current.add(ref);
      const img = new Image();
      img.onload = () => {
        setImages((prev) => new Map(prev).set(ref, img as unknown as RenderImage));
      };
      img.src = ref.startsWith("data:") ? ref : `/api/apps/${appId}/screenshot-doc/assets/${ref}`;
    }
  }, [appId, refs]);

  return images;
}

/** Build the RenderAssets for one screenshot from the shared bitmap cache. */
export function assetsForShot(
  doc: ScreenshotDoc,
  index: number,
  images: Map<string, RenderImage>,
): RenderAssets {
  const shot = doc.screenshots[index];
  const screenshotImages: Record<string, RenderImage | undefined> = {};
  if (shot) {
    for (const [lang, entry] of Object.entries(shot.localizedImages)) {
      if (entry?.src) screenshotImages[lang] = images.get(entry.src);
    }
  }
  return {
    screenshotImages,
    legacyImage: shot?.src ? images.get(shot.src) : null,
    elementImages: {}, // phase 3
    laurelImages: {}, // phase 3
  };
}
