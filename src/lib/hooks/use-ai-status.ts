import { useState, useEffect, useSyncExternalStore } from "react";

let cachedStatus: boolean | null = null;
let version = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getVersion() { return version; }

export function useAIStatus(): { configured: boolean; loading: boolean } {
  // Re-render when invalidateAIStatus() is called
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);

  const [fetchResult, setFetchResult] = useState<{
    configured: boolean;
    forVersion: number;
  } | null>(() => cachedStatus !== null ? { configured: cachedStatus, forVersion: v } : null);

  // Derive status: use cache if available, then fetch result, then defaults
  const resultCurrent = fetchResult?.forVersion === v;
  const configured = cachedStatus ?? (resultCurrent ? fetchResult.configured : false);
  const loading = cachedStatus === null && !resultCurrent;

  useEffect(() => {
    if (cachedStatus !== null) return;

    let cancelled = false;
    fetch("/api/ai/check")
      .then((res) => res.json())
      .then((data: { configured: boolean }) => {
        if (cancelled) return;
        cachedStatus = data.configured;
        setFetchResult({ configured: data.configured, forVersion: v });
      })
      .catch(() => {
        if (cancelled) return;
        setFetchResult({ configured: false, forVersion: v });
      });

    return () => { cancelled = true; };
  }, [v]);

  return { configured, loading };
}

/** Invalidate the cached status (e.g. after saving AI settings). */
export function invalidateAIStatus() {
  cachedStatus = null;
  version++;
  listeners.forEach((cb) => cb());
}
