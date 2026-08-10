"use client";

import { use, useState } from "react";
import { Crop, DeviceMobile, Palette, Shapes, TextT } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useEditorDoc } from "@/lib/hooks/use-editor-doc";
import { useEditorImages } from "@/lib/hooks/use-editor-images";
import { EditorCanvas } from "@/components/screenshot-editor/editor-canvas";
import { ScreenshotStrip } from "@/components/screenshot-editor/screenshot-strip";
import { BackgroundPanel } from "@/components/screenshot-editor/background-panel";
import { ScreenshotPanel } from "@/components/screenshot-editor/screenshot-panel";
import { TextPanel } from "@/components/screenshot-editor/text-panel";
import { ElementsPanel } from "@/components/screenshot-editor/elements-panel";
import { PopoutsPanel } from "@/components/screenshot-editor/popouts-panel";
import { FormatSelect } from "@/components/screenshot-editor/format-select";

export default function ScreenshotEditorPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const t = useTranslations();
  const { doc, dispatch, saveState } = useEditorDoc(appId);
  const images = useEditorImages(appId, doc);
  const [tab, setTab] = useState("background");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedPopoutId, setSelectedPopoutId] = useState<string | null>(null);

  // Selection is per screenshot: reset it during render when the selected shot changes
  // (React's "adjusting state when props change" – an effect here would cascade renders).
  const [selectionOwner, setSelectionOwner] = useState(doc?.selectedIndex);
  if (doc && doc.selectedIndex !== selectionOwner) {
    setSelectionOwner(doc.selectedIndex);
    setSelectedElementId(null);
    setSelectedPopoutId(null);
  }

  const selectElement = (id: string | null) => {
    setSelectedElementId(id);
    if (id) setSelectedPopoutId(null);
  };
  const selectPopout = (id: string | null) => {
    setSelectedPopoutId(id);
    if (id) setSelectedElementId(null);
  };

  if (!doc) {
    return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  }

  const selected = doc.screenshots[doc.selectedIndex];

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <ScreenshotStrip appId={appId} doc={doc} dispatch={dispatch} images={images} />
      <div className="flex min-w-0 flex-1 items-center justify-center rounded-lg border bg-muted/30 p-4">
        {selected ? (
          <EditorCanvas doc={doc} images={images} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("screenshotEditor.emptyState")}</p>
        )}
      </div>
      <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <FormatSelect doc={doc} dispatch={dispatch} />
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" ? t("screenshotEditor.saving") : saveState === "saved" ? t("screenshotEditor.saved") : ""}
          </span>
        </div>
        {selected ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-5">
              {([
                ["background", Palette, t("screenshotEditor.background")],
                ["screenshot", DeviceMobile, t("screenshotEditor.screenshot")],
                ["text", TextT, t("screenshotEditor.text")],
                ["elements", Shapes, t("screenshotEditor.elements")],
                ["popouts", Crop, t("screenshotEditor.popouts")],
              ] as const).map(([value, Icon, label]) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <TabsTrigger value={value} aria-label={label}><Icon size={16} /></TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
            <TabsContent value="background"><BackgroundPanel doc={doc} dispatch={dispatch} appId={appId} /></TabsContent>
            <TabsContent value="screenshot"><ScreenshotPanel doc={doc} dispatch={dispatch} /></TabsContent>
            <TabsContent value="text"><TextPanel doc={doc} dispatch={dispatch} /></TabsContent>
            <TabsContent value="elements">
              <ElementsPanel appId={appId} doc={doc} dispatch={dispatch} images={images}
                             selectedElementId={selectedElementId} onSelectElement={selectElement} />
            </TabsContent>
            <TabsContent value="popouts">
              <PopoutsPanel doc={doc} dispatch={dispatch} images={images}
                            selectedPopoutId={selectedPopoutId} onSelectPopout={selectPopout} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}
