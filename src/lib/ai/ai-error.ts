import type { MessageKey } from "@/lib/i18n/messages";
import type { AIErrorCategory } from "@/lib/ai/provider-factory";

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

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
    case "ai_device_conflict":
      return t("errors.aiDeviceConflict");
    case "itunes_unavailable":
      return t("errors.itunesUnavailable");
    case "no_proposal":
      return t("errors.noProposal");
    default:
      return t("errors.aiRequestFailed");
  }
}

/** Managed-proxy failure category → the code stored in `workflow_runs.error`.
 *  Single source: `run-manager.ts` writes from this map, a run's UI translates from the
 *  Set derived from it. The two lists used to be hand-written on each side – adding a
 *  code on one side silently stopped displaying it on the other. Here the drift is no
 *  longer representable.
 *  Type-only import: nothing from `provider-factory` enters the client bundle. */
export const MANAGED_ERROR_CODE_BY_CATEGORY: Partial<Record<AIErrorCategory, string>> = {
  credits: "ai_credits_exhausted",
  rate_limited: "ai_rate_limited",
  action_exhausted: "ai_action_exhausted",
  device_conflict: "ai_device_conflict",
  auth: "ai_auth_error",
  permission: "ai_auth_error",
};

/** The only codes a run's UI should translate: any other `workflow_runs.error` value
 *  (an internal bug…) stays a raw message – announcing "AI request failed" for a cause
 *  that is not the AI would be wrong.
 *  "itunes_unavailable" and "no_proposal" are set directly by run-manager.ts (not
 *  through classifyAIError – they are not AI-proxy failure categories, so they have no
 *  place in MANAGED_ERROR_CODE_BY_CATEGORY) but deserve the same translated treatment:
 *  a run that fails for want of iTunes data, or with no proposal, must say why rather
 *  than stay mute. */
export const MANAGED_WORKFLOW_ERROR_CODES: ReadonlySet<string> = new Set([
  ...Object.values(MANAGED_ERROR_CODE_BY_CATEGORY),
  "itunes_unavailable",
  "no_proposal",
]);
