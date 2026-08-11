"use client";

// Renders the selected shot's 3D mockup whenever the doc changes – the WebGL render itself is
// synchronous once the model is cached, so this settles within a frame except on first load.
import { useEffect, useState } from "react";
import { getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { resolveScreenshotImage } from "@/lib/screenshot-editor/render/compose";
import { getMockupRenderer } from "@/lib/screenshot-editor/three-renderer";
import { assetsForShot } from "./use-editor-images";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function useEditorMockups(
  doc: ScreenshotDoc | null,
  images: Map<string, RenderImage>,
): RenderImage | null {
  const [mockup, setMockup] = useState<RenderImage | null>(null);

  useEffect(() => {
    const shot = doc?.screenshots[doc.selectedIndex];
    const image = doc && shot?.screenshot.use3D
      ? resolveScreenshotImage(
          assetsForShot(doc, doc.selectedIndex, images, {}),
          doc.currentLanguage,
          doc.projectLanguages,
        )
      : null;
    let cancelled = false;
    // Every state write happens after an await – the effect body itself stays synchronous-free,
    // so 2D shots and image-less 3D shots clear the mockup a microtask later (invisible: compose
    // ignores assets.mockup outside 3D).
    void (async () => {
      if (!doc || !shot?.screenshot.use3D || !image) {
        if (!cancelled) setMockup(null);
        return;
      }
      const renderer = await getMockupRenderer();
      await renderer.loadModel(shot.screenshot.device3D);
      if (cancelled) return;
      const canvas = renderer.render(shot.screenshot, image, getCanvasDimensions(doc));
      setMockup(canvas as unknown as RenderImage);
    })();
    return () => { cancelled = true; };
  }, [doc, images]);

  return mockup;
}
