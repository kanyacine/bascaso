"use client";

// Port of generateMagicalTitles (magical-titles.js:286-459) on the /api/ai rail: one gesture =
// one actionId = one call; images downscaled to ≤512px JPEG (appscreen posts full-res PNGs).
import { useCallback, useState } from "react";
import { notifyManagedDebit } from "@/lib/ai/debit-toast";
import { toastAIError } from "@/lib/ai/ai-error-toast";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorScreenshot, ScreenshotDoc } from "@/lib/screenshot-editor/types";
import { imageLanguageFor, type TranslationEntry } from "@/lib/screenshot-editor/languages";

const MAX_EDGE = 512;

function imageRefFor(shot: EditorScreenshot, language: string, projectLanguages: string[]): string | null {
  const source = imageLanguageFor(shot, language, projectLanguages);
  return (source ? shot.localizedImages[source].src : shot.src) ?? null;
}

async function toPayloadImage(appId: string, ref: string): Promise<{ mimeType: "image/jpeg"; data: string } | null> {
  const url = ref.startsWith("data:") ? ref : `/api/apps/${appId}/screenshot-doc/assets/${ref}`;
  const image = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  if (!loaded) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

export function useMagicTitles({ appId, appName }: { appId: string; appName?: string }) {
  const t = useTranslations();
  const [running, setRunning] = useState(false);

  const generate = useCallback(
    async (doc: ScreenshotDoc, language: string): Promise<TranslationEntry[] | null> => {
      setRunning(true);
      try {
        const refs = doc.screenshots.map((shot) => imageRefFor(shot, language, doc.projectLanguages));
        // ponytail: shots whose image fails to load are dropped, which shifts the indexes the
        // model sees; send placeholder entries instead if that ever bites in practice.
        const images = (await Promise.all(refs.map((ref) => (ref ? toPayloadImage(appId, ref) : null))))
          .filter((img): img is { mimeType: "image/jpeg"; data: string } => img !== null);
        if (images.length === 0) return null;
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "screenshot-titles",
            actionId: crypto.randomUUID(), // one gesture = one credit
            text: "",
            locale: language,
            appName,
            images,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toastAIError(data.error, t);
          return null;
        }
        void notifyManagedDebit(data.tier, t);
        const entries: TranslationEntry[] = [];
        (data.result.titles as { headline: string; subheadline: string }[]).forEach((title, index) => {
          if (index >= doc.screenshots.length) return;
          if (title.headline) entries.push({ kind: "headline", index, language, value: title.headline });
          if (title.subheadline) entries.push({ kind: "subheadline", index, language, value: title.subheadline });
        });
        return entries;
      } catch {
        toastAIError(undefined, t);
        return null;
      } finally {
        setRunning(false);
      }
    },
    [appId, appName, t],
  );

  return { running, generate };
}
