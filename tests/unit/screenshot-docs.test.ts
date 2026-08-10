import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;
vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

import { createEmptyDoc, getOrCreateCurrentDoc, saveCurrentDoc } from "@/lib/screenshot-docs";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";

beforeEach(() => { testDb = createTestDb(); });

describe("createEmptyDoc", () => {
  it("starts empty on the first ASC format with English as working language", () => {
    const doc = createEmptyDoc();
    expect(doc.screenshots).toEqual([]);
    expect(doc.selectedIndex).toBe(0);
    expect(doc.outputDevice).toBe("APP_IPHONE_67");
    expect(doc.customWidth).toBe(1290);
    expect(doc.customHeight).toBe(2796);
    expect(doc.currentLanguage).toBe("en-US");
    expect(doc.projectLanguages).toEqual(["en-US"]);
    expect(doc.defaults.background).toEqual(DEFAULTS.background);
    expect(doc.defaults.screenshot).toEqual(DEFAULTS.screenshot);
    expect(doc.defaults.text.headlineLanguages).toEqual(["en-US"]);
    expect(doc.defaults.text.headlines).toEqual({ "en-US": "" });
    expect(doc.defaults).not.toBe(DEFAULTS); // deep clone, never the shared object
  });
});

describe("getOrCreateCurrentDoc", () => {
  it("creates the current doc on first access and returns the same row afterwards", () => {
    const first = getOrCreateCurrentDoc("app-1");
    expect(first.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(first.doc.screenshots).toEqual([]);
    const again = getOrCreateCurrentDoc("app-1");
    expect(again.id).toBe(first.id);
  });

  it("isolates apps – app B never sees app A's doc", () => {
    const a = getOrCreateCurrentDoc("app-a");
    const b = getOrCreateCurrentDoc("app-b");
    expect(b.id).not.toBe(a.id);
  });
});

describe("saveCurrentDoc", () => {
  it("updates the existing current row and bumps updatedAt + denormalized columns", () => {
    const created = getOrCreateCurrentDoc("app-1");
    const doc = createEmptyDoc();
    doc.outputDevice = "APP_IPHONE_65";
    doc.projectLanguages = ["en-US", "fr-FR"];
    const saved = saveCurrentDoc("app-1", doc);
    expect(saved.id).toBe(created.id);
    const reread = getOrCreateCurrentDoc("app-1");
    expect(reread.doc.outputDevice).toBe("APP_IPHONE_65");
    expect(reread.doc.projectLanguages).toEqual(["en-US", "fr-FR"]);
  });

  it("inserts when no current row exists yet (save before get)", () => {
    const saved = saveCurrentDoc("app-2", createEmptyDoc());
    expect(getOrCreateCurrentDoc("app-2").id).toBe(saved.id);
  });
});
