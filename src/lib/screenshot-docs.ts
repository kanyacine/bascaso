import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { screenshotDocs } from "@/db/schema";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { DEFAULT_WORKING_FORMATS, EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import { normalizeDocLanguages } from "@/lib/screenshot-editor/languages";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

/** `formats` seeds the working formats; unknown keys are dropped, an empty result falls back. */
export function createEmptyDoc(formats: string[] = DEFAULT_WORKING_FORMATS): ScreenshotDoc {
  const known = EDITOR_FORMATS.filter((f) => formats.includes(f.key)).map((f) => f.key);
  const outputDevices = known.length > 0 ? known : [...DEFAULT_WORKING_FORMATS];
  return normalizeDocLanguages({
    screenshots: [],
    selectedIndex: 0,
    outputDevice: outputDevices[0],
    outputDevices,
    customWidth: 1290,
    customHeight: 2796,
    currentLanguage: "en",
    projectLanguages: ["en"],
    defaults: structuredClone(DEFAULTS),
  });
}

function currentRow(appId: string) {
  return db
    .select()
    .from(screenshotDocs)
    .where(and(eq(screenshotDocs.appId, appId), eq(screenshotDocs.kind, "current")))
    .get();
}

/** Lets a caller skip an expensive `formats` lookup when the doc already exists. */
export function currentDocExists(appId: string): boolean {
  return currentRow(appId) !== undefined;
}

export function getOrCreateCurrentDoc(
  appId: string,
  formats?: string[],
): { id: string; doc: ScreenshotDoc; updatedAt: string } {
  const existing = currentRow(appId);
  if (existing) {
    const doc = normalizeDocLanguages(JSON.parse(existing.doc) as ScreenshotDoc);
    return { id: existing.id, doc, updatedAt: existing.updatedAt };
  }
  const doc = createEmptyDoc(formats);
  const inserted = db
    .insert(screenshotDocs)
    .values({
      appId,
      kind: "current",
      languages: JSON.stringify(doc.projectLanguages),
      outputDevice: doc.outputDevice,
      doc: JSON.stringify(doc),
    })
    .returning()
    .get();
  return { id: inserted.id, doc, updatedAt: inserted.updatedAt };
}

/** Freeze the current doc into a named `kind='version'` row – written automatically on export. */
export function saveVersionSnapshot(appId: string, name: string): { id: string; name: string; createdAt: string } {
  const current = getOrCreateCurrentDoc(appId);
  const inserted = db
    .insert(screenshotDocs)
    .values({
      appId,
      kind: "version",
      name,
      languages: JSON.stringify(current.doc.projectLanguages),
      outputDevice: current.doc.outputDevice,
      doc: JSON.stringify(current.doc),
    })
    .returning()
    .get();
  return { id: inserted.id, name, createdAt: inserted.createdAt };
}

export function saveCurrentDoc(appId: string, doc: ScreenshotDoc): { id: string; updatedAt: string } {
  const updatedAt = new Date().toISOString();
  const updated = db
    .update(screenshotDocs)
    .set({
      languages: JSON.stringify(doc.projectLanguages),
      outputDevice: doc.outputDevice,
      doc: JSON.stringify(doc),
      updatedAt,
    })
    .where(and(eq(screenshotDocs.appId, appId), eq(screenshotDocs.kind, "current")))
    .returning()
    .get();
  if (updated) return { id: updated.id, updatedAt: updated.updatedAt };
  const inserted = db
    .insert(screenshotDocs)
    .values({
      appId,
      kind: "current",
      languages: JSON.stringify(doc.projectLanguages),
      outputDevice: doc.outputDevice,
      doc: JSON.stringify(doc),
      updatedAt,
    })
    .returning()
    .get();
  return { id: inserted.id, updatedAt: inserted.updatedAt };
}

export interface VersionSummary {
  id: string;
  name: string;
  createdAt: string;
}

function versionRow(appId: string, id: string) {
  return db
    .select()
    .from(screenshotDocs)
    .where(and(eq(screenshotDocs.appId, appId), eq(screenshotDocs.id, id), eq(screenshotDocs.kind, "version")))
    .get();
}

export function listVersionSnapshots(appId: string): VersionSummary[] {
  return db
    .select({ id: screenshotDocs.id, name: screenshotDocs.name, createdAt: screenshotDocs.createdAt })
    .from(screenshotDocs)
    .where(and(eq(screenshotDocs.appId, appId), eq(screenshotDocs.kind, "version")))
    // ulid() suffixes are random, not monotonic – rowid is the only reliable tiebreaker
    // for snapshots written inside the same millisecond (export + duplicate).
    .orderBy(desc(screenshotDocs.createdAt), sql`rowid desc`)
    .all()
    .map((row) => ({ ...row, name: row.name ?? "" }));
}

export function getVersionSnapshot(
  appId: string,
  id: string,
): { id: string; name: string; doc: ScreenshotDoc } | null {
  const row = versionRow(appId, id);
  if (!row) return null;
  return { id: row.id, name: row.name ?? "", doc: JSON.parse(row.doc) as ScreenshotDoc };
}

/** Copy a version's doc into the current row. The caller decides about confirmations. */
export function restoreVersionSnapshot(appId: string, id: string): { doc: ScreenshotDoc } | null {
  const snapshot = getVersionSnapshot(appId, id);
  if (!snapshot) return null;
  const doc = normalizeDocLanguages(snapshot.doc);
  saveCurrentDoc(appId, doc);
  return { doc };
}

export function duplicateVersionSnapshot(appId: string, id: string, name: string): VersionSummary | null {
  const row = versionRow(appId, id);
  if (!row) return null;
  const inserted = db
    .insert(screenshotDocs)
    .values({ appId, kind: "version", name, languages: row.languages, outputDevice: row.outputDevice, doc: row.doc })
    .returning()
    .get();
  return { id: inserted.id, name, createdAt: inserted.createdAt };
}

export function deleteVersionSnapshot(appId: string, id: string): boolean {
  const result = db
    .delete(screenshotDocs)
    .where(and(eq(screenshotDocs.appId, appId), eq(screenshotDocs.id, id), eq(screenshotDocs.kind, "version")))
    .run();
  return result.changes > 0;
}
