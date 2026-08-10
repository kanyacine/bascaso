// Export planning – pure. The rendering/upload loops live in the client hook.
import type { ScreenshotDoc } from "./types";

export const ASC_MAX_SCREENSHOTS_PER_SET = 10; // Apple's per-set limit

export type ExportLanguageChoice = "current" | "working" | "working-plus-listing";
export type ExportFormatChoice = "current" | "working";

export interface ExportJob {
  language: string;
  format: string;
  translated: boolean; // true = on-the-fly translation to a listing locale (no review step)
}

export function workingFormats(doc: ScreenshotDoc): string[] {
  return doc.outputDevices ?? [doc.outputDevice];
}

export function buildExportPlan(
  doc: ScreenshotDoc,
  opts: { languages: ExportLanguageChoice; formats: ExportFormatChoice; listingLocales?: string[] },
): ExportJob[] {
  const formats = opts.formats === "current" ? [doc.outputDevice] : workingFormats(doc);
  const languages: { language: string; translated: boolean }[] =
    opts.languages === "current"
      ? [{ language: doc.currentLanguage, translated: false }]
      : doc.projectLanguages.map((language) => ({ language, translated: false }));
  if (opts.languages === "working-plus-listing") {
    for (const locale of opts.listingLocales ?? []) {
      if (!doc.projectLanguages.includes(locale)) languages.push({ language: locale, translated: true });
    }
  }
  return languages.flatMap(({ language, translated }) =>
    formats.map((format) => ({ language, format, translated })),
  );
}

export function exportFileName(language: string, format: string, index: number): string {
  return `${language}/${format}/${index + 1}.png`;
}

export function zipFileName(
  opts: { languages: ExportLanguageChoice; formats: ExportFormatChoice },
  doc: ScreenshotDoc,
): string {
  const lang = opts.languages === "current" ? doc.currentLanguage : "all-languages";
  const format = opts.formats === "current" ? doc.outputDevice : "all-formats";
  return `screenshots_${lang}_${format}.zip`;
}
