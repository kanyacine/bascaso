"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Info } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TagScore } from "@/components/keyword-tag-input";
import { summaryInputs } from "@/components/keyword-distribution-bars";
import {
  DOWNLOADS_ALL_STOREFRONTS_KEY,
  DOWNLOADS_CALIBRATED_COUNTRY,
} from "@/lib/aso/downloads";
import {
  computeStorefrontSummary,
  formatInterval,
} from "@/lib/aso/summary";
import { rankTone, TONE_TEXT } from "@/lib/aso/score-display";
import { usePersistedBool } from "@/lib/hooks/use-persisted-range";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

function Kpi({
  label,
  tip,
  children,
}: {
  label: string;
  tip: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={label} className="cursor-help">
              <Info className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tip}</TooltipContent>
        </Tooltip>
      </p>
      {children}
    </div>
  );
}

/**
 * Single-country port of respectaso's dashboard App Summary: aggregate
 * download estimates, headroom, rank coverage and movers for every keyword
 * of the selected storefront. Downloads-based figures follow the same
 * calibration gate as the detail panel (US only unless opted in).
 */
export function StorefrontSummary({
  words,
  getTagScore,
  country,
}: {
  words: string[];
  getTagScore: (tag: string) => TagScore | undefined;
  country: string | null;
}) {
  const t = useTranslations();
  const [allStorefronts] = usePersistedBool(DOWNLOADS_ALL_STOREFRONTS_KEY, false);
  const inputs = summaryInputs(words, getTagScore);
  if (inputs.length === 0) return null;

  const includeDownloads =
    country !== null &&
    (country === DOWNLOADS_CALIBRATED_COUNTRY || allStorefronts);
  const summary = computeStorefrontSummary(inputs, country ?? "us", includeDownloads);

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("keywords.summaryTitle")}</p>
          {inputs.length < words.length && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {inputs.length}/{words.length}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summary.downloads && (
            <Kpi label={t("keywords.summaryDownloads")} tip={t("keywords.summaryDownloadsTip")}>
              <p className="text-lg font-semibold tabular-nums">
                {formatInterval(summary.downloads.low, summary.downloads.high)}
              </p>
            </Kpi>
          )}
          {summary.headroom && (
            <Kpi label={t("keywords.summaryHeadroom")} tip={t("keywords.summaryHeadroomTip")}>
              <p className="text-lg font-semibold tabular-nums">
                {formatInterval(summary.headroom.low, summary.headroom.high)}
              </p>
            </Kpi>
          )}
          <Kpi label={t("keywords.summaryRanked")} tip={t("keywords.summaryRankedTip")}>
            <p className="text-lg font-semibold tabular-nums">
              {summary.rankingKeywords}/{summary.totalKeywords}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.bestRank != null && (
                <span className={cn("font-medium", TONE_TEXT[rankTone(summary.bestRank)])}>
                  {t("keywords.summaryBestRank", { rank: summary.bestRank })}
                </span>
              )}
              {summary.bestRank != null && " · "}
              {t("keywords.summaryTop20", { count: summary.inTop20 })}
            </p>
          </Kpi>
          <Kpi label={t("keywords.summaryMovers")} tip={t("keywords.summaryMoversTip")}>
            <p className="flex items-center gap-3 text-lg font-semibold tabular-nums">
              <span className={cn("flex items-center gap-0.5", TONE_TEXT.green)}>
                <ArrowUp weight="bold" className="size-4" />
                {summary.movers.up}
              </span>
              <span className={cn("flex items-center gap-0.5", TONE_TEXT.red)}>
                <ArrowDown weight="bold" className="size-4" />
                {summary.movers.down}
              </span>
            </p>
          </Kpi>
        </div>

        {(summary.topPerformer || summary.biggestGap) && (
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            {summary.topPerformer && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("keywords.summaryTopPerformer")}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge variant="secondary" className="font-mono">
                    {summary.topPerformer.keyword}
                  </Badge>
                  {summary.topPerformer.rank != null && (
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        TONE_TEXT[rankTone(summary.topPerformer.rank)],
                      )}
                    >
                      #{summary.topPerformer.rank}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {t("keywords.detailPerDay", {
                      range: formatInterval(
                        summary.topPerformer.low,
                        summary.topPerformer.high,
                      ),
                    })}
                  </span>
                </p>
              </div>
            )}
            {summary.biggestGap && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("keywords.summaryBiggestGap")}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge variant="secondary" className="font-mono">
                    {summary.biggestGap.keyword}
                  </Badge>
                  <span className="tabular-nums text-muted-foreground">
                    {summary.biggestGap.rank != null
                      ? `#${summary.biggestGap.rank}`
                      : t("keywords.rankBarUnranked")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("keywords.summaryGapUpTo", {
                      range: formatInterval(
                        summary.biggestGap.headroomLow,
                        summary.biggestGap.headroomHigh,
                      ),
                    })}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
