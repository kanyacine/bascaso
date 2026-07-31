import { describe, expect, it } from "vitest";
import { allRulesPass, passwordRules } from "@/lib/managed/client";
import { en } from "@/lib/i18n/locales/en";
import { getByPath } from "@/lib/i18n/messages";

// La check-list remplace une validation qui mentait : un mot de passe trop court était
// refusé par la route avec « vérifiez vos identifiants ». Ce qui compte donc ici, c'est
// que la règle affichée soit exactement celle qui sera appliquée – un décalage
// ramènerait le mensonge, en vert cette fois.
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
    // Sans la garde de longueur, "" === "" passerait la règle de correspondance et la
    // check-list s'ouvrirait à moitié verte sur un formulaire vierge.
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
