"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  Buildings,
  CaretRight,
  ChartBar,
  Info,
  Lock,
  MapPin,
  Sparkle,
  Star,
  Tag,
  Target,
  TextAa,
  TrendDown,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DOWNLOADS_ALL_STOREFRONTS_KEY,
  DOWNLOADS_CALIBRATED_COUNTRY,
  estimateDownloads,
  type DownloadPosition,
} from "@/lib/aso/downloads";
import type { DifficultyBreakdown, RankingTier } from "@/lib/aso/estimators";
import {
  deriveInsights,
  deriveOpportunities,
  highlightTitle,
  tierHighlights,
  type HighlightTier,
  type InsightKey,
  type OpportunityKey,
  type TierHighlightKey,
} from "@/lib/aso/research";
import type { CompetitorSnapshot } from "@/lib/aso/score-service";
import {
  difficultyTone,
  rankQuality,
  rankTone,
  TONE_BADGE,
  TONE_TEXT,
  type ScoreTone,
} from "@/lib/aso/score-display";
import { formatDate } from "@/lib/format";
import { usePersistedBool } from "@/lib/hooks/use-persisted-range";
import type { MessageKey } from "@/lib/i18n/messages";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

// Label, tooltip and weight (% of the difficulty score) per sub-score –
// weights mirror respectaso's _compute_raw_difficulty.
const SUB_SCORES = [
  ["ratingVolume", "keywords.subRatingVolume", "keywords.subRatingVolumeTip", 30],
  ["reviewVelocity", "keywords.subReviewVelocity", "keywords.subReviewVelocityTip", 10],
  ["dominantPlayers", "keywords.subDominantPlayers", "keywords.subDominantPlayersTip", 20],
  ["ratingQuality", "keywords.subRatingQuality", "keywords.subRatingQualityTip", 10],
  ["marketAge", "keywords.subMarketAge", "keywords.subMarketAgeTip", 10],
  ["publisherDiversity", "keywords.subPublisherDiversity", "keywords.subPublisherDiversityTip", 10],
  ["titleRelevance", "keywords.subTitleRelevance", "keywords.subTitleRelevanceTip", 10],
] as const;

const OPPORTUNITIES: Record<
  OpportunityKey,
  { icon: Icon; name: MessageKey; detail: MessageKey }
> = {
  titleGapNone: { icon: Target, name: "keywords.oppNameTitleGap", detail: "keywords.oppTitleGapNone" },
  titleGapFew: { icon: Target, name: "keywords.oppNameTitleGap", detail: "keywords.oppTitleGapFew" },
  weakCompetitors: { icon: TrendDown, name: "keywords.oppNameWeak", detail: "keywords.oppWeakCompetitors" },
  activeMarket: { icon: Sparkle, name: "keywords.oppNameActiveMarket", detail: "keywords.oppActiveMarket" },
  crossGenre: { icon: TextAa, name: "keywords.oppNameCrossGenre", detail: "keywords.oppCrossGenre" },
};

// Badge label per insight, plus the fuller respectaso wording as a tooltip
// where the short form would lose the reasoning.
const INSIGHTS: Record<InsightKey, { icon: Icon; text: MessageKey; detail?: MessageKey }> = {
  adjustedSmall: {
    icon: MapPin,
    text: "keywords.insightAdjusted",
    detail: "keywords.insightAdjustedSmallDetail",
  },
  adjustedCompetitive: {
    icon: MapPin,
    text: "keywords.insightAdjusted",
    detail: "keywords.insightAdjustedCompetitiveDetail",
  },
  adjustedBackfill: {
    icon: MapPin,
    text: "keywords.insightAdjusted",
    detail: "keywords.insightAdjustedBackfillDetail",
  },
  brandKeyword: {
    icon: Tag,
    text: "keywords.insightBrand",
    detail: "keywords.insightBrandDetail",
  },
  incumbentsUltra: { icon: Buildings, text: "keywords.insightIncumbentsUltra" },
  incumbentsMega: { icon: Warning, text: "keywords.insightIncumbentsMega" },
  skewedGiants: { icon: ChartBar, text: "keywords.insightSkewedGiants" },
  titleGapNone: { icon: Target, text: "keywords.insightTitleGapNone" },
  titleGapFew: { icon: Target, text: "keywords.insightTitleGapFew" },
  titleCrowded: { icon: Lock, text: "keywords.insightTitleCrowded" },
  qualityBar: { icon: Star, text: "keywords.insightQualityBar" },
  weakCompetitors: { icon: TrendDown, text: "keywords.insightWeakCompetitors" },
};

