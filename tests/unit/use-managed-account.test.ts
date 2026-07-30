import { describe, expect, it } from "vitest";
import { parseManagedAccount } from "@/lib/hooks/use-managed-account";
import { accountDisplayName } from "@/lib/managed/client";

// The store itself is a React hook, but everything that can be wrong about it is in the
// mapping: which bodies count as signed in, and what a missing field defaults to. That
// part is pure, so it is tested without a renderer.
describe("parseManagedAccount", () => {
  it("maps the /api/managed/me body and derives subscribed", () => {
    expect(parseManagedAccount(true, {
      email: "a@b.c", username: "Yacine", balance: 42,
      subscription: { status: "active", currentPeriodEnd: null },
    })).toEqual({ email: "a@b.c", username: "Yacine", balance: 42, subscribed: true });
  });
  it("is null when signed out and defensively on odd bodies", () => {
    expect(parseManagedAccount(false, { error: "not_logged_in" })).toBeNull();
    expect(parseManagedAccount(true, null)).toBeNull();
  });
  it("expired subscription reads as not subscribed, balance defaults to 0", () => {
    const parsed = parseManagedAccount(true, {
      email: "a@b.c", username: null,
      subscription: { status: "active", currentPeriodEnd: "2020-01-01T00:00:00Z" },
    });
    expect(parsed).toEqual({ email: "a@b.c", username: null, balance: 0, subscribed: false });
  });
});

describe("accountDisplayName", () => {
  it("prefers the username, falls back to the email local part", () => {
    expect(accountDisplayName({ username: "Yacine", email: "yacinemouf@gmail.com" })).toBe("Yacine");
    expect(accountDisplayName({ username: null, email: "yacinemouf@gmail.com" })).toBe("yacinemouf");
  });
});
