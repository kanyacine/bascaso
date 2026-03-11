import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";
import { getAISettings } from "./settings";
import { eq } from "drizzle-orm";

const PREF_KEY = "gemini_screenshot_key";

/**
 * Get the Google API key for screenshot translation.
 * Priority:
 * 1. If the user's main AI provider is Google, reuse that key.
 * 2. Otherwise, check for a dedicated Gemini key stored in app preferences.
 * Returns null if no key is available.
 */
export async function getGeminiKey(): Promise<string | null> {
  // Check if main AI provider is Google
  const settings = await getAISettings();
  if (settings?.provider === "google" && settings.apiKey) {
    return settings.apiKey;
  }

  // Check for dedicated Gemini key in preferences
  const row = db
    .select()
    .from(appPreferences)
    .where(eq(appPreferences.key, PREF_KEY))
    .get();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.value) as {
      ciphertext: string;
      iv: string;
      authTag: string;
      encryptedDek: string;
    };
    return decrypt(parsed);
  } catch {
    return null;
  }
}

/** Save a dedicated Gemini API key for screenshot translation. */
export function saveGeminiKey(apiKey: string): void {
  const encrypted = encrypt(apiKey);
  const value = JSON.stringify({
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    encryptedDek: encrypted.encryptedDek,
  });

  db.insert(appPreferences)
    .values({ key: PREF_KEY, value })
    .onConflictDoUpdate({ target: appPreferences.key, set: { value } })
    .run();
}

/** Remove the dedicated Gemini API key. */
export function removeGeminiKey(): void {
  db.delete(appPreferences).where(eq(appPreferences.key, PREF_KEY)).run();
}

/** Check if any Gemini key is available (without decrypting). */
export async function hasGeminiKey(): Promise<boolean> {
  const settings = await getAISettings();
  if (settings?.provider === "google") return true;

  const row = db
    .select()
    .from(appPreferences)
    .where(eq(appPreferences.key, PREF_KEY))
    .get();

  return !!row;
}
