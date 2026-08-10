"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TokenCostHint } from "@/components/token-cost-hint";
import { AddLocaleDialog } from "@/components/add-locale-dialog";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { useAppInfo } from "@/lib/hooks/use-app-info";
import { localeName } from "@/lib/asc/locale-names";
import { EDITABLE_STATES, resolveVersion } from "@/lib/asc/version-types";
import { useVersions } from "@/lib/versions-context";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import {
  ASC_MAX_SCREENSHOTS_PER_SET, buildExportPlan, workingFormats, zipFileName,
  type ExportFormatChoice, type ExportLanguageChoice,
} from "@/lib/screenshot-editor/export";
import { collectTranslatableItems, type TranslationEntry } from "@/lib/screenshot-editor/languages";
import { useEditorExport } from "@/lib/hooks/use-editor-export";
import { useEditorTranslation } from "@/lib/hooks/use-editor-translation";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { LaurelVariant, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function ExportDialog({
  open, onOpenChange, doc, dispatch: _dispatch, appId, appName,
  primaryLocale, images, laurelImages,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  appId: string; appName?: string; primaryLocale: string;
  images: Map<string, RenderImage>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
}) {
  const t = useTranslations();
  const [languages, setLanguages] = useState<ExportLanguageChoice>("current");
  const [formats, setFormats] = useState<ExportFormatChoice>("current");
  const [destination, setDestination] = useState<"zip" | "asc">("zip");
  const [addLocaleCode, setAddLocaleCode] = useState<string | null>(null);

  const { versions } = useVersions();
  const version = resolveVersion(versions, null);
  const editable = version ? EDITABLE_STATES.has(version.attributes.appVersionState) : false;
  const versionId = version?.id ?? "";
  const { localizations, refresh: refreshLocalizations } = useLocalizations(appId, versionId);
  const listingLocales = useMemo(() => localizations.map((l) => l.attributes.locale), [localizations]);
  const { appInfos } = useAppInfo(appId);
  const appInfoId = useMemo(() => pickAppInfo(appInfos)?.id ?? "", [appInfos]);

  const exporter = useEditorExport({ appId, doc, images, laurelImages });
  const translator = useEditorTranslation({ appName });
  const running = exporter.running || translator.running;

  const plan = buildExportPlan(doc, { languages, formats, listingLocales });
  const uniqueExtra = [...new Set(plan.filter((j) => j.translated).map((j) => j.language))];
  const tooMany = doc.screenshots.length > ASC_MAX_SCREENSHOTS_PER_SET;
  // Working languages the listing does not carry yet: their jobs would be skipped on upload.
  const missing = destination === "asc"
    ? doc.projectLanguages.filter((l) => !listingLocales.includes(l))
    : [];
  const customFormat = destination === "asc" && plan.some((j) => j.format === "custom");

  const start = async () => {
    const translations = new Map<string, TranslationEntry[]>();
    if (uniqueExtra.length > 0) {
      const items = collectTranslatableItems(doc, doc.currentLanguage);
      if (items.length > 0) {
        const entries = await translator.translateItems(items, doc.currentLanguage, uniqueExtra);
        if (!entries) return; // cancelled or failed – keep the dialog open
        for (const entry of entries) {
          const list = translations.get(entry.language) ?? [];
          list.push(entry);
          translations.set(entry.language, list);
        }
      }
    }
    const ok = await exporter.runExport({
      plan, destination, translations,
      zipName: zipFileName({ languages, formats }, doc),
      asc: destination === "asc" ? { versionId, localizations } : undefined,
    });
    if (ok) onOpenChange(false);
  };

  const progress = translator.progress
    ? t("screenshotEditor.translating", { done: translator.progress.done, total: translator.progress.total })
    : exporter.progress?.label;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("screenshotEditor.exportTitle")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="section-title">{t("screenshotEditor.exportLanguages")}</h3>
          <RadioGroup value={languages} onValueChange={(v) => setLanguages(v as ExportLanguageChoice)}>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="current" />
              {t("screenshotEditor.exportCurrentLanguage", { language: localeName(doc.currentLanguage) })}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="working" disabled={doc.projectLanguages.length < 2} />
              {t("screenshotEditor.exportWorkingLanguages")}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="working-plus-listing" disabled={listingLocales.length === 0} />
              {t("screenshotEditor.exportTranslateOthers")}
            </Label>
          </RadioGroup>
          {languages === "working-plus-listing" ? (
            <p className="text-xs text-muted-foreground">{t("screenshotEditor.exportTranslateOthersHint")}</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="section-title">{t("screenshotEditor.exportFormats")}</h3>
          <RadioGroup value={formats} onValueChange={(v) => setFormats(v as ExportFormatChoice)}>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="current" />{t("screenshotEditor.exportCurrentFormat")}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="working" disabled={workingFormats(doc).length < 2} />
              {t("screenshotEditor.exportWorkingFormats")}
            </Label>
          </RadioGroup>
        </section>

        <section className="space-y-2">
          <h3 className="section-title">{t("screenshotEditor.exportDestination")}</h3>
          <RadioGroup value={destination} onValueChange={(v) => setDestination(v as "zip" | "asc")}>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="asc" disabled={!editable} />{t("screenshotEditor.exportToAsc")}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="zip" />{t("screenshotEditor.exportToZip")}
            </Label>
          </RadioGroup>
          {!editable ? (
            <p className="text-xs text-muted-foreground">{t("screenshotEditor.exportNoEditableVersion")}</p>
          ) : null}
          {destination === "asc" ? (
            <>
              <p className="text-xs text-muted-foreground">{t("screenshotEditor.exportPurgeWarning")}</p>
              {tooMany ? (
                <p className="text-xs text-amber-600">
                  {t("screenshotEditor.exportMaxWarning", { max: ASC_MAX_SCREENSHOTS_PER_SET })}
                </p>
              ) : null}
              {customFormat ? (
                <p className="text-xs text-amber-600">{t("screenshotEditor.exportCustomFormatSkipped")}</p>
              ) : null}
              {missing.map((lang) => (
                <div key={lang} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("screenshotEditor.exportMissingLocale", { language: localeName(lang) })}</span>
                  <Button size="sm" variant="outline" onClick={() => setAddLocaleCode(lang)}>
                    {t("screenshotEditor.exportAddLocale")}
                  </Button>
                </div>
              ))}
            </>
          ) : null}
        </section>

        <DialogFooter className="items-center gap-3">
          {progress ? <span className="mr-auto text-xs text-muted-foreground">{progress}</span> : null}
          <Button onClick={start} disabled={running || plan.length === 0}>
            {t("screenshotEditor.exportStart")}
            {uniqueExtra.length > 0 ? <TokenCostHint group="metadata" variant="button" /> : null}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AddLocaleDialog open={addLocaleCode !== null}
                       onOpenChange={(o) => { if (!o) setAddLocaleCode(null); }}
                       locale={addLocaleCode ?? ""} appId={appId} primaryLocale={primaryLocale}
                       appName={appName} versionId={versionId} appInfoId={appInfoId}
                       onCreated={() => { void refreshLocalizations(); }} />
    </Dialog>
  );
}
