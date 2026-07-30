import { toast } from "sonner";
import { aiErrorMessage, type Translate } from "@/lib/ai/ai-error";
import { openManagedTopUp } from "@/lib/hooks/use-managed-topup";

/** Toast a failed AI response. Drop-in for the
 *  `toast.error(aiErrorMessage(code, t) ?? t("errors.aiRequestFailed"))` pattern,
 *  with one addition: the credits-exhausted toast carries a top-up action that
 *  opens the purchase dialog right where the user hit the wall – the settings
 *  round-trip was the main conversion hole. Callers that branch on
 *  aiErrorMessage's null (their own "set up AI" prompt) keep calling it directly.
 *
 *  Separate module from ai-error.ts on purpose: that one is imported by
 *  run-manager.ts, hence by instrumentation.ts, hence server-side. Pulling sonner
 *  and a React hook into it takes the whole dev server down with
 *  "useSyncExternalStore only works in a Client Component". */
export function toastAIError(errorCode: string | undefined, t: Translate): void {
  const message = aiErrorMessage(errorCode, t) ?? t("errors.aiRequestFailed");
  if (errorCode === "ai_credits_exhausted") {
    toast.error(message, {
      action: { label: t("settings.account.topUp"), onClick: () => openManagedTopUp() },
    });
    return;
  }
  toast.error(message);
}
