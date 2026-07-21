"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { CaretDown, CaretUp, Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
import type { TagScore } from "@/components/keyword-tag-input";
import { localeName } from "@/lib/asc/locale-names";
import {
  appendKeywordToField,
  compareResearchRows,
  mergeKeywords,
  parseResearchInput,
  type ResearchSortColumn,
} from "@/lib/aso/research";
import {
  classificationTone,
  difficultyTone,
  opportunityTone,
  popularityTone,
  rankTone,
  TONE_TEXT,
  type ScoreTone,
} from "@/lib/aso/score-display";
import { storefrontCountryCode } from "@/lib/aso/storefront-country";
import { storefrontsByLocale } from "@/lib/asc/storefronts";
import { useKeywordScores } from "@/lib/hooks/use-keyword-scores";
import { usePersistedState } from "@/lib/hooks/use-persisted-range";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import { DifficultyDetail } from "../_components/difficulty-detail";
import { useKeywords } from "../_components/keywords-context";
import { StorefrontPicker } from "../_components/storefront-picker";

const HEADERS = [
  { column: "keyword", label: "keywords.researchKeyword", tooltip: null },
  { column: "popularity", label: "keywords.scorePopularity", tooltip: "keywords.researchPopularityTooltip" },
  { column: "difficulty", label: "keywords.scoreDifficulty", tooltip: "keywords.researchDifficultyTooltip" },
  { column: "opportunity", label: "keywords.scoreOpportunity", tooltip: "keywords.researchOpportunityTooltip" },
  { column: "classification", label: "keywords.researchVerdict", tooltip: "keywords.researchVerdictTooltip" },
  { column: "rank", label: "keywords.researchRank", tooltip: "keywords.researchRankTooltip" },
] as const;

// The classification labels themselves stay in English (API values).
const VERDICT_TOOLTIPS = {
  "Sweet Spot": "keywords.verdictSweetSpot",
  "Good Target": "keywords.verdictGoodTarget",
  "Hidden Gem": "keywords.verdictHiddenGem",
  "High Competition": "keywords.verdictHighCompetition",
  Moderate: "keywords.verdictModerate",
  "Low Volume": "keywords.verdictLowVolume",
  Avoid: "keywords.verdictAvoid",
} as const;

