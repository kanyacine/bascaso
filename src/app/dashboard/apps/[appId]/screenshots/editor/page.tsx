"use client";

import { use, useState } from "react";
import { Crop, DeviceMobile, Export, Palette, Shapes, TextT } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApps } from "@/lib/apps-context";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useEditorDoc } from "@/lib/hooks/use-editor-doc";
import { useEditorFonts } from "@/lib/hooks/use-editor-fonts";
import { useEditorImages, useLaurelImages } from "@/lib/hooks/use-editor-images";
import { EditorCanvas } from "@/components/screenshot-editor/editor-canvas";
import { ScreenshotStrip } from "@/components/screenshot-editor/screenshot-strip";
import { BackgroundPanel } from "@/components/screenshot-editor/background-panel";
import { ScreenshotPanel } from "@/components/screenshot-editor/screenshot-panel";
import { TextPanel } from "@/components/screenshot-editor/text-panel";
import { ElementsPanel } from "@/components/screenshot-editor/elements-panel";
import { PopoutsPanel } from "@/components/screenshot-editor/popouts-panel";
import { FormatSelect } from "@/components/screenshot-editor/format-select";
import { LanguageSwitcher } from "@/components/screenshot-editor/language-switcher";
import { LanguagesDialog } from "@/components/screenshot-editor/languages-dialog";
import { ExportDialog } from "@/components/screenshot-editor/export-dialog";

export default function ScreenshotEditorPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const t = useTranslations();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { doc, dispatch, saveState } = useEditorDoc(appId);
  const images = useEditorImages(appId, doc);
  const laurelImages = useLaurelImages();
  const fontsVersion = useEditorFonts(doc);
  const [tab, setTab] = useState("background");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedPopoutId, setSelectedPopoutId] = useState<string | null>(null);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
          <EditorCanvas doc={doc} images={images} laurelImages={laurelImages} fontsVersion={fontsVersion}
                        dispatch={dispatch}
                        onSelectElement={(id) => { selectElement(id); setTab("elements"); }}
                        onSelectPopout={(id) => { selectPopout(id); setTab("popouts"); }} />
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
        <div className="flex items-center justify-between">
          <LanguageSwitcher doc={doc} dispatch={dispatch} onManage={() => setLanguagesOpen(true)} />
          <Button size="sm" onClick={() => setExportOpen(true)} disabled={doc.screenshots.length === 0}>
            <Export size={16} className="mr-1.5" />{t("screenshotEditor.export")}
          </Button>
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
      <LanguagesDialog open={languagesOpen} onOpenChange={setLanguagesOpen}
                       doc={doc} dispatch={dispatch} appId={appId} appName={app?.name} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} doc={doc} dispatch={dispatch}
                    appId={appId} appName={app?.name} primaryLocale={app?.primaryLocale ?? ""}
                    images={images} laurelImages={laurelImages} />
    </div>
  );
}
