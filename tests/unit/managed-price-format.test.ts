import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/managed/client";

// The price shown on a button that charges a card: a mistake here is not cosmetic, it
// tells the customer something other than what they are about to pay.
describe("formatPrice", () => {
  it("renders a round amount without decimals", () => {
    expect(formatPrice(1000, "eur", "fr")).toContain("10");
    expect(formatPrice(1000, "eur", "fr")).not.toContain("00");
  });

  it("keeps the decimals of a non-round amount", () => {
    expect(formatPrice(1050, "eur", "fr").replace(/\s/g, "")).toContain("10,50");
  });

  // Stripe carries these currencies WITHOUT a minor unit: their `amount` is already the
  // whole figure. Dividing by 100 would show ¥10 for a ¥1000 price.
  it("does not divide zero-decimal currencies by 100", () => {
    expect(formatPrice(1000, "jpy", "en")).toContain("1,000");
    expect(formatPrice(1000, "krw", "en")).toContain("1,000");
  });

  it("accepts the currency in either case", () => {
    expect(formatPrice(1000, "JPY", "en")).toContain("1,000");
  });

  // The currency comes from the Stripe price, not from the locale: showing euros to a
  // user billed in dollars would state the wrong amount.
  it("uses the price's currency, not one implied by the locale", () => {
    expect(formatPrice(1000, "usd", "fr")).toContain("$");
    expect(formatPrice(1000, "eur", "en")).toContain("€");
  });
});
