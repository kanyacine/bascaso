"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function FormatSelect({ doc, dispatch }: { doc: ScreenshotDoc; dispatch: (a: EditorAction) => void }) {
  const t = useTranslations();
  return (
    <Select value={doc.outputDevice} onValueChange={(v) => dispatch({ type: "set-output-device", device: v })}>
      <SelectTrigger className="w-44 text-sm" aria-label={t("screenshotEditor.format")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EDITOR_FORMATS.map((f) => (
          <SelectItem key={f.key} value={f.key}>{f.label} – {f.width}×{f.height}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
