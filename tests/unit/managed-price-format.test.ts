import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/managed/client";

// Le prix affiché sur un bouton qui débite une carte : une erreur ici n'est pas
// cosmétique, elle annonce au client autre chose que ce qu'il va payer.
describe("formatPrice", () => {
  it("renders a round amount without decimals", () => {
    expect(formatPrice(1000, "eur", "fr")).toContain("10");
    expect(formatPrice(1000, "eur", "fr")).not.toContain("00");
  });

  it("keeps the decimals of a non-round amount", () => {
    expect(formatPrice(1050, "eur", "fr").replace(/\s/g, "")).toContain("10,50");
  });

  // Stripe porte ces devises SANS unité mineure : leur `amount` est déjà la
  // somme entière. Diviser par 100 afficherait ¥10 pour un prix de ¥1000.
  it("does not divide zero-decimal currencies by 100", () => {
    expect(formatPrice(1000, "jpy", "en")).toContain("1,000");
    expect(formatPrice(1000, "krw", "en")).toContain("1,000");
  });

  it("accepts the currency in either case", () => {
    expect(formatPrice(1000, "JPY", "en")).toContain("1,000");
  });

  // La devise vient du prix Stripe, pas de la locale : afficher des euros à un
  // utilisateur facturé en dollars annoncerait le mauvais montant.
  it("uses the price's currency, not one implied by the locale", () => {
    expect(formatPrice(1000, "usd", "fr")).toContain("$");
    expect(formatPrice(1000, "eur", "en")).toContain("€");
  });
});
