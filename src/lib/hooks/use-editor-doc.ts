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
  // Distinct from saveState: a doc that never loaded has nothing to save, and the page has to
  // stop spinning and say so rather than wait on a fetch that already failed.
  const [loadFailed, setLoadFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  const pending = useRef<ScreenshotDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/apps/${appId}/screenshot-doc`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then(({ doc: loaded }) => {
        if (cancelled) return;
        lastSaved.current = JSON.stringify(loaded);
        setState({ doc: loaded, history: EMPTY_HISTORY });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(t("screenshotEditor.loadFailed"));
      });
    return () => { cancelled = true; };
  }, [appId, t]);

  const scheduleSave = useCallback((next: ScreenshotDoc) => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(async () => {
      timer.current = null;
      pending.current = null;
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

  /**
   * Leaving the editor inside the debounce window (breadcrumb click right after an edit) used
   * to drop the edit while the badge still read "Saved". Send it instead of cancelling it –
   * `keepalive` lets the request outlive the unmount that triggered it.
   */
  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const serialized = JSON.stringify(next);
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    // No state updates and no toast here: the component is on its way out.
    void fetch(`/api/apps/${appId}/screenshot-doc`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: next }),
      keepalive: true,
    }).catch(() => {});
  }, [appId]);

  // Cleanup on unmount – and on an appId change, which is the same loss of the pending doc.
  useEffect(() => flush, [flush]);

  return { doc, dispatch, saveState, loadFailed, undo, canUndo: history.stack.length > 0 };
}
