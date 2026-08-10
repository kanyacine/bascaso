"use client";

import { use } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useEditorDoc } from "@/lib/hooks/use-editor-doc";
import { useEditorImages } from "@/lib/hooks/use-editor-images";
import { EditorCanvas } from "@/components/screenshot-editor/editor-canvas";
import { ScreenshotStrip } from "@/components/screenshot-editor/screenshot-strip";
import { BackgroundPanel } from "@/components/screenshot-editor/background-panel";
import { ScreenshotPanel } from "@/components/screenshot-editor/screenshot-panel";
import { TextPanel } from "@/components/screenshot-editor/text-panel";
import { FormatSelect } from "@/components/screenshot-editor/format-select";

export default function ScreenshotEditorPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const t = useTranslations();
  const { doc, dispatch, saveState } = useEditorDoc(appId);
  const images = useEditorImages(appId, doc);

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
          <Tabs defaultValue="background">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="background">{t("screenshotEditor.background")}</TabsTrigger>
              <TabsTrigger value="screenshot">{t("screenshotEditor.screenshot")}</TabsTrigger>
              <TabsTrigger value="text">{t("screenshotEditor.text")}</TabsTrigger>
            </TabsList>
            <TabsContent value="background"><BackgroundPanel doc={doc} dispatch={dispatch} appId={appId} /></TabsContent>
            <TabsContent value="screenshot"><ScreenshotPanel doc={doc} dispatch={dispatch} /></TabsContent>
            <TabsContent value="text"><TextPanel doc={doc} dispatch={dispatch} /></TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}
