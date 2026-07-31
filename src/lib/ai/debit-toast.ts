import { toast } from "sonner";
import {
  fetchManagedAccount,
  invalidateManagedAccount,
} from "@/lib/hooks/use-managed-account";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Post-debit feedback for a completed managed AI gesture: refresh the shared
 *  account store and surface the new balance. Best-effort – a failed balance
 *  read must never turn a successful generation into an error.
 *
 *  Reads through the store's own coalesced fetch rather than calling
 *  `/api/managed/me` directly: the footer is refreshing for the same reason at the
 *  same moment, and two identical cloud reads per AI action is one too many. */
export async function notifyManagedDebit(tier: string | undefined, t: Translate): Promise<void> {
  if (tier !== "managed") return;
  invalidateManagedAccount();
  const account = await fetchManagedAccount();
  if (!account) return;
  // A subscriber was not debited: telling them a credit was spent would be false.
  if (account.subscribed) return;
  toast.info(t("ai.debitToast", { count: account.balance }));
}
