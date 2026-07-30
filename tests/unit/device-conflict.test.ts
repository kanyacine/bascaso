import { describe, expect, it } from "vitest";
import { classifyAIError } from "@/lib/ai/provider-factory";
import { aiErrorMessage, MANAGED_ERROR_CODE_BY_CATEGORY } from "@/lib/ai/ai-error";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

// The whole chain from the proxy's 409 to the toast the user reads runs through four
// files. Each hop is a place a code can be dropped silently, so each hop is pinned.
describe("device_conflict plumbing", () => {
  it("classifies the proxy message by its verbatim code", () => {
    expect(classifyAIError(new Error("device_conflict: compte abonné déjà utilisé"))).toBe("device_conflict");
  });
  it("maps category → client code → localized message", () => {
    expect(MANAGED_ERROR_CODE_BY_CATEGORY.device_conflict).toBe("ai_device_conflict");
    expect(aiErrorMessage("ai_device_conflict", t)).toBe(t("errors.aiDeviceConflict"));
  });
});
