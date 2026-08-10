"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { assetsForShot, collectRefs } from "@/lib/hooks/use-editor-images";
import { applyTranslationEntries, docWithLanguage, type TranslationEntry } from "@/lib/screenshot-editor/languages";
import {
  ASC_MAX_SCREENSHOTS_PER_SET, exportFileName, type ExportJob,
} from "@/lib/screenshot-editor/export";
import { renderScreenshotToCanvas, resolveScreenshotImage } from "@/lib/screenshot-editor/render/compose";
import { getCanvasDimensions } from "@/lib/screenshot-editor/devices";
import { collectFontFamilies } from "@/lib/screenshot-editor/fonts";
import { getMockupRenderer } from "@/lib/screenshot-editor/three-renderer";
import { loadEditorFont } from "./use-editor-fonts";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { AscScreenshotSet } from "@/lib/asc/display-types";
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

/** Push the rendered PNGs into the ASC screenshot sets: find or create the set for the job's
 *  display type, purge it (the screenshots section mirrors ASC – no local merge), then upload
 *  in strip order, capped at Apple's per-set limit. */
async function uploadToAsc(
  appId: string,
  jobs: { job: ExportJob; files: RenderedFile[] }[],
  asc: { versionId: string; localizations: AscLocalization[] },
  onProgress: (job: ExportJob) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const setCache = new Map<string, string>(); // `${localizationId}:${displayType}` → setId
  const setsFetched = new Map<string, AscScreenshotSet[]>();
  for (const { job, files } of jobs) {
    if (isCancelled()) return;
    if (job.format === "custom") continue; // not an ASC display type – warned in the dialog
    const localization = asc.localizations.find((l) => l.attributes.locale === job.language);
    if (!localization) continue; // missing locales were surfaced in the dialog
    const base = `/api/apps/${appId}/versions/${asc.versionId}/localizations/${localization.id}/screenshots`;
    onProgress(job);
    const cacheKey = `${localization.id}:${job.format}`;
    let setId = setCache.get(cacheKey);
    let existing: { id: string }[] = [];
    if (!setId) {
      let sets = setsFetched.get(localization.id);
      if (!sets) {
        const res = await fetch(`${base}?refresh=1`);
        if (!res.ok) throw new Error("list sets failed");
        sets = (await res.json()).screenshotSets as AscScreenshotSet[];
        setsFetched.set(localization.id, sets);
      }
      const found = sets.find((s) => s.attributes.screenshotDisplayType === job.format);
      if (found) {
        setId = found.id;
        existing = found.screenshots ?? [];
      } else {
        const created = await fetch(`${base}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayType: job.format }),
        });
        if (!created.ok) throw new Error("create set failed");
        setId = (await created.json()).setId as string;
      }
      setCache.set(cacheKey, setId);
    }
    for (const shot of existing) {
      const res = await fetch(`${base}/${shot.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("purge failed");
    }
    const capped = files.slice(0, ASC_MAX_SCREENSHOTS_PER_SET);
    for (let i = 0; i < capped.length; i++) {
      if (isCancelled()) return;
      const form = new FormData();
      form.set("setId", setId);
      form.set("file", new File([capped[i].blob], `${i + 1}.png`, { type: "image/png" }));
      const res = await fetch(base, { method: "POST", body: form });
      if (!res.ok) throw new Error("upload failed");
    }
  }
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
    const dims = getCanvasDimensions(source);
    const devices3D = [...new Set(
      source.screenshots.filter((s) => s.screenshot.use3D).map((s) => s.screenshot.device3D),
    )];
    const mockups = devices3D.length > 0 ? await getMockupRenderer() : null;
    if (mockups) await Promise.all(devices3D.map((d) => mockups.loadModel(d)));
    const files: RenderedFile[] = [];
    for (let i = 0; i < source.screenshots.length; i++) {
      const shot = source.screenshots[i];
      const assets = assetsForShot(source, i, images, laurelImages);
      let mockup: RenderImage | null = null;
      if (shot.screenshot.use3D && mockups) {
        const shotImage = resolveScreenshotImage(assets, job.language, source.projectLanguages);
        if (shotImage) {
          mockup = mockups.render(shot.screenshot, shotImage, dims) as unknown as RenderImage;
        }
      }
      const canvas = document.createElement("canvas");
      renderScreenshotToCanvas(canvas, source, i, { ...assets, mockup }, {
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
    // Never rasterize a fallback face – await every family the doc uses (appscreen gap).
    await Promise.all(collectFontFamilies(doc).map((f) => loadEditorFont(f).catch(() => {})));
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
      } else if (opts.asc) {
        await uploadToAsc(
          appId, rendered, opts.asc,
          (job) => setProgress({
            done: total, total,
            label: t("screenshotEditor.exportUploading", { language: job.language, format: job.format }),
          }),
          () => cancelled.current,
        );
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
