"use client";

import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function ScreenshotStrip(_props: {
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; images: Map<string, RenderImage>;
}) { return null; }
