"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { editorReducer, type EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";
import { useTranslations } from "@/lib/i18n/locale-context";

const AUTOSAVE_DEBOUNCE_MS = 800; // appscreen saved on every updateCanvas; we debounce instead

export type EditorSaveState = "idle" | "saving" | "saved" | "error";

export function useEditorDoc(appId: string) {
  const t = useTranslations();
  const [doc, setDoc] = useState<ScreenshotDoc | null>(null);
  const [saveState, setSaveState] = useState<EditorSaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/apps/${appId}/screenshot-doc`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then(({ doc: loaded }) => {
        if (cancelled) return;
        lastSaved.current = JSON.stringify(loaded);
        setDoc(loaded);
      })
      .catch(() => { if (!cancelled) toast.error(t("screenshotEditor.saveFailed")); });
    return () => { cancelled = true; };
  }, [appId, t]);

  const scheduleSave = useCallback((next: ScreenshotDoc) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const serialized = JSON.stringify(next);
      if (serialized === lastSaved.current) return;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/apps/${appId}/screenshot-doc`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc: next }),
        });
        if (!res.ok) throw new Error("save failed");
        lastSaved.current = serialized;
        setSaveState("saved");
      } catch {
        setSaveState("error");
        toast.error(t("screenshotEditor.saveFailed"));
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [appId, t]);

  const dispatch = useCallback((action: EditorAction) => {
    setDoc((current) => {
      if (!current) return current;
      const next = editorReducer(current, action);
      if (next !== current) scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { doc, dispatch, saveState };
}
