import { useState, useEffect, useSyncExternalStore } from "react";
import type { RoutingState } from "@/components/settings/ai-routing-section";

// `undefined` = not fetched yet, `null` = unreachable. Same sentinel convention as
// use-managed-account.
let cachedRouting: RoutingState | null | undefined = undefined;
let version = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getVersion() { return version; }

/** Which tier each AI group resolves to. Read by every cost hint on the app's AI entry
 *  points, so it is module-cached: a page with five wand buttons must not fetch
 *  `/api/settings/ai` five times. */
export function useAIRouting(): { routing: RoutingState | null } {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);

  const [fetchResult, setFetchResult] = useState<{
    routing: RoutingState | null;
    forVersion: number;
  } | null>(() => cachedRouting !== undefined ? { routing: cachedRouting, forVersion: v } : null);

  const resultCurrent = fetchResult?.forVersion === v;
  const routing = cachedRouting !== undefined
    ? cachedRouting
    : (resultCurrent ? fetchResult.routing : null);

  useEffect(() => {
    if (cachedRouting !== undefined) return;

    let cancelled = false;
    fetch("/api/settings/ai")
      .then(async (res) => {
        if (cancelled) return;
        const data = res.ok ? await res.json().catch(() => null) : null;
        cachedRouting = (data?.routing as RoutingState | undefined) ?? null;
        setFetchResult({ routing: cachedRouting, forVersion: v });
      })
      .catch(() => {
        // Not cached: a transient outage must not pin "no routing" until the next
        // invalidate, which would hide every cost hint for the rest of the session.
        if (cancelled) return;
        setFetchResult({ routing: null, forVersion: v });
      });

    return () => { cancelled = true; };
  }, [v]);

  return { routing };
}

/** Drop the cached routing (after the AI settings page changes a group's tier). */
export function invalidateAIRouting() {
  cachedRouting = undefined;
  version++;
  listeners.forEach((cb) => cb());
}
