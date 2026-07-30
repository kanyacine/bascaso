import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError } }));
const openTopUp = vi.fn();
vi.mock("@/lib/hooks/use-managed-topup", () => ({ openManagedTopUp: openTopUp }));

const t = (key: string) => key;

describe("toastAIError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts the mapped message for a plain error", async () => {
    const { toastAIError } = await import("@/lib/ai/ai-error-toast");
    toastAIError("ai_rate_limited", t as never);
    expect(toastError).toHaveBeenCalledWith("errors.aiRateLimited");
  });

  it("falls back to the generic message for ai_not_configured – same as the ?? pattern it replaces", async () => {
    const { toastAIError } = await import("@/lib/ai/ai-error-toast");
    toastAIError("ai_not_configured", t as never);
    expect(toastError).toHaveBeenCalledWith("errors.aiRequestFailed");
  });

  it("attaches a top-up action for exhausted credits", async () => {
    const { toastAIError } = await import("@/lib/ai/ai-error-toast");
    toastAIError("ai_credits_exhausted", t as never);
    expect(toastError).toHaveBeenCalledWith(
      "errors.aiCreditsExhausted",
      expect.objectContaining({ action: expect.objectContaining({ label: "settings.account.topUp" }) }),
    );
    const action = toastError.mock.calls[0][1].action as { onClick: () => void };
    action.onClick();
    expect(openTopUp).toHaveBeenCalled();
  });
});