const RANK_QUALITY: Record<ReturnType<typeof rankQuality>, MessageKey> = {
  excellent: "keywords.rankExcellent",
  strong: "keywords.rankStrong",
  moderate: "keywords.rankModerate",
  low: "keywords.rankLow",
};

const TIER_HIGHLIGHTS: Record<TierHighlightKey, MessageKey> = {
  tierNoCompetitors: "keywords.tierNoCompetitors",
  tierOpenSpots: "keywords.tierOpenSpots",
  tierReviewsEasiest: "keywords.tierReviewsEasiest",
  tierReviewsNeeded: "keywords.tierReviewsNeeded",
  tierReviewsBreakIn: "keywords.tierReviewsBreakIn",
  tierReviewsEstablished: "keywords.tierReviewsEstablished",
  tierWeakBeatable: "keywords.tierWeakBeatable",
  tierNoEasyTargets: "keywords.tierNoEasyTargets",
  tierFreshEntrants: "keywords.tierFreshEntrants",
  tierTitleNone: "keywords.tierTitleNone",
  tierTitleFew: "keywords.tierTitleFew",
  tierTitleMany: "keywords.tierTitleMany",
};

/** Numbers get thousand separators; strings (app/genre names) pass through. */
const fmtParams = (params: Record<string, string | number>) =>
  Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? fmt(v) : v]),
  );

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

