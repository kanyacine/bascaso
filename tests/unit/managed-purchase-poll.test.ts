import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

const invalidate = vi.fn();
const fetchAccount = vi.fn();
vi.mock("@/lib/hooks/use-managed-account", () => ({
  invalidateManagedAccount: invalidate,
  fetchManagedAccount: fetchAccount,
}));

const t = ((key: string) => key) as never;
const before = { balance: 5, subscribed: false };

async function load() {
  vi.resetModules();
  return import("@/lib/managed/purchase-poll");
}

/** setInterval alone is not enough: each tick awaits a fetch, so the assertions
 *  have to let those microtasks run before looking at the result. */
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("purchase poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fetchAccount.mockResolvedValue(before);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports pending as soon as it starts and notifies subscribers", async () => {
    const mod = await load();
    const cb = vi.fn();
    mod.subscribePurchasePoll(cb);
    expect(mod.getPurchasePending()).toBe(false);
    mod.startPurchasePoll(before, t);
    expect(mod.getPurchasePending()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    mod.stopPurchasePoll();
  });

  it("refreshes the account on every tick while nothing has landed", async () => {
    const mod = await load();
    mod.startPurchasePoll(before, t);
    await tick(5_000);
    await tick(5_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(mod.getPurchasePending()).toBe(true);
    mod.stopPurchasePoll();
  });

  it("announces the purchase and stops once the balance rises", async () => {
    const mod = await load();
    fetchAccount.mockResolvedValue({ balance: 55, subscribed: false });
    mod.startPurchasePoll(before, t);
    await tick(5_000);
    expect(toastSuccess).toHaveBeenCalledWith("settings.account.purchaseLanded");
    expect(mod.getPurchasePending()).toBe(false);
    // stopped: no further refresh
    await tick(5_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("gives up after the tick budget without announcing anything", async () => {
    const mod = await load();
    mod.startPurchasePoll(before, t);
    await tick(5_000 * 25);
    expect(mod.getPurchasePending()).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("ignores a null account (signed out mid-poll)", async () => {
    const mod = await load();
    fetchAccount.mockResolvedValue(null);
    mod.startPurchasePoll(before, t);
    await tick(5_000);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(mod.getPurchasePending()).toBe(true);
    mod.stopPurchasePoll();
  });

  it("replaces a running poll instead of stacking a second one", async () => {
    const mod = await load();
    mod.startPurchasePoll(before, t);
    mod.startPurchasePoll({ balance: 9, subscribed: false }, t);
    await tick(5_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    mod.stopPurchasePoll();
  });

  it("stopping twice is a no-op and stops notifying after unsubscribe", async () => {
    const mod = await load();
    const cb = vi.fn();
    const unsubscribe = mod.subscribePurchasePoll(cb);
    mod.startPurchasePoll(before, t);
    mod.stopPurchasePoll();
    expect(cb).toHaveBeenCalledTimes(2);
    mod.stopPurchasePoll();
    expect(cb).toHaveBeenCalledTimes(2);
    unsubscribe();
    mod.startPurchasePoll(before, t);
    expect(cb).toHaveBeenCalledTimes(2);
    mod.stopPurchasePoll();
  });

  it("discards a response that lands after the poll was stopped", async () => {
    const mod = await load();
    let resolve: (v: unknown) => void = () => {};
    fetchAccount.mockReturnValue(new Promise((r) => { resolve = r; }));
    mod.startPurchasePoll(before, t);
    await tick(5_000);
    mod.stopPurchasePoll();
    resolve({ balance: 55, subscribed: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  describe("window focus", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("window", { addEventListener, removeEventListener });
      addEventListener.mockClear();
      removeEventListener.mockClear();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("checks immediately when the app regains focus – the user is back from Stripe", async () => {
      const mod = await load();
      fetchAccount.mockResolvedValue({ balance: 55, subscribed: false });
      mod.startPurchasePoll(before, t);
      const handler = addEventListener.mock.calls[0][1] as () => void;
      expect(addEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
      handler();
      await vi.advanceTimersByTimeAsync(0);
      expect(toastSuccess).toHaveBeenCalledWith("settings.account.purchaseLanded");
      expect(removeEventListener).toHaveBeenCalledWith("focus", handler);
    });

    it("does nothing when the handler fires after the poll stopped", async () => {
      const mod = await load();
      mod.startPurchasePoll(before, t);
      const handler = addEventListener.mock.calls[0][1] as () => void;
      mod.stopPurchasePoll();
      handler();
      await vi.advanceTimersByTimeAsync(0);
      expect(invalidate).not.toHaveBeenCalled();
    });
  });
});
