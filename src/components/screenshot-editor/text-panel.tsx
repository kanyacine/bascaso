"use client";

import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function TextPanel(_props: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
}) { return null; }
