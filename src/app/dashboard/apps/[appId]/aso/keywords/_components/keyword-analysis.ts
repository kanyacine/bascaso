import type { AscLocalization } from "@/lib/asc/localizations";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import { localeName } from "@/lib/asc/locale-names";
import { resolveExchangeableLocale, storefrontsByLocale } from "@/lib/asc/storefronts";

export interface LocaleKeywordData {
  locale: string;
  /** The actual locale providing keywords (may differ via fallback, e.g. en-US for en-CA). */
  resolvedLocale: string;
  keywords: string[];
  keywordsRaw: string;
  charsUsed: number;
  charsFree: number;
  /** Keywords that overlap with app name or subtitle words for this locale. */
  overlapsWithMetadata: string[];
}

export interface StorefrontAnalysis {
  indexedLocales: string[];
  activeLocales: string[];
  missingLocales: string[];
  localeData: LocaleKeywordData[];
  totalCharsUsed: number;
  totalBudget: number;
  /** keyword → list of locales it appears in (only if > 1). */
  crossLocaleDuplicates: Map<string, string[]>;
  totalOverlaps: number;
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getMetadataWords(
  locale: string,
  appInfoLocalizations: AscAppInfoLocalization[],
): Set<string> {
  const loc = appInfoLocalizations.find((l) => l.attributes.locale === locale);
  if (!loc) return new Set();
  const words = new Set<string>();
  for (const text of [loc.attributes.name ?? "", loc.attributes.subtitle ?? ""]) {
    for (const word of text.toLowerCase().split(/[\s\-–/&]+/)) {
      const trimmed = word.trim();
      if (trimmed.length > 1) words.add(trimmed);
    }
  }
  return words;
}

export function analyzeStorefront(
  storefrontLocales: string[],
  versionLocalizations: AscLocalization[],
  appInfoLocalizations: AscAppInfoLocalization[],
): StorefrontAnalysis {
  const locByLocale = new Map<string, AscLocalization>();
  for (const loc of versionLocalizations) {
    locByLocale.set(loc.attributes.locale, loc);
  }
  const availableLocales = new Set(locByLocale.keys());

  const activeLocales: string[] = [];
  const missingLocales: string[] = [];
  const localeData: LocaleKeywordData[] = [];

  for (const locale of storefrontLocales) {
    // Try exact match first, then exchangeable fallback
    const resolved = resolveExchangeableLocale(locale, availableLocales) ?? locale;
    const loc = locByLocale.get(resolved);
    if (!loc) {
      missingLocales.push(locale);
      continue;
    }

    activeLocales.push(locale);
    const raw = loc.attributes.keywords ?? "";
    const keywords = splitKeywords(raw);
    const metadataWords = getMetadataWords(locale, appInfoLocalizations);

    const overlaps = keywords.filter((kw) =>
      kw.split(/\s+/).some((w) => metadataWords.has(w)),
    );

    localeData.push({
      locale,
      resolvedLocale: resolved,
      keywords,
      keywordsRaw: raw,
      charsUsed: raw.length,
      charsFree: Math.max(0, 100 - raw.length),
      overlapsWithMetadata: overlaps,
    });
  }

  // Detect cross-locale duplicates, but skip when locales resolve to the same source
  const keywordToLocales = new Map<string, string[]>();
  for (const ld of localeData) {
    for (const kw of ld.keywords) {
      const existing = keywordToLocales.get(kw) ?? [];
      existing.push(ld.locale);
      keywordToLocales.set(kw, existing);
    }
  }
  const crossLocaleDuplicates = new Map<string, string[]>();
  const resolvedByLocale = new Map(localeData.map((ld) => [ld.locale, ld.resolvedLocale]));
  for (const [kw, locales] of keywordToLocales) {
    // Only count as duplicate if the locales resolve to different actual sources
    const uniqueResolved = new Set(locales.map((l) => resolvedByLocale.get(l)));
    if (uniqueResolved.size > 1) crossLocaleDuplicates.set(kw, locales);
  }

  const totalCharsUsed = localeData.reduce((sum, ld) => sum + ld.charsUsed, 0);
  const totalOverlaps = localeData.reduce((sum, ld) => sum + ld.overlapsWithMetadata.length, 0);

  return {
    indexedLocales: storefrontLocales,
    activeLocales,
    missingLocales,
    localeData,
    totalCharsUsed,
    totalBudget: storefrontLocales.length * 100,
    crossLocaleDuplicates,
    totalOverlaps,
  };
}

/**
 * Analyse all user localizations (no storefront filter).
 * Shows per-locale keyword health + how many storefronts each locale reaches.
 */
export function analyzeAllLocales(
  versionLocalizations: AscLocalization[],
  appInfoLocalizations: AscAppInfoLocalization[],
): StorefrontAnalysis {
  const allLocales = versionLocalizations.map((l) => l.attributes.locale);
  const localeData: LocaleKeywordData[] = [];

  for (const loc of versionLocalizations) {
    const locale = loc.attributes.locale;
    const raw = loc.attributes.keywords ?? "";
    const keywords = splitKeywords(raw);
    const metadataWords = getMetadataWords(locale, appInfoLocalizations);
    const overlaps = keywords.filter((kw) =>
      kw.split(/\s+/).some((w) => metadataWords.has(w)),
    );

    localeData.push({
      locale,
      resolvedLocale: locale,
      keywords,
      keywordsRaw: raw,
      charsUsed: raw.length,
      charsFree: Math.max(0, 100 - raw.length),
      overlapsWithMetadata: overlaps,
    });
  }

  localeData.sort((a, b) => localeName(a.locale).localeCompare(localeName(b.locale)));

  // Detect cross-locale duplicates – if two locales share a keyword
  // they're likely co-indexed in at least one storefront
  const keywordToLocales = new Map<string, string[]>();
  for (const ld of localeData) {
    for (const kw of ld.keywords) {
      const existing = keywordToLocales.get(kw) ?? [];
      existing.push(ld.locale);
      keywordToLocales.set(kw, existing);
    }
  }
  const crossLocaleDuplicates = new Map<string, string[]>();
  for (const [kw, locales] of keywordToLocales) {
    if (locales.length > 1) crossLocaleDuplicates.set(kw, locales);
  }

  const totalCharsUsed = localeData.reduce((sum, ld) => sum + ld.charsUsed, 0);
  const totalOverlaps = localeData.reduce((sum, ld) => sum + ld.overlapsWithMetadata.length, 0);

  return {
    indexedLocales: allLocales,
    activeLocales: allLocales,
    missingLocales: [],
    localeData,
    totalCharsUsed,
    totalBudget: allLocales.length * 100,
    crossLocaleDuplicates,
    totalOverlaps,
  };
}
