"use client";

import { Globe } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localeName } from "@/lib/asc/locale-names";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function LanguageSwitcher({ doc, dispatch, onManage }: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; onManage: () => void;
}) {
  const t = useTranslations();
  // min-w-0 + w-full: the switcher gives way to the actions on its right instead of
  // pushing them out of the 320px panel, whatever the locale name's length.
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Select value={doc.currentLanguage}
              onValueChange={(v) => dispatch({ type: "set-current-language", language: v })}>
        <SelectTrigger className="w-full min-w-0 text-sm" aria-label={t("screenshotEditor.language")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {doc.projectLanguages.map((lang) => (
            <SelectItem key={lang} value={lang}>{localeName(lang)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" className="size-8" aria-label={t("screenshotEditor.manageLanguages")}
              onClick={onManage}>
        <Globe size={16} />
      </Button>
    </div>
  );
}
