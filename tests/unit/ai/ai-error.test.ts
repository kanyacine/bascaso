import { describe, expect, it } from "vitest";
import { aiErrorMessage } from "@/lib/ai/ai-error";
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

// Garde anti-dérive : run-manager.ts écrit ces codes, le dialogue de run les lit.
// Les deux côtés lisaient auparavant deux listes séparées, donc ajouter un code
// d'un côté cessait silencieusement de l'afficher de l'autre.
describe("MANAGED_WORKFLOW_ERROR_CODES", () => {
  it("couvre exactement les codes que run-manager sait produire", async () => {
    const { MANAGED_WORKFLOW_ERROR_CODES } = await import("@/lib/ai/ai-error");
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/ai/workflows/run-manager.ts", "utf8"));
    const produced = new Set(
      [...src.matchAll(/"(ai_[a-z_]+)"/g)].map((m) => m[1]),
    );
    expect([...produced].sort()).toEqual([...MANAGED_WORKFLOW_ERROR_CODES].sort());
  });

  it("chaque code a bien une traduction dédiée, pas le message générique", () => {
    const t = ((key: string) => key) as never;
    for (const code of ["ai_credits_exhausted", "ai_rate_limited", "ai_action_exhausted", "ai_auth_error"]) {
      expect(aiErrorMessage(code, t)).not.toBe("errors.aiRequestFailed");
    }
  });
});
