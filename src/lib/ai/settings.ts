import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import type { AITier } from "@/lib/ai/tasks";

export interface AISettingsResult {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
}

/** Read and decrypt the settings row for a tier. Returns null if not configured. */
export async function getTierSettings(tier: AITier): Promise<AISettingsResult | null> {
  const row = db.select().from(aiSettings).where(eq(aiSettings.tier, tier)).get();
  if (!row) return null;

  const apiKey = decrypt({
    ciphertext: row.encryptedApiKey,
    iv: row.iv,
    authTag: row.authTag,
    encryptedDek: row.encryptedDek,
  });

  return { provider: row.provider, modelId: row.modelId, baseUrl: row.baseUrl, apiKey };
}
