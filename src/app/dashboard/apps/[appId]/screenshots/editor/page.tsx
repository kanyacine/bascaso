"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUUpLeft, Crop, DeviceMobile, Export, Palette, Shapes, TextT,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApps } from "@/lib/apps-context";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useEditorDoc } from "@/lib/hooks/use-editor-doc";
import { useEditorFonts } from "@/lib/hooks/use-editor-fonts";
import { useEditorImages, useLaurelImages } from "@/lib/hooks/use-editor-images";
import { useEditorMockups } from "@/lib/hooks/use-editor-mockups";
import { EditorCanvas } from "@/components/screenshot-editor/editor-canvas";
import { IconTooltip } from "@/components/screenshot-editor/panel-controls";
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
import { VersionsDialog } from "@/components/screenshot-editor/versions-dialog";

export default function ScreenshotEditorPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const t = useTranslations();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { doc, dispatch, saveState, undo, canUndo } = useEditorDoc(appId);
  const images = useEditorImages(appId, doc);
  const laurelImages = useLaurelImages();
  const fontsVersion = useEditorFonts(doc);
  const mockup = useEditorMockups(doc, images);
  const [tab, setTab] = useState("background");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedPopoutId, setSelectedPopoutId] = useState<string | null>(null);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

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
      <div className="flex min-h-0 shrink-0 flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="justify-start">
          <Link href={`/dashboard/apps/${appId}/screenshots`}>
            <ArrowLeft size={14} className="mr-1.5" />{t("common.back")}
          </Link>
        </Button>
        <ScreenshotStrip appId={appId} doc={doc} dispatch={dispatch} images={images}
                         laurelImages={laurelImages} fontsVersion={fontsVersion} mockup={mockup}
                         onVersions={() => setVersionsOpen(true)} />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-4">
        {selected ? (
          <EditorCanvas doc={doc} images={images} laurelImages={laurelImages} fontsVersion={fontsVersion}
                        mockup={mockup} dispatch={dispatch}
                        onSelectElement={(id) => { selectElement(id); setTab("elements"); }}
                        onSelectPopout={(id) => { selectPopout(id); setTab("popouts"); }} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("screenshotEditor.emptyState")}</p>
        )}
      </div>
      {/* Header and tab bar stay put, like the back/versions buttons on the left – only the panel
          under the tabs scrolls. */}
      <div className="flex min-h-0 w-80 shrink-0 flex-col gap-4">
        {/* One grid for both rows: the selects share a column (same width), the icon buttons share
            the next one, and the save label sits in the export button's column. The panels render
            with `display: contents` so their controls land in these columns directly. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
          <FormatSelect doc={doc} dispatch={dispatch} />
          <div className="flex items-center justify-end gap-1">
            {/* Both labels are laid out in the same cell, one of them hidden: the box is as wide as
                the longest of the two in the active language and never resizes, so the state
                flipping between them cannot nudge the selects next to it. */}
            <span className="grid justify-items-end text-xs text-muted-foreground">
              <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
                {t("screenshotEditor.saving")}
              </span>
              <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
                {t("screenshotEditor.saved")}
              </span>
              {/* role=status: it is the live one of the three, for a screen reader and for a test. */}
              <span role="status" className="col-start-1 row-start-1 whitespace-nowrap">
                {saveState === "saving" ? t("screenshotEditor.saving") : saveState === "saved" ? t("screenshotEditor.saved") : ""}
              </span>
            </span>
            <Button size="icon" variant="ghost" className="size-8" disabled={!canUndo} onClick={undo}
                    aria-label={t("screenshotEditor.undo")}>
              <IconTooltip label={t("screenshotEditor.undo")}><ArrowUUpLeft size={16} /></IconTooltip>
            </Button>
          </div>
          <LanguageSwitcher doc={doc} dispatch={dispatch} onManage={() => setLanguagesOpen(true)} />
          <Button size="sm" onClick={() => setExportOpen(true)}
                  disabled={doc.screenshots.length === 0}>
            <Export size={16} className="mr-1.5" />{t("screenshotEditor.export")}
          </Button>
        </div>
        {selected ? (
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid w-full shrink-0 grid-cols-5">
              {([
                ["background", Palette, t("screenshotEditor.background")],
                ["screenshot", DeviceMobile, t("screenshotEditor.screenshot")],
                ["text", TextT, t("screenshotEditor.text")],
                ["elements", Shapes, t("screenshotEditor.elements")],
                ["popouts", Crop, t("screenshotEditor.popouts")],
              ] as const).map(([value, Icon, label]) => (
                <TabsTrigger key={value} value={value} aria-label={label}
                             className="data-[state=active]:text-primary">
                  <IconTooltip label={label}><Icon size={16} /></IconTooltip>
                </TabsTrigger>
              ))}
            </TabsList>
            {/* px-0.5: the panels' focus rings and swatch outlines would otherwise touch the
                scroll edge. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
            <TabsContent value="background"><BackgroundPanel doc={doc} dispatch={dispatch} appId={appId} /></TabsContent>
            <TabsContent value="screenshot">
              <ScreenshotPanel appId={appId} doc={doc} dispatch={dispatch} />
            </TabsContent>
            <TabsContent value="text">
              <TextPanel doc={doc} dispatch={dispatch} />
            </TabsContent>
            <TabsContent value="elements">
              <ElementsPanel appId={appId} doc={doc} dispatch={dispatch} images={images}
                             selectedElementId={selectedElementId} onSelectElement={selectElement} />
            </TabsContent>
            <TabsContent value="popouts">
              <PopoutsPanel doc={doc} dispatch={dispatch} images={images}
                            selectedPopoutId={selectedPopoutId} onSelectPopout={selectPopout} />
            </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </div>
      <LanguagesDialog open={languagesOpen} onOpenChange={setLanguagesOpen}
                       doc={doc} dispatch={dispatch} appId={appId} appName={app?.name}
                       primaryLocale={app?.primaryLocale ?? ""} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} doc={doc} dispatch={dispatch}
                    appId={appId} appName={app?.name} primaryLocale={app?.primaryLocale ?? ""}
                    images={images} laurelImages={laurelImages} />
      <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} appId={appId} doc={doc} dispatch={dispatch} />
    </div>
  );
}
