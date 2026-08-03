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

// Drift between run-manager and a run's UI is no longer testable because it is no longer
// representable: both derive from MANAGED_ERROR_CODE_BY_CATEGORY. What is left to check
// is that every code from that source has its own translation – without which the dialog
// would show the generic message for a code that carries a precise meaning. Iterates the
// Set, never a copied list: a hardcoded list here would recreate exactly the duplication
// that was just removed.
describe("MANAGED_WORKFLOW_ERROR_CODES", () => {
  it("is not empty", () => {
    expect(MANAGED_WORKFLOW_ERROR_CODES.size).toBeGreaterThan(0);
  });

  it("gives every code its own translation, never the generic message nor null", () => {
    const t = ((key: string) => key) as never;
    for (const code of MANAGED_WORKFLOW_ERROR_CODES) {
      const message = aiErrorMessage(code, t);
      expect(message).not.toBeNull();
      expect(message).not.toBe("errors.aiRequestFailed");
    }
  });
});
