import type { LocalePreference, SupportedLocale } from "./types";
import {
  LOCALE_COOKIE_KEY,
  LOCALE_PREF_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from "./types";
import { resolveLocale } from "./resolve-locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value);
}

/** Resolve locale from request cookies and Accept-Language (pure – testable). */
export function resolveLocaleFromRequest(opts: {
  resolvedCookie?: string | null;
  prefCookie?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  const { resolvedCookie, prefCookie, acceptLanguage } = opts;

  if (isSupportedLocale(resolvedCookie)) {
    return resolvedCookie;
  }

  if (isSupportedLocale(prefCookie)) {
    return prefCookie;
  }

  return resolveLocale("system", acceptLanguage ?? "en");
}

/** Write locale cookies on the client after preference changes. */
export function writeLocaleCookies(
  preference: LocalePreference,
  locale: SupportedLocale,
): void {
  if (typeof document === "undefined") return;
  const base = `path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  document.cookie = `${LOCALE_PREF_COOKIE_KEY}=${preference};${base}`;
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale};${base}`;
}

/**
 * Inline bootstrap script – runs before React hydrates.
 * Restores the preference cookie from localStorage in case cookies were
 * cleared, so the next SSR request matches the stored preference. All locale
 * matching happens in resolveLocaleFromRequest – nothing is duplicated here.
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){
  try {
    var pref=localStorage.getItem("${LOCALE_STORAGE_KEY}");
    if(pref&&document.cookie.indexOf("${LOCALE_PREF_COOKIE_KEY}=")===-1){
      document.cookie="${LOCALE_PREF_COOKIE_KEY}="+pref+";path=/;max-age=${COOKIE_MAX_AGE};samesite=lax";
    }
  }catch(e){}
})();`;
