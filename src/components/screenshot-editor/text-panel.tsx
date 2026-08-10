"use client";

import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FontPicker } from "./font-picker";
import { PanelColor, PanelSlider } from "./panel-controls";
import { localeName } from "@/lib/asc/locale-names";
import { useTranslations } from "@/lib/i18n/locale-context";
import { getEffectiveLayout } from "@/lib/screenshot-editor/render/text";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { LanguageLayout, ScreenshotDoc, TextSettings } from "@/lib/screenshot-editor/types";

const WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];

// Text writes go to doc.currentLanguage; the five layout controls follow the per-language
// layout switch (colors, weights and italics stay global across languages – appscreen behavior).
export function TextPanel({ doc, dispatch, onMagicTitles }: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; onMagicTitles?: () => void;
}) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const lang = doc.currentLanguage;
  const txt = doc.screenshots[index].text;
  const patch = (p: Partial<TextSettings>) => dispatch({ type: "set-text-setting", index, patch: p });
  const layout = getEffectiveLayout(txt, lang);
  const layoutPatch = (p: Partial<LanguageLayout>) =>
    txt.perLanguageLayout
      ? dispatch({ type: "set-language-layout", index, language: lang, patch: p })
      : dispatch({ type: "set-text-setting", index, patch: p });

  return (
    <div className="space-y-6">
      {onMagicTitles ? (
        <Button size="sm" variant="outline" className="w-full" onClick={onMagicTitles}>
          <MagicWand size={14} className="mr-1.5" />{t("screenshotEditor.magicTitles")}
        </Button>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.headline")}</h3>
          <Switch checked={txt.headlineEnabled} onCheckedChange={(v) => patch({ headlineEnabled: v })} />
        </div>
        {txt.headlineEnabled ? (
          <>
            <Input value={txt.headlines[lang] ?? ""} placeholder={t("screenshotEditor.headline")}
                   onChange={(e) => dispatch({ type: "set-headline", index, language: lang, value: e.target.value })} />
            <PanelSlider label={t("screenshotEditor.size")} value={layout.headlineSize} min={20} max={220}
                         onChange={(v) => layoutPatch({ headlineSize: v })} />
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.weight")}</span>
              <Select value={txt.headlineWeight} onValueChange={(v) => patch({ headlineWeight: v })}>
                <SelectTrigger className="w-24 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.fontFamily")}</span>
              <FontPicker value={txt.headlineFont} onChange={(v) => patch({ headlineFont: v })} />
            </div>
            <PanelColor label={t("screenshotEditor.color")} value={txt.headlineColor}
                        onChange={(v) => patch({ headlineColor: v })} />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.subheadline")}</h3>
          <Switch checked={txt.subheadlineEnabled} onCheckedChange={(v) => patch({ subheadlineEnabled: v })} />
        </div>
        {txt.subheadlineEnabled ? (
          <>
            <Input value={txt.subheadlines[lang] ?? ""} placeholder={t("screenshotEditor.subheadline")}
                   onChange={(e) => dispatch({ type: "set-subheadline", index, language: lang, value: e.target.value })} />
            <PanelSlider label={t("screenshotEditor.size")} value={layout.subheadlineSize} min={12} max={140}
                         onChange={(v) => layoutPatch({ subheadlineSize: v })} />
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.fontFamily")}</span>
              <FontPicker value={txt.subheadlineFont} onChange={(v) => patch({ subheadlineFont: v })} />
            </div>
            <PanelColor label={t("screenshotEditor.color")} value={txt.subheadlineColor}
                        onChange={(v) => patch({ subheadlineColor: v })} />
            <PanelSlider label={t("screenshotEditor.opacity")} value={txt.subheadlineOpacity} min={0} max={100}
                         onChange={(v) => patch({ subheadlineOpacity: v })} />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.perLanguageLayout")}</h3>
          <Switch checked={txt.perLanguageLayout}
                  onCheckedChange={(v) => dispatch({ type: "set-per-language-layout", index, enabled: v })} />
        </div>
        {txt.perLanguageLayout ? (
          <p className="text-xs text-muted-foreground">
            {t("screenshotEditor.layoutForLanguage", { language: localeName(lang) })}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="section-title">{t("screenshotEditor.position")}</h3>
        <ToggleGroup type="single" variant="outline" size="sm" value={layout.position}
                     onValueChange={(v) => v && layoutPatch({ position: v as TextSettings["position"] })}>
          <ToggleGroupItem value="top">{t("screenshotEditor.top")}</ToggleGroupItem>
          <ToggleGroupItem value="bottom">{t("screenshotEditor.bottom")}</ToggleGroupItem>
        </ToggleGroup>
        <PanelSlider label={t("screenshotEditor.offsetY")} value={layout.offsetY} min={0} max={50}
                     onChange={(v) => layoutPatch({ offsetY: v })} />
        <PanelSlider label={t("screenshotEditor.lineHeight")} value={layout.lineHeight} min={80} max={200}
                     onChange={(v) => layoutPatch({ lineHeight: v })} />
      </section>
    </div>
  );
}
