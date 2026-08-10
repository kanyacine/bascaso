import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { screenshotDocs } from "@/db/schema";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

export function createEmptyDoc(): ScreenshotDoc {
  return {
    screenshots: [],
    selectedIndex: 0,
    outputDevice: EDITOR_FORMATS[0].key,
    customWidth: 1290,
    customHeight: 2796,
    currentLanguage: "en",
    projectLanguages: ["en"],
    defaults: structuredClone(DEFAULTS),
  };
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
    return { id: existing.id, doc: JSON.parse(existing.doc) as ScreenshotDoc, updatedAt: existing.updatedAt };
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
