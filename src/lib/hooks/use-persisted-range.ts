import { useCallback, useSyncExternalStore } from "react";

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {}
}

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * localStorage-backed state via useSyncExternalStore: hydration-safe (server
 * renders the default) without re-rendering a default-value frame on
 * client-side navigations.
 */
export function usePersistedRange(storageKey: string): [string | null, (v: string | null) => void] {
  const range = useSyncExternalStore(
    subscribe,
    () => readStored(storageKey),
    () => null,
  );

  const update = useCallback((v: string | null) => {
    writeStored(storageKey, v);
    emit();
  }, [storageKey]);

  return [range, update];
}

export function usePersistedState(storageKey: string, defaultValue: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readStored(storageKey) ?? defaultValue,
    () => defaultValue,
  );

  const update = useCallback((v: string) => {
    writeStored(storageKey, v);
    emit();
  }, [storageKey]);

  return [value, update];
}

export function usePersistedBool(storageKey: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const stored = readStored(storageKey);
      return stored !== null ? stored === "1" : defaultValue;
    },
    () => defaultValue,
  );

  const update = useCallback((v: boolean) => {
    writeStored(storageKey, v ? "1" : "0");
    emit();
  }, [storageKey]);

  return [value, update];
}
