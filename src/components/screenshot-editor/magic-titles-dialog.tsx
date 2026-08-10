"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TokenCostHint } from "@/components/token-cost-hint";
import { localeName } from "@/lib/asc/locale-names";
import { useMagicTitles } from "@/lib/hooks/use-magic-titles";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function MagicTitlesDialog({ open, onOpenChange, appId, doc, dispatch, appName }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; appName?: string;
}) {
  const t = useTranslations();
  const { running, generate } = useMagicTitles({ appId, appName });
  const [language, setLanguage] = useState<string | null>(null);
  const target = language ?? doc.currentLanguage;

  const start = async () => {
    const entries = await generate(doc, target);
    if (!entries || entries.length === 0) {
      if (entries?.length === 0) toast.error(t("screenshotEditor.magicTitlesFailed"));
      return;
    }
    dispatch({ type: "apply-doc-translations", entries });
    // appscreen also flips the visibility switches on (magical-titles.js:423-433);
    // apply-doc-translations only auto-enables subheadlines.
    for (const index of new Set(entries.map((e) => e.index))) {
      dispatch({ type: "set-text-setting", index, patch: { headlineEnabled: true } });
    }
    dispatch({ type: "set-current-language", language: target }); // review in place
    toast.success(t("screenshotEditor.magicTitlesDone"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("screenshotEditor.magicTitlesTitle")}</DialogTitle>
          <DialogDescription>{t("screenshotEditor.magicTitlesBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("screenshotEditor.magicTitlesCount", { count: doc.screenshots.length })}
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>{t("screenshotEditor.magicTitlesLanguage")}</span>
            <Select value={target} onValueChange={setLanguage}>
              <SelectTrigger className="w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {doc.projectLanguages.map((l) => (
                  <SelectItem key={l} value={l}>{localeName(l)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t("screenshotEditor.magicTitlesOverwriteHint")}</p>
        </div>
        <DialogFooter>
          <Button onClick={start} disabled={running || doc.screenshots.length === 0}>
            {t("screenshotEditor.magicTitlesGenerate")}
            <TokenCostHint group="metadata" variant="button" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
