"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye, EyeSlash, Info, CheckCircle, XCircle,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";
import { screenshotImageUrl } from "@/lib/asc/display-types";
import type { AscScreenshot } from "@/lib/asc/display-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenshotItem {
  screenshot: AscScreenshot;
  displayType: string;
}

type ItemStatus = "queued" | "translating" | "uploading" | "done" | "failed";

interface ItemState {
  status: ItemStatus;
  thumbnail?: string;
  thumbnailMimeType?: string;
  error?: string;
}

interface TranslateScreenshotsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screenshots to translate/copy. */
  items: ScreenshotItem[];
  /** Target locale code. */
  toLocale: string;
  /** Target localization ID. */
  targetLocalizationId: string;
  /** Called when all done so parent can refresh. */
  onComplete: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TranslateScreenshotsModal({
  open,
  onOpenChange,
  items,
  toLocale,
  targetLocalizationId,
  onComplete,
}: TranslateScreenshotsModalProps) {
  const [marketingOnly, setMarketingOnly] = useState(true);
  const [started, setStarted] = useState(false);
  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(new Map());
  const [copyMode, setCopyMode] = useState(false);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const setIdCacheRef = useRef(new Map<string, string>());

  // Gemini key state
  const [geminiKey, setGeminiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState("");
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStarted(false);
    setItemStates(new Map());
    setCopyMode(false);
    stopRef.current = false;
    abortRef.current = null;
    setIdCacheRef.current = new Map();
    setGeminiKey("");
    setKeyError("");
    setHasKey(null);

    fetch("/api/settings/gemini-key")
      .then((res) => res.json())
      .then((data: { available: boolean }) => setHasKey(data.available))
      .catch(() => setHasKey(false));
  }, [open]);

  // Focus key input
  useEffect(() => {
    if (hasKey === false && !started) {
      setTimeout(() => keyInputRef.current?.focus(), 0);
    }
  }, [hasKey, started]);

  const isSingle = items.length === 1;

  const processItems = useCallback(async (copy: boolean, keyOverride?: string) => {
    setStarted(true);
    setCopyMode(copy);
    stopRef.current = false;

    // Initialize all items as queued
    const initial = new Map<string, ItemState>();
    for (const item of items) {
      initial.set(item.screenshot.id, { status: "queued" });
    }
    setItemStates(new Map(initial));

    for (const item of items) {
      if (stopRef.current) break;

      const ssId = item.screenshot.id;
      const token = item.screenshot.attributes.assetToken;
      if (!token) {
        setItemStates((prev) => {
          const next = new Map(prev);
          next.set(ssId, { status: "failed", error: "No asset token" });
          return next;
        });
        continue;
      }

      setItemStates((prev) => {
        const next = new Map(prev);
        next.set(ssId, { status: copy ? "uploading" : "translating" });
        return next;
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const imageUrl = screenshotImageUrl(token, 4000);
        const res = await fetch("/api/ai/translate-and-upload-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            imageUrl,
            toLocale,
            marketingOnly,
            fileName: item.screenshot.attributes.fileName,
            displayType: item.displayType,
            targetLocalizationId,
            targetSetId: setIdCacheRef.current.get(item.displayType),
            copyOnly: copy,
            ...(keyOverride ? { geminiKey: keyOverride } : {}),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === "gemini_key_required") {
            setHasKey(false);
            setStarted(false);
            return;
          }
          if (data.error === "gemini_auth_error") {
            setHasKey(false);
            setStarted(false);
            setKeyError("Invalid API key. Please check and try again.");
            return;
          }
          throw new Error(data.error || "Failed");
        }

        // Cache the resolved set ID for subsequent images of the same display type
        if (data.targetSetId) {
          setIdCacheRef.current.set(item.displayType, data.targetSetId);
        }

        setItemStates((prev) => {
          const next = new Map(prev);
          next.set(ssId, {
            status: "done",
            thumbnail: data.thumbnail,
            thumbnailMimeType: data.thumbnailMimeType,
          });
          return next;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        setItemStates((prev) => {
          const next = new Map(prev);
          next.set(ssId, {
            status: "failed",
            error: err instanceof Error ? err.message : "Failed",
          });
          return next;
        });
      }
    }

    abortRef.current = null;
  }, [items, toLocale, marketingOnly, targetLocalizationId]);

  function handleStop() {
    stopRef.current = true;
    abortRef.current?.abort();
  }

  async function handleClose() {
    if (started) {
      handleStop();
      await onComplete();
    }
    onOpenChange(false);
  }

  async function handleRetryFailed() {
    const failedItems = items.filter(
      (item) => itemStates.get(item.screenshot.id)?.status === "failed",
    );
    if (failedItems.length === 0) return;

    stopRef.current = false;

    for (const item of failedItems) {
      if (stopRef.current) break;

      const ssId = item.screenshot.id;
      const token = item.screenshot.attributes.assetToken;
      if (!token) continue;

      setItemStates((prev) => {
        const next = new Map(prev);
        next.set(ssId, { status: copyMode ? "uploading" : "translating" });
        return next;
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const imageUrl = screenshotImageUrl(token, 4000);
        const res = await fetch("/api/ai/translate-and-upload-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            imageUrl,
            toLocale,
            marketingOnly,
            fileName: item.screenshot.attributes.fileName,
            displayType: item.displayType,
            targetLocalizationId,
            targetSetId: setIdCacheRef.current.get(item.displayType),
            copyOnly: copyMode,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");

        if (data.targetSetId) {
          setIdCacheRef.current.set(item.displayType, data.targetSetId);
        }

        setItemStates((prev) => {
          const next = new Map(prev);
          next.set(ssId, {
            status: "done",
            thumbnail: data.thumbnail,
            thumbnailMimeType: data.thumbnailMimeType,
          });
          return next;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        setItemStates((prev) => {
          const next = new Map(prev);
          next.set(ssId, {
            status: "failed",
            error: err instanceof Error ? err.message : "Failed",
          });
          return next;
        });
      }
    }
    abortRef.current = null;
  }

  function handleKeySubmit() {
    if (!geminiKey.trim()) return;
    setHasKey(true);
    setKeyError("");
    processItems(false, geminiKey.trim());
  }

  // Compute progress stats
  const total = items.length;
  const doneCount = Array.from(itemStates.values()).filter((s) => s.status === "done").length;
  const failedCount = Array.from(itemStates.values()).filter((s) => s.status === "failed").length;
  const inProgress = started && (doneCount + failedCount) < total && !stopRef.current;
  const allDone = started && (doneCount + failedCount) >= total;
  const hasFailed = failedCount > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isSingle ? "Translate screenshot" : `Translate ${total} screenshots`}
            {" "}to {localeName(toLocale)}
          </DialogTitle>
        </DialogHeader>

        {/* Progress grid */}
        {started && (
          <div className="flex-1 overflow-y-auto">
            {/* Progress bar */}
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {doneCount} of {total} completed
                  {failedCount > 0 && ` (${failedCount} failed)`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${total > 0 ? ((doneCount + failedCount) / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Thumbnail grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const state = itemStates.get(item.screenshot.id);
                const status = state?.status ?? "queued";
                const token = item.screenshot.attributes.assetToken;

                return (
                  <div
                    key={item.screenshot.id}
                    className="relative flex flex-col items-center rounded-lg border bg-muted/20 p-2"
                  >
                    {/* Show translated thumbnail if done, otherwise original */}
                    {status === "done" && state?.thumbnail ? (
                      <img
                        src={`data:${state.thumbnailMimeType};base64,${state.thumbnail}`}
                        alt="Translated"
                        className="h-[300px] w-auto rounded object-contain"
                      />
                    ) : token ? (
                      <img
                        src={screenshotImageUrl(token, 400)}
                        alt={item.screenshot.attributes.fileName}
                        className="h-[300px] w-auto rounded object-contain opacity-40"
                      />
                    ) : (
                      <div className="flex h-[300px] w-[168px] items-center justify-center rounded bg-muted">
                        <Spinner className="size-6 text-muted-foreground/40" />
                      </div>
                    )}

                    {/* Status overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {(status === "translating" || status === "uploading") && (
                        <div className="rounded-full bg-background/80 p-2">
                          <Spinner className="size-7 text-primary" />
                        </div>
                      )}
                      {status === "done" && (
                        <div className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5">
                          <CheckCircle size={20} weight="fill" className="text-green-500" />
                        </div>
                      )}
                      {status === "failed" && (
                        <div className="rounded-full bg-background/80 p-2" title={state?.error}>
                          <XCircle size={24} weight="fill" className="text-destructive" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Idle state – preview of what will be translated */}
        {!started && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const token = item.screenshot.attributes.assetToken;
                return (
                  <div
                    key={item.screenshot.id}
                    className="flex flex-col items-center rounded-lg border bg-muted/20 p-2"
                  >
                    {token ? (
                      <img
                        src={screenshotImageUrl(token, 400)}
                        alt={item.screenshot.attributes.fileName}
                        className="h-[300px] w-auto rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-[300px] w-[168px] items-center justify-center rounded bg-muted">
                        <Spinner className="size-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gemini key input – shown when no key available */}
        {hasKey === false && !started && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-2 text-sm">
              <Info size={16} className="mt-0.5 shrink-0 text-orange-500" />
              <p className="text-muted-foreground">
                Screenshot translation uses Gemini 3 Pro Image. Enter your Gemini API key to continue.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  ref={keyInputRef}
                  type={showKey ? "text" : "password"}
                  placeholder="Gemini API key"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && geminiKey.trim()) handleKeySubmit();
                  }}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                >
                  {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {keyError && <p className="text-sm text-destructive">{keyError}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t pt-3">
          {!started && (
            <>
              <div className="flex items-center gap-2 mr-auto">
                <Switch
                  id="marketing-only-batch"
                  checked={marketingOnly}
                  onCheckedChange={setMarketingOnly}
                />
                <Label htmlFor="marketing-only-batch" className="text-sm">
                  Don&apos;t translate app UI
                </Label>
              </div>
              <Button
                variant="outline"
                onClick={() => processItems(true)}
              >
                Copy without translation
              </Button>
              <Button
                onClick={() => {
                  if (hasKey === false && geminiKey.trim()) {
                    handleKeySubmit();
                  } else {
                    processItems(false);
                  }
                }}
                disabled={hasKey === false && !geminiKey.trim()}
              >
                Translate
              </Button>
            </>
          )}

          {started && (
            <>
              <div className="mr-auto text-xs text-muted-foreground">
                {inProgress
                  ? copyMode
                    ? "Uploading..."
                    : "Translating... This can take 1\u20132 minutes per image."
                  : allDone && !hasFailed
                    ? "All done!"
                    : allDone && hasFailed
                      ? `${doneCount} completed, ${failedCount} failed`
                      : "Stopped"
                }
              </div>
              {hasFailed && !inProgress && (
                <Button variant="outline" size="sm" className="gap-1" onClick={handleRetryFailed}>
                  <ArrowsClockwise size={14} />
                  Retry failed
                </Button>
              )}
              <Button onClick={handleClose}>
                {inProgress ? "Cancel" : "Done"}
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-right">
          Uses Gemini 3 Pro Image {"\u2013"} approximately $0.30 per image.{" "}
          <a
            href="https://cloud.google.com/vertex-ai/generative-ai/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Google pricing
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
