import { toast } from "sonner";
import type { MessageKey } from "@/lib/i18n/messages";
import { fetchManagedAccount, invalidateManagedAccount } from "@/lib/hooks/use-managed-account";
import { purchaseLanded, type PurchaseSnapshot } from "@/lib/managed/catalog";

/** Balance refresh after a checkout opens, owned by the module rather than by the
 *  card that started it. Stripe is paid in the browser, seconds or minutes later,
 *  and by then the surface that opened it is usually gone: the top-up dialog was
 *  closed, the wizard moved to the next step, the user changed page. A poller held
 *  in component state dies with that component and the balance then only catches up
 *  on the next manual refresh – which is exactly the moment a user concludes the
 *  payment did not go through. Module state outlives every surface, so the credits
 *  land wherever the purchase was started from. */

const POLL_MS = 5_000;
/** ~2 min of polling. Stripe checkout is a card form, not a bank redirect; past
 *  this the window is more likely abandoned than slow, and the focus listener
 *  below catches a late return anyway. */
const MAX_TICKS = 24;

let timer: ReturnType<typeof setInterval> | null = null;
let before: PurchaseSnapshot | null = null;
let onFocus: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

/** Exported for useSyncExternalStore and tests – not for components. */
export function subscribePurchasePoll(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPurchasePending(): boolean {
  return before !== null;
}

export function stopPurchasePoll(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // No window guard here: onFocus is only ever assigned inside one, so a non-null
  // handler is proof there was a window to register it on.
  if (onFocus) {
    window.removeEventListener("focus", onFocus);
    onFocus = null;
  }
  if (before !== null) {
    before = null;
    emit();
  }
}

/** Watch the account until the purchase started at `snapshot` shows up, then
 *  announce it. A second purchase replaces the running poll rather than stacking
 *  another one. `t` is captured at click time: the toast has to fire from here,
 *  since by then there may be no card mounted to fire it. */
export function startPurchasePoll(snapshot: PurchaseSnapshot, t: (key: MessageKey) => string): void {
  stopPurchasePoll();
  before = snapshot;
  emit();

  let ticks = 0;
  const check = async () => {
    const started = before;
    if (!started) return;
    invalidateManagedAccount();
    const after = await fetchManagedAccount();
    // `before` is re-read rather than closed over: a stop between the fetch
    // starting and landing means this poll is no longer the current one.
    if (after && before === started && purchaseLanded(started, after)) {
      stopPurchasePoll();
      toast.success(t("settings.account.purchaseLanded"));
    }
  };

  // Coming back from the browser is the strongest signal there is that the payment
  // is done – far better than waiting out the rest of the interval.
  if (typeof window !== "undefined") {
    onFocus = () => void check();
    window.addEventListener("focus", onFocus);
  }

  timer = setInterval(() => {
    if (++ticks > MAX_TICKS) {
      // Gave up: back to idle without claiming success or failure.
      stopPurchasePoll();
      return;
    }
    void check();
  }, POLL_MS);
}
