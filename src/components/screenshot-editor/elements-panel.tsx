"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, TextT, TrashSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconTooltip, PanelColor, PanelSlider } from "./panel-controls";
import { EmojiPicker } from "./emoji-picker";
import { FontPicker } from "./font-picker";
import { IconPicker } from "./icon-picker";
import { iconSvgDataUri } from "./icon-catalog";
import { uploadAsset } from "./upload-asset";
import {
  createEmojiElement, createGraphicElement, createIconElement, createTextElement,
} from "@/lib/screenshot-editor/elements";
import { FONT_WEIGHTS, SYSTEM_FONTS } from "@/lib/screenshot-editor/font-catalog";
import { getElementText } from "@/lib/screenshot-editor/render/elements";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { EditorElement, IconWeight, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

const ICON_WEIGHTS: { value: IconWeight; key: MessageKey }[] = [
  { value: "thin", key: "screenshotEditor.weightThin" },
  { value: "light", key: "screenshotEditor.weightLight" },
  { value: "regular", key: "screenshotEditor.weightRegular" },
  { value: "bold", key: "screenshotEditor.weightBold" },
  { value: "fill", key: "screenshotEditor.weightFill" },
  { value: "duotone", key: "screenshotEditor.weightDuotone" },
];
const FRAMES: { value: string; key: MessageKey }[] = [
  { value: "none", key: "screenshotEditor.badgeNone" },
  { value: "laurel-simple", key: "screenshotEditor.laurelSimple" },
  { value: "laurel-simple-star", key: "screenshotEditor.laurelSimpleStar" },
  { value: "laurel-detailed", key: "screenshotEditor.laurelDetailed" },
  { value: "laurel-detailed-star", key: "screenshotEditor.laurelDetailedStar" },
  { value: "badge-circle", key: "screenshotEditor.badgeCircle" },
  { value: "badge-ribbon", key: "screenshotEditor.badgeRibbon" },
];
const LAYER_KEY: Record<EditorElement["layer"], MessageKey> = {
  "behind-screenshot": "screenshotEditor.layerBehind",
  "above-screenshot": "screenshotEditor.layerMiddle",
  "above-text": "screenshotEditor.layerFront",
};

export function ElementsPanel({ appId, doc, dispatch, images, selectedElementId, onSelectElement }: {
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
  images: Map<string, RenderImage>;
  selectedElementId: string | null; onSelectElement: (id: string | null) => void;
}) {
  const t = useTranslations();
  const index = doc.selectedIndex;
  const elements = doc.screenshots[index].elements;
  const selected = elements.find((e) => e.id === selectedElementId) ?? null;
  const fileInput = useRef<HTMLInputElement>(null);

  const add = (element: EditorElement) => {
    dispatch({ type: "add-element", index, element });
    onSelectElement(element.id);
  };
  const patch = (p: Partial<EditorElement>) =>
    selected && dispatch({ type: "update-element", index, elementId: selected.id, patch: p });

  const onGraphic = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      add(createGraphicElement(await uploadAsset(appId, file), file.name));
    } catch {
      toast.error(t("screenshotEditor.uploadFailed"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {/* Four equal columns filling the panel, like the tab list above – the pickers render their
            trigger button directly, so they stretch as grid items too. */}
        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" aria-label={t("screenshotEditor.addGraphic")}
                  onClick={() => fileInput.current?.click()}>
            <IconTooltip label={t("screenshotEditor.addGraphic")}><ImageIcon size={16} /></IconTooltip>
          </Button>
          <Button variant="outline" size="sm" aria-label={t("screenshotEditor.addText")}
                  onClick={() => add(createTextElement(doc.currentLanguage))}>
            <IconTooltip label={t("screenshotEditor.addText")}><TextT size={16} /></IconTooltip>
          </Button>
          <EmojiPicker onPick={(emoji, name) => add(createEmojiElement(emoji, name))} />
          <IconPicker onPick={(name) => {
            const src = iconSvgDataUri(name, "#ffffff", "regular");
            if (src) add(createIconElement(name, src, "#ffffff", "regular"));
          }} />
        </div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
               onChange={(e) => onGraphic(e.target.files)} />
      </section>

      <section className="space-y-1">
        {elements.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("screenshotEditor.noElements")}</p>
        ) : null}
        {/* Front-most first, like every layer panel: the array draws back-to-front, so the list is
            reversed and "move forward" walks up the list instead of down it. */}
        {[...elements].reverse().map((el, i) => (
          <div key={el.id}
               className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${el.id === selectedElementId ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectElement(el.id)}>
              <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-base">
                {el.type === "emoji" ? el.emoji
                  : el.src && images.get(el.src)
                    ? <img src={(images.get(el.src) as unknown as HTMLImageElement).src} alt="" className="size-6 object-contain" />
                    : <TextT size={12} />}
              </span>
              <span className="truncate">
                {el.type === "text" ? getElementText(el, doc.currentLanguage) || el.name : el.name}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t(LAYER_KEY[el.layer])}</span>
            </button>
            <div className="hidden shrink-0 gap-0.5 group-hover:flex">
              <Button size="icon" variant="ghost" className="size-6" disabled={i === 0}
                      aria-label={t("screenshotEditor.moveForward")}
                      onClick={() => dispatch({ type: "move-element", index, elementId: el.id, direction: "up" })}>
                <ArrowUp size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={i === elements.length - 1}
                      aria-label={t("screenshotEditor.moveBackward")}
                      onClick={() => dispatch({ type: "move-element", index, elementId: el.id, direction: "down" })}>
                <ArrowDown size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="size-6"
                      aria-label={t("screenshotEditor.delete")}
                      onClick={() => {
                        dispatch({ type: "remove-element", index, elementId: el.id });
                        if (el.id === selectedElementId) onSelectElement(null);
                      }}>
                <TrashSimple size={12} />
              </Button>
            </div>
          </div>
        ))}
      </section>

      {selected ? (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t("screenshotEditor.layer")}</span>
              <Select value={selected.layer}
                      onValueChange={(v) => patch({ layer: v as EditorElement["layer"] })}>
                <SelectTrigger className="w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="behind-screenshot">{t("screenshotEditor.layerBehind")}</SelectItem>
                  <SelectItem value="above-screenshot">{t("screenshotEditor.layerMiddle")}</SelectItem>
                  <SelectItem value="above-text">{t("screenshotEditor.layerFront")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PanelSlider label={t("screenshotEditor.positionX")} value={selected.x} min={0} max={100} onChange={(v) => patch({ x: v })} />
            <PanelSlider label={t("screenshotEditor.positionY")} value={selected.y} min={0} max={100} onChange={(v) => patch({ y: v })} />
            <PanelSlider label={t("screenshotEditor.width")} value={selected.width} min={2} max={100} onChange={(v) => patch({ width: v })} />
            <PanelSlider label={t("screenshotEditor.rotation")} value={selected.rotation} min={-180} max={180} onChange={(v) => patch({ rotation: v })} />
            <PanelSlider label={t("screenshotEditor.opacity")} value={selected.opacity} min={0} max={100} onChange={(v) => patch({ opacity: v })} />
          </section>

          {selected.type === "text" ? (
            <section className="space-y-3">
              <h3 className="section-title">{t("screenshotEditor.text")}</h3>
              <Textarea value={selected.texts?.[doc.currentLanguage] ?? selected.text ?? ""}
                        rows={2}
                        onChange={(e) => dispatch({
                          type: "set-element-text", index, elementId: selected.id,
                          language: doc.currentLanguage, value: e.target.value,
                        })} />
              <PanelSlider label={t("screenshotEditor.size")} value={selected.fontSize ?? 60} min={12} max={300}
                           onChange={(v) => patch({ fontSize: v })} />
              <div className="flex items-center justify-between text-sm">
                <span>{t("screenshotEditor.weight")}</span>
                <Select value={selected.fontWeight ?? "600"} onValueChange={(v) => patch({ fontWeight: v })}>
                  <SelectTrigger className="w-28 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_WEIGHTS.map((w) => <SelectItem key={w.value} value={w.value}>{t(w.key)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>{t("screenshotEditor.fontFamily")}</span>
                <FontPicker value={selected.font ?? SYSTEM_FONTS[0].value}
                            onChange={(v) => patch({ font: v })} />
              </div>
              <PanelColor label={t("screenshotEditor.color")} value={selected.fontColor ?? "#ffffff"}
                          onChange={(v) => patch({ fontColor: v })} />
              <div className="flex items-center justify-between text-sm">
                <span>{t("screenshotEditor.italic")}</span>
                <Switch checked={selected.italic ?? false} onCheckedChange={(v) => patch({ italic: v })} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>{t("screenshotEditor.badge")}</span>
                <Select value={selected.frame ?? "none"} onValueChange={(v) => patch({ frame: v })}>
                  <SelectTrigger className="w-44 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FRAMES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{t(f.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selected.frame && selected.frame !== "none" ? (
                <>
                  <PanelColor label={t("screenshotEditor.color")} value={selected.frameColor ?? "#ffffff"}
                              onChange={(v) => patch({ frameColor: v })} />
                  <PanelSlider label={t("screenshotEditor.badgeScale")} value={selected.frameScale ?? 100}
                               min={50} max={200} onChange={(v) => patch({ frameScale: v })} />
                </>
              ) : null}
            </section>
          ) : null}

          {selected.type === "icon" ? (
            <section className="space-y-3">
              <h3 className="section-title">{t("screenshotEditor.addIcon")}</h3>
              <PanelColor label={t("screenshotEditor.color")} value={selected.iconColor ?? "#ffffff"}
                          onChange={(v) => {
                            const src = iconSvgDataUri(selected.name ?? "", v, selected.iconWeight ?? "regular");
                            patch(src ? { iconColor: v, src } : { iconColor: v });
                          }} />
              <div className="flex items-center justify-between text-sm">
                <span>{t("screenshotEditor.iconStyle")}</span>
                <Select value={selected.iconWeight ?? "regular"}
                        onValueChange={(v) => {
                          const weight = v as IconWeight;
                          const src = iconSvgDataUri(selected.name ?? "", selected.iconColor ?? "#ffffff", weight);
                          patch(src ? { iconWeight: weight, src } : { iconWeight: weight });
                        }}>
                  <SelectTrigger className="w-32 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_WEIGHTS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{t(w.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <h3 className="section-title">{t("screenshotEditor.shadow")}</h3>
                <Switch checked={selected.iconShadow?.enabled ?? false}
                        onCheckedChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { enabled: v } })} />
              </div>
              {selected.iconShadow?.enabled ? (
                <>
                  <PanelColor label={t("screenshotEditor.color")} value={selected.iconShadow.color ?? "#000000"}
                              onChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { color: v } })} />
                  <PanelSlider label={t("screenshotEditor.shadowBlur")} value={selected.iconShadow.blur ?? 20} min={0} max={100}
                               onChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { blur: v } })} />
                  <PanelSlider label={t("screenshotEditor.shadowOpacity")} value={selected.iconShadow.opacity ?? 40} min={0} max={100}
                               onChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { opacity: v } })} />
                  <PanelSlider label={t("screenshotEditor.shadowOffsetX")} value={selected.iconShadow.x ?? 0} min={-50} max={50}
                               onChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { x: v } })} />
                  <PanelSlider label={t("screenshotEditor.shadowOffsetY")} value={selected.iconShadow.y ?? 10} min={-50} max={50}
                               onChange={(v) => dispatch({ type: "set-element-icon-shadow", index, elementId: selected.id, patch: { y: v } })} />
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
