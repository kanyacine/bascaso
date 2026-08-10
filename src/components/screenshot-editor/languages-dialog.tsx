"use client";

import { useState } from "react";
import { Plus, TrashSimple, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TokenCostHint } from "@/components/token-cost-hint";
import { LOCALE_NAMES, localeName, sortLocales } from "@/lib/asc/locale-names";
import { collectTranslatableItems } from "@/lib/screenshot-editor/languages";
import { useEditorTranslation } from "@/lib/hooks/use-editor-translation";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function LanguagesDialog({ open, onOpenChange, doc, dispatch, appId: _appId, appName }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; appId: string; appName?: string;
}) {
  const t = useTranslations();
  const { running, progress, translateItems, cancel } = useEditorTranslation({ appName });
  const addable = sortLocales(
    Object.keys(LOCALE_NAMES).filter((l) => !doc.projectLanguages.includes(l)),
    doc.projectLanguages[0],
  );
  const [newLang, setNewLang] = useState("");
  const [withTranslation, setWithTranslation] = useState(true);
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const source = sourceLang ?? doc.currentLanguage;

  const onAdd = async () => {
    if (!newLang) return;
    dispatch({ type: "add-language", language: newLang });
    if (withTranslation) {
      const items = collectTranslatableItems(doc, source);
      if (items.length > 0) {
        const entries = await translateItems(items, source, [newLang]);
        if (entries) {
          dispatch({ type: "apply-doc-translations", entries });
          toast.success(t("screenshotEditor.translationDone"));
        }
      }
    }
    dispatch({ type: "set-current-language", language: newLang }); // review happens in place
    setNewLang("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("screenshotEditor.languages")}</DialogTitle>
          <DialogDescription>{t("screenshotEditor.manageLanguages")}</DialogDescription>
        </DialogHeader>

        <section className="space-y-1">
          {doc.projectLanguages.map((lang) => (
            <div key={lang} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span>{localeName(lang)}{lang === doc.currentLanguage ? " ·" : ""}</span>
              <Button size="icon" variant="ghost" className="size-6"
                      disabled={doc.projectLanguages.length <= 1 || running}
                      aria-label={t("screenshotEditor.removeLanguage")}
                      onClick={() => dispatch({ type: "remove-language", language: lang })}>
                <TrashSimple size={12} />
              </Button>
            </div>
          ))}
          {doc.projectLanguages.length <= 1 ? (
            <p className="text-xs text-muted-foreground">{t("screenshotEditor.lastLanguageHint")}</p>
          ) : null}
        </section>

        <section className="space-y-3 border-t pt-4">
          <Select value={newLang} onValueChange={setNewLang}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder={t("screenshotEditor.addLanguage")} />
            </SelectTrigger>
            <SelectContent>
              {addable.map((l) => <SelectItem key={l} value={l}>{localeName(l)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox id="prefill" checked={withTranslation} onCheckedChange={(v) => setWithTranslation(v === true)} />
            <Label htmlFor="prefill" className="text-sm">{t("screenshotEditor.addLanguageTranslate")}</Label>
          </div>
          {withTranslation ? (
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.sourceLanguage")}</span>
              <Select value={source} onValueChange={setSourceLang}>
                <SelectTrigger className="w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {doc.projectLanguages.map((l) => <SelectItem key={l} value={l}>{localeName(l)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {running && progress ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("screenshotEditor.translating", { done: progress.done, total: progress.total })}</span>
              <Button size="sm" variant="ghost" onClick={cancel}><X size={14} /></Button>
            </div>
          ) : (
            <Button size="sm" disabled={!newLang} onClick={onAdd}>
              <Plus size={14} className="mr-1" />{t("screenshotEditor.addLanguage")}
              {withTranslation ? <TokenCostHint group="metadata" variant="button" /> : null}
            </Button>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
