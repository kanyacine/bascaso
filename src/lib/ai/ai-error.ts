import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Map a failed `/api/ai` response's error code to a localized, user-facing
 * message.
 *
 * Returns `null` for `"ai_not_configured"` – callers should show their own
 * "set up AI" prompt (e.g. `AIRequiredDialog`) instead of a toast in that
 * case. Every other code (including unknown/undefined ones) gets a message,
 * so callers never have to fall back to swallowing the error silently.
 */
export function aiErrorMessage(errorCode: string | undefined, t: Translate): string | null {
  switch (errorCode) {
    case "ai_not_configured":
      return null;
    case "ai_tier_not_configured":
      return t("errors.aiTierNotConfigured");
    case "apple_fm_unavailable":
      return t("errors.appleFmUnavailable");
    case "apple_fm_input_too_large":
      return t("errors.appleFmInputTooLarge");
    case "apple_fm_language_unsupported":
      return t("errors.appleFmLanguageUnsupported");
    case "ai_auth_error":
      return t("ai.authError");
    case "ai_credits_exhausted":
      return t("errors.aiCreditsExhausted");
    case "ai_rate_limited":
      return t("errors.aiRateLimited");
    case "ai_action_exhausted":
      return t("errors.aiActionExhausted");
    default:
      return t("errors.aiRequestFailed");
  }
}
