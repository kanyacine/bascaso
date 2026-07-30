import { useState, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n/locale-context";
import { isManagedSubscriptionActive } from "@/lib/managed/client";

export interface ManagedAccountInfo {
  email: string;
  username: string | null;
  balance: number;
  subscribed: boolean;
  /** Set only for a subscription that is still active but will not renew: the date
   *  it stops. Cancelling in the Stripe portal does not end the subscription, it
   *  clears the renewal – so the app keeps honouring it until this date and says
   *  when it runs out, rather than dropping the user to credits on the spot. */
  endsAt: string | null;
}

/** Pure mapping from the /api/managed/me response – exported for tests. */
export function parseManagedAccount(ok: boolean, body: unknown): ManagedAccountInfo | null {
  if (!ok || body === null || typeof body !== "object") return null;
  const b = body as { email?: unknown; username?: unknown; balance?: unknown; subscription?: unknown };
  const sub = (b.subscription ?? null) as { cancelAtPeriodEnd?: unknown; currentPeriodEnd?: unknown } | null;
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
    // Only meaningful alongside an end date: "will not renew" with no date to show
    // is a warning the UI cannot phrase, so it stays null and nothing is claimed.
    endsAt:
      sub?.cancelAtPeriodEnd === true && typeof sub.currentPeriodEnd === "string"
        ? sub.currentPeriodEnd
        : null,
  };
}

// `undefined` = not fetched yet, `null` = signed out or unreachable. Two distinct states:
// without the sentinel, a signed-out account would be refetched on every mount.
let cachedAccount: ManagedAccountInfo | null | undefined = undefined;
let version = 0;
const listeners = new Set<() => void>();

// Whether the last read saw an account, and whether the one after it lost the session.
// Module state because `cachedAccount` is wiped to `undefined` by every invalidation –
// including the one that precedes the refetch – so it cannot answer "was there an
// account before this response?". Exported through takeSessionExpired below, which
// clears the flag so one expiry produces one toast.
let wasSignedIn = false;
let sessionExpired = false;

/** True exactly once per expiry, for whichever consumer asks first. */
export function takeSessionExpired(): boolean {
  if (!sessionExpired) return false;
  sessionExpired = false;
  return true;
}

/** The read in flight, shared by everyone who wants the account right now. Without it
 *  the module cache only dedupes AFTER a response lands: every mounted consumer (the
 *  footer always is) fires its own request on each invalidation, and every managed AI
 *  action invalidates. Tagged with the version it was started under, so a response
 *  that lands after an invalidation is discarded rather than written back. */
let inFlight: { version: number; promise: Promise<ManagedAccountInfo | null> } | null = null;

/** One `/api/managed/me`, whoever asks and however many ask at once. Exported so
 *  `notifyManagedDebit` reads the fresh balance through the same request the store is
 *  already making, instead of opening a second one alongside it. */
export function fetchManagedAccount(): Promise<ManagedAccountInfo | null> {
  // Cache first: this is "give me the account", not "go ask the server". Callers that
  // want fresh data invalidate first (notifyManagedDebit does exactly that).
  if (cachedAccount !== undefined) return Promise.resolve(cachedAccount);
  if (inFlight) return inFlight.promise;
  const startedAt = version;
  const promise = fetch("/api/managed/me")
    .then(async (res) => {
      const account = parseManagedAccount(res.ok, await res.json().catch(() => null));
      // A 401 for an account we were holding a second ago is a session that expired or
      // was revoked – not a user who signed out. The app used to fall silently back to
      // the signed-out UI, which reads as data loss: the balance vanishes, the AI
      // starts refusing, and nothing says why or what to do.
      if (res.status === 401 && wasSignedIn) sessionExpired = true;
      wasSignedIn = account !== null;
      // Only write back if nothing invalidated meanwhile: a response describing the
      // state we just invalidated would undo the refresh it was meant to trigger.
      if (version === startedAt) cachedAccount = account;
      return account;
    })
    .catch(() => {
      // Network failure reads as signed out for this round but is NOT written to the
      // cache: a transient outage must not pin "no account" until the next invalidate.
      return null;
    })
    .finally(() => {
      // Guarded so a stale request settling late cannot clear a newer one.
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

/** The account behind the managed tier, shared by the sidebar footer, the account menu,
 *  the AI settings page and the wizard. Module-cached AND request-coalesced, so those
 *  surfaces cost one `/api/managed/me` per invalidation between them, not one each.
 *  Same shape as use-ai-status. */
export function useManagedAccount(): { account: ManagedAccountInfo | null; loading: boolean } {
  const t = useTranslations();
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
    void fetchManagedAccount().then((account) => {
      // Announced even if this consumer unmounted meanwhile: the flag is one-shot, and
      // swallowing it here would lose the only notice the user gets.
      if (takeSessionExpired()) toast.error(t("settings.account.sessionExpired"));
      if (cancelled) return;
      setFetchResult({ account, forVersion: v });
    });

    return () => { cancelled = true; };
  }, [v, t]);

  return { account, loading };
}

/** Drop the cached account (after signing in or out, a purchase, a rename, a debit). */
export function invalidateManagedAccount() {
  cachedAccount = undefined;
  // A read started before this point describes the state we just invalidated; bumping
  // the version first makes it discard its own result when it lands (see fetchManagedAccount).
  version++;
  inFlight = null;
  listeners.forEach((cb) => cb());
}
