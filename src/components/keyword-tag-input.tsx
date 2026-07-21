"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  opportunityTone,
  type OpportunityTone,
} from "@/lib/aso/score-display";

/** Per-tag ASO score state, provided by the storefront keywords view. */
export type TagScore =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "done";
      opportunity: number;
      popularity: number | null;
      difficulty: number;
      classification: string;
      /** 1-based App Store rank of the current app; only fetched by views
       *  that pass an app id (research tab). */
      rank?: number | null;
    };

interface KeywordTagInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  getTagScore?: (tag: string) => TagScore | undefined;
}

export const TONE_CLASSES: Record<OpportunityTone, string> = {
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function TagScoreBadge({ score }: { score: TagScore }) {
  const t = useTranslations();

  if (score.status === "loading") {
    return <Spinner className="size-3 text-muted-foreground" />;
  }

  if (score.status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[10px] text-muted-foreground">–</span>
        </TooltipTrigger>
        <TooltipContent>{t("keywords.scoreUnavailable")}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${TONE_CLASSES[opportunityTone(score.opportunity)]}`}
        >
          {score.opportunity}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">
          {t("keywords.scoreOpportunity")} {score.opportunity} – {score.classification}
        </p>
        <p>
          {t("keywords.scorePopularity")} {score.popularity ?? "–"} ·{" "}
          {t("keywords.scoreDifficulty")} {score.difficulty}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinKeywords(tags: string[]): string {
  return tags.join(",");
}

export function KeywordTagInput({
  value,
  onChange,
  readOnly,
  getTagScore,
}: KeywordTagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = splitKeywords(value);

  const commitTags = useCallback(
    (raw: string) => {
      const newTags = splitKeywords(raw);
      if (newTags.length === 0) return;
      const merged = [...tags, ...newTags];
      onChange(joinKeywords(merged));
      setInput("");
    },
    [tags, onChange],
  );

  const removeTag = useCallback(
    (index: number) => {
      const next = tags.filter((_, i) => i !== index);
      onChange(joinKeywords(next));
    },
    [tags, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        if (input.trim()) {
          e.preventDefault();
          commitTags(input);
        } else if (e.key === ",") {
          e.preventDefault();
        }
      } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
        removeTag(tags.length - 1);
      }
    },
    [input, tags, commitTags, removeTag],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (text.includes(",")) {
        e.preventDefault();
        commitTags(text);
      }
    },
    [commitTags],
  );

  const handleBlur = useCallback(() => {
    if (input.trim()) {
      commitTags(input);
    }
  }, [input, commitTags]);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => {
        const score = getTagScore?.(tag);
        return (
        <Badge key={`${i}-${tag}`} variant="secondary" className="gap-1 py-0.5">
          {tag}
          {score && <TagScoreBadge score={score} />}
          {!readOnly && (
            <button
              type="button"
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
            >
              <X size={12} />
            </button>
          )}
        </Badge>
        );
      })}
      {!readOnly && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? "Add keywords…" : ""}
          className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
