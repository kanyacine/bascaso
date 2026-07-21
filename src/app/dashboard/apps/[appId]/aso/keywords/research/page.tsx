"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { CaretDown, CaretUp, Info, Plus, X } from "@phosphor-icons/react";
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
import { TONE_CLASSES, type TagScore } from "@/components/keyword-tag-input";
import { localeName } from "@/lib/asc/locale-names";
import {
  appendKeywordToField,
  compareResearchRows,
  mergeKeywords,
  parseResearchInput,
  type ResearchSortColumn,
} from "@/lib/aso/research";
import { opportunityTone } from "@/lib/aso/score-display";
import { storefrontCountryCode } from "@/lib/aso/storefront-country";
import { storefrontsByLocale } from "@/lib/asc/storefronts";
import { useKeywordScores } from "@/lib/hooks/use-keyword-scores";
import { usePersistedState } from "@/lib/hooks/use-persisted-range";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import { useKeywords } from "../_components/keywords-context";
import { StorefrontPicker } from "../_components/storefront-picker";

const SORTABLE = [
  { column: "keyword", key: "keywords.researchKeyword" },
  { column: "popularity", key: "keywords.scorePopularity" },
  { column: "difficulty", key: "keywords.scoreDifficulty" },
  { column: "opportunity", key: "keywords.scoreOpportunity" },
] as const;

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
  const getTagScore = useKeywordScores(
    keywords,
    storefrontCountryCode(storefront),
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
                  {SORTABLE.map(({ column, key }) => (
                    <TableHead
                      key={column}
                      onClick={() => toggleSort(column)}
                      className={cn(
                        "cursor-pointer select-none",
                        column !== "keyword" && "text-center",
                      )}
                    >
                      {t(key)}
                      {sortIndicator(column)}
                    </TableHead>
                  ))}
                  <TableHead>{t("keywords.researchVerdict")}</TableHead>
                  <TableHead
                    onClick={() => toggleSort("rank")}
                    className="cursor-pointer select-none text-center"
                  >
                    <span className="inline-flex items-center gap-1">
                      {t("keywords.researchRank")}
                      {sortIndicator("rank")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {t("keywords.researchRankTooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ keyword, score }) => (
                  <ResearchRow
                    key={keyword}
                    keyword={keyword}
                    score={score}
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
  readOnly,
  locales,
  onAddToLocale,
  onRemove,
}: {
  keyword: string;
  score: TagScore | undefined;
  readOnly: boolean;
  locales: { attributes: { locale: string; keywords: string | null } }[];
  onAddToLocale: (locale: string, current: string | null, keyword: string) => void;
  onRemove: (keyword: string) => void;
}) {
  const t = useTranslations();
  const done = score?.status === "done" ? score : null;

  const cell = (value: number | null | undefined) =>
    score?.status === "loading" ? (
      <Spinner className="mx-auto size-3 text-muted-foreground" />
    ) : (
      <span className="tabular-nums">{value ?? "–"}</span>
    );

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{keyword}</TableCell>
      <TableCell className="text-center text-sm">{cell(done?.popularity)}</TableCell>
      <TableCell className="text-center text-sm">{cell(done?.difficulty)}</TableCell>
      <TableCell className="text-center">
        {score?.status === "loading" ? (
          <Spinner className="mx-auto size-3 text-muted-foreground" />
        ) : done ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${TONE_CLASSES[opportunityTone(done.opportunity)]}`}
          >
            {done.opportunity}
          </span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">–</span>
            </TooltipTrigger>
            <TooltipContent>{t("keywords.scoreUnavailable")}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {done?.classification ?? "–"}
      </TableCell>
      <TableCell className="text-center text-sm">{cell(done?.rank)}</TableCell>
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
