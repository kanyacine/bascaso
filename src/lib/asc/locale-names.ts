export const LOCALE_NAMES: Record<string, string> = {
  "ar-SA": "Arabic",
  "ca": "Catalan",
  "cs": "Czech",
  "da": "Danish",
  "de-DE": "German",
  "el": "Greek",
  "en-AU": "English (Australia)",
  "en-CA": "English (Canada)",
  "en-GB": "English (UK)",
  "en-US": "English (US)",
  "es-ES": "Spanish (Spain)",
  "es-MX": "Spanish (Mexico)",
  "fi": "Finnish",
  "fr-CA": "French (Canada)",
  "fr-FR": "French (France)",
  "he": "Hebrew",
  "hi": "Hindi",
  "hr": "Croatian",
  "hu": "Hungarian",
  "id": "Indonesian",
  "it": "Italian",
  "ja": "Japanese",
  "ko": "Korean",
  "ms": "Malay",
  "nl-NL": "Dutch",
  "no": "Norwegian",
  "pl": "Polish",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  "ro": "Romanian",
  "ru": "Russian",
  "sk": "Slovak",
  "sv": "Swedish",
  "th": "Thai",
  "tr": "Turkish",
  "uk": "Ukrainian",
  "vi": "Vietnamese",
  "zh-Hans": "Chinese (Simplified)",
  "zh-Hant": "Chinese (Traditional)",
};

/** Case-insensitive lookup map: uppercase key → canonical key in LOCALE_NAMES. */
const LOCALE_UPPER: Record<string, string> = Object.fromEntries(
  Object.keys(LOCALE_NAMES).map((k) => [k.toUpperCase(), k]),
);

/** Normalise an ASC locale code (which may be ALL-CAPS) to our canonical form. */
export function normalizeLocale(code: string): string {
  return LOCALE_UPPER[code.toUpperCase()] ?? code;
}

export function localeName(locale: string): string {
  return LOCALE_NAMES[locale] ?? LOCALE_NAMES[normalizeLocale(locale)] ?? locale;
}

/** Sort locales: primary locale first, rest alphabetical by display name. */
export function sortLocales(codes: string[], primaryLocale: string): string[] {
  return [...codes].sort((a, b) => {
    if (a === primaryLocale) return -1;
    if (b === primaryLocale) return 1;
    return localeName(a).localeCompare(localeName(b));
  });
}

export const FIELD_LIMITS: Record<string, number> = {
  name: 30,
  subtitle: 30,
  description: 4000,
  keywords: 100,
  whatsNew: 4000,
  promotionalText: 170,
  supportUrl: 2048,
  marketingUrl: 2048,
  reviewNotes: 4000,
};

/** Minimum character lengths enforced by the ASC API (empty is allowed). */
export const FIELD_MIN_LIMITS: Record<string, number> = {
  name: 2,
  description: 10,
  whatsNew: 4,
};
