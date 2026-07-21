"use client";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { estimateDownloads } from "@/lib/aso/downloads";
import type { DifficultyBreakdown, RankingTier } from "@/lib/aso/estimators";
import { difficultyTone, TONE_TEXT } from "@/lib/aso/score-display";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

const SUB_SCORES = [
  ["ratingVolume", "keywords.subRatingVolume"],
  ["reviewVelocity", "keywords.subReviewVelocity"],
  ["dominantPlayers", "keywords.subDominantPlayers"],
  ["ratingQuality", "keywords.subRatingQuality"],
  ["marketAge", "keywords.subMarketAge"],
  ["publisherDiversity", "keywords.subPublisherDiversity"],
  ["titleRelevance", "keywords.subTitleRelevance"],
] as const;

const OVERRIDE_KEYS = {
  small_result_set: "keywords.overrideSmallResultSet",
  weak_leader: "keywords.overrideWeakLeader",
  backfill: "keywords.overrideBackfill",
} as const;

const fmt = (x: number) =>
  x >= 100
    ? Math.round(x).toLocaleString()
    : x >= 10
      ? String(Math.round(x))
      : String(Math.round(x * 10) / 10);

const range = (low: number, high: number) => `${fmt(low)}–${fmt(high)}`;

const TONE_BAR: Partial<Record<ReturnType<typeof difficultyTone>, string>> = {
  green: "bg-green-500",
  lightGreen: "bg-green-400",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  darkRed: "bg-red-700",
};

function TierRow({ label, tier }: { label: string; tier: RankingTier }) {
  const tone = difficultyTone(tier.tierScore);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={cn("h-1.5 rounded-full", TONE_BAR[tone] ?? "bg-muted-foreground")}
          style={{ width: `${tier.tierScore}%` }}
        />
      </div>
      <span className={cn("w-7 text-right text-xs font-semibold tabular-nums", TONE_TEXT[tone])}>
        {tier.tierScore}
      </span>
      <span className="w-16 text-right text-xs text-muted-foreground">{tier.label}</span>
    </div>
  );
}

/**
 * Popover detailing a keyword's difficulty: sub-scores, brand flag,
 * adjustment note, top 5/10/20 tiers and estimated daily downloads.
 */
export function DifficultyDetail({
  breakdown,
  popularity,
  country,
  rank,
  children,
}: {
  breakdown: DifficultyBreakdown | null;
  popularity: number | null;
  country: string;
  rank: number | null;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const downloads = popularity !== null ? estimateDownloads(popularity, country) : null;
  const atRank = downloads && rank !== null && rank >= 1 && rank <= 20
    ? { rank, ...downloads.positions[rank - 1] }
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="center" className="w-80 space-y-4 text-sm">
        {!breakdown ? (
          <p className="text-muted-foreground">{t("keywords.detailNoDetails")}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                <span className={cn("tabular-nums", TONE_TEXT[difficultyTone(breakdown.totalScore)])}>
                  {breakdown.totalScore}
                </span>
                {" – "}
                {breakdown.interpretation}
              </p>
              {breakdown.isBrandKeyword && (
                <Badge variant="outline" className="shrink-0 text-muted-foreground">
                  {t("keywords.detailBrandKeyword", {
                    name: breakdown.brandName ?? "–",
                  })}
                </Badge>
              )}
            </div>

            {breakdown.overrideReason && (
              <p className="text-xs text-muted-foreground">
                {t(OVERRIDE_KEYS[breakdown.overrideReason])}
              </p>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("keywords.detailBreakdown")}
              </p>
              {SUB_SCORES.map(([field, key]) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-xs">{t(key)}</span>
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      TONE_TEXT[difficultyTone(breakdown[field])],
                    )}
                  >
                    {breakdown[field]}
                  </span>
                </div>
              ))}
            </div>

            {breakdown.rankingTiers && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("keywords.detailTiers")}
                </p>
                <TierRow label={t("keywords.detailTierTop5")} tier={breakdown.rankingTiers.top5} />
                <TierRow label={t("keywords.detailTierTop10")} tier={breakdown.rankingTiers.top10} />
                <TierRow label={t("keywords.detailTierTop20")} tier={breakdown.rankingTiers.top20} />
              </div>
            )}

            {downloads && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("keywords.detailDownloads")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("keywords.detailSearchesPerDay", { count: fmt(downloads.dailySearches) })}
                </p>
                {(
                  [
                    ["keywords.detailTierTop5", downloads.tiers.top5],
                    ["keywords.detailRanks6To10", downloads.tiers.top6To10],
                    ["keywords.detailRanks11To20", downloads.tiers.top11To20],
                  ] as const
                ).map(([key, tier]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs">{t(key)}</span>
                    <span className="text-xs tabular-nums">
                      {t("keywords.detailPerDay", { range: range(tier.low, tier.high) })}
                    </span>
                  </div>
                ))}
                {atRank && (
                  <p className="pt-0.5 text-xs font-medium">
                    {t("keywords.detailAtRank", {
                      rank: atRank.rank,
                      range: range(atRank.downloadsLow, atRank.downloadsHigh),
                    })}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
