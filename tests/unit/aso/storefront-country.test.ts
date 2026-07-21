import { describe, it, expect } from "vitest";
import { STOREFRONTS } from "@/lib/asc/storefronts";
import {
  STOREFRONT_COUNTRY_CODES,
  storefrontCountryCode,
} from "@/lib/aso/storefront-country";

describe("storefrontCountryCode", () => {
  it("maps every storefront to a lowercase ISO alpha-2 code", () => {
    for (const code of Object.keys(STOREFRONTS)) {
      expect(storefrontCountryCode(code), code).toMatch(/^[a-z]{2}$/);
    }
  });

  it("has no duplicate country codes", () => {
    const values = Object.values(STOREFRONT_COUNTRY_CODES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("has no mappings outside the storefront list", () => {
    for (const code of Object.keys(STOREFRONT_COUNTRY_CODES)) {
      expect(STOREFRONTS[code], code).toBeDefined();
    }
  });

  it("maps well-known storefronts", () => {
    expect(storefrontCountryCode("USA")).toBe("us");
    expect(storefrontCountryCode("FRA")).toBe("fr");
    expect(storefrontCountryCode("GBR")).toBe("gb");
    expect(storefrontCountryCode("DEU")).toBe("de");
    expect(storefrontCountryCode("JPN")).toBe("jp");
    expect(storefrontCountryCode("KOR")).toBe("kr");
    expect(storefrontCountryCode("CHN")).toBe("cn");
    expect(storefrontCountryCode("ARE")).toBe("ae");
    expect(storefrontCountryCode("CHE")).toBe("ch");
    expect(storefrontCountryCode("XKS")).toBe("xk"); // Kosovo, Apple-specific code
  });

  it("returns null for unknown codes", () => {
    expect(storefrontCountryCode("ZZZ")).toBeNull();
    expect(storefrontCountryCode("")).toBeNull();
  });
});
