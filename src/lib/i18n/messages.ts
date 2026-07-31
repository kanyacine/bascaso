import { BRAND_NAME } from "@/lib/brand";
import type { SupportedLocale, Messages } from "./types";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import { fr } from "./locales/fr";
import { de } from "./locales/de";
import { ru } from "./locales/ru";

const catalogs: Record<SupportedLocale, Messages> = {
  en: en as Messages,
  "zh-CN": zhCN,
  fr,
  de,
  ru,
};

export function getMessages(locale: SupportedLocale): Messages {
  return catalogs[locale];
}

type NestedKeyOf<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : Prefix
  : {
      [K in keyof T & string]: NestedKeyOf<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type MessageKey = NestedKeyOf<typeof en>;

export function getByPath(obj: object, path: string): string | undefined {
  let current: unknown = obj;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

const INTERPOLATION_PATTERN = /\{(\w+)\}/g;

/** Translate a dot-path message key, with optional `{param}` interpolation.
 *
 *  `{brand}` needs no parameter: it resolves to BRAND_NAME everywhere, so the product
 *  name is spelled in exactly one place instead of being retyped – and drifting – in
 *  five catalogues. That drift was real: screens said "Bascaso", "bascaso cloud" and
 *  "Bascaso cloud" for the same thing, and none of them would have followed a rename. */
export function translate(
  messages: Messages,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const value = getByPath(messages, key);
  if (value === undefined) return key;

  return value.replace(INTERPOLATION_PATTERN, (_, name: string) => {
    const replacement = params?.[name] ?? (name === "brand" ? BRAND_NAME : undefined);
    return replacement == null ? `{${name}}` : String(replacement);
  });
}
