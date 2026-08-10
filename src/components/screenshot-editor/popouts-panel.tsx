"use client";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function PopoutsPanel(_props: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  images: Map<string, RenderImage>;
  selectedPopoutId: string | null; onSelectPopout: (id: string | null) => void;
}) { return null; }
