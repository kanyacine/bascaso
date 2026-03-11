"use client";

import { useState, useEffect } from "react";
import { Eye, EyeSlash, Info } from "@phosphor-icons/react";
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

interface TranslateScreenshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Original screenshot image URL (Apple CDN). */
  originalUrl: string;
  /** File name of the original screenshot. */
  fileName: string;
  /** Target locale code. */
  toLocale: string;
  /** Called with the translated image blob when user accepts. */
  onAccept: (file: File) => Promise<void>;
}

type Phase = "idle" | "translating" | "done" | "error" | "needs-key";

export function TranslateScreenshotModal({
  open,
  onOpenChange,
  originalUrl,
  fileName,
  toLocale,
  onAccept,
}: TranslateScreenshotModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [marketingOnly, setMarketingOnly] = useState(true);
  const [translatedSrc, setTranslatedSrc] = useState<string>("");
  const [translatedBlob, setTranslatedBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  // Gemini key state (for inline key entry)
  const [geminiKey, setGeminiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Reset state and check key availability when modal opens
  useEffect(() => {
    if (!open) return;
    setPhase("idle");
    setError("");
    setTranslatedSrc("");
    setTranslatedBlob(null);
    setGeminiKey("");
    setUploading(false);
    setHasKey(null);

    fetch("/api/settings/gemini-key")
      .then((res) => res.json())
      .then((data: { available: boolean }) => {
        setHasKey(data.available);
        if (!data.available) setPhase("needs-key");
      })
      .catch(() => {
        setHasKey(false);
        setPhase("needs-key");
      });
  }, [open]);

  async function handleTranslate(keyOverride?: string) {
    setError("");
    setPhase("translating");
    console.log("[translate-modal] Starting translation, url=%s locale=%s", originalUrl.slice(0, 80), toLocale);

    try {
      const res = await fetch("/api/ai/translate-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: originalUrl,
          toLocale,
          marketingOnly,
          ...(keyOverride ? { geminiKey: keyOverride } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "gemini_key_required") {
          setPhase("needs-key");
          return;
        }
        if (data.error === "gemini_auth_error") {
          setPhase("needs-key");
          setError("Invalid API key. Please check and try again.");
          return;
        }
        throw new Error(data.error || "Translation failed");
      }

      // Convert base64 response to blob URL for preview
      const binaryStr = atob(data.imageBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const resultBlob = new Blob([bytes], { type: data.mimeType || "image/png" });
      setTranslatedBlob(resultBlob);
      setTranslatedSrc(URL.createObjectURL(resultBlob));
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
      setPhase("error");
    }
  }

  async function handleAccept() {
    if (!translatedBlob) return;
    setUploading(true);
    try {
      const ext = translatedBlob.type === "image/jpeg" ? ".jpg" : ".png";
      const name = fileName.replace(/\.[^.]+$/, "") + `_${toLocale}${ext}`;
      const file = new File([translatedBlob], name, { type: translatedBlob.type });
      await onAccept(file);
      onOpenChange(false);
    } catch {
      setError("Failed to add screenshot");
    } finally {
      setUploading(false);
    }
  }

  function handleKeySubmit() {
    if (!geminiKey.trim()) return;
    setHasKey(true);
    handleTranslate(geminiKey.trim());
  }

  const isWorking = phase === "translating";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Translate screenshot to {localeName(toLocale)}
          </DialogTitle>
        </DialogHeader>

        {/* Settings row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="marketing-only"
              checked={marketingOnly}
              onCheckedChange={setMarketingOnly}
              disabled={isWorking}
            />
            <Label htmlFor="marketing-only" className="text-sm">
              Don&apos;t translate app UI
            </Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Uses Gemini 3 Pro Image – approximately $0.30 per image.{" "}
          <a
            href="https://cloud.google.com/vertex-ai/generative-ai/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Google pricing
          </a>
        </p>

        {/* Needs key – inline form */}
        {phase === "needs-key" && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-2 text-sm">
              <Info size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Screenshot translation uses Gemini 3 Pro Image. Enter your Google AI API key to continue.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="Google AI API key"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleKeySubmit();
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
              <Button onClick={handleKeySubmit} disabled={!geminiKey.trim()}>
                Translate
              </Button>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {/* Translating spinner */}
        {phase === "translating" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Translating with Gemini 3 Pro Image…</p>
            <p className="text-xs text-muted-foreground">This can take up to a minute</p>
          </div>
        )}

        {/* Result preview */}
        {phase === "done" && translatedSrc && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <img
                src={translatedSrc}
                alt="Translated screenshot"
                className="max-h-[70vh] w-auto rounded object-contain"
              />
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="max-w-sm text-center text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {(phase === "idle" || phase === "error") && (
            <Button onClick={() => handleTranslate()} disabled={isWorking}>
              Translate
            </Button>
          )}
          {phase === "done" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleTranslate()}
                disabled={uploading}
              >
                Retry
              </Button>
              <Button onClick={handleAccept} disabled={uploading}>
                {uploading ? (
                  <>
                    <Spinner className="size-3" />
                    Adding…
                  </>
                ) : (
                  "Add to locale"
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
