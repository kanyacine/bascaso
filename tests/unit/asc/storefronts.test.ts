import { describe, it, expect } from "vitest";
import {
  STOREFRONTS,
  storefrontLocales,
  resolveExchangeableLocale,
  storefrontKeywordBudget,
  storefrontsByLocale,
  POPULAR_STOREFRONTS,
} from "@/lib/asc/storefronts";

describe("STOREFRONTS", () => {
  it("contains approximately 170 entries", () => {
    const count = Object.keys(STOREFRONTS).length;
    expect(count).toBeGreaterThanOrEqual(170);
    expect(count).toBeLessThanOrEqual(200);
  });

  it("has correct shape for each entry", () => {
    for (const [iso, sf] of Object.entries(STOREFRONTS)) {
      expect(iso).toMatch(/^[A-Z]{3}$/);
      expect(sf).toHaveProperty("name");
      expect(sf).toHaveProperty("defaultLocale");
      expect(sf).toHaveProperty("additionalLocales");
      expect(typeof sf.name).toBe("string");
      expect(typeof sf.defaultLocale).toBe("string");
      expect(Array.isArray(sf.additionalLocales)).toBe(true);
    }
  });

  it("maps USA correctly", () => {
    expect(STOREFRONTS.USA).toEqual({
      name: "United States",
      defaultLocale: "en-US",
      additionalLocales: ["ar-SA", "zh-Hans", "zh-Hant", "fr-FR", "ko", "pt-BR", "ru", "es-MX", "vi"],
    });
  });

  it("maps JPN correctly", () => {
    expect(STOREFRONTS.JPN).toEqual({
      name: "Japan",
      defaultLocale: "ja",
      additionalLocales: ["en-US"],
    });
  });

  it("maps CHE correctly", () => {
    expect(STOREFRONTS.CHE).toEqual({
      name: "Switzerland",
      defaultLocale: "de-DE",
      additionalLocales: ["en-GB", "fr-FR", "it"],
    });
  });
});

describe("storefrontLocales", () => {
  it("returns default + additional locales for a known storefront", () => {
    expect(storefrontLocales("USA")).toEqual([
      "en-US", "ar-SA", "zh-Hans", "zh-Hant", "fr-FR", "ko", "pt-BR", "ru", "es-MX", "vi",
    ]);
  });

  it("returns single-element array for storefront with no additional locales", () => {
    expect(storefrontLocales("GBR")).toEqual(["en-GB"]);
  });

  it("returns empty array for unknown storefront", () => {
    expect(storefrontLocales("ZZZ")).toEqual([]);
  });
});

describe("resolveExchangeableLocale", () => {
  it("returns the locale directly when available", () => {
    const available = new Set(["en-US", "fr-FR"]);
    expect(resolveExchangeableLocale("en-US", available)).toBe("en-US");
  });

  it("returns an exchangeable fallback when the required locale is missing", () => {
    // en-CA is exchangeable with en-US, en-GB, en-AU
    const available = new Set(["en-US", "fr-FR"]);
    expect(resolveExchangeableLocale("en-CA", available)).toBe("en-US");
  });

  it("returns fallback within pt group", () => {
    const available = new Set(["pt-BR"]);
    expect(resolveExchangeableLocale("pt-PT", available)).toBe("pt-BR");
  });

  it("returns fallback within fr group", () => {
    const available = new Set(["fr-CA"]);
    expect(resolveExchangeableLocale("fr-FR", available)).toBe("fr-CA");
  });

  it("returns fallback within es group", () => {
    const available = new Set(["es-ES"]);
    expect(resolveExchangeableLocale("es-MX", available)).toBe("es-ES");
  });

  it("returns fallback within zh group", () => {
    const available = new Set(["zh-Hant"]);
    expect(resolveExchangeableLocale("zh-Hans", available)).toBe("zh-Hant");
  });

  it("returns null when no fallback is available", () => {
    const available = new Set(["de-DE", "ja"]);
    expect(resolveExchangeableLocale("en-CA", available)).toBeNull();
  });

  it("returns null for a locale not in any exchangeable group", () => {
    const available = new Set(["en-US", "fr-FR"]);
    expect(resolveExchangeableLocale("ja", available)).toBeNull();
  });
});

describe("storefrontKeywordBudget", () => {
  it("returns 100 for a single-locale storefront", () => {
    // GBR has only en-GB
    expect(storefrontKeywordBudget("GBR")).toBe(100);
  });

  it("returns 1000 for USA (10 locales)", () => {
    expect(storefrontKeywordBudget("USA")).toBe(1000);
  });

  it("returns 400 for CHE (4 locales)", () => {
    expect(storefrontKeywordBudget("CHE")).toBe(400);
  });

  it("returns 0 for unknown storefront", () => {
    expect(storefrontKeywordBudget("ZZZ")).toBe(0);
  });
});

describe("storefrontsByLocale", () => {
  it("includes USA and JPN for en-US", () => {
    const result = storefrontsByLocale("en-US");
    expect(result).toContain("USA");
    expect(result).toContain("JPN");
  });

  it("includes JPN for ja", () => {
    const result = storefrontsByLocale("ja");
    expect(result).toContain("JPN");
  });

  it("includes many storefronts for en-GB", () => {
    const result = storefrontsByLocale("en-GB");
    expect(result.length).toBeGreaterThan(50);
    expect(result).toContain("GBR");
    expect(result).toContain("AUS");
  });

  it("returns empty array for non-existent locale", () => {
    expect(storefrontsByLocale("xx-XX")).toEqual([]);
  });
});

describe("POPULAR_STOREFRONTS", () => {
  it("has 16 entries", () => {
    expect(POPULAR_STOREFRONTS).toHaveLength(16);
  });

  it("includes expected storefronts", () => {
    expect(POPULAR_STOREFRONTS).toContain("USA");
    expect(POPULAR_STOREFRONTS).toContain("GBR");
    expect(POPULAR_STOREFRONTS).toContain("JPN");
    expect(POPULAR_STOREFRONTS).toContain("CHN");
    expect(POPULAR_STOREFRONTS).toContain("DEU");
  });

  it("contains only valid storefront codes", () => {
    for (const iso of POPULAR_STOREFRONTS) {
      expect(STOREFRONTS[iso]).toBeDefined();
    }
  });
});
