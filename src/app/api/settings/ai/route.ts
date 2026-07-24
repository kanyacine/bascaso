import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { and, eq, ne, sql } from "drizzle-orm";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  normalizeOpenAICompatibleBaseUrl,
  resolveLocalOpenAIApiKey,
} from "@/lib/ai/local-provider";
import { APPLE_FM_MODEL_ID, APPLE_FM_PROVIDER_ID, getAppleFmStatus } from "@/lib/ai/apple-fm";
import {
  getAppleFmAllowUnsupportedLanguages,
  getRoutingFallbackEnabled,
  getRoutingTier,
  isRoutingTierExplicit,
} from "@/lib/app-preferences";
import { AI_ROUTED_GROUPS, type AIGroupId, type AITier } from "@/lib/ai/tasks";

function projectTier(tier: AITier) {
  const row = db
    .select({
      provider: aiSettings.provider,
      modelId: aiSettings.modelId,
      baseUrl: aiSettings.baseUrl,
    })
    .from(aiSettings)
    .where(eq(aiSettings.tier, tier))
    .get();

  return row ? { ...row, hasApiKey: true as const } : null;
}

export async function GET() {
  const groups: Partial<Record<AIGroupId, { tier: AITier; explicit: boolean }>> = {};
  for (const group of AI_ROUTED_GROUPS) {
    groups[group] = {
      tier: getRoutingTier(group),
      explicit: isRoutingTierExplicit(group),
    };
  }

  return NextResponse.json({
    local: projectTier("local"),
    byok: projectTier("byok"),
    routing: {
      groups,
      fallback: getRoutingFallbackEnabled(),
      allowUnsupportedLanguages: getAppleFmAllowUnsupportedLanguages(),
    },
  });
}

const updateSchema = z.object({
  provider: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().optional(),
  tier: z.enum(["local", "byok"]),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const provider = parsed.provider.trim();
  const modelId = parsed.modelId.trim();
  const apiKey = parsed.apiKey?.trim();
  const baseUrl = parsed.baseUrl?.trim();
  const tier = parsed.tier;
  const isLocalProvider = isLocalOpenAIProvider(provider);
  const isAppleFm = provider === APPLE_FM_PROVIDER_ID;

  if (tier === "local" && !isLocalProvider && !isAppleFm) {
    return NextResponse.json(
      { error: "Local tier requires the local-openai provider" },
      { status: 400 },
    );
  }
  if (tier === "byok" && (isLocalProvider || isAppleFm)) {
    return NextResponse.json(
      { error: "BYOK tier requires a non-local provider" },
      { status: 400 },
    );
  }

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
    .where(eq(aiSettings.tier, tier))
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

  function replaceSettings(candidateApiKey: string, overrideModelId?: string): void {
    db.delete(aiSettings).where(eq(aiSettings.tier, tier)).run();
    const encrypted = encrypt(candidateApiKey);
    db.insert(aiSettings)
      .values({
        id: ulid(),
        provider,
        modelId: overrideModelId ?? modelId,
        baseUrl: normalizedBaseUrl,
        tier,
        updatedAt: new Date().toISOString(),
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();
  }

  // Apple Foundation Model (local tier): no key and no model-load handshake –
  // just require the sidecar to report available, then store a placeholder row.
  // The live `/v1` URL is resolved from the state file at request time, so
  // baseUrl stays null here. This short-circuits the key-reuse branches below,
  // so a within-local switch (local-openai ⇄ apple-fm) routes correctly:
  // apple-fm lands here; local-openai flows through the local-key path.
  if (isAppleFm) {
    const status = await getAppleFmStatus();
    if (!status.available) {
      return NextResponse.json({ error: "apple_fm_unavailable" }, { status: 422 });
    }
    replaceSettings("afm", APPLE_FM_MODEL_ID);
    return NextResponse.json({ ok: true });
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
    db.delete(aiSettings)
      .where(and(eq(aiSettings.tier, tier), ne(aiSettings.id, existing.id)))
      .run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const tier = new URL(request.url).searchParams.get("tier");
  if (tier !== "local" && tier !== "byok") {
    return NextResponse.json({ error: "tier must be 'local' or 'byok'" }, { status: 400 });
  }

  db.delete(aiSettings).where(eq(aiSettings.tier, tier)).run();
  return NextResponse.json({ ok: true });
}
