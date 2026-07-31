import { describe, expect, it } from "vitest";
import { chargesToken } from "@/components/token-cost-hint";
import type { RoutingState } from "@/components/settings/ai-routing-section";

// Every cost chip AND the insights auto-generate consent gate hang off this one
// predicate. A wrong answer either hides a real cost or silently spends a credit.
describe("chargesToken", () => {
  const managed = { groups: { insights: { tier: "managed" } } } as unknown as RoutingState;
  const byok = { groups: { insights: { tier: "byok" } } } as unknown as RoutingState;

  it("charges when the group routes to managed and the account is pay-per-use", () => {
    expect(chargesToken(managed, { subscribed: false }, "insights")).toBe(true);
  });

  it("does not charge a subscriber", () => {
    expect(chargesToken(managed, { subscribed: true }, "insights")).toBe(false);
  });

  it("does not charge on the byok tier", () => {
    expect(chargesToken(byok, { subscribed: false }, "insights")).toBe(false);
  });

  it("does not charge when routing is unknown or the group is unrouted", () => {
    expect(chargesToken(null, { subscribed: false }, "insights")).toBe(false);
    expect(chargesToken(managed, { subscribed: false }, "metadata")).toBe(false);
  });

  it("charges a signed-out account on a managed group (the call will fail, not refund)", () => {
    expect(chargesToken(managed, null, "insights")).toBe(true);
  });
});
