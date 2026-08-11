import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;
vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

import {
  createEmptyDoc, currentDocExists, deleteVersionSnapshot, duplicateVersionSnapshot, getOrCreateCurrentDoc,
  getVersionSnapshot, listVersionSnapshots, restoreVersionSnapshot, saveCurrentDoc, saveVersionSnapshot,
} from "@/lib/screenshot-docs";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { screenshotDocs } from "@/db/schema";

beforeEach(() => { testDb = createTestDb(); });

describe("createEmptyDoc", () => {
  it("starts empty on the default working formats with English as working language", () => {
    const doc = createEmptyDoc();
    expect(doc.screenshots).toEqual([]);
    expect(doc.selectedIndex).toBe(0);
    expect(doc.outputDevices).toEqual(["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"]);
    expect(doc.outputDevice).toBe("APP_IPHONE_65");
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

  it("seeds the working formats from the caller, dropping keys the editor cannot render", () => {
    // iMessage display types carry no pixel size in the ASC catalog, so they are not editor formats.
    const doc = createEmptyDoc(["APP_IPAD_PRO_3GEN_129", "APP_IPHONE_67", "IMESSAGE_APP_IPHONE_67"]);
    expect(doc.outputDevices).toEqual(["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"]); // EDITOR_FORMATS order
    expect(doc.outputDevice).toBe("APP_IPHONE_67");
  });

  it("keeps the non-phone formats – watch, Mac, TV and Vision Pro are editable too", () => {
    expect(createEmptyDoc(["APP_APPLE_TV"]).outputDevices).toEqual(["APP_APPLE_TV"]);
    expect(createEmptyDoc(["APP_WATCH_ULTRA", "APP_DESKTOP"]).outputDevices)
      .toEqual(["APP_WATCH_ULTRA", "APP_DESKTOP"]);
  });

  it("falls back to the default pair when nothing usable is passed", () => {
    expect(createEmptyDoc(["IMESSAGE_APP_IPAD_97"]).outputDevices)
      .toEqual(["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"]);
    expect(createEmptyDoc([]).outputDevices).toEqual(["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"]);
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

  it("creates with the given working formats, ignores them once the row exists", () => {
    const created = getOrCreateCurrentDoc("app-seed", ["APP_IPHONE_67"]);
    expect(created.doc.outputDevices).toEqual(["APP_IPHONE_67"]);
    const again = getOrCreateCurrentDoc("app-seed", ["APP_IPAD_PRO_129"]);
    expect(again.doc.outputDevices).toEqual(["APP_IPHONE_67"]);
  });

  it("reports whether the current doc exists", () => {
    expect(currentDocExists("app-none")).toBe(false);
    getOrCreateCurrentDoc("app-none");
    expect(currentDocExists("app-none")).toBe(true);
  });

  it("isolates apps – app B never sees app A's doc", () => {
    const a = getOrCreateCurrentDoc("app-a");
    const b = getOrCreateCurrentDoc("app-b");
    expect(b.id).not.toBe(a.id);
  });

  // Two windows opening the same app race between the select and the insert. The partial unique
  // index keeps one row; the loser used to surface the raw constraint error.
  it("returns the winning row when a concurrent insert got there first", () => {
    const winner = getOrCreateCurrentDoc("app-race");
    const realSelect = testDb.select.bind(testDb);
    let missed = false;
    vi.spyOn(testDb, "select").mockImplementation(((...args: unknown[]) => {
      if (missed) return realSelect(...(args as Parameters<typeof realSelect>));
      missed = true; // the racing read, taken before the other window inserted
      return { from: () => ({ where: () => ({ get: () => undefined }) }) };
    }) as never);

    const loser = getOrCreateCurrentDoc("app-race");

    expect(loser.id).toBe(winner.id);
    expect(loser.doc.screenshots).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("saveCurrentDoc", () => {
  it("updates the existing current row and bumps updatedAt + denormalized columns", () => {
    const created = getOrCreateCurrentDoc("app-1");
    const doc = createEmptyDoc();
    doc.outputDevice = "APP_IPHONE_55";
    doc.projectLanguages = ["en-US", "fr-FR"];
    const saved = saveCurrentDoc("app-1", doc);
    expect(saved.id).toBe(created.id);
    const reread = getOrCreateCurrentDoc("app-1");
    expect(reread.doc.outputDevice).toBe("APP_IPHONE_55");
    expect(reread.doc.projectLanguages).toEqual(["en-US", "fr-FR"]);
  });

  it("inserts when no current row exists yet (save before get)", () => {
    const saved = saveCurrentDoc("app-2", createEmptyDoc());
    expect(getOrCreateCurrentDoc("app-2").id).toBe(saved.id);
  });
});

describe("getOrCreateCurrentDoc – legacy language normalization", () => {
  it("returns en-US for a stored bare-en doc", () => {
    const created = getOrCreateCurrentDoc("app-legacy");
    const legacy = JSON.parse(JSON.stringify(created.doc).replaceAll('"en-US"', '"en"'));
    saveCurrentDoc("app-legacy", legacy);
    const reread = getOrCreateCurrentDoc("app-legacy");
    expect(reread.doc.currentLanguage).toBe("en-US");
    expect(reread.doc.projectLanguages).toEqual(["en-US"]);
  });
});

describe("saveVersionSnapshot", () => {
  it("copies the current doc into a named version row without touching current", () => {
    getOrCreateCurrentDoc("app-1");
    const doc = createEmptyDoc();
    doc.outputDevice = "APP_IPHONE_55";
    saveCurrentDoc("app-1", doc);
    const snap = saveVersionSnapshot("app-1", "Export 2026-08-10 18:00");
    expect(snap.name).toBe("Export 2026-08-10 18:00");
    expect(snap.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const current = getOrCreateCurrentDoc("app-1");
    expect(current.doc.outputDevice).toBe("APP_IPHONE_55"); // untouched
    const snap2 = saveVersionSnapshot("app-1", "Another");
    expect(snap2.id).not.toBe(snap.id); // multiple versions per app are fine
  });

  it("snapshots the empty doc when no current row exists yet", () => {
    const snap = saveVersionSnapshot("app-fresh", "First");
    expect(snap.name).toBe("First");
  });
});

describe("version snapshots – list/get/restore/duplicate/delete", () => {
  function seedTwoVersions(appId: string) {
    getOrCreateCurrentDoc(appId);
    const doc = createEmptyDoc();
    doc.outputDevice = "APP_IPHONE_55";
    saveCurrentDoc(appId, doc);
    const v1 = saveVersionSnapshot(appId, "First");
    const doc2 = createEmptyDoc();
    saveCurrentDoc(appId, doc2);
    const v2 = saveVersionSnapshot(appId, "Second");
    return { v1, v2 };
  }

  it("lists newest first, scoped by app", () => {
    const { v1, v2 } = seedTwoVersions("app-v");
    seedTwoVersions("app-other");
    const list = listVersionSnapshots("app-v");
    expect(list.map((v) => v.id)).toEqual([v2.id, v1.id]);
    expect(list[0]).toEqual({ id: v2.id, name: "Second", createdAt: expect.any(String) });
  });

  it("gets a snapshot with its doc, misses cleanly", () => {
    const { v1 } = seedTwoVersions("app-g");
    const snap = getVersionSnapshot("app-g", v1.id);
    expect(snap?.name).toBe("First");
    expect(snap?.doc.outputDevice).toBe("APP_IPHONE_55");
    expect(getVersionSnapshot("app-g", "nope")).toBeNull();
    expect(getVersionSnapshot("app-other-2", v1.id)).toBeNull(); // cross-app blocked
  });

  it("restores a version into the current doc", () => {
    const { v1 } = seedTwoVersions("app-r");
    expect(getOrCreateCurrentDoc("app-r").doc.outputDevice).not.toBe("APP_IPHONE_55");
    const restored = restoreVersionSnapshot("app-r", v1.id);
    expect(restored?.doc.outputDevice).toBe("APP_IPHONE_55");
    expect(getOrCreateCurrentDoc("app-r").doc.outputDevice).toBe("APP_IPHONE_55");
    expect(restoreVersionSnapshot("app-r", "nope")).toBeNull();
  });

  it("reads a nameless row as an empty name (the column is nullable)", () => {
    seedTwoVersions("app-n");
    const bare = testDb
      .insert(screenshotDocs)
      .values({ appId: "app-n", kind: "version", languages: "[]", outputDevice: "APP_IPHONE_67", doc: "{}" })
      .returning()
      .get();
    expect(getVersionSnapshot("app-n", bare.id)?.name).toBe("");
    expect(listVersionSnapshots("app-n").find((v) => v.id === bare.id)?.name).toBe("");
  });

  it("duplicates and deletes", () => {
    const { v1 } = seedTwoVersions("app-d");
    const copy = duplicateVersionSnapshot("app-d", v1.id, "Copy of First");
    expect(copy?.name).toBe("Copy of First");
    expect(copy?.id).not.toBe(v1.id);
    expect(listVersionSnapshots("app-d")).toHaveLength(3);
    expect(deleteVersionSnapshot("app-d", v1.id)).toBe(true);
    expect(deleteVersionSnapshot("app-d", v1.id)).toBe(false);
    expect(listVersionSnapshots("app-d")).toHaveLength(2);
    expect(duplicateVersionSnapshot("app-d", "nope", "X")).toBeNull();
  });
});
