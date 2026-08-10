"use client";

import { Stack } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import { workingFormats } from "@/lib/screenshot-editor/export";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function FormatSelect({ doc, dispatch }: { doc: ScreenshotDoc; dispatch: (a: EditorAction) => void }) {
  const t = useTranslations();
  const working = workingFormats(doc);
  return (
    <div className="flex items-center gap-1">
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
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8" aria-label={t("screenshotEditor.workingFormats")}>
            <Stack size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <p className="section-title mb-2">{t("screenshotEditor.workingFormats")}</p>
          {EDITOR_FORMATS.map((f) => {
            const active = working.includes(f.key);
            return (
              <label key={f.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                <Checkbox checked={active} disabled={f.key === doc.outputDevice}
                          onCheckedChange={() => dispatch({ type: "toggle-output-device", device: f.key })} />
                <span className="flex-1">{f.label}</span>
                <span className="text-xs text-muted-foreground">{f.width}×{f.height}</span>
              </label>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
