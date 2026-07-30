/** Catalog shapes shared by the managed tier's purchase surfaces. Moved out of the
 *  purchase dialog when it became ManagedAccountCard, so pure pricing logic can be
 *  unit-tested without a component tree. */

export interface Pack {
  sku: string;
  credits: number;
  /** Minor units, as Stripe returns them – formatted at render time, never stored.
   *  Always present: the backend omits a pack whose price it cannot resolve
   *  rather than serving it without one. */
  amount: number;
  currency: string;
}

export interface Catalog {
  packs: Pack[];
  subscription: { sku: string; amount: number; currency: string; interval: string } | null;
}

/** Empty catalog, set when the request itself does not land.
 *  `null` means "not asked yet": leaving that state after a failure rendered a
 *  completely mute purchase section – no button, no message, no way to know
 *  anything had gone wrong. Empty is a result, not the absence of one, and it
 *  carries the same message as the empty catalog the backend returns when Stripe
 *  is down on its side. */
export const EMPTY_CATALOG: Catalog = { packs: [], subscription: null };

/** SKU of the pack with the lowest per-credit price – the one the card tags as
 *  best value. Null when there is nothing to compare (fewer than two priced
 *  packs): a lone pack is not "the best" of anything. First pack wins a tie. */
export function bestValueSku(packs: Pack[]): string | null {
  const priced = packs.filter((p) => p.credits > 0);
  if (priced.length < 2) return null;
  return priced.reduce((best, p) => (p.amount / p.credits < best.amount / best.credits ? p : best)).sku;
}

/** Price of one credit in minor units, rounded – display only, never billed.
 *  A non-positive credit count cannot happen with the current backend, but a
 *  division by zero here would poison the whole card render. */
export function perCreditAmount(pack: Pack): number {
  if (pack.credits <= 0) return pack.amount;
  return Math.round(pack.amount / pack.credits);
}

/** Account state captured when a checkout opens, compared against later reads. */
export interface PurchaseSnapshot {
  balance: number;
  subscribed: boolean;
}

/** Whether the purchase started at `before` has visibly landed: the balance rose
 *  (pack) or the subscription switched on. A dropping balance is a debit from a
 *  concurrent AI action, not a failed purchase. */
export function purchaseLanded(before: PurchaseSnapshot, after: PurchaseSnapshot): boolean {
  return after.balance > before.balance || (!before.subscribed && after.subscribed);
}
