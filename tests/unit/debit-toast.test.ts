import { beforeEach, describe, expect, it, vi } from "vitest";

const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));
const invalidate = vi.fn();
vi.mock("@/lib/hooks/use-managed-account", () => ({ invalidateManagedAccount: invalidate }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const t = (key: string, params?: Record<string, string | number>) => `${key}:${params?.count ?? ""}`;

describe("notifyManagedDebit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing for non-managed tiers", async () => {
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("byok", t as never);
    expect(invalidate).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("invalidates and toasts the fresh balance for pay-per-use", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ email: "a@b.c", balance: 239, subscription: null })));
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("managed", t as never);
    expect(invalidate).toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith("ai.debitToast:239");
  });

  it("stays silent for subscribers – nothing was debited", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      email: "a@b.c", balance: 0, subscription: { status: "active", currentPeriodEnd: null },
    })));
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("managed", t as never);
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
