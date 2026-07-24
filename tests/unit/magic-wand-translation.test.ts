import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { fetchTranslation } from "@/components/magic-wand-button";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("fetchTranslation", () => {
  beforeEach(() => {
    mockToastError.mockClear();
    vi.unstubAllGlobals();
  });

  it("surfaces a localized toast and does not apply the result when /api/ai fails (e.g. apple_fm_unavailable)", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: "apple_fm_unavailable" }),
      }),
    );

    await fetchTranslation(
      { baseValue: "Hello", field: "whatsNew", fromLocale: "en-US", toLocale: "fr-FR" },
      t,
      onChange,
    );

    expect(mockToastError).toHaveBeenCalledWith(en.errors.appleFmUnavailable);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("surfaces a generic toast when the fetch itself throws (network error)", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await fetchTranslation(
      { baseValue: "Hello", field: "whatsNew", fromLocale: "en-US", toLocale: "fr-FR" },
      t,
      onChange,
    );

    expect(mockToastError).toHaveBeenCalledWith(en.errors.aiRequestFailed);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies the result on success and shows no toast", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: "Bonjour" }),
      }),
    );

    await fetchTranslation(
      { baseValue: "Hello", field: "whatsNew", fromLocale: "en-US", toLocale: "fr-FR" },
      t,
      onChange,
    );

    expect(onChange).toHaveBeenCalledWith("Bonjour");
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