function readList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export default function KeywordsResearchPage() {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const { app, editedLocalizations, readOnly, loading, handleKeywordsChange } =
    useKeywords();

  const defaultStorefront = useMemo(() => {
    const primaryLocale = app?.primaryLocale ?? "en-US";
    const candidates = storefrontsByLocale(primaryLocale);
    if (candidates.includes("USA") && primaryLocale === "en-US") return "USA";
    return candidates[0] ?? "USA";
  }, [app?.primaryLocale]);
  const [storefront, setStorefront] = useState<string>(defaultStorefront);

  const [stored, setStored] = usePersistedState(`aso-research-${appId}`, "[]");
  const keywords = useMemo(() => readList(stored), [stored]);
  const [input, setInput] = useState("");
  const [sort, setSort] = useState<{ column: ResearchSortColumn; dir: "asc" | "desc" }>(
    { column: "opportunity", dir: "desc" },
  );

  // Demo apps have non-numeric ids – rank stays unavailable there.
  const appleId = Number(app?.id);
  const country = storefrontCountryCode(storefront);
  const getTagScore = useKeywordScores(
    keywords,
    country,
    Number.isInteger(appleId) && appleId > 0 ? appleId : undefined,
  );

  const rows = useMemo(
    () =>
      keywords
        .map((keyword) => ({ keyword, score: getTagScore(keyword) }))
        .sort(compareResearchRows(sort.column, sort.dir)),
    [keywords, getTagScore, sort],
  );

  const addFromInput = () => {
    const added = parseResearchInput(input);
    if (added.length === 0) return;
    setStored(JSON.stringify(mergeKeywords(keywords, added)));
    setInput("");
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addFromInput();
  };

  const removeKeyword = (keyword: string) => {
    setStored(JSON.stringify(keywords.filter((k) => k !== keyword)));
  };

  const addToLocale = (locale: string, current: string | null, keyword: string) => {
    const next = appendKeywordToField(current ?? "", keyword);
    if (next === null) return;
    handleKeywordsChange(locale, next);
    toast.success(t("keywords.addedToLocale", { locale: localeName(locale) }));
  };

  const toggleSort = (column: ResearchSortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "keyword" ? "asc" : "desc" },
    );
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const sortIndicator = (column: ResearchSortColumn) =>
    sort.column === column &&
    (sort.dir === "asc" ? (
      <CaretUp className="ml-1 inline size-3" />
    ) : (
      <CaretDown className="ml-1 inline size-3" />
    ));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <StorefrontPicker value={storefront} onChange={setStorefront} />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={t("keywords.researchPlaceholder")}
          className="max-w-md font-mono"
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("keywords.researchEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {HEADERS.map(({ column, label, tooltip }) => (
                    <TableHead
                      key={column}
                      onClick={() => toggleSort(column)}
                      className={cn(
                        "cursor-pointer select-none",
                        column !== "keyword" &&
                          column !== "classification" &&
                          "text-center",
                      )}
                    >
                      {tooltip ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{t(label)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {t(tooltip)}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        t(label)
                      )}
                      {sortIndicator(column)}
                    </TableHead>
                  ))}
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ keyword, score }) => (
                  <ResearchRow
                    key={keyword}
                    keyword={keyword}
                    score={score}
                    country={country ?? "us"}
                    readOnly={readOnly}
                    locales={editedLocalizations}
                    onAddToLocale={addToLocale}
                    onRemove={removeKeyword}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResearchRow({
  keyword,
  score,
  country,
  readOnly,
  locales,
  onAddToLocale,
  onRemove,
}: {
  keyword: string;
  score: TagScore | undefined;
  country: string;
  readOnly: boolean;
  locales: { attributes: { locale: string; keywords: string | null } }[];
  onAddToLocale: (locale: string, current: string | null, keyword: string) => void;
  onRemove: (keyword: string) => void;
}) {
  const t = useTranslations();
  const done = score?.status === "done" ? score : null;

  const cell = (value: number | null | undefined, tone: ScoreTone) =>
    score?.status === "loading" ? (
      <Spinner className="mx-auto size-3 text-muted-foreground" />
    ) : (
      <span
        className={cn(
          "tabular-nums font-medium",
          TONE_TEXT[value == null ? "muted" : tone],
        )}
      >
        {value ?? "–"}
      </span>
    );

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{keyword}</TableCell>
      <TableCell className="text-center text-sm">
        {cell(done?.popularity, popularityTone(done?.popularity ?? null))}
      </TableCell>
      <TableCell className="text-center text-sm">
        {done ? (
          <DifficultyDetail
            breakdown={done.details ?? null}
            popularity={done.popularity}
            country={country}
            rank={done.rank ?? null}
          >
            <button
              type="button"
              className={cn(
                "cursor-pointer tabular-nums font-medium underline decoration-dotted underline-offset-4",
                TONE_TEXT[difficultyTone(done.difficulty)],
              )}
            >
              {done.difficulty}
            </button>
          </DifficultyDetail>
        ) : (
          cell(undefined, "muted")
        )}
      </TableCell>
      <TableCell className="text-center text-sm">
        {score?.status === "error" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground">–</span>
            </TooltipTrigger>
            <TooltipContent>{t("keywords.scoreUnavailable")}</TooltipContent>
          </Tooltip>
        ) : (
          cell(done?.opportunity, opportunityTone(done?.opportunity ?? 0))
        )}
      </TableCell>
      <TableCell className="text-sm">
        {done ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={TONE_TEXT[classificationTone(done.classification)]}>
                {done.classification}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {t(
                VERDICT_TOOLTIPS[
                  done.classification as keyof typeof VERDICT_TOOLTIPS
                ] ?? "keywords.researchVerdictTooltip",
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell className="text-center text-sm">
        {cell(done?.rank, rankTone(done?.rank ?? null))}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t("keywords.useKeyword")}
              >
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!readOnly && locales.length > 0 && (
                <>
                  <DropdownMenuLabel>{t("keywords.addToLocale")}</DropdownMenuLabel>
                  {locales.map((loc) => {
                    const fits =
                      appendKeywordToField(loc.attributes.keywords ?? "", keyword) !==
                      null;
                    return (
                      <DropdownMenuItem
                        key={loc.attributes.locale}
                        disabled={!fits}
                        onSelect={() =>
                          onAddToLocale(
                            loc.attributes.locale,
                            loc.attributes.keywords,
                            keyword,
                          )
                        }
                      >
                        {localeName(loc.attributes.locale)}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(keyword);
                  toast.success(t("keywords.researchCopied"));
                }}
              >
                {t("common.copy")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={t("keywords.removeKeyword", { keyword })}
            onClick={() => onRemove(keyword)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
