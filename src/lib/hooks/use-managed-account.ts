import { useState, useEffect, useSyncExternalStore } from "react";
import { isManagedSubscriptionActive } from "@/lib/managed/client";

export interface ManagedAccountInfo {
  email: string;
  username: string | null;
  balance: number;
  subscribed: boolean;
}

/** Pure mapping from the /api/managed/me response – exported for tests. */
export function parseManagedAccount(ok: boolean, body: unknown): ManagedAccountInfo | null {
  if (!ok || body === null || typeof body !== "object") return null;
  const b = body as { email?: unknown; username?: unknown; balance?: unknown; subscription?: unknown };
  // No email means no account to show, whatever else the body carries: a 200 without one
  // is a shape we do not recognise, and inventing a blank label for it would put an empty
  // row in the sidebar footer.
  if (typeof b.email !== "string") return null;
  return {
    email: b.email,
    username: typeof b.username === "string" ? b.username : null,
    balance: typeof b.balance === "number" ? b.balance : 0,
    subscribed: isManagedSubscriptionActive(
      b.subscription as Parameters<typeof isManagedSubscriptionActive>[0],
    ),
  };
}

// `undefined` = not fetched yet, `null` = signed out or unreachable. Two distinct states:
// without the sentinel, a signed-out account would be refetched on every mount.
let cachedAccount: ManagedAccountInfo | null | undefined = undefined;
let version = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getVersion() { return version; }

/** The account behind the managed tier, shared by the sidebar footer, the account menu,
 *  the AI settings page and the wizard. Module-cached so those four surfaces read one
 *  `/api/managed/me` per invalidation, not one each. Same shape as use-ai-status. */
export function useManagedAccount(): { account: ManagedAccountInfo | null; loading: boolean } {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);

  const [fetchResult, setFetchResult] = useState<{
    account: ManagedAccountInfo | null;
    forVersion: number;
  } | null>(() => cachedAccount !== undefined ? { account: cachedAccount, forVersion: v } : null);

  const resultCurrent = fetchResult?.forVersion === v;
  const account = cachedAccount !== undefined
    ? cachedAccount
    : (resultCurrent ? fetchResult.account : null);
  const loading = cachedAccount === undefined && !resultCurrent;

  useEffect(() => {
    if (cachedAccount !== undefined) return;

    let cancelled = false;
    fetch("/api/managed/me")
      .then(async (res) => {
        if (cancelled) return;
        cachedAccount = parseManagedAccount(res.ok, await res.json().catch(() => null));
        setFetchResult({ account: cachedAccount, forVersion: v });
      })
      .catch(() => {
        // Network failure reads as signed out for this version but is NOT written to the
        // cache: a transient outage must not pin "no account" until the next invalidate.
        if (cancelled) return;
        setFetchResult({ account: null, forVersion: v });
      });

    return () => { cancelled = true; };
  }, [v]);

  return { account, loading };
}

/** Drop the cached account (after signing in or out, a purchase, a rename, a debit). */
export function invalidateManagedAccount() {
  cachedAccount = undefined;
  version++;
  listeners.forEach((cb) => cb());
}
