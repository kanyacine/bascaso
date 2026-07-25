import { describe, expect, it } from "vitest";
import { aiErrorMessage, MANAGED_WORKFLOW_ERROR_CODES } from "@/lib/ai/ai-error";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("aiErrorMessage", () => {
  it("returns null for ai_not_configured so callers show their own setup prompt", () => {
    expect(aiErrorMessage("ai_not_configured", t)).toBeNull();
  });

  it("maps ai_tier_not_configured to its localized message", () => {
    expect(aiErrorMessage("ai_tier_not_configured", t)).toBe(en.errors.aiTierNotConfigured);
  });

  it("maps apple_fm_unavailable to its localized message", () => {
    expect(aiErrorMessage("apple_fm_unavailable", t)).toBe(en.errors.appleFmUnavailable);
  });

  it("maps apple_fm_input_too_large to its localized message", () => {
    expect(aiErrorMessage("apple_fm_input_too_large", t)).toBe(en.errors.appleFmInputTooLarge);
  });

  it("maps ai_auth_error to the auth error message", () => {
    expect(aiErrorMessage("ai_auth_error", t)).toBe(en.ai.authError);
  });

  it("maps ai_credits_exhausted to its localized message", () => {
    expect(aiErrorMessage("ai_credits_exhausted", t)).toBe(en.errors.aiCreditsExhausted);
  });

  it("maps ai_rate_limited to its localized message", () => {
    expect(aiErrorMessage("ai_rate_limited", t)).toBe(en.errors.aiRateLimited);
  });

  it("maps ai_action_exhausted to its localized message", () => {
    expect(aiErrorMessage("ai_action_exhausted", t)).toBe(en.errors.aiActionExhausted);
  });

  it("falls back to a generic failure message for unknown error codes", () => {
    expect(aiErrorMessage("something_unexpected", t)).toBe(en.errors.aiRequestFailed);
  });

  it("falls back to a generic failure message when no error code is present", () => {
    expect(aiErrorMessage(undefined, t)).toBe(en.errors.aiRequestFailed);
  });
});

// La dérive entre run-manager et l'UI d'un run n'est plus testable parce qu'elle
// n'est plus représentable : les deux dérivent de MANAGED_ERROR_CODE_BY_CATEGORY.
// Reste à vérifier que chaque code de cette source a bien sa traduction dédiée –
// sans quoi le dialogue afficherait le message générique pour un code qui a un sens
// précis. Itère le Set, jamais une liste recopiée : une liste en dur ici recréerait
// exactement la duplication qu'on vient de supprimer.
describe("MANAGED_WORKFLOW_ERROR_CODES", () => {
  it("n'est pas vide", () => {
    expect(MANAGED_WORKFLOW_ERROR_CODES.size).toBeGreaterThan(0);
  });

  it("donne à chaque code une traduction dédiée, jamais le message générique ni null", () => {
    const t = ((key: string) => key) as never;
    for (const code of MANAGED_WORKFLOW_ERROR_CODES) {
      const message = aiErrorMessage(code, t);
      expect(message).not.toBeNull();
      expect(message).not.toBe("errors.aiRequestFailed");
    }
  });
});
