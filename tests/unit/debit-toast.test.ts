import { beforeEach, describe, expect, it, vi } from "vitest";

const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));
const invalidate = vi.fn();
const fetchAccount = vi.fn();
vi.mock("@/lib/hooks/use-managed-account", () => ({
  invalidateManagedAccount: invalidate,
  fetchManagedAccount: fetchAccount,
}));

const t = (key: string, params?: Record<string, string | number>) => `${key}:${params?.count ?? ""}`;

describe("notifyManagedDebit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing for non-managed tiers", async () => {
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("byok", t as never);
    expect(invalidate).not.toHaveBeenCalled();
    expect(fetchAccount).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("invalidates and toasts the fresh balance for pay-per-use", async () => {
    fetchAccount.mockResolvedValue({ email: "a@b.c", username: null, balance: 239, subscribed: false });
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("managed", t as never);
    expect(invalidate).toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith("ai.debitToast:239");
  });

  it("stays silent for subscribers – nothing was debited", async () => {
    fetchAccount.mockResolvedValue({ email: "a@b.c", username: null, balance: 0, subscribed: true });
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("managed", t as never);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  // The balance read is cosmetic; a signed-out or unreachable account must not turn a
  // successful generation into a toast about nothing.
  it("stays silent when the account read comes back empty", async () => {
    fetchAccount.mockResolvedValue(null);
    const { notifyManagedDebit } = await import("@/lib/ai/debit-toast");
    await notifyManagedDebit("managed", t as never);
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
