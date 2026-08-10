"use client";

import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function LanguagesDialog(_props: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; appId: string; appName?: string;
}) {
  return null;
}
