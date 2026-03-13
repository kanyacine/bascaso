"use client";

import { useState, useCallback } from "react";
import { Check, Warning, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";
import { useBulkAI } from "@/lib/hooks/use-bulk-ai";

// Re-export for backwards compatibility
export type { BulkField } from "@/lib/hooks/use-bulk-ai";

interface BulkAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "translate" | "copy";
  targetLocale: string;
  primaryLocale: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, Record<string, any>>;
  fields: import("@/lib/hooks/use-bulk-ai").BulkField[];
  appName?: string;
  onApply: (updates: Record<string, Record<string, string>>) => void;
}

/**
 * Merge bulk updates into locale data. Extracted for testability.
 */
export function mergeBulkUpdates(
  current: Record<string, Record<string, string>>,
  updates: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const next = { ...current };
  for (const [locale, fields] of Object.entries(updates)) {
    next[locale] = { ...next[locale], ...fields };
  }
  return next;
}

export function BulkAIDialog({
  open,
  onOpenChange,
  mode,
  targetLocale,
  primaryLocale,
  localeData,
  fields,
  appName,
  onApply,
}: BulkAIDialogProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const initChecked = useCallback(() => {
    const initial: Record<string, boolean> = {};
    for (const f of fields) {
      initial[f.key] = true;
    }
    setChecked(initial);
  }, [fields]);

  const { authError, getResult } = useBulkAI({
    open,
    mode,
    primaryLocale,
    targetLocales: [targetLocale],
    localeData,
    fields,
    appName,
    onInit: initChecked,
  });

  // --- Checkbox logic ---

  function toggleField(fieldKey: string) {
    setChecked((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }

  function toggleAll() {
    const allChk = fields.every((f) => checked[f.key]);
    const next: Record<string, boolean> = {};
    for (const f of fields) {
      next[f.key] = !allChk;
    }
    setChecked(next);
  }

  // --- Apply ---

  function handleApply() {
    const fieldUpdates: Record<string, string> = {};
    for (const f of fields) {
      if (!checked[f.key]) continue;
      const fr = getResult(targetLocale, f.key);
      if (fr?.status === "done") {
        fieldUpdates[f.key] = fr.value;
      }
    }
    if (Object.keys(fieldUpdates).length > 0) {
      onApply({ [targetLocale]: fieldUpdates });
    }
    onOpenChange(false);
  }

  // --- Derived state ---

  const checkedCount = fields.filter((f) => checked[f.key]).length;
  const allChecked = checkedCount === fields.length;

  const allFinished = fields.every((f) => {
    const s = getResult(targetLocale, f.key)?.status;
    return s === "done" || s === "error";
  });

  const anyApplicable = fields.some(
    (f) => checked[f.key] && getResult(targetLocale, f.key)?.status === "done",
  );

  const targetLabel = localeName(targetLocale);
  const baseLabel = localeName(primaryLocale);
  const title =
    mode === "translate"
      ? `Translate all fields to ${targetLabel}`
      : `Copy all fields from ${baseLabel}`;

  const currentFields = localeData[targetLocale] ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !grid grid-rows-[auto_1fr_auto] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {authError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3 text-sm text-destructive">
            Your API key is invalid or revoked.{" "}
            <a href="/settings/ai" className="underline font-medium">
              Update it in AI settings
            </a>.
          </div>
        )}

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="space-y-4 pr-3">
            {fields.map((field) => {
              const fr = getResult(targetLocale, field.key);
              const before = String(currentFields[field.key] ?? "");
              const after = fr?.status === "done" ? fr.value : "";
              const isLoading = fr?.status === "loading";
              const isError = fr?.status === "error";
              const unchanged = fr?.status === "done" && before === after;

              return (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={checked[field.key] ?? false}
                      onCheckedChange={() => toggleField(field.key)}
                      disabled={isLoading || isError}
                    />
                    <span className="text-sm font-medium">{field.label}</span>
                    {isLoading && (
                      <CircleNotch
                        size={12}
                        className="animate-spin text-muted-foreground"
                      />
                    )}
                    {isError && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <Warning size={12} />
                        Failed
                      </span>
                    )}
                    {unchanged && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check size={12} />
                        No change
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0 pl-6">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Before
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      After
                    </p>
                    {/* Both cells share the same grid row so they match height */}
                    <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                      {before || (
                        <span className="italic text-muted-foreground">
                          Empty
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center justify-center rounded border bg-muted/40">
                        <CircleNotch
                          size={14}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : isError ? (
                      <div className="flex items-center justify-center rounded border border-destructive/30 bg-muted/40 text-xs text-destructive">
                        Translation failed
                      </div>
                    ) : (
                      <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                        {after || (
                          <span className="italic text-muted-foreground">
                            Empty
                          </span>
                        )}
                      </div>
                    )}
                    {field.charLimit && (
                      <>
                        <CharCount value={before} limit={field.charLimit} />
                        {!isLoading && !isError && after
                          ? <CharCount value={after} limit={field.charLimit} />
                          : <span />}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={allChecked}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!anyApplicable} onClick={handleApply}>
              {allFinished
                ? `Apply ${checkedCount} field${checkedCount !== 1 ? "s" : ""}`
                : mode === "copy"
                  ? `Apply ${checkedCount} field${checkedCount !== 1 ? "s" : ""}`
                  : "Translating\u2026"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
