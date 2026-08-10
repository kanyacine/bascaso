"use client";

import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { LaurelVariant, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function ExportDialog(_props: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  appId: string; appName?: string; primaryLocale: string;
  images: Map<string, RenderImage>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
}) {
  return null;
}
