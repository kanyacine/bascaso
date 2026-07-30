import { toast } from "sonner";
import { invalidateManagedAccount } from "@/lib/hooks/use-managed-account";
import { isManagedSubscriptionActive } from "@/lib/managed/client";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Post-debit feedback for a completed managed AI gesture: refresh the shared
 *  account store and surface the new balance. Best-effort – a failed balance
 *  read must never turn a successful generation into an error. */
export async function notifyManagedDebit(tier: string | undefined, t: Translate): Promise<void> {
  if (tier !== "managed") return;
  invalidateManagedAccount();
  try {
    const res = await fetch("/api/managed/me");
    if (!res.ok) return;
    const data = await res.json();
    // A subscriber was not debited: telling them a credit was spent would be false.
    if (isManagedSubscriptionActive(data.subscription)) return;
    toast.info(t("ai.debitToast", { count: data.balance }));
  } catch {
    // Balance toast is cosmetic; the footer store refreshes on its own.
  }
}
