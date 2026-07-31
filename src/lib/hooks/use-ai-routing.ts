import { useState, useEffect, useSyncExternalStore } from "react";
import type { RoutingState } from "@/components/settings/ai-routing-section";

// `undefined` = not fetched yet, `null` = unreachable. Same sentinel convention as
// use-managed-account.
let cachedRouting: RoutingState | null | undefined = undefined;
let version = 0;
const listeners = new Set<() => void>();

/** The read in flight, shared by everyone mounting at once. Same reason as the sibling
 *  store in use-managed-account: the module cache alone only dedupes AFTER a response
 *  lands, so five wand buttons mounting together still fire five requests – the very
 *  thing the docstring below promises they do not. Tagged with the version it started
 *  under, so a response landing after an invalidation is discarded, not written back. */
let inFlight: { version: number; promise: Promise<RoutingState | null> } | null = null;

/** One `/api/settings/ai`, whoever asks and however many ask at once. Exported for the
 *  same reason as the sibling `fetchManagedAccount`: the coalescing is what needs
 *  testing, and it is testable without a renderer. */
export function fetchRouting(): Promise<RoutingState | null> {
  if (cachedRouting !== undefined) return Promise.resolve(cachedRouting);
  if (inFlight) return inFlight.promise;
  const startedAt = version;
  const promise = fetch("/api/settings/ai")
    .then(async (res) => {
      const data = res.ok ? await res.json().catch(() => null) : null;
      const routing = (data?.routing as RoutingState | undefined) ?? null;
      if (startedAt === version) cachedRouting = routing;
      return routing;
    })
    .catch(() => {
      // Not cached: a transient outage must not pin "no routing" until the next
      // invalidate, which would hide every cost hint for the rest of the session.
      return null;
    })
    .finally(() => {
      if (inFlight?.version === startedAt) inFlight = null;
    });
  inFlight = { version: startedAt, promise };
  return promise;
}

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
    void fetchRouting().then((routing) => {
      if (!cancelled) setFetchResult({ routing, forVersion: v });
    });

    return () => { cancelled = true; };
  }, [v]);

  return { routing };
}

/** Drop the cached routing (after the AI settings page changes a group's tier). */
export function invalidateAIRouting() {
  cachedRouting = undefined;
  inFlight = null;
  version++;
  listeners.forEach((cb) => cb());
}
