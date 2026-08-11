import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const GOOGLE_FONTS_KEY = "screenshot_editor_google_fonts";

/**
 * Whether the screenshot editor may pull font files from Google. Off unless granted: loading a
 * family sends the machine's IP to fonts.googleapis.com, and the editor works offline on the
 * fonts already installed. The picker only offers its online catalog once this is on.
 */
export function getGoogleFontsEnabled(): boolean {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, GOOGLE_FONTS_KEY))
      .get();
    return row?.value === "true";
  } catch {
    return false;
  }
}

export function setGoogleFontsEnabled(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: GOOGLE_FONTS_KEY, value: String(enabled) })
    .onConflictDoUpdate({ target: appPreferences.key, set: { value: String(enabled) } })
    .run();
}
