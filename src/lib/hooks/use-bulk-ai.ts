import { useState, useEffect, useRef } from "react";

export interface BulkField {
  key: string;
  label: string;
  charLimit?: number;
}

export type FieldStatus = "pending" | "loading" | "done" | "error";

export interface FieldResult {
  status: FieldStatus;
  value: string;
}

/** Composite key for results: `locale:fieldKey` */
export function resultKey(locale: string, fieldKey: string): string {
  return `${locale}:${fieldKey}`;
}

interface UseBulkAIOptions {
  open: boolean;
  mode: "translate" | "copy";
  primaryLocale: string;
  targetLocales: string[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, Record<string, any>>;
  fields: BulkField[];
  appName?: string;
  /** Called at the start of each run (inside requestAnimationFrame). */
  onInit?: () => void;
}

interface UseBulkAIReturn {
  results: Record<string, FieldResult>;
  authError: boolean;
  getResult: (locale: string, fieldKey: string) => FieldResult | undefined;
}

/**
 * Shared hook for bulk AI translate/copy operations.
 *
 * Manages results state, abort controller, and fires translate/copy
 * requests when the dialog opens. Works for both single-locale and
 * multi-locale dialogs.
 */
export function useBulkAI({
  open,
  mode,
  primaryLocale,
  targetLocales,
  localeData,
  fields,
  appName,
  onInit,
}: UseBulkAIOptions): UseBulkAIReturn {
  const [results, setResults] = useState<Record<string, FieldResult>>({});
  const [authError, setAuthError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function runCopy() {
    onInit?.();
    setAuthError(false);
    const baseFields = localeData[primaryLocale] ?? {};
    const newResults: Record<string, FieldResult> = {};
    for (const loc of targetLocales) {
      for (const f of fields) {
        newResults[resultKey(loc, f.key)] = {
          status: "done",
          value: String(baseFields[f.key] ?? ""),
        };
      }
    }
    setResults(newResults);
  }

  function runTranslate() {
    onInit?.();
    setAuthError(false);
    const controller = new AbortController();
    abortRef.current = controller;
    const baseFields = localeData[primaryLocale] ?? {};

    // Set all to loading
    const loading: Record<string, FieldResult> = {};
    for (const loc of targetLocales) {
      for (const f of fields) {
        loading[resultKey(loc, f.key)] = { status: "loading", value: "" };
      }
    }
    setResults(loading);

    // Fire requests for each locale x field
    for (const loc of targetLocales) {
      for (const field of fields) {
        const baseValue = String(baseFields[field.key] ?? "");
        const key = resultKey(loc, field.key);

        if (!baseValue.trim()) {
          setResults((prev) => ({
            ...prev,
            [key]: { status: "done", value: "" },
          }));
          continue;
        }

        fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "translate",
            text: baseValue,
            field: field.key,
            fromLocale: primaryLocale,
            toLocale: loc,
            appName,
            charLimit: field.charLimit,
          }),
          signal: controller.signal,
        })
          .then(async (res) => {
            const data = await res.json();
            if (data.error === "ai_auth_error") {
              controller.abort();
              setAuthError(true);
              setResults((prev) => {
                const next = { ...prev };
                for (const k of Object.keys(next)) {
                  if (next[k].status === "loading") {
                    next[k] = { status: "error", value: "" };
                  }
                }
                return next;
              });
              return;
            }
            setResults((prev) => ({
              ...prev,
              [key]: res.ok
                ? { status: "done", value: data.result }
                : { status: "error", value: "" },
            }));
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setResults((prev) => ({
              ...prev,
              [key]: { status: "error", value: "" },
            }));
          });
      }
    }
  }

  // Run on open
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    // Defer to avoid synchronous setState in effect body
    const frame = requestAnimationFrame(() => {
      if (mode === "copy") {
        runCopy();
      } else {
        runTranslate();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [open]);

  function getResult(locale: string, fieldKey: string): FieldResult | undefined {
    return results[resultKey(locale, fieldKey)];
  }

  return { results, authError, getResult };
}
