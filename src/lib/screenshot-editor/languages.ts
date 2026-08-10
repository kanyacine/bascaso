/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Language-model operations: ASC-locale normalization, the global language switch
// (switchGlobalLanguage, app.js:4738-4753), translation collection and write-back
// (aiTranslateAll/applyTranslations/translateAllText, app.js:5081-5675). Pure – shared
// by the reducer and the export loop.
import type { ScreenshotDoc, TextSettings } from "./types";

const LEGACY = "en";
const CANONICAL = "en-US";

function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!(from in record)) return record;
  const { [from]: value, ...rest } = record;
  return { ...rest, [to]: value };
}

function renameInList(list: string[], from: string, to: string): string[] {
  if (!list.includes(from)) return list;
  return list.map((l) => (l === from ? to : l));
}

function renameInText(text: TextSettings, from: string, to: string): TextSettings {
  return {
    ...text,
    headlines: renameKey(text.headlines, from, to),
    subheadlines: renameKey(text.subheadlines, from, to),
    headlineLanguages: renameInList(text.headlineLanguages, from, to),
    subheadlineLanguages: renameInList(text.subheadlineLanguages, from, to),
    currentHeadlineLang: text.currentHeadlineLang === from ? to : text.currentHeadlineLang,
    currentSubheadlineLang: text.currentSubheadlineLang === from ? to : text.currentSubheadlineLang,
    currentLayoutLang: text.currentLayoutLang === from ? to : text.currentLayoutLang,
    languageSettings: renameKey(text.languageSettings, from, to),
  };
}

/** Rename legacy bare "en" (phase 2/3 docs) to the ASC locale "en-US". Idempotent. */
export function normalizeDocLanguages(doc: ScreenshotDoc): ScreenshotDoc {
  const hasLegacy = doc.projectLanguages.includes(LEGACY) || doc.currentLanguage === LEGACY;
  if (!hasLegacy || doc.projectLanguages.includes(CANONICAL)) return doc;
  return {
    ...doc,
    currentLanguage: doc.currentLanguage === LEGACY ? CANONICAL : doc.currentLanguage,
    projectLanguages: renameInList(doc.projectLanguages, LEGACY, CANONICAL),
    defaults: { ...doc.defaults, text: renameInText(doc.defaults.text, LEGACY, CANONICAL) },
    screenshots: doc.screenshots.map((shot) => ({
      ...shot,
      localizedImages: renameKey(shot.localizedImages, LEGACY, CANONICAL),
      text: renameInText(shot.text, LEGACY, CANONICAL),
      elements: shot.elements.map((el) =>
        el.texts && LEGACY in el.texts ? { ...el, texts: renameKey(el.texts, LEGACY, CANONICAL) } : el,
      ),
    })),
  };
}

/**
 * Switch the working language. Port of switchGlobalLanguage (app.js:4738) – also aligns
 * currentLayoutLang (appscreen leaves it stale, so exports could use the wrong per-language
 * layout for position/offset – deliberate fix).
 */
export function docWithLanguage(doc: ScreenshotDoc, language: string): ScreenshotDoc {
  return {
    ...doc,
    currentLanguage: language,
    screenshots: doc.screenshots.map((shot) => ({
      ...shot,
      text: {
        ...shot.text,
        currentHeadlineLang: language,
        currentSubheadlineLang: language,
        currentLayoutLang: language,
      },
    })),
  };
}

export interface TranslatableItem {
  kind: "headline" | "subheadline" | "element";
  index: number;
  elementId?: string;
  text: string;
}

/** Everything worth translating from sourceLanguage. Element source is texts[src] only –
 *  the el.text legacy mirror holds the last-edited language, whatever it was. */
export function collectTranslatableItems(doc: ScreenshotDoc, sourceLanguage: string): TranslatableItem[] {
  const items: TranslatableItem[] = [];
  doc.screenshots.forEach((shot, index) => {
    const headline = shot.text.headlines[sourceLanguage]?.trim();
    if (headline) items.push({ kind: "headline", index, text: headline });
    const subheadline = shot.text.subheadlines[sourceLanguage]?.trim();
    if (subheadline) items.push({ kind: "subheadline", index, text: subheadline });
    for (const el of shot.elements) {
      if (el.type !== "text") continue;
      const text = el.texts?.[sourceLanguage]?.trim();
      if (text) items.push({ kind: "element", index, elementId: el.id, text });
    }
  });
  return items;
}

export interface TranslationEntry {
  kind: "headline" | "subheadline" | "element";
  index: number;
  elementId?: string;
  language: string;
  value: string;
}

/** Write translations back into a doc copy. Subheadline entries enable the subheadline
 *  (appscreen behavior, app.js:5648). Invalid targets are skipped. */
export function applyTranslationEntries(doc: ScreenshotDoc, entries: TranslationEntry[]): ScreenshotDoc {
  const valid = entries.filter((e) => {
    const shot = doc.screenshots[e.index];
    if (!shot) return false;
    if (e.kind === "element") return shot.elements.some((el) => el.id === e.elementId);
    return true;
  });
  if (valid.length === 0) return doc;
  const screenshots = doc.screenshots.map((shot) => structuredClone(shot));
  for (const entry of valid) {
    const shot = screenshots[entry.index];
    if (entry.kind === "headline") {
      shot.text.headlines = { ...shot.text.headlines, [entry.language]: entry.value };
    } else if (entry.kind === "subheadline") {
      shot.text.subheadlines = { ...shot.text.subheadlines, [entry.language]: entry.value };
      shot.text.subheadlineEnabled = true;
    } else {
      const el = shot.elements.find((e) => e.id === entry.elementId)!;
      el.texts = { ...el.texts, [entry.language]: entry.value };
    }
  }
  return { ...doc, screenshots };
}
