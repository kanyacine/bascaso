"use client";

import { ArrowDown, ArrowUp, Plus, TrashSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CropPreview } from "./crop-preview";
import { PanelColor, PanelSlider } from "./panel-controls";
import { createPopout } from "@/lib/screenshot-editor/elements";
import { assetsForShot } from "@/lib/hooks/use-editor-images";
import { resolveScreenshotImage } from "@/lib/screenshot-editor/render/compose";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { Popout, RenderImage, ScreenshotDoc, Shadow } from "@/lib/screenshot-editor/types";

export function PopoutsPanel({ doc, dispatch, images, selectedPopoutId, onSelectPopout }: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  images: Map<string, RenderImage>;
  selectedPopoutId: string | null; onSelectPopout: (id: string | null) => void;
}) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const popouts = doc.screenshots[index].popouts;
  const selected = popouts.find((p) => p.id === selectedPopoutId) ?? null;
  // laurels are irrelevant here – the assets are built only to resolve the source image
  const image = resolveScreenshotImage(
    assetsForShot(doc, index, images, {}), doc.currentLanguage, doc.projectLanguages,
  );

  const patch = (p: Partial<Omit<Popout, "id" | "shadow" | "border">>) =>
    selected && dispatch({ type: "update-popout", index, popoutId: selected.id, patch: p });
  const shadow = (p: Partial<Shadow>) =>
    selected && dispatch({ type: "set-popout-shadow", index, popoutId: selected.id, patch: p });
  const border = (p: Partial<Popout["border"]>) =>
    selected && dispatch({ type: "set-popout-border", index, popoutId: selected.id, patch: p });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Button variant="outline" size="sm" disabled={!image}
                onClick={() => {
                  const popout = createPopout();
                  dispatch({ type: "add-popout", index, popout });
                  onSelectPopout(popout.id);
                }}>
          <Plus size={14} className="mr-1" />{t("screenshotEditor.addPopout")}
        </Button>
        {!image ? (
          <p className="text-sm text-muted-foreground">{t("screenshotEditor.popoutNeedsImage")}</p>
        ) : null}
      </section>

      <section className="space-y-1">
        {popouts.length === 0 && image ? (
          <p className="py-2 text-sm text-muted-foreground">{t("screenshotEditor.noPopouts")}</p>
        ) : null}
        {popouts.map((p, i) => (
          <div key={p.id}
               className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${p.id === selectedPopoutId ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center justify-between text-left"
                    onClick={() => onSelectPopout(p.id)}>
              <span>{t("screenshotEditor.popoutName", { index: i + 1 })}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(p.cropWidth)}% × {Math.round(p.cropHeight)}%
              </span>
            </button>
            <div className="hidden shrink-0 gap-0.5 group-hover:flex">
              <Button size="icon" variant="ghost" className="size-6" disabled={i === popouts.length - 1}
                      aria-label={t("screenshotEditor.moveForward")}
                      onClick={() => dispatch({ type: "move-popout", index, popoutId: p.id, direction: "up" })}>
                <ArrowUp size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={i === 0}
                      aria-label={t("screenshotEditor.moveBackward")}
                      onClick={() => dispatch({ type: "move-popout", index, popoutId: p.id, direction: "down" })}>
                <ArrowDown size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="size-6"
                      aria-label={t("screenshotEditor.delete")}
                      onClick={() => {
                        dispatch({ type: "remove-popout", index, popoutId: p.id });
                        if (p.id === selectedPopoutId) onSelectPopout(null);
                      }}>
                <TrashSimple size={12} />
              </Button>
            </div>
          </div>
        ))}
      </section>

      {selected && image ? (
        <>
          <section className="space-y-3">
            <h3 className="section-title">{t("screenshotEditor.crop")}</h3>
            <CropPreview image={image} popout={selected} onCropChange={(crop) => patch(crop)} />
          </section>

          <section className="space-y-3">
            <PanelSlider label={t("screenshotEditor.positionX")} value={selected.x} min={0} max={100} onChange={(v) => patch({ x: v })} />
            <PanelSlider label={t("screenshotEditor.positionY")} value={selected.y} min={0} max={100} onChange={(v) => patch({ y: v })} />
            <PanelSlider label={t("screenshotEditor.width")} value={selected.width} min={5} max={130} onChange={(v) => patch({ width: v })} />
            <PanelSlider label={t("screenshotEditor.rotation")} value={selected.rotation} min={-180} max={180} onChange={(v) => patch({ rotation: v })} />
            <PanelSlider label={t("screenshotEditor.opacity")} value={selected.opacity} min={0} max={100} onChange={(v) => patch({ opacity: v })} />
            <PanelSlider label={t("screenshotEditor.cornerRadius")} value={selected.cornerRadius} min={0} max={50} onChange={(v) => patch({ cornerRadius: v })} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="section-title">{t("screenshotEditor.shadow")}</h3>
              <Switch checked={selected.shadow.enabled} onCheckedChange={(v) => shadow({ enabled: v })} />
            </div>
            {selected.shadow.enabled ? (
              <>
                <PanelColor label={t("screenshotEditor.color")} value={selected.shadow.color} onChange={(v) => shadow({ color: v })} />
                <PanelSlider label={t("screenshotEditor.shadowBlur")} value={selected.shadow.blur} min={0} max={100} onChange={(v) => shadow({ blur: v })} />
                <PanelSlider label={t("screenshotEditor.shadowOpacity")} value={selected.shadow.opacity} min={0} max={100} onChange={(v) => shadow({ opacity: v })} />
                <PanelSlider label={t("screenshotEditor.shadowOffsetX")} value={selected.shadow.x} min={-50} max={50} onChange={(v) => shadow({ x: v })} />
                <PanelSlider label={t("screenshotEditor.shadowOffsetY")} value={selected.shadow.y} min={-50} max={50} onChange={(v) => shadow({ y: v })} />
              </>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="section-title">{t("screenshotEditor.border")}</h3>
              <Switch checked={selected.border.enabled} onCheckedChange={(v) => border({ enabled: v })} />
            </div>
            {selected.border.enabled ? (
              <>
                <PanelColor label={t("screenshotEditor.color")} value={selected.border.color} onChange={(v) => border({ color: v })} />
                <PanelSlider label={t("screenshotEditor.frameWidth")} value={selected.border.width} min={0} max={20} onChange={(v) => border({ width: v })} />
                <PanelSlider label={t("screenshotEditor.frameOpacity")} value={selected.border.opacity} min={0} max={100} onChange={(v) => border({ opacity: v })} />
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
