"use client";

import { Stack } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EDITOR_FORMATS, formatsForPlatforms } from "@/lib/screenshot-editor/devices";
import { useVersions } from "@/lib/versions-context";
import { workingFormats } from "@/lib/screenshot-editor/export";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function FormatSelect({ doc, dispatch }: { doc: ScreenshotDoc; dispatch: (a: EditorAction) => void }) {
  const t = useTranslations();
  const working = workingFormats(doc);
  // Only the devices the app is declared on – an iOS app has no business exporting a Mac shot.
  // A format the doc already works on is listed regardless, so nothing silently disappears.
  const { versions } = useVersions();
  const platforms = [...new Set(versions.map((v) => v.attributes.platform))];
  const formats = formatsForPlatforms(platforms)
    .concat(EDITOR_FORMATS.filter((f) => working.includes(f.key)))
    .filter((f, i, all) => all.findIndex((x) => x.key === f.key) === i)
    .sort((a, b) => EDITOR_FORMATS.indexOf(a) - EDITOR_FORMATS.indexOf(b));
  return (
    // `contents`: the select and the popover button are columns of the editor's header grid.
    <div className="contents">
      <Select value={doc.outputDevice} onValueChange={(v) => dispatch({ type: "set-output-device", device: v })}>
        <SelectTrigger className="w-full min-w-0 text-sm" aria-label={t("screenshotEditor.format")}>
          <SelectValue />
        </SelectTrigger>
        {/* Only the working formats switch the canvas – the full catalog lives in the popover. */}
        <SelectContent>
          {formats.filter((f) => working.includes(f.key)).map((f) => (
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
          <h3 className="section-title mb-2">{t("screenshotEditor.workingFormats")}</h3>
          {/* The whole ASC catalog – too long for the panel, so the list scrolls. */}
          <div className="max-h-72 overflow-y-auto">
          {formats.map((f) => {
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
