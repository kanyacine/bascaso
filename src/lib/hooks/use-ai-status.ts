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

  const [configured, setConfigured] = useState(cachedStatus ?? false);
  const [loading, setLoading] = useState(cachedStatus === null);

  useEffect(() => {
    if (cachedStatus !== null) {
      setConfigured(cachedStatus);
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch("/api/ai/check")
      .then((res) => res.json())
      .then((data: { configured: boolean }) => {
        if (cancelled) return;
        cachedStatus = data.configured;
        setConfigured(data.configured);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setConfigured(false);
        setLoading(false);
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
