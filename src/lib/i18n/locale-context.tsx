"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  detectSystemLocale,
  readLocalePreference,
  readNavigatorLocale,
  resolveLocale,
} from "./resolve-locale";
import { writeLocaleCookies } from "./locale-cookies";
import { setDateLocale } from "@/lib/format";
import { getMessages, translate, type MessageKey } from "./messages";
import type { LocalePreference, Messages, SupportedLocale } from "./types";
import { LOCALE_STORAGE_KEY } from "./types";

/** In-memory override so setPreference works even when localStorage throws. */
let preferenceOverride: LocalePreference | null = null;
/**
 * Seeded synchronously from the navigator so the first client render already
 * resolves the correct system locale; refined via Electron IPC after mount.
 */
let systemLocaleTag = readNavigatorLocale();
let clientReady = false;
/** Locale frozen for SSR hydration – set from the server on each request. */
let frozenLocale: SupportedLocale = "en";
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY || e.key === null) {
      preferenceOverride = null;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readPreference(): LocalePreference {
  if (preferenceOverride !== null) return preferenceOverride;
  return readLocalePreference();
}

function getSnapshot(): SupportedLocale {
  if (!clientReady) return frozenLocale;
  return resolveLocale(readPreference(), systemLocaleTag);
}

function getServerSnapshot(): SupportedLocale {
  return frozenLocale;
}

function getServerPreferenceSnapshot(): LocalePreference {
  return "system";
}

function scheduleClientActivation(onActivate: () => void) {
  // Defer until after all Suspense boundaries finish hydrating.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      onActivate();
    });
  });
}

interface LocaleContextValue {
  locale: SupportedLocale;
  preference: LocalePreference;
  messages: Messages;
  setPreference: (preference: LocalePreference) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  /** True after client hydration – safe to read browser-only preference state. */
  hydrated: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLocale;
  children: React.ReactNode;
}) {
  frozenLocale = initialLocale;

  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    getServerPreferenceSnapshot,
  );
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Keep the shared date-formatting locale in sync before children render.
  setDateLocale(locale);

  useEffect(() => {
    let cancelled = false;

    scheduleClientActivation(() => {
      if (cancelled) return;
      clientReady = true;
      emitChange();
      void detectSystemLocale().then((tag) => {
        if (cancelled) return;
        const changed = tag !== systemLocaleTag;
        systemLocaleTag = tag;
        const pref = readPreference();
        writeLocaleCookies(pref, resolveLocale(pref, systemLocaleTag));
        if (changed) emitChange();
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setPreference = useCallback((next: LocalePreference) => {
    preferenceOverride = next;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    const resolved = resolveLocale(next, systemLocaleTag);
    writeLocaleCookies(next, resolved);
    emitChange();
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      translate(messages, key, params),
    [messages],
  );

  const value = useMemo(
    () => ({ locale, preference, messages, setPreference, t, hydrated }),
    [locale, preference, messages, setPreference, t, hydrated],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useTranslations() {
  return useLocale().t;
}
