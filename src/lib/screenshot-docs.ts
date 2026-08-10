import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { screenshotDocs } from "@/db/schema";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import { normalizeDocLanguages } from "@/lib/screenshot-editor/languages";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function createEmptyDoc(): ScreenshotDoc {
  return normalizeDocLanguages({
    screenshots: [],
    selectedIndex: 0,
    outputDevice: EDITOR_FORMATS[0].key,
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

export function getOrCreateCurrentDoc(appId: string): { id: string; doc: ScreenshotDoc; updatedAt: string } {
  const existing = currentRow(appId);
  if (existing) {
    const doc = normalizeDocLanguages(JSON.parse(existing.doc) as ScreenshotDoc);
    return { id: existing.id, doc, updatedAt: existing.updatedAt };
  }
  const doc = createEmptyDoc();
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
