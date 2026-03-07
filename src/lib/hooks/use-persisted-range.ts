import { useState, useCallback, useEffect } from "react";

function readStored(key: string): string | null {
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

export function usePersistedRange(storageKey: string): [string | null, (v: string | null) => void] {
  const [range, setRange] = useState<string | null>(null);

  useEffect(() => {
    setRange(readStored(storageKey));
  }, [storageKey]);

  const update = useCallback((v: string | null) => {
    setRange(v);
    writeStored(storageKey, v);
  }, [storageKey]);

  return [range, update];
}
