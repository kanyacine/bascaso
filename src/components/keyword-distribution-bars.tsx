"use client";

import { Info } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TagScore } from "@/components/keyword-tag-input";
import {
  classificationDistribution,
  rankDistribution,
  type RankDistribution,
  type SummaryInput,
} from "@/lib/aso/summary";
import type { MessageKey } from "@/lib/i18n/messages";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

/** Scored ("done") keywords as summary inputs, shared with the summary card. */
export function summaryInputs(
  words: string[],
  getTagScore: ((tag: string) => TagScore | undefined) | undefined,
): SummaryInput[] {
  const inputs: SummaryInput[] = [];
  for (const word of words) {
    const score = getTagScore?.(word);
    if (score?.status !== "done") continue;
    inputs.push({
      keyword: word,
      popularity: score.popularity,
      rank: score.rank ?? null,
      previousRank: score.previous?.rank ?? null,
      hasPrevious: score.previous != null,
      classification: score.classification,
    });
  }
  return inputs;
}

// Classification labels stay in English (API values); order and hues mirror
// respectaso's "Keyword mix" strip, on our tone scale.
const MIX_SEGMENTS: Array<{ label: string; cls: string; tip: MessageKey }> = [
  { label: "Sweet Spot", cls: "bg-green-700", tip: "keywords.verdictSweetSpot" },
  { label: "Good Target", cls: "bg-green-500", tip: "keywords.verdictGoodTarget" },
  { label: "Hidden Gem", cls: "bg-blue-500", tip: "keywords.verdictHiddenGem" },
  { label: "High Competition", cls: "bg-yellow-500", tip: "keywords.verdictHighCompetition" },
  { label: "Moderate", cls: "bg-muted-foreground/70", tip: "keywords.verdictModerate" },
  { label: "Low Volume", cls: "bg-muted-foreground/40", tip: "keywords.verdictLowVolume" },
  { label: "Avoid", cls: "bg-red-500", tip: "keywords.verdictAvoid" },
];

// Scoring fetches 25 results, hence the 21–25 bucket instead of respectaso's
// deeper tiers.
const RANK_SEGMENTS: Array<{
  key: keyof RankDistribution;
  label: MessageKey;
  tip: MessageKey;
  cls: string;
}> = [
  { key: "t5", label: "keywords.rankBarT5", tip: "keywords.rankBarT5Tip", cls: "bg-green-600" },
  { key: "t10", label: "keywords.rankBarT10", tip: "keywords.rankBarT10Tip", cls: "bg-green-400" },
  { key: "t20", label: "keywords.rankBarT20", tip: "keywords.rankBarT20Tip", cls: "bg-yellow-500" },
  { key: "t25", label: "keywords.rankBarT25", tip: "keywords.rankBarT25Tip", cls: "bg-orange-500" },
  { key: "unranked", label: "keywords.rankBarUnranked", tip: "keywords.rankBarUnrankedTip", cls: "bg-muted-foreground/30" },
];

function BarStrip({
  title,
  titleTip,
  scored,
  total,
  segments,
}: {
  title: string;
  titleTip: string;
  scored: number;
  total: number;
  segments: Array<{ id: string; label: string; tip: string; cls: string; count: number }>;
}) {
  const shown = segments.filter((s) => s.count > 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {title}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={title} className="cursor-help">
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{titleTip}</TooltipContent>
          </Tooltip>
        </span>
        {scored < total && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {scored}/{total}
          </span>
        )}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {shown.map((s) => (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <div
                className={cn("cursor-help", s.cls)}
                style={{ width: `${(s.count / scored) * 100}%` }}
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium">
                {s.label}: {s.count}
              </p>
              <p>{s.tip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {shown.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1 text-[10px] text-muted-foreground"
          >
            <span className={cn("size-2 rounded-sm", s.cls)} />
            {s.label}: <span className="tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * "Keyword mix" (classification) and "keyword ranks" distribution strips for
 * one keyword field, ported from respectaso's App Summary. Fills in
 * progressively as scores land; only scored keywords are counted.
 */
export function KeywordDistributionBars({
  words,
  getTagScore,
}: {
  words: string[];
  getTagScore?: (tag: string) => TagScore | undefined;
}) {
  const t = useTranslations();
  const inputs = summaryInputs(words, getTagScore);
  if (words.length === 0 || inputs.length === 0) return null;

  const mix = classificationDistribution(inputs);
  const ranks = rankDistribution(inputs);

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <BarStrip
        title={t("keywords.mixTitle")}
        titleTip={t("keywords.mixTooltip")}
        scored={inputs.length}
        total={words.length}
        segments={MIX_SEGMENTS.map((s) => ({
          id: s.label,
          label: s.label,
          tip: t(s.tip),
          cls: s.cls,
          count: mix[s.label] ?? 0,
        }))}
      />
      <BarStrip
        title={t("keywords.ranksTitle")}
        titleTip={t("keywords.ranksTooltip")}
        scored={inputs.length}
        total={words.length}
        segments={RANK_SEGMENTS.map((s) => ({
          id: s.key,
          label: t(s.label),
          tip: t(s.tip),
          cls: s.cls,
          count: ranks[s.key],
        }))}
      />
    </div>
  );
}
