"use client";

import { useCallback, type KeyboardEvent } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DifficultyDetail } from "@/components/difficulty-detail";
import type { TagScore } from "@/components/keyword-tag-input";
import { DeltaArrow } from "@/components/score-delta-arrow";
import { scoreDelta } from "@/lib/aso/research";
import {
  classificationTone,
  difficultyTone,
  opportunityTone,
  popularityTone,
  RANK_QUALITY,
  rankQuality,
  rankTone,
  TONE_BADGE,
  TONE_TEXT,
  type ScoreTone,
} from "@/lib/aso/score-display";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

/** Header stat: label above, tinted value + optional trend arrow below. */
function HeaderStat({
  label,
  value,
  tone,
  prefix,
  valueTooltip,
  delta,
}: {
  label: string;
  value: number | null | undefined;
  tone: ScoreTone;
  prefix?: string;
  valueTooltip?: string;
  delta?: { current: number | null | undefined; previous: number | null | undefined; fetchedAt: number | undefined; lowerIsBetter?: boolean };
}) {
  const content = (
    <p
      className={cn(
        "text-sm font-semibold tabular-nums",
        TONE_TEXT[value == null ? "muted" : tone],
        valueTooltip && value != null && "cursor-help",
      )}
    >
      {value == null ? "–" : `${prefix ?? ""}${value}`}
      {delta && (
        <DeltaArrow
          delta={scoreDelta(delta.current, delta.previous, delta.lowerIsBetter)}
          previousValue={delta.previous}
          fetchedAt={delta.fetchedAt}
        />
      )}
    </p>
  );
  return (
    <div className="min-w-14">
      <p className="text-xs text-muted-foreground">{label}</p>
      {valueTooltip && value != null ? (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent>{valueTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        content
      )}
    </div>
  );
}

/**
 * Full keyword detail as a dialog: the research table's expanded row
 * (DifficultyDetail) plus a header carrying the row's own columns – verdict,
 * popularity/difficulty/opportunity/results and the rank top-right. Left and
 * right navigation walks the keyword field in visual order.
 */
export function KeywordDetailDialog({
  words,
  openIndex,
  onOpenIndexChange,
  getTagScore,
  country,
}: {
  words: string[];
  openIndex: number | null;
  onOpenIndexChange: (index: number | null) => void;
  getTagScore?: (tag: string) => TagScore | undefined;
  country: string | null;
}) {
  const t = useTranslations();
  const open = openIndex !== null && openIndex >= 0 && openIndex < words.length;
  const keyword = open ? words[openIndex] : null;
  const score = keyword ? getTagScore?.(keyword) : undefined;
  const done = score?.status === "done" ? score : null;
  const prev = done?.previous ?? null;

  const navigate = useCallback(
    (step: -1 | 1) => {
      if (openIndex === null) return;
      const next = openIndex + step;
      if (next >= 0 && next < words.length) onOpenIndexChange(next);
    },
    [openIndex, words.length, onOpenIndexChange],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // Leave arrows to actual text inputs; buttons/links don't use them.
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
    e.preventDefault();
    navigate(e.key === "ArrowLeft" ? -1 : 1);
  };

  if (!keyword) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenIndexChange(null)}>
      <DialogContent
        // Same size for every keyword: height tracks the window (min window
        // is 1200×800) but caps on large displays; only the body scrolls.
        className="flex h-[min(85vh,52rem)] flex-col gap-4 overflow-hidden sm:max-w-5xl"
        onKeyDown={onKeyDown}
      >
        <DialogHeader className="gap-3 pr-8 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
            {keyword}
            {done && (
              <Badge
                variant="secondary"
                className={cn(
                  "font-sans font-medium",
                  TONE_BADGE[classificationTone(done.classification)],
                )}
              >
                {done.classification}
              </Badge>
            )}
          </DialogTitle>
          {done && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <HeaderStat
                label={t("keywords.scorePopularity")}
                value={done.popularity}
                tone={popularityTone(done.popularity ?? null)}
                delta={{
                  current: done.popularity,
                  previous: prev?.popularity,
                  fetchedAt: prev?.fetchedAt,
                }}
              />
              <HeaderStat
                label={t("keywords.scoreDifficulty")}
                value={done.difficulty}
                tone={difficultyTone(done.difficulty ?? 0)}
                delta={{
                  current: done.difficulty,
                  previous: prev?.difficulty,
                  fetchedAt: prev?.fetchedAt,
                  lowerIsBetter: true,
                }}
              />
              <HeaderStat
                label={t("keywords.scoreOpportunity")}
                value={done.opportunity}
                tone={opportunityTone(done.opportunity ?? 0)}
                delta={{
                  current: done.opportunity,
                  previous: prev?.opportunity,
                  fetchedAt: prev?.fetchedAt,
                }}
              />
              <HeaderStat
                label={t("keywords.researchResults")}
                value={done.resultCount}
                tone="muted"
              />
              <HeaderStat
                label={t("keywords.researchRank")}
                value={done.rank}
                tone={rankTone(done.rank ?? null)}
                prefix="#"
                valueTooltip={
                  done.rank != null
                    ? t(RANK_QUALITY[rankQuality(done.rank)])
                    : undefined
                }
                delta={{
                  current: done.rank,
                  previous: prev?.rank,
                  fetchedAt: prev?.fetchedAt,
                  lowerIsBetter: true,
                }}
              />
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {done ? (
            <DifficultyDetail
              breakdown={done.details ?? null}
              popularity={done.popularity}
              country={country ?? "us"}
              rank={done.rank ?? null}
              keyword={keyword}
              competitors={done.competitors ?? null}
            />
          ) : score?.status === "error" ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {t("keywords.scoreUnavailable")}
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={openIndex === 0}
            onClick={() => navigate(-1)}
            aria-label={t("keywords.detailPrev")}
          >
            <CaretLeft className="size-4" />
            {t("keywords.detailPrev")}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {(openIndex ?? 0) + 1}/{words.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={openIndex === words.length - 1}
            onClick={() => navigate(1)}
            aria-label={t("keywords.detailNext")}
          >
            {t("keywords.detailNext")}
            <CaretRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
