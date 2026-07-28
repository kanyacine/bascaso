import type { en } from "./locales/en";

export type SupportedLocale = "en" | "zh-CN" | "fr" | "de" | "ru";

/** User-facing preference – "system" resolves against the OS locale. */
export type LocalePreference = "system" | SupportedLocale;

type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringMap<T[K]>;
};

/** Message tree shape – leaf values are translated strings. */
export type Messages = DeepStringMap<typeof en>;

export const LOCALE_STORAGE_KEY = "bascaso-locale";

/** Resolved locale stored for SSR. */
export const LOCALE_COOKIE_KEY = "bascaso-locale-resolved";

/** Stored preference ("system" or a supported locale). */
export const LOCALE_PREF_COOKIE_KEY = "bascaso-locale-pref";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  "en",
  "zh-CN",
  "fr",
  "de",
  "ru",
];
