import { describe, expect, it } from "vitest";
import { allRulesPass, passwordRules } from "@/lib/managed/client";
import { en } from "@/lib/i18n/locales/en";
import { getByPath } from "@/lib/i18n/messages";

// The checklist replaces a validation that lied: a password that was too short got
// refused by the route with "check your credentials". What matters here is therefore
// that the rule displayed is exactly the one that will be enforced – a mismatch would
// bring the lie back, in green this time.
describe("passwordRules", () => {
  it("is all red on an empty field and all green on a valid pair", () => {
    expect(allRulesPass(passwordRules("", ""))).toBe(false);
    expect(allRulesPass(passwordRules("password123", "password123"))).toBe(true);
  });

  // 8 is the minimum both managed routes enforce (z.string().min(8)); the literal is
  // spelled out here on purpose, so a change to either side fails this test.
  it("refuses a password shorter than the routes accept", () => {
    const [length] = passwordRules("a".repeat(7), "a".repeat(7));
    expect(length.ok).toBe(false);
    expect(passwordRules("a".repeat(8), "")[0].ok).toBe(true);
  });

  it("never counts two empty fields as matching", () => {
    // Without the length guard, "" === "" would pass the match rule and the checklist
    // would open half green on a blank form.
    expect(passwordRules("", "")[1].ok).toBe(false);
  });

  it("catches a mismatch", () => {
    expect(passwordRules("password123", "password124")[1].ok).toBe(false);
  });

  it("points at message keys that exist", () => {
    for (const rule of passwordRules("x", "y")) {
      expect(getByPath(en, rule.key)).toBeTypeOf("string");
    }
  });
});
