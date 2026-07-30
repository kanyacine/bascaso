import { beforeEach, describe, expect, it, vi } from "vitest";

describe("managed top-up store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts closed and opens on demand, notifying subscribers once", async () => {
    const mod = await import("@/lib/hooks/use-managed-topup");
    const cb = vi.fn();
    mod.subscribeManagedTopUp(cb);
    expect(mod.getManagedTopUpOpen()).toBe(false);
    mod.openManagedTopUp();
    expect(mod.getManagedTopUpOpen()).toBe(true);
    mod.openManagedTopUp(); // already open – no second notification
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("closes through setManagedTopUpOpen and stops notifying after unsubscribe", async () => {
    const mod = await import("@/lib/hooks/use-managed-topup");
    const cb = vi.fn();
    const unsubscribe = mod.subscribeManagedTopUp(cb);
    mod.openManagedTopUp();
    mod.setManagedTopUpOpen(false);
    expect(mod.getManagedTopUpOpen()).toBe(false);
    expect(cb).toHaveBeenCalledTimes(2);
    unsubscribe();
    mod.openManagedTopUp();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
