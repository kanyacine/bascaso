"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PanelColor, PanelSlider } from "./panel-controls";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc, TextSettings } from "@/lib/screenshot-editor/types";

const WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];

// Single working language in phase 2 – every text write goes to doc.currentLanguage.
export function TextPanel({ doc, dispatch }: { doc: ScreenshotDoc; dispatch: (a: EditorAction) => void }) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const lang = doc.currentLanguage;
  const txt = doc.screenshots[index].text;
  const patch = (p: Partial<TextSettings>) => dispatch({ type: "set-text-setting", index, patch: p });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.headline")}</h3>
          <Switch checked={txt.headlineEnabled} onCheckedChange={(v) => patch({ headlineEnabled: v })} />
        </div>
        {txt.headlineEnabled ? (
          <>
            <Input value={txt.headlines[lang] ?? ""} placeholder={t("screenshotEditor.headline")}
                   onChange={(e) => dispatch({ type: "set-headline", index, language: lang, value: e.target.value })} />
            <PanelSlider label={t("screenshotEditor.size")} value={txt.headlineSize} min={20} max={220}
                         onChange={(v) => patch({ headlineSize: v })} />
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.weight")}</span>
              <Select value={txt.headlineWeight} onValueChange={(v) => patch({ headlineWeight: v })}>
                <SelectTrigger className="w-24 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <PanelSlider label={t("screenshotEditor.size")} value={txt.subheadlineSize} min={12} max={140}
                         onChange={(v) => patch({ subheadlineSize: v })} />
            <PanelColor label={t("screenshotEditor.color")} value={txt.subheadlineColor}
                        onChange={(v) => patch({ subheadlineColor: v })} />
            <PanelSlider label={t("screenshotEditor.opacity")} value={txt.subheadlineOpacity} min={0} max={100}
                         onChange={(v) => patch({ subheadlineOpacity: v })} />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="section-title">{t("screenshotEditor.position")}</h3>
        <ToggleGroup type="single" variant="outline" size="sm" value={txt.position}
                     onValueChange={(v) => v && patch({ position: v as TextSettings["position"] })}>
          <ToggleGroupItem value="top">{t("screenshotEditor.top")}</ToggleGroupItem>
          <ToggleGroupItem value="bottom">{t("screenshotEditor.bottom")}</ToggleGroupItem>
        </ToggleGroup>
        <PanelSlider label={t("screenshotEditor.offsetY")} value={txt.offsetY} min={0} max={50}
                     onChange={(v) => patch({ offsetY: v })} />
        <PanelSlider label={t("screenshotEditor.lineHeight")} value={txt.lineHeight} min={80} max={200}
                     onChange={(v) => patch({ lineHeight: v })} />
      </section>
    </div>
  );
}
