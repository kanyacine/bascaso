import { db } from "@/db";
import { pendingChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ulid } from "@/lib/ulid";

export interface SectionChange {
  id: string;
  appId: string;
  section: string;
  scope: string;
  data: Record<string, unknown>;
  originalData: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Get all pending changes for an app.
 */
export function getChangesForApp(appId: string): SectionChange[] {
  return db
    .select()
    .from(pendingChanges)
    .where(eq(pendingChanges.appId, appId))
    .all()
    .map(deserialize);
}

/**
 * Get pending changes for a specific section + scope.
 */
export function getSectionChange(
  appId: string,
  section: string,
  scope: string,
): SectionChange | null {
  const row = db
    .select()
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.appId, appId),
        eq(pendingChanges.section, section),
        eq(pendingChanges.scope, scope),
      ),
    )
    .get();
  return row ? deserialize(row) : null;
}

/**
 * Upsert a section's pending changes.
 * `data` = current edited state, `originalData` = ASC state at time of first edit.
 */
export function upsertSectionChange(
  appId: string,
  section: string,
  scope: string,
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const existing = db
    .select({ id: pendingChanges.id })
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.appId, appId),
        eq(pendingChanges.section, section),
        eq(pendingChanges.scope, scope),
      ),
    )
    .get();

  if (existing) {
    db.update(pendingChanges)
      .set({
        value: JSON.stringify(data),
        originalValue: JSON.stringify(originalData),
        updatedAt: now,
      })
      .where(eq(pendingChanges.id, existing.id))
      .run();
  } else {
    db.insert(pendingChanges)
      .values({
        id: ulid(),
        appId,
        section,
        scope,
        field: "all",
        value: JSON.stringify(data),
        originalValue: JSON.stringify(originalData),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/**
 * Delete pending changes for a specific section + scope.
 */
export function deleteSectionChange(
  appId: string,
  section: string,
  scope: string,
): void {
  db.delete(pendingChanges)
    .where(
      and(
        eq(pendingChanges.appId, appId),
        eq(pendingChanges.section, section),
        eq(pendingChanges.scope, scope),
      ),
    )
    .run();
}

/**
 * Delete all pending changes for an app.
 */
export function deleteAllChanges(appId: string): void {
  db.delete(pendingChanges)
    .where(eq(pendingChanges.appId, appId))
    .run();
}

/**
 * Count pending changes, optionally filtered by app.
 */
export function getChangeCount(appId?: string): number {
  if (appId) {
    return db
      .select({ id: pendingChanges.id })
      .from(pendingChanges)
      .where(eq(pendingChanges.appId, appId))
      .all().length;
  }
  return db.select({ id: pendingChanges.id }).from(pendingChanges).all().length;
}

function deserialize(
  row: typeof pendingChanges.$inferSelect,
): SectionChange {
  return {
    id: row.id,
    appId: row.appId,
    section: row.section,
    scope: row.scope,
    data: JSON.parse(row.value),
    originalData: row.originalValue ? JSON.parse(row.originalValue) : {},
    updatedAt: row.updatedAt,
  };
}