function Meter({ value, className }: { value: number; className?: string }) {
  const tone = difficultyTone(value);
  return (
    <div className={cn("h-1 rounded-full bg-muted", className)}>
      <div
        className={cn("h-1 rounded-full", TONE_BAR[tone] ?? "bg-muted-foreground")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** One "how hard is it to rank" column: score, bar, weakest app, bullets. */
function TierCard({
  label,
  tier,
  tierSize,
}: {
  label: string;
  tier: RankingTier;
  tierSize: number;
}) {
  const t = useTranslations();
  const tone = difficultyTone(tier.tierScore);
  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium">{label}</span>
          <span className={cn("text-base font-semibold tabular-nums", TONE_TEXT[tone])}>
            {tier.tierScore}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </span>
        <Badge variant="secondary" className={cn("font-medium", TONE_BADGE[tone])}>
          {tier.label}
        </Badge>
      </div>
      <Meter value={tier.tierScore} />
      <p className="truncate text-xs text-muted-foreground">
        {t("keywords.detailTierWeakest", { name: tier.weakestApp || "–" })}
      </p>
      <ul className="space-y-1 border-t pt-2">
        {tierHighlights(tier, tierSize).map(({ key, params }) => (
          <li key={key} className="flex gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="text-muted-foreground/50">
              •
            </span>
            <span>{t(TIER_HIGHLIGHTS[key], fmtParams(params))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full-width "how hard is it to rank" card – one column per tier. */
function RankingTiersCard({ tiers }: { tiers: DifficultyBreakdown["rankingTiers"] }) {
  const t = useTranslations();
  return (
    <Collapsible defaultOpen className="rounded-lg border bg-background/60">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90">
        <CaretRight className="size-3 shrink-0 transition-transform" />
        {t("keywords.detailTiers")}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 p-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
        <TierCard label={t("keywords.detailTierTop5")} tier={tiers.top5} tierSize={5} />
        <TierCard label={t("keywords.detailTierTop10")} tier={tiers.top10} tierSize={10} />
        <TierCard label={t("keywords.detailTierTop20")} tier={tiers.top20} tierSize={20} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Actionable opportunity signals, mirroring respectaso's green panel. */
function OpportunityCard({
  breakdown,
  competitors,
}: {
  breakdown: DifficultyBreakdown;
  competitors: CompetitorSnapshot[] | null;
}) {
  const t = useTranslations();
  const signals = deriveOpportunities(breakdown, competitors ?? []);
  return (
    <section className="flex h-full flex-col gap-2 rounded-lg border bg-background/60 p-3">
      <h4 className="text-xs font-medium text-muted-foreground">
        {t("keywords.oppTitle")}
      </h4>
      {signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("keywords.oppNone")}</p>
      ) : (
        <ul className="flex flex-1 flex-col justify-around gap-2.5">
          {signals.map(({ key, strength, tone, params }) => {
            const { icon: SignalIcon, name, detail } = OPPORTUNITIES[key];
            return (
              <li key={key} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <SignalIcon className={cn("size-3.5 shrink-0", TONE_TEXT[tone])} />
                  <span className="text-xs font-medium">{t(name)}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "px-1.5 py-0 text-[10px] font-medium",
                      TONE_BADGE[strength === "strong" ? "green" : "yellow"],
                    )}
                  >
                    {t(
                      strength === "strong"
                        ? "keywords.oppStrengthStrong"
                        : "keywords.oppStrengthModerate",
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(detail, fmtParams(params))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Downloads-by-position strip, 1–20; the app's own rank is highlighted. */
// Same hue for both halves of a bar, as in respectaso: the conservative
// estimate is solid, the optimistic extension above it barely tinted. The
// user's own rank swaps purple for gold.
const BAR_COLORS = {
  low: "bg-purple-500",
  high: "bg-purple-500/25",
  ownLow: "bg-amber-400",
  ownHigh: "bg-amber-400/35",
} as const;

// The plot grows into whatever height the row's tallest card imposes.
const CHART_MIN_HEIGHT = 64;

/**
 * Daily downloads per search position: stacked low/high bars, a rank axis and
 * a hover readout. Positions whose optimistic estimate is below one download
 * are collapsed into a trailing "N+" marker instead of invisible bars.
 */
function DownloadChart({
  positions,
  rank,
  label,
}: {
  positions: DownloadPosition[];
  rank: number | null;
  label: string;
}) {
  const t = useTranslations();
  const shown = positions.filter((p) => p.downloadsHigh >= 1);
  const [hovered, setHovered] = useState<number | null>(null);
  const top = positions[0];
  const max = Math.max(top?.downloadsHigh ?? 0, 1);

  // The readout falls back to the app's own rank, else the top position.
  const readout =
    positions.find((p) => p.pos === (hovered ?? rank)) ?? shown[0] ?? top;

  // Ticks at the top position's conservative and optimistic estimates plus
  // their midpoint; deduped so a zero-width range does not stack labels.
  const mid = (top.downloadsLow + top.downloadsHigh) / 2;
  const ticks = [...new Set([top.downloadsHigh, mid, top.downloadsLow, 0])];

  if (shown.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("keywords.detailBelowOne")}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {/* Grid so the rank axis inherits the plot's column geometry exactly –
          duplicating the widths by hand drifts by a few pixels. */}
      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-x-1.5">
        {/* Labels sit on their own value, so each lines up with its gridline.
            The in-flow span only exists to give the column its width. */}
        <div
          className="relative text-right text-[10px] tabular-nums text-muted-foreground"
          aria-hidden
        >
          <span className="invisible">{fmt(top.downloadsHigh)}</span>
          {ticks.map((value) => (
            <span
              key={value}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(value / max) * 100}%` }}
            >
              {fmt(value)}
            </span>
          ))}
        </div>
        <div
          className="relative flex min-h-0 min-w-0 items-end gap-px border-b border-l"
          style={{ minHeight: CHART_MIN_HEIGHT }}
          role="group"
          aria-label={label}
        >
          {/* Gridlines for every tick except the 0 baseline, which the
              container's bottom border already draws. */}
          {ticks
            .filter((value) => value > 0)
            .map((value) => (
              <span
                key={value}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
                style={{ bottom: `${(value / max) * 100}%` }}
              />
            ))}
          {shown.map((p) => {
            const own = p.pos === rank;
            const lowShare = (p.downloadsLow / p.downloadsHigh) * 100;
            return (
              // Full-height hit area so the whole column is hoverable, not
              // just the few pixels of a short bar.
              <button
                key={p.pos}
                type="button"
                aria-label={t("keywords.detailBarLabel", {
                  rank: p.pos,
                  range: range(p.downloadsLow, p.downloadsHigh),
                })}
                onMouseEnter={() => setHovered(p.pos)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.pos)}
                onBlur={() => setHovered(null)}
                className={cn(
                  "flex h-full flex-1 flex-col justify-end outline-none",
                  hovered === p.pos && "bg-foreground/10",
                )}
              >
                <span
                  className="flex w-full flex-col justify-end"
                  style={{ height: `${Math.max(3, (p.downloadsHigh / max) * 100)}%` }}
                >
                  <span
                    className={cn(
                      "w-full rounded-t-[2px]",
                      own ? BAR_COLORS.ownHigh : BAR_COLORS.high,
                    )}
                    style={{ height: `${100 - lowShare}%` }}
                  />
                  <span
                    className={cn("w-full", own ? BAR_COLORS.ownLow : BAR_COLORS.low)}
                    style={{ height: `${lowShare}%` }}
                  />
                </span>
              </button>
            );
          })}
          {shown.length < positions.length && (
            <span className="shrink-0 self-end pl-1 text-[10px] tabular-nums text-muted-foreground">
              {shown.length + 1}+
            </span>
          )}
        </div>
        {/* Rank axis: second grid row, so it shares the plot's column. pl-px
            offsets the plot's left border. */}
        <div aria-hidden />
        <div className="flex min-w-0 gap-px pt-0.5 pl-px text-[10px] tabular-nums text-muted-foreground">
          {shown.map((p) => (
            <span key={p.pos} className="flex-1 text-center">
              {p.pos}
            </span>
          ))}
          {/* Same text as the "N+" marker, so the rank labels stay aligned. */}
          {shown.length < positions.length && (
            <span aria-hidden className="pl-1 opacity-0">
              {shown.length + 1}+
            </span>
          )}
        </div>
      </div>
      <p className="flex items-baseline justify-between gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs">
        <span className="font-medium">
          {t("keywords.detailTopRank", { rank: readout.pos })}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {t("keywords.detailPerDay", {
            range: range(readout.downloadsLow, readout.downloadsHigh),
          })}
        </span>
      </p>
    </div>
  );
}

// Match strength → letter colour: exact phrase reads strongest, a partial
// word match stays legible rather than greyed out.
const HIGHLIGHT_TONE: Record<HighlightTier, ScoreTone> = {
  exact: "green",
  all: "amber",
  partial: "blue",
};

/** Every occurrence of the keyword's words in an app name, tinted by tier. */
function highlightKeyword(name: string, keyword: string): ReactNode {
  const { tier, segments } = highlightTitle(name, keyword);
  if (!tier) return name;
  return segments.map(({ text, match }, i) =>
    match ? (
      <span key={i} className={cn("font-semibold", TONE_TEXT[HIGHLIGHT_TONE[tier]])}>
        {text}
      </span>
    ) : (
      <span key={i}>{text}</span>
    ),
  );
}

function CompetitorTable({
  competitors,
  keyword,
  rank,
}: {
  competitors: CompetitorSnapshot[];
  keyword: string;
  rank: number | null;
}) {
  const t = useTranslations();
  return (
    <Collapsible className="rounded-lg border bg-background/60">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90">
        <CaretRight className="size-3 shrink-0 transition-transform" />
        {t("keywords.detailCompetitors")}
        <span className="tabular-nums">({competitors.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 w-8 text-xs">#</TableHead>
              <TableHead className="h-8 text-xs">{t("keywords.detailCompApp")}</TableHead>
              <TableHead className="h-8 text-right text-xs">{t("keywords.detailCompRating")}</TableHead>
              <TableHead className="h-8 text-right text-xs">{t("keywords.detailCompRatings")}</TableHead>
              <TableHead className="h-8 text-xs">{t("keywords.detailCompGenre")}</TableHead>
              <TableHead className="h-8 text-xs">{t("keywords.detailCompPrice")}</TableHead>
              <TableHead className="h-8 text-xs">{t("keywords.detailCompReleased")}</TableHead>
              <TableHead className="h-8 text-xs">{t("keywords.detailCompUpdated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.map((app, i) => (
              <TableRow
                key={app.trackId ?? `${app.trackName}-${i}`}
                className={cn(i + 1 === rank && "bg-green-500/5 hover:bg-green-500/10")}
              >
                <TableCell className="py-1.5 text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {app.artworkUrl100 && (
                      <img
                        src={app.artworkUrl100}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded-lg border"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <a
                        href={app.trackViewUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-56 truncate text-xs font-medium hover:underline"
                      >
                        {highlightKeyword(app.trackName, keyword)}
                      </a>
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">
                        {app.sellerName}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right text-xs tabular-nums whitespace-nowrap">
                  {app.averageUserRating > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Star weight="fill" className="size-3 text-yellow-500" />
                      {app.averageUserRating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-right text-xs tabular-nums">
                  {fmt(app.userRatingCount)}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">
                  {app.primaryGenreName || "–"}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  {app.formattedPrice || "–"}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  {app.releaseDate ? formatDate(app.releaseDate) : "–"}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  {app.currentVersionReleaseDate
                    ? formatDate(app.currentVersionReleaseDate)
                    : "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Panel detailing a keyword's difficulty: market signals, sub-scores,
 * top 5/10/20 tiers, estimated daily downloads and top results.
 */
export function DifficultyDetail({
  breakdown,
  popularity,
  country,
  rank,
  keyword,
  competitors,
}: {
  breakdown: DifficultyBreakdown | null;
  popularity: number | null;
  country: string;
  rank: number | null;
  keyword: string;
  competitors: CompetitorSnapshot[] | null;
}) {
  const t = useTranslations();
  const [allStorefronts] = usePersistedBool(DOWNLOADS_ALL_STOREFRONTS_KEY, false);
  const calibrated = country === DOWNLOADS_CALIBRATED_COUNTRY || allStorefronts;
  const downloads =
    popularity !== null && calibrated ? estimateDownloads(popularity, country) : null;
  const atRank = downloads && rank !== null && rank >= 1 && rank <= 20
    ? { rank, ...downloads.positions[rank - 1] }
    : null;

  if (!breakdown) {
    return <p className="text-sm text-muted-foreground">{t("keywords.detailNoDetails")}</p>;
  }

  return (
    // whitespace-normal: the panel lives inside a TableCell, which forces nowrap.
    <div className="space-y-4 text-sm whitespace-normal">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className={cn("font-medium", TONE_BADGE[difficultyTone(breakdown.totalScore)])}
        >
          {breakdown.interpretation}
        </Badge>
        {deriveInsights(breakdown, competitors ?? []).map(({ key, tone, params }) => {
          const { icon: InsightIcon, text, detail } = INSIGHTS[key];
          const badge = (
            <Badge
              variant="outline"
              className="gap-1.5 bg-background/60 font-normal text-muted-foreground"
            >
              <InsightIcon className={cn("size-3 shrink-0", TONE_TEXT[tone])} />
              {t(text, fmtParams(params))}
            </Badge>
          );
          return detail ? (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-help">
                  {badge}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {t(detail, fmtParams(params))}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Fragment key={key}>{badge}</Fragment>
          );
        })}
      </div>

      {/* No items-start: the cards stretch so the row shares the tallest height. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OpportunityCard breakdown={breakdown} competitors={competitors} />

        <section className="flex h-full flex-col gap-2 rounded-lg border bg-background/60 p-3">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t("keywords.detailBreakdown")}
          </h4>
          <div className="flex flex-1 flex-col justify-around gap-1.5">
            {SUB_SCORES.map(([field, key, tip, weight]) => (
              <div key={field} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1 text-xs">
                  <span className="truncate">{t(key)}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t(key)}
                        className="shrink-0 cursor-help text-muted-foreground"
                      >
                        <Info className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {t(tip)} {t("keywords.subWeight", { weight })}
                    </TooltipContent>
                  </Tooltip>
                </span>
                <Meter value={breakdown[field]} className="w-16 shrink-0" />
                <span
                  className={cn(
                    "w-8 shrink-0 text-right text-xs font-semibold tabular-nums",
                    TONE_TEXT[difficultyTone(breakdown[field])],
                  )}
                >
                  {breakdown[field]}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t pt-2 text-xs text-muted-foreground">
            {t("keywords.detailMedianAvg", {
              median: fmt(breakdown.medianReviews),
              avg: fmt(breakdown.avgReviews),
            })}
          </p>
        </section>

        {downloads && (
          <section className="flex h-full flex-col gap-2 rounded-lg border bg-background/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                {t("keywords.detailDownloads")}
              </h4>
              <span className="text-xs text-muted-foreground">
                {t("keywords.detailSearchesPerDay", { count: fmt(downloads.dailySearches) })}
              </span>
            </div>
            <DownloadChart
              positions={downloads.positions}
              rank={rank}
              label={t("keywords.detailPositionStrip")}
            />
            {atRank && (
              <p
                className={cn(
                  "border-t pt-2 text-xs font-medium",
                  TONE_TEXT[rankTone(atRank.rank)],
                )}
              >
                {t("keywords.detailAtRank", {
                  rank: atRank.rank,
                  range: range(atRank.downloadsLow, atRank.downloadsHigh),
                })}{" "}
                <span className="font-normal">
                  ({t(RANK_QUALITY[rankQuality(atRank.rank)])})
                </span>
              </p>
            )}
          </section>
        )}
      </div>

      {breakdown.rankingTiers && <RankingTiersCard tiers={breakdown.rankingTiers} />}

      {competitors && competitors.length > 0 && (
        <CompetitorTable competitors={competitors} keyword={keyword} rank={rank} />
      )}
    </div>
  );
}
