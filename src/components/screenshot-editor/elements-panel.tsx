"use client";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function ElementsPanel(_props: {
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  images: Map<string, RenderImage>;
  selectedElementId: string | null; onSelectElement: (id: string | null) => void;
}) { return null; }
