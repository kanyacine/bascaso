"use client";

import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PanelColor, PanelSlider } from "./panel-controls";
import { FRAME_COLOR_PRESETS, frameColorPreset } from "@/lib/screenshot-editor/three-scene";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc, ScreenshotSettings, Shadow } from "@/lib/screenshot-editor/types";

export function ScreenshotPanel({ doc, dispatch }: {
  doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
}) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const s = doc.screenshots[index].screenshot;
  const patch = (p: Partial<ScreenshotSettings>) => dispatch({ type: "set-screenshot-setting", index, patch: p });
  const shadow = (p: Partial<Shadow>) => dispatch({ type: "set-shadow", index, patch: p });
  const frame = (p: Partial<ScreenshotSettings["frame"]>) => dispatch({ type: "set-frame", index, patch: p });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="section-title">{t("screenshotEditor.deviceType")}</h3>
        <ToggleGroup type="single" variant="outline" size="sm" value={s.use3D ? "3d" : "2d"} className="w-full"
                     onValueChange={(v) => v && patch({ use3D: v === "3d" })}>
          <ToggleGroupItem value="2d" className="flex-1">2D</ToggleGroupItem>
          <ToggleGroupItem value="3d" className="flex-1">3D</ToggleGroupItem>
        </ToggleGroup>
        <PanelSlider label={t("screenshotEditor.scale")} value={s.scale} min={10} max={100} onChange={(v) => patch({ scale: v })} />
        <PanelSlider label={t("screenshotEditor.positionX")} value={s.x} min={0} max={100} onChange={(v) => patch({ x: v })} />
        <PanelSlider label={t("screenshotEditor.positionY")} value={s.y} min={0} max={100} onChange={(v) => patch({ y: v })} />
        {!s.use3D ? (
          <>
            <PanelSlider label={t("screenshotEditor.rotation")} value={s.rotation} min={-45} max={45} onChange={(v) => patch({ rotation: v })} />
            <PanelSlider label={t("screenshotEditor.perspective")} value={s.perspective} min={-50} max={50} onChange={(v) => patch({ perspective: v })} />
            <PanelSlider label={t("screenshotEditor.cornerRadius")} value={s.cornerRadius} min={0} max={100} onChange={(v) => patch({ cornerRadius: v })} />
          </>
        ) : null}
      </section>

      {s.use3D ? (
        <section className="space-y-3">
          <h3 className="section-title">{t("screenshotEditor.deviceModel")}</h3>
          <ToggleGroup type="single" variant="outline" size="sm" value={s.device3D} className="w-full"
                       onValueChange={(v) => v && patch({ device3D: v, frameColor: FRAME_COLOR_PRESETS[v][0].id })}>
            <ToggleGroupItem value="iphone" className="flex-1">iPhone</ToggleGroupItem>
            <ToggleGroupItem value="samsung" className="flex-1">Samsung</ToggleGroupItem>
          </ToggleGroup>
          <PanelSlider label={t("screenshotEditor.rotationX")} value={s.rotation3D.x} min={-45} max={45}
                       onChange={(v) => patch({ rotation3D: { ...s.rotation3D, x: v } })} />
          <PanelSlider label={t("screenshotEditor.rotationY")} value={s.rotation3D.y} min={-45} max={45}
                       onChange={(v) => patch({ rotation3D: { ...s.rotation3D, y: v } })} />
          <PanelSlider label={t("screenshotEditor.rotationZ")} value={s.rotation3D.z} min={-45} max={45}
                       onChange={(v) => patch({ rotation3D: { ...s.rotation3D, z: v } })} />
          <div className="space-y-1.5">
            <span className="text-sm">{t("screenshotEditor.frameColor")}</span>
            <div className="flex flex-wrap gap-1.5">
              {FRAME_COLOR_PRESETS[s.device3D]?.map((p) => (
                <button key={p.id} type="button" aria-label={p.label} title={p.label}
                        onClick={() => patch({ frameColor: p.id })}
                        className={`size-6 rounded-full border ${frameColorPreset(s.device3D, s.frameColor).id === p.id ? "ring-2 ring-ring ring-offset-1" : ""}`}
                        style={{ backgroundColor: p.swatch }} />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("screenshotEditor.threeDTip")}</p>
        </section>
      ) : null}

      {/* Shadow and device frame are 2D-only in appscreen (#2d-only-settings). */}
      {!s.use3D ? (
      <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.shadow")}</h3>
          <Switch checked={s.shadow.enabled} onCheckedChange={(v) => shadow({ enabled: v })} />
        </div>
        {s.shadow.enabled ? (
          <>
            <PanelColor label={t("screenshotEditor.color")} value={s.shadow.color} onChange={(v) => shadow({ color: v })} />
            <PanelSlider label={t("screenshotEditor.shadowBlur")} value={s.shadow.blur} min={0} max={120} onChange={(v) => shadow({ blur: v })} />
            <PanelSlider label={t("screenshotEditor.shadowOpacity")} value={s.shadow.opacity} min={0} max={100} onChange={(v) => shadow({ opacity: v })} />
            <PanelSlider label={t("screenshotEditor.shadowOffsetX")} value={s.shadow.x} min={-100} max={100} onChange={(v) => shadow({ x: v })} />
            <PanelSlider label={t("screenshotEditor.shadowOffsetY")} value={s.shadow.y} min={-100} max={100} onChange={(v) => shadow({ y: v })} />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">{t("screenshotEditor.frame")}</h3>
          <Switch checked={s.frame.enabled} onCheckedChange={(v) => frame({ enabled: v })} />
        </div>
        {s.frame.enabled ? (
          <>
            <PanelColor label={t("screenshotEditor.color")} value={s.frame.color} onChange={(v) => frame({ color: v })} />
            <PanelSlider label={t("screenshotEditor.frameWidth")} value={s.frame.width} min={1} max={60} onChange={(v) => frame({ width: v })} />
            <PanelSlider label={t("screenshotEditor.frameOpacity")} value={s.frame.opacity} min={0} max={100} onChange={(v) => frame({ opacity: v })} />
          </>
        ) : null}
      </section>
      </>
      ) : null}
    </div>
  );
}
