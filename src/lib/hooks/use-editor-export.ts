"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { assetsForShot, collectRefs } from "@/lib/hooks/use-editor-images";
import { applyTranslationEntries, docWithLanguage, type TranslationEntry } from "@/lib/screenshot-editor/languages";
import { exportFileName, type ExportJob } from "@/lib/screenshot-editor/export";
import { renderScreenshotToCanvas } from "@/lib/screenshot-editor/render/compose";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { LaurelVariant, RenderImage, ScreenshotDoc } from "@/lib/screenshot-editor/types";

export interface RunExportOptions {
  plan: ExportJob[];
  destination: "zip" | "asc";
  zipName: string;
  translations: Map<string, TranslationEntry[]>;
  asc?: { versionId: string; localizations: AscLocalization[] };
}

interface RenderedFile {
  path: string;
  blob: Blob;
}

/** The doc a job renders from – never the live doc: on-the-fly translations and the format
 *  switch are applied to a derived copy (appscreen mutated state and restored on success only). */
function jobDoc(doc: ScreenshotDoc, job: ExportJob, translations: Map<string, TranslationEntry[]>): ScreenshotDoc {
  const translated = applyTranslationEntries(doc, translations.get(job.language) ?? []);
  return docWithLanguage({ ...translated, outputDevice: job.format }, job.language);
}

async function uploadToAsc(): Promise<void> {
  throw new Error("asc destination lands in task 10");
}

export function useEditorExport({ appId, doc, images, laurelImages }: {
  appId: string; doc: ScreenshotDoc;
  images: Map<string, RenderImage>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
}) {
  const t = useTranslations();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const cancelled = useRef(false);

  const cancel = useCallback(() => { cancelled.current = true; }, []);

  const renderJob = useCallback(async (job: ExportJob, translations: Map<string, TranslationEntry[]>) => {
    const source = jobDoc(doc, job, translations);
    const files: RenderedFile[] = [];
    for (let i = 0; i < source.screenshots.length; i++) {
      const canvas = document.createElement("canvas");
      renderScreenshotToCanvas(canvas, source, i, assetsForShot(source, i, images, laurelImages), {
        language: job.language,
        projectLanguages: source.projectLanguages,
        createCanvas: (w, h) => {
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          return c;
        },
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("toBlob failed");
      files.push({ path: exportFileName(job.language, job.format, i), blob });
    }
    return files;
  }, [doc, images, laurelImages]);

  const runExport = useCallback(async (opts: RunExportOptions): Promise<boolean> => {
    if (doc.screenshots.length === 0) { toast.error(t("screenshotEditor.exportNothing")); return false; }
    if (collectRefs(doc).some((ref) => !images.has(ref))) {
      toast.error(t("screenshotEditor.exportImagesLoading"));
      return false;
    }
    cancelled.current = false;
    setRunning(true);
    try {
      // automatic snapshot per export (spec §6)
      await fetch(`/api/apps/${appId}/screenshot-doc/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Export ${new Date().toISOString().slice(0, 16).replace("T", " ")}` }),
      });
      const total = opts.plan.length;
      const rendered: { job: ExportJob; files: RenderedFile[] }[] = [];
      for (let i = 0; i < opts.plan.length; i++) {
        if (cancelled.current) return false;
        const job = opts.plan[i];
        setProgress({
          done: i, total,
          label: t("screenshotEditor.exportRendering", { language: job.language, format: job.format }),
        });
        rendered.push({ job, files: await renderJob(job, opts.translations) });
      }
      if (opts.destination === "zip") {
        setProgress({ done: total, total, label: t("screenshotEditor.exportZipping") });
        const files = rendered.flatMap((r) => r.files);
        const form = new FormData();
        form.set("name", opts.zipName);
        form.set("paths", JSON.stringify(files.map((f) => f.path)));
        for (const f of files) form.append("files", new File([f.blob], "f.png", { type: "image/png" }));
        const res = await fetch(`/api/apps/${appId}/screenshot-doc/export-zip`, { method: "POST", body: form });
        if (!res.ok) throw new Error("zip failed");
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = opts.zipName;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await uploadToAsc(); // Task 10 – unreachable while the ASC option is disabled
      }
      toast.success(t("screenshotEditor.exportDone"));
      return true;
    } catch {
      toast.error(t("screenshotEditor.exportFailed"));
      return false;
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [appId, doc, images, renderJob, t]);

  return { running, progress, cancel, runExport };
}
