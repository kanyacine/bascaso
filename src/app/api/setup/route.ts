import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials, aiSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  normalizeOpenAICompatibleBaseUrl,
  resolveLocalOpenAIApiKey,
} from "@/lib/ai/local-provider";
import {
  APPLE_FM_MODEL_ID,
  APPLE_FM_PROVIDER_ID,
  getAppleFmStatus,
} from "@/lib/ai/apple-fm";

const setupSchema = z.object({
  // ASC credentials – required
  name: z.string().trim().default("My team"),
  issuerId: z.string().min(1, "Issuer ID is required").trim(),
  keyId: z.string().min(1, "Key ID is required").trim(),
  privateKey: z.string().min(1, "Private key is required"),
  // AI settings – both optional, independently configurable
  local: z
    .discriminatedUnion("provider", [
      z.object({ provider: z.literal("apple-fm") }),
      z.object({
        provider: z.literal("local-openai"),
        modelId: z.string().trim().min(1),
        baseUrl: z.string().trim().optional(),
        apiKey: z.string().trim().optional(),
      }),
    ])
    .optional(),
  byok: z
    .object({
      provider: z.string().trim().min(1),
      modelId: z.string().trim().min(1),
      apiKey: z.string().trim().min(1),
    })
    .optional(),
});

function insertAiSettings(
  tier: "local" | "byok",
  provider: string,
  modelId: string,
  baseUrl: string | null,
  apiKey: string,
) {
  const encrypted = encrypt(apiKey);
  db.insert(aiSettings)
    .values({
      id: ulid(),
      tier,
      provider,
      modelId,
      baseUrl,
      encryptedApiKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    })
    .run();
}

export async function POST(request: Request) {
  // Check no active credentials exist (setup already done)
  const existing = db
    .select({ id: ascCredentials.id })
    .from(ascCredentials)
    .where(eq(ascCredentials.isActive, true))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, setupSchema);
  if (parsed instanceof Response) return parsed;
  const data = parsed;

  // Validate everything before storing anything.
  let normalizedLocalBaseUrl: string | null = null;
  let resolvedLocalApiKey = "";
  if (data.local?.provider === "local-openai") {
    normalizedLocalBaseUrl = data.local.baseUrl
      ? normalizeOpenAICompatibleBaseUrl(data.local.baseUrl)
      : DEFAULT_LOCAL_OPENAI_BASE_URL;
    if (!normalizedLocalBaseUrl) {
      return NextResponse.json(
        { error: "Invalid local server URL" },
        { status: 400 },
      );
    }
    resolvedLocalApiKey = resolveLocalOpenAIApiKey(data.local.apiKey);
    const loadError = await ensureLocalModelLoaded(
      data.local.modelId,
      normalizedLocalBaseUrl,
      resolvedLocalApiKey,
    );
    if (loadError) {
      return NextResponse.json({ error: loadError }, { status: 422 });
    }
    const keyError = await validateApiKey(
      data.local.provider,
      data.local.modelId,
      resolvedLocalApiKey,
      normalizedLocalBaseUrl,
    );
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 422 });
    }
  } else if (data.local?.provider === "apple-fm") {
    const status = await getAppleFmStatus();
    if (!status.available) {
      return NextResponse.json({ error: "apple_fm_unavailable" }, { status: 422 });
    }
  }
  if (data.byok) {
    if (
      isLocalOpenAIProvider(data.byok.provider) ||
      data.byok.provider === APPLE_FM_PROVIDER_ID
    ) {
      return NextResponse.json(
        { error: "BYOK requires a cloud provider" },
        { status: 400 },
      );
    }
    const keyError = await validateApiKey(
      data.byok.provider,
      data.byok.modelId,
      data.byok.apiKey,
    );
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 422 });
    }
  }

  // Store ASC credentials
  const encrypted = encrypt(data.privateKey);
  db.insert(ascCredentials)
    .values({
      id: ulid(),
      name: data.name,
      issuerId: data.issuerId,
      keyId: data.keyId,
      encryptedPrivateKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    })
    .run();

  // Store AI settings (already validated above)
  if (data.local?.provider === "apple-fm") {
    // Same placeholder key as the settings route: AFM needs no key, but the
    // row schema requires one.
    insertAiSettings("local", APPLE_FM_PROVIDER_ID, APPLE_FM_MODEL_ID, null, "afm");
  } else if (data.local?.provider === "local-openai") {
    insertAiSettings(
      "local",
      data.local.provider,
      data.local.modelId,
      normalizedLocalBaseUrl,
      resolvedLocalApiKey,
    );
  }
  if (data.byok) {
    insertAiSettings("byok", data.byok.provider, data.byok.modelId, null, data.byok.apiKey);
  }

  // Start background sync now that credentials are stored
  const { startSyncWorker } = await import("@/lib/sync/worker");
  startSyncWorker();

  return NextResponse.json({ ok: true });
}
