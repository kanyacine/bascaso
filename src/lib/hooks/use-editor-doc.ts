"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EMPTY_HISTORY, pushHistory, type HistoryState } from "@/lib/screenshot-editor/history";
import { editorReducer, type EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";
import { useTranslations } from "@/lib/i18n/locale-context";

const AUTOSAVE_DEBOUNCE_MS = 800; // appscreen saved on every updateCanvas; we debounce instead

export type EditorSaveState = "idle" | "saving" | "saved" | "error";

// Doc and undo stack move together: the snapshot to push is the doc the action was applied to,
// which only the state updater knows.
interface EditorState {
  doc: ScreenshotDoc | null;
  history: HistoryState;
}

export function useEditorDoc(appId: string) {
  const t = useTranslations();
  const [{ doc, history }, setState] = useState<EditorState>({ doc: null, history: EMPTY_HISTORY });
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
        setState({ doc: loaded, history: EMPTY_HISTORY });
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
    const at = Date.now(); // read here, not in the updater, which must stay pure
    setState((current) => {
      if (!current.doc) return current;
      const next = editorReducer(current.doc, action);
      if (next === current.doc) return current; // a no-op action is not an undo step
      scheduleSave(next);
      return { doc: next, history: pushHistory(current.history, current.doc, action, at) };
    });
  }, [scheduleSave]);

  const undo = useCallback(() => {
    setState((current) => {
      const { stack } = current.history;
      const previous = stack[stack.length - 1];
      if (!previous) return current;
      scheduleSave(previous);
      // key cleared: the next edit starts its own step even on the control just undone.
      return { doc: previous, history: { stack: stack.slice(0, -1), key: null, at: 0 } };
    });
  }, [scheduleSave]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { doc, dispatch, saveState, undo, canUndo: history.stack.length > 0 };
}
