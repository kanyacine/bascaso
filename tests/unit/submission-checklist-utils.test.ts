import { describe, it, expect } from "vitest";
import { computeFieldIssues, computeStoreListingFlags } from "@/lib/submission-checklist-utils";
import type { LocaleFields } from "@/app/dashboard/apps/[appId]/store-listing/_components/locale-fields";

function makeLocaleData(overrides: Record<string, Partial<LocaleFields>>): Record<string, LocaleFields> {
  const base: LocaleFields = {
    description: "",
    keywords: "",
    whatsNew: "",
    promotionalText: "",
    supportUrl: "",
    marketingUrl: "",
  };
  const result: Record<string, LocaleFields> = {};
  for (const [locale, fields] of Object.entries(overrides)) {
    result[locale] = { ...base, ...fields };
  }
  return result;
}

describe("computeFieldIssues", () => {
  it("returns 'missing' when primary locale is empty", () => {
    const data = makeLocaleData({ "en-US": { description: "" } });
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "missing", localesWithIssues: [] });
  });

  it("returns 'missing' when primary locale is below minLength", () => {
    const data = makeLocaleData({ "en-US": { description: "short" } });
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "missing", localesWithIssues: [] });
  });

  it("returns 'ok' when all locales are valid", () => {
    const data = makeLocaleData({
      "en-US": { description: "A valid description text" },
      "it": { description: "Una descrizione valida" },
    });
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "ok", localesWithIssues: [] });
  });

  it("returns 'warn' when primary OK but one secondary is empty", () => {
    const data = makeLocaleData({
      "en-US": { keywords: "games,fun" },
      "it": { keywords: "" },
    });
    const result = computeFieldIssues(data, "en-US", "keywords", 1);
    expect(result).toEqual({ status: "warn", localesWithIssues: ["it"] });
  });

  it("returns 'warn' listing all failing secondary locales", () => {
    const data = makeLocaleData({
      "en-US": { keywords: "games" },
      "it": { keywords: "" },
      "de-DE": { keywords: "" },
      "fr-FR": { keywords: "jeux" },
    });
    const result = computeFieldIssues(data, "en-US", "keywords", 1);
    expect(result.status).toBe("warn");
    expect(result.localesWithIssues).toContain("it");
    expect(result.localesWithIssues).toContain("de-DE");
    expect(result.localesWithIssues).not.toContain("fr-FR");
    expect(result.localesWithIssues).toHaveLength(2);
  });

  it("returns 'ok' when only primary locale exists and is valid", () => {
    const data = makeLocaleData({ "en-US": { description: "A valid description text" } });
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "ok", localesWithIssues: [] });
  });

  it("uses 1-char minimum for keywords", () => {
    const data = makeLocaleData({
      "en-US": { keywords: "a" },
      "it": { keywords: "b" },
    });
    const result = computeFieldIssues(data, "en-US", "keywords", 1);
    expect(result).toEqual({ status: "ok", localesWithIssues: [] });
  });

  it("uses 4-char minimum for whatsNew", () => {
    const data = makeLocaleData({
      "en-US": { whatsNew: "Fix" },
    });
    const result = computeFieldIssues(data, "en-US", "whatsNew", 4);
    expect(result).toEqual({ status: "missing", localesWithIssues: [] });
  });

  it("passes whatsNew with exactly 4 chars", () => {
    const data = makeLocaleData({
      "en-US": { whatsNew: "Fix!" },
    });
    const result = computeFieldIssues(data, "en-US", "whatsNew", 4);
    expect(result).toEqual({ status: "ok", localesWithIssues: [] });
  });

  it("returns 'missing' when primary locale is not in data", () => {
    const data = makeLocaleData({ "it": { description: "Qualcosa" } });
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "missing", localesWithIssues: [] });
  });

  it("treats undefined field on primary locale as length 0", () => {
    // Field key absent entirely – exercises the ?.length ?? 0 fallback
    const data = { "en-US": { keywords: "ok", whatsNew: "ok" } as LocaleFields };
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result).toEqual({ status: "missing", localesWithIssues: [] });
  });

  it("treats undefined field on secondary locale as length 0", () => {
    const data = makeLocaleData({
      "en-US": { description: "A valid description text" },
    });
    // Manually add a secondary locale missing the description field
    data["it"] = { keywords: "k", whatsNew: "w", promotionalText: "", supportUrl: "", marketingUrl: "" } as LocaleFields;
    const result = computeFieldIssues(data, "en-US", "description", 10);
    expect(result.status).toBe("warn");
    expect(result.localesWithIssues).toEqual(["it"]);
  });
});

describe("computeStoreListingFlags", () => {
  it("computes all fields independently", () => {
    const data = makeLocaleData({
      "en-US": { description: "A valid description text", keywords: "games", whatsNew: "New stuff here", supportUrl: "https://example.com" },
      "it": { description: "Descrizione valida qui", keywords: "", whatsNew: "", supportUrl: "" },
    });
    const flags = computeStoreListingFlags(data, "en-US");
    expect(flags.description.status).toBe("ok");
    expect(flags.keywords.status).toBe("warn");
    expect(flags.keywords.localesWithIssues).toEqual(["it"]);
    expect(flags.whatsNew.status).toBe("warn");
    expect(flags.whatsNew.localesWithIssues).toEqual(["it"]);
    expect(flags.supportUrl.status).toBe("warn");
    expect(flags.supportUrl.localesWithIssues).toEqual(["it"]);
  });

  it("handles mixed states correctly", () => {
    const data = makeLocaleData({
      "en-US": { description: "A valid description text", keywords: "games", whatsNew: "", supportUrl: "https://example.com" },
    });
    const flags = computeStoreListingFlags(data, "en-US");
    expect(flags.description.status).toBe("ok");
    expect(flags.keywords.status).toBe("ok");
    expect(flags.whatsNew.status).toBe("missing");
    expect(flags.supportUrl.status).toBe("ok");
  });

  it("returns all 'missing' for empty localeData", () => {
    const flags = computeStoreListingFlags({}, "en-US");
    expect(flags.description.status).toBe("missing");
    expect(flags.whatsNew.status).toBe("missing");
    expect(flags.keywords.status).toBe("missing");
    expect(flags.supportUrl.status).toBe("missing");
  });

  it("returns all 'ok' when every locale has all fields", () => {
    const data = makeLocaleData({
      "en-US": { description: "A valid description text", keywords: "games", whatsNew: "Bugs fixed", supportUrl: "https://a.com" },
      "it": { description: "Descrizione valida qui", keywords: "giochi", whatsNew: "Bug corretti", supportUrl: "https://b.com" },
      "de-DE": { description: "Eine gültige Beschreibung", keywords: "spiele", whatsNew: "Fehler behoben", supportUrl: "https://c.com" },
    });
    const flags = computeStoreListingFlags(data, "en-US");
    expect(flags.description.status).toBe("ok");
    expect(flags.keywords.status).toBe("ok");
    expect(flags.whatsNew.status).toBe("ok");
    expect(flags.supportUrl.status).toBe("ok");
  });
});
