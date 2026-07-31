import { useSyncExternalStore } from "react";
import { getPurchasePending, subscribePurchasePoll } from "@/lib/managed/purchase-poll";

/** Whether a purchase opened from anywhere is still waiting to land. The state lives
 *  in purchase-poll.ts, outside React, so it survives the card that started it. */
export function usePurchasePending(): boolean {
  return useSyncExternalStore(subscribePurchasePoll, getPurchasePending, getPurchasePending);
}
