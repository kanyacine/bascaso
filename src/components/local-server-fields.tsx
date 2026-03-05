"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { DEFAULT_LOCAL_OPENAI_BASE_URL } from "@/lib/ai/local-provider";

interface LocalServerFieldsProps {
  baseUrl: string;
  onBaseUrlChange: (url: string) => void;
  modelId: string;
  onModelIdChange: (id: string) => void;
  apiKey: string;
  /** Use lightweight labels instead of section headings. */
  compact?: boolean;
}

export function LocalServerFields({
  baseUrl,
  onBaseUrlChange,
  modelId,
  onModelIdChange,
  apiKey,
  compact,
}: LocalServerFieldsProps) {
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const effectiveBaseUrl = baseUrl.trim() || DEFAULT_LOCAL_OPENAI_BASE_URL;

  async function handleTest() {
    setTesting(true);
    try {
      const body: Record<string, string> = { baseUrl: effectiveBaseUrl };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const res = await fetch("/api/settings/ai/local-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to reach local server");
        setTesting(false);
        return;
      }

      const models = Array.isArray(data.models)
        ? data.models.filter((m: unknown): m is string => typeof m === "string" && m.trim().length > 0)
        : [];

      setDetectedModels(models);
      if (models.length === 0) {
        toast.error("Server is reachable, but no models were returned.");
      } else {
        if (!models.includes(modelId)) onModelIdChange(models[0]);
        toast.success(`Detected ${models.length} model${models.length === 1 ? "" : "s"}`);
      }
    } catch {
      toast.error("Network error");
    }
    setTesting(false);
  }

  const Wrapper = compact ? "div" : "section";

  return (
    <>
      <Wrapper className={compact ? "space-y-2" : "space-y-2 max-w-2xl"}>
        {compact ? (
          <label className="text-sm text-muted-foreground">Server URL</label>
        ) : (
          <h3 className="section-title">Server URL</h3>
        )}
        <Input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={DEFAULT_LOCAL_OPENAI_BASE_URL}
          className="font-mono text-sm max-w-xl"
        />
        <p className="text-xs text-muted-foreground">
          OpenAI-compatible endpoint, e.g. <span className="font-mono">http://127.0.0.1:1234/v1</span>
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <><Spinner className="size-3" /> Testing...</> : "Test connection"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Tries <span className="font-mono">{effectiveBaseUrl}/models</span>
          </span>
        </div>
      </Wrapper>

      <Wrapper className={compact ? "space-y-2" : "space-y-2 max-w-2xl"}>
        {compact ? (
          <label className="text-sm text-muted-foreground">Model</label>
        ) : (
          <h3 className="section-title">Model</h3>
        )}
        <Input
          value={modelId}
          onChange={(e) => onModelIdChange(e.target.value)}
          placeholder="qwen2.5-7b-instruct"
          className="font-mono text-sm max-w-xl"
        />
        {detectedModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {detectedModels.map((id) => (
              <Badge
                key={id}
                asChild
                variant={id === modelId ? "default" : "outline"}
                className="cursor-pointer font-mono"
              >
                <button type="button" onClick={() => onModelIdChange(id)}>
                  {id}
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The model ID exposed by your local server (for LM Studio, the loaded model ID).
        </p>
      </Wrapper>
    </>
  );
}
