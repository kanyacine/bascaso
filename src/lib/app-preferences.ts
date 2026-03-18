import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const FREE_SELECTED_APP_KEY = "free_selected_app_id";
const REVIEW_BEFORE_SAVING_KEY = "review_before_saving";

export function getFreeSelectedAppId(): string | null {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, FREE_SELECTED_APP_KEY))
      .get();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setFreeSelectedAppId(appId: string): void {
  db.insert(appPreferences)
    .values({ key: FREE_SELECTED_APP_KEY, value: appId })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: appId },
    })
    .run();
}

export function clearFreeSelectedAppId(): void {
  db.delete(appPreferences)
    .where(eq(appPreferences.key, FREE_SELECTED_APP_KEY))
    .run();
}

export function getReviewBeforeSaving(): boolean {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, REVIEW_BEFORE_SAVING_KEY))
      .get();
    return row?.value === "true";
  } catch {
    return false;
  }
}

export function setReviewBeforeSaving(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: REVIEW_BEFORE_SAVING_KEY, value: String(enabled) })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: String(enabled) },
    })
    .run();
}
