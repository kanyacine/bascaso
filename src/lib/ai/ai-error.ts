import type { MessageKey } from "@/lib/i18n/messages";
import type { AIErrorCategory } from "@/lib/ai/provider-factory";

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

/** Catégorie d'échec du proxy managé → code stocké dans `workflow_runs.error`.
 *  Source unique : `run-manager.ts` écrit d'après cette map, l'UI d'un run traduit
 *  d'après le Set qui en dérive. Les deux listes étaient auparavant écrites à la main
 *  chacune de son côté – ajouter un code d'un seul côté cessait silencieusement de
 *  l'afficher de l'autre. Ici la dérive n'est plus représentable.
 *  Import de type seulement : rien de `provider-factory` n'entre dans le bundle client. */
export const MANAGED_ERROR_CODE_BY_CATEGORY: Partial<Record<AIErrorCategory, string>> = {
  credits: "ai_credits_exhausted",
  rate_limited: "ai_rate_limited",
  action_exhausted: "ai_action_exhausted",
  auth: "ai_auth_error",
  permission: "ai_auth_error",
};

/** Seuls codes qu'une UI de run doit traduire : toute autre valeur de
 *  `workflow_runs.error` (panne iTunes, bug interne…) reste un message brut – il serait
 *  faux d'annoncer « requête IA échouée » pour une cause qui n'est pas l'IA. */
export const MANAGED_WORKFLOW_ERROR_CODES: ReadonlySet<string> =
  new Set(Object.values(MANAGED_ERROR_CODE_BY_CATEGORY));
