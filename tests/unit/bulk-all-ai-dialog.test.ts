import { describe, it, expect } from "vitest";
import { defaultFieldSelection } from "@/components/bulk-all-ai-dialog";
import type { BulkField } from "@/lib/hooks/use-bulk-ai";

const FIELDS: BulkField[] = [
  { key: "description", label: "Description" },
  { key: "keywords", label: "Keywords", charLimit: 100 },
  { key: "whatsNew", label: "What's new" },
  { key: "promotionalText", label: "Promotional text" },
];

describe("defaultFieldSelection", () => {
  it("selects every field when no target language has keywords yet", () => {
    const result = defaultFieldSelection(
      FIELDS,
      ["de-DE", "fr-FR"],
      { "de-DE": { keywords: "" }, "fr-FR": {} },
      false,
    );
    expect(result).toEqual({
      description: true,
      keywords: true,
      whatsNew: true,
      promotionalText: true,
    });
  });

  it("leaves Keywords off when a target language already has keywords", () => {
    const result = defaultFieldSelection(
      FIELDS,
      ["de-DE", "fr-FR"],
      { "de-DE": { keywords: "katze,hund,spiel" }, "fr-FR": { keywords: "" } },
      false,
    );
    expect(result.keywords).toBe(false);
    // Other fields stay on
    expect(result.description).toBe(true);
    expect(result.whatsNew).toBe(true);
    expect(result.promotionalText).toBe(true);
  });

  it("ignores whitespace-only keywords", () => {
    const result = defaultFieldSelection(
      FIELDS,
      ["de-DE"],
      { "de-DE": { keywords: "   " } },
      false,
    );
    expect(result.keywords).toBe(true);
  });

  it("keeps Keywords on in single-field mode (explicit per-field choice)", () => {
    const result = defaultFieldSelection(
      [{ key: "keywords", label: "Keywords", charLimit: 100 }],
      ["de-DE"],
      { "de-DE": { keywords: "katze,hund" } },
      true,
    );
    expect(result.keywords).toBe(true);
  });

  it("only inspects target locales, not the base", () => {
    // Base (en-US) has keywords but no target does → keywords stays on.
    const result = defaultFieldSelection(
      FIELDS,
      ["de-DE"],
      { "en-US": { keywords: "cat,dog" }, "de-DE": {} },
      false,
    );
    expect(result.keywords).toBe(true);
  });
});
