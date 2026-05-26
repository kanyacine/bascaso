import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const REVIEW_BEFORE_SAVING_KEY = "review_before_saving";

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
