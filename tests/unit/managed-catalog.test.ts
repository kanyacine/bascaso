import { describe, expect, it } from "vitest";
import {
  bestValueSku,
  EMPTY_CATALOG,
  perCreditAmount,
  purchaseLanded,
  type Pack,
} from "@/lib/managed/catalog";

const pack = (sku: string, credits: number, amount: number): Pack => ({
  sku,
  credits,
  amount,
  currency: "eur",
});

describe("bestValueSku", () => {
  it("returns null for an empty catalog", () => {
    expect(bestValueSku(EMPTY_CATALOG.packs)).toBeNull();
  });

  it("returns null for a single pack – nothing to compare against", () => {
    expect(bestValueSku([pack("pack_10", 10, 1000)])).toBeNull();
  });

  it("picks the lowest per-credit price", () => {
    const packs = [pack("pack_10", 10, 1000), pack("pack_50", 50, 4500), pack("pack_100", 100, 8000)];
    expect(bestValueSku(packs)).toBe("pack_100");
  });

  it("keeps the first pack on a per-credit tie", () => {
    expect(bestValueSku([pack("a", 10, 1000), pack("b", 20, 2000)])).toBe("a");
  });

  it("ignores packs with non-positive credits", () => {
    const packs = [pack("broken", 0, 1), pack("a", 10, 1000), pack("b", 50, 4500)];
    expect(bestValueSku(packs)).toBe("b");
  });
});

describe("perCreditAmount", () => {
  it("divides and rounds to minor units", () => {
    expect(perCreditAmount(pack("p", 50, 4500))).toBe(90);
    expect(perCreditAmount(pack("p", 3, 1000))).toBe(333);
  });

  it("falls back to the full amount when credits are non-positive", () => {
    expect(perCreditAmount(pack("p", 0, 1000))).toBe(1000);
  });
});

describe("purchaseLanded", () => {
  it("lands when the balance rises", () => {
    expect(purchaseLanded({ balance: 5, subscribed: false }, { balance: 15, subscribed: false })).toBe(true);
  });

  it("lands when the subscription switches on", () => {
    expect(purchaseLanded({ balance: 5, subscribed: false }, { balance: 5, subscribed: true })).toBe(true);
  });

  it("does not land while nothing changed", () => {
    expect(purchaseLanded({ balance: 5, subscribed: false }, { balance: 5, subscribed: false })).toBe(false);
  });

  it("does not land when the balance drops (a debit is not a purchase)", () => {
    expect(purchaseLanded({ balance: 5, subscribed: true }, { balance: 4, subscribed: true })).toBe(false);
  });

  it("lands when a cancelled subscription goes back to renewing – the resubscribe case", () => {
    const before = { balance: 5, subscribed: true, endsAt: "2026-08-29T00:00:00Z" };
    expect(purchaseLanded(before, { balance: 5, subscribed: true, endsAt: null })).toBe(true);
  });

  it("does not land while the cancelled subscription still carries its end date", () => {
    const before = { balance: 5, subscribed: true, endsAt: "2026-08-29T00:00:00Z" };
    expect(purchaseLanded(before, { balance: 5, subscribed: true, endsAt: "2026-08-29T00:00:00Z" })).toBe(false);
  });

  it("does not read a subscription that simply expired as a resubscribe", () => {
    const before = { balance: 5, subscribed: true, endsAt: "2026-08-29T00:00:00Z" };
    expect(purchaseLanded(before, { balance: 5, subscribed: false, endsAt: null })).toBe(false);
  });
});
