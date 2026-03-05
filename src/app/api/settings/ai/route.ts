import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { eq, ne, sql } from "drizzle-orm";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  normalizeOpenAICompatibleBaseUrl,
  resolveLocalOpenAIApiKey,
} from "@/lib/ai/local-provider";

export async function GET() {
  const settings = db
    .select({
      id: aiSettings.id,
      provider: aiSettings.provider,
      modelId: aiSettings.modelId,
      baseUrl: aiSettings.baseUrl,
    })
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();

  return NextResponse.json({
    settings: settings
      ? { ...settings, hasApiKey: true }
      : null,
  });
}

const updateSchema = z.object({
  provider: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().optional(),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const provider = parsed.provider.trim();
  const modelId = parsed.modelId.trim();
  const apiKey = parsed.apiKey?.trim();
  const baseUrl = parsed.baseUrl?.trim();
  const isLocalProvider = isLocalOpenAIProvider(provider);

  let normalizedBaseUrl: string | null = null;
  if (isLocalProvider) {
    if (baseUrl) {
      normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
      if (!normalizedBaseUrl) {
        return NextResponse.json(
          { error: "Invalid local server URL" },
          { status: 400 },
        );
      }
    } else {
      normalizedBaseUrl = DEFAULT_LOCAL_OPENAI_BASE_URL;
    }
  }

  const existing = db
    .select({ id: aiSettings.id, provider: aiSettings.provider })
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();

  async function validateAndLoadLocal(candidateApiKey: string): Promise<Response | null> {
    if (!isLocalProvider) return null;
    const loadError = await ensureLocalModelLoaded(modelId, normalizedBaseUrl ?? undefined, candidateApiKey);
    if (loadError) return NextResponse.json({ error: loadError }, { status: 422 });
    return null;
  }

  async function validateKey(candidateApiKey: string): Promise<Response | null> {
    const error = await validateApiKey(provider, modelId, candidateApiKey, normalizedBaseUrl ?? undefined);
    if (error) return NextResponse.json({ error }, { status: 422 });
    return null;
  }

  function replaceSettings(candidateApiKey: string): void {
    db.delete(aiSettings).run();
    const encrypted = encrypt(candidateApiKey);
    db.insert(aiSettings)
      .values({
        id: ulid(),
        provider,
        modelId,
        baseUrl: normalizedBaseUrl,
        updatedAt: new Date().toISOString(),
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();
  }

  if (apiKey) {
    const loadErr = await validateAndLoadLocal(apiKey);
    if (loadErr) return loadErr;
    const keyErr = await validateKey(apiKey);
    if (keyErr) return keyErr;
    replaceSettings(apiKey);
  } else if (!existing) {
    if (!isLocalProvider) {
      return NextResponse.json({ error: "API key is required for initial setup" }, { status: 400 });
    }
    const localApiKey = resolveLocalOpenAIApiKey(undefined);
    const loadErr = await validateAndLoadLocal(localApiKey);
    if (loadErr) return loadErr;
    const keyErr = await validateKey(localApiKey);
    if (keyErr) return keyErr;
    replaceSettings(localApiKey);
  } else if (provider !== existing.provider) {
    if (!isLocalProvider) {
      return NextResponse.json({ error: "Switching provider requires a new API key" }, { status: 400 });
    }
    const localApiKey = resolveLocalOpenAIApiKey(undefined);
    const loadErr = await validateAndLoadLocal(localApiKey);
    if (loadErr) return loadErr;
    const keyErr = await validateKey(localApiKey);
    if (keyErr) return keyErr;
    replaceSettings(localApiKey);
  } else {
    if (isLocalProvider) {
      const localApiKey = resolveLocalOpenAIApiKey(undefined);
      const loadErr = await validateAndLoadLocal(localApiKey);
      if (loadErr) return loadErr;
    }
    db.update(aiSettings)
      .set({ provider, modelId, baseUrl: normalizedBaseUrl, updatedAt: new Date().toISOString() })
      .where(eq(aiSettings.id, existing.id))
      .run();
    db.delete(aiSettings).where(ne(aiSettings.id, existing.id)).run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  db.delete(aiSettings).run();
  return NextResponse.json({ ok: true });
}
