"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, TrashSimple } from "@phosphor-icons/react";
import { PanelColor, PanelSlider } from "./panel-controls";
import { uploadAsset } from "./upload-asset";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { Background, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function BackgroundPanel({ doc, dispatch, appId }: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void; appId: string;
}) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const bg = doc.screenshots[index].background;
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<Background>) => dispatch({ type: "set-background", index, patch: p });

  const onImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      patch({ type: "image", image: await uploadAsset(appId, file) });
    } catch {
      toast.error(t("screenshotEditor.uploadFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="section-title">{t("screenshotEditor.backgroundType")}</h3>
        <Tabs value={bg.type} onValueChange={(v) => patch({ type: v as Background["type"] })}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gradient">{t("screenshotEditor.gradient")}</TabsTrigger>
            <TabsTrigger value="solid">{t("screenshotEditor.solid")}</TabsTrigger>
            <TabsTrigger value="image">{t("screenshotEditor.image")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {bg.type === "gradient" ? (
        <section className="space-y-3">
          <PanelSlider label={t("screenshotEditor.angle")} value={bg.gradient.angle} min={0} max={360}
                       onChange={(v) => patch({ gradient: { ...bg.gradient, angle: v } })} />
          {bg.gradient.stops.map((stop, stopIndex) => (
            <div key={stopIndex} className="flex items-center gap-2">
              <input type="color" value={stop.color} className="size-7 cursor-pointer rounded border bg-transparent"
                     onChange={(e) => dispatch({ type: "set-gradient-stop", index, stopIndex, patch: { color: e.target.value } })} />
              <Slider className="flex-1" value={[stop.position]} min={0} max={100}
                      onValueChange={([v]) => dispatch({ type: "set-gradient-stop", index, stopIndex, patch: { position: v } })} />
              <Button size="icon" variant="ghost" className="size-6" disabled={bg.gradient.stops.length <= 2}
                      aria-label={t("screenshotEditor.delete")}
                      onClick={() => dispatch({ type: "remove-gradient-stop", index, stopIndex })}>
                <TrashSimple size={12} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "add-gradient-stop", index })}>
            <Plus size={14} className="mr-1" />{t("screenshotEditor.addStop")}
          </Button>
        </section>
      ) : null}

      {bg.type === "solid" ? (
        <section className="space-y-3">
          <PanelColor label={t("screenshotEditor.color")} value={bg.solid}
                      onChange={(v) => patch({ solid: v })} />
        </section>
      ) : null}

      {bg.type === "image" ? (
        <section className="space-y-3">
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            {t("screenshotEditor.replaceImage")}
          </Button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
                 onChange={(e) => onImage(e.target.files)} />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.noise")}</h3>
          <Switch checked={bg.noise} onCheckedChange={(v) => patch({ noise: v })} />
        </div>
        {bg.noise ? (
          <PanelSlider label={t("screenshotEditor.noiseIntensity")} value={bg.noiseIntensity} min={0} max={100}
                       onChange={(v) => patch({ noiseIntensity: v })} />
        ) : null}
      </section>
    </div>
  );
}
