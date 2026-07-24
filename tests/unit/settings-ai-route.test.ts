import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

const mockValidateApiKey = vi.fn();
const mockNormalizeBaseUrl = vi.fn();
const mockResolveLocalApiKey = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalProvider = vi.fn();
const mockGetAppleFmStatus = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/ai/provider-factory", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock("@/lib/ai/local-provider", () => ({
  DEFAULT_LOCAL_OPENAI_BASE_URL: "http://127.0.0.1:1234/v1",
  normalizeOpenAICompatibleBaseUrl: (...args: unknown[]) => mockNormalizeBaseUrl(...args),
  resolveLocalOpenAIApiKey: (...args: unknown[]) => mockResolveLocalApiKey(...args),
  ensureLocalModelLoaded: (...args: unknown[]) => mockEnsureLocalModelLoaded(...args),
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalProvider(...args),
}));

vi.mock("@/lib/ai/apple-fm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/apple-fm")>();
  return {
    ...actual,
    getAppleFmStatus: (...args: unknown[]) => mockGetAppleFmStatus(...args),
  };
});

function putRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(tier?: string) {
  const url = tier ? `http://localhost/api/settings/ai?tier=${tier}` : "http://localhost/api/settings/ai";
  return new Request(url, { method: "DELETE" });
}

describe("PUT/GET/DELETE /api/settings/ai (per-tier)", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
    mockNormalizeBaseUrl.mockReset();
    mockNormalizeBaseUrl.mockReturnValue("http://localhost:1234/v1");
    mockResolveLocalApiKey.mockReset();
    mockResolveLocalApiKey.mockImplementation((key: string | undefined) => key ?? "local-key");
    mockEnsureLocalModelLoaded.mockReset();
    mockEnsureLocalModelLoaded.mockResolvedValue(null);
    mockIsLocalProvider.mockReset();
    mockIsLocalProvider.mockImplementation((provider: string) => provider === "local-openai");
    mockGetAppleFmStatus.mockReset();
    mockGetAppleFmStatus.mockResolvedValue({ available: true, reason: null });
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  // --- provider/tier consistency guard ---

  it("PUT rejects tier local when the provider is not local-openai", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ provider: "anthropic", modelId: "claude-sonnet-4", apiKey: "sk-test", tier: "local" }),
    );

    expect(response.status).toBe(400);
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(0);
  });

  it("PUT rejects tier byok when the provider is local-openai", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ provider: "local-openai", modelId: "qwen", tier: "byok" }),
    );

    expect(response.status).toBe(400);
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(0);
  });

  it("PUT rejects a body missing tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test" }),
    );

    expect(response.status).toBe(400);
  });

  // --- tier isolation ---

  it("PUT byok does not touch the local row", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");
    const { encrypt } = await import("@/lib/encryption");

    const encLocal = encrypt("local-key");
    testDb
      .insert(schema.aiSettings)
      .values({
        id: "local-1",
        provider: "local-openai",
        modelId: "qwen",
        baseUrl: "http://127.0.0.1:1234/v1",
        encryptedApiKey: encLocal.ciphertext,
        iv: encLocal.iv,
        authTag: encLocal.authTag,
        encryptedDek: encLocal.encryptedDek,
        tier: "local",
        updatedAt: "2025-01-01T00:00:00Z",
      })
      .run();

    const response = await PUT(
      putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }),
    );

    expect(response.status).toBe(200);
    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(2);
    const localRow = rows.find((r) => r.tier === "local");
    expect(localRow).toMatchObject({
      id: "local-1",
      provider: "local-openai",
      modelId: "qwen",
      updatedAt: "2025-01-01T00:00:00Z",
    });
  });

  it("PUT byok update-in-place (no new key) does not delete the local row", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");
    const { encrypt } = await import("@/lib/encryption");

    const encLocal = encrypt("local-key");
    testDb
      .insert(schema.aiSettings)
      .values({
        id: "local-1",
        provider: "local-openai",
        modelId: "qwen",
        baseUrl: "http://127.0.0.1:1234/v1",
        encryptedApiKey: encLocal.ciphertext,
        iv: encLocal.iv,
        authTag: encLocal.authTag,
        encryptedDek: encLocal.encryptedDek,
        tier: "local",
        updatedAt: "2025-01-01T00:00:00Z",
      })
      .run();

    await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }));

    mockValidateApiKey.mockClear();
    const response = await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1-mini", tier: "byok" }));

    expect(response.status).toBe(200);
    expect(mockValidateApiKey).not.toHaveBeenCalled();

    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.tier === "local")).toMatchObject({ id: "local-1", modelId: "qwen" });
    expect(rows.find((r) => r.tier === "byok")).toMatchObject({ modelId: "gpt-4.1-mini" });
  });

  // --- existing branch logic, now tier-scoped ---

  it("PUT stores initial settings for a tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mockValidateApiKey).toHaveBeenCalledWith("openai", "gpt-4.1", "sk-test", undefined);
    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe("byok");
  });

  it("PUT rejects missing API key for first byok setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1", tier: "byok" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "API key is required for initial setup" });
  });

  it("PUT rejects invalid local URLs", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockNormalizeBaseUrl.mockReturnValue(null);

    const response = await PUT(
      putRequest({ provider: "local-openai", modelId: "qwen", baseUrl: "bad-url", tier: "local" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid local server URL" });
  });

  it("PUT updates an existing byok provider without replacing the API key", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }));
    mockValidateApiKey.mockClear();

    const response = await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1-mini", tier: "byok" }));
    const settings = testDb.select().from(schema.aiSettings).all();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(settings).toHaveLength(1);
    expect(settings[0]?.modelId).toBe("gpt-4.1-mini");
  });

  it("PUT requires a new API key when switching providers within the byok tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }));

    const response = await PUT(putRequest({ provider: "anthropic", modelId: "claude-sonnet-4", tier: "byok" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Switching provider requires a new API key" });
  });

  it("PUT configures the local tier without an explicit API key", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));
    const settings = testDb.select().from(schema.aiSettings).all();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockResolveLocalApiKey).toHaveBeenCalledWith(undefined);
    expect(mockEnsureLocalModelLoaded).toHaveBeenCalledWith("qwen", "http://127.0.0.1:1234/v1", "local-key");
    expect(mockValidateApiKey).toHaveBeenCalledWith("local-openai", "qwen", "local-key", "http://127.0.0.1:1234/v1");
    expect(settings).toHaveLength(1);
    expect(settings[0].tier).toBe("local");
  });

  it("PUT validates local model availability when updating an existing local row", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    mockEnsureLocalModelLoaded.mockResolvedValueOnce("still loading");

    const response = await PUT(
      putRequest({ provider: "local-openai", modelId: "qwen-2", baseUrl: "http://localhost:1234", tier: "local" }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "still loading" });
  });

  it("PUT returns key validation error for initial local setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockValidateApiKey.mockResolvedValue("invalid key for local");

    const response = await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid key for local" });
  });

  it("PUT returns load error for initial local setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockEnsureLocalModelLoaded.mockResolvedValue("model not available");

    const response = await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model not available" });
  });

  it("PUT returns load and key errors when apiKey is explicitly provided for the local tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockEnsureLocalModelLoaded.mockResolvedValueOnce("local model load failed");

    let response = await PUT(
      putRequest({ provider: "local-openai", modelId: "qwen", apiKey: "explicit-key", tier: "local" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "local model load failed" });

    mockEnsureLocalModelLoaded.mockResolvedValueOnce(null);
    mockValidateApiKey.mockResolvedValueOnce("key validation failed");

    response = await PUT(
      putRequest({ provider: "local-openai", modelId: "qwen", apiKey: "explicit-key", tier: "local" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "key validation failed" });
  });

  // --- apple-fm on the local tier ---

  it("PUT stores an apple-fm local row when the sidecar is available (no key, no model load)", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ tier: "local", provider: "apple-fm", modelId: "apple-fm" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockGetAppleFmStatus).toHaveBeenCalled();
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(mockEnsureLocalModelLoaded).not.toHaveBeenCalled();

    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tier: "local",
      provider: "apple-fm",
      modelId: "apple-fm",
      baseUrl: null,
    });
  });

  it("PUT rejects apple-fm with 422 when the sidecar is unavailable", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");
    mockGetAppleFmStatus.mockResolvedValue({ available: false, reason: "model_not_ready" });

    const response = await PUT(
      putRequest({ tier: "local", provider: "apple-fm", modelId: "apple-fm" }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "apple_fm_unavailable" });
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(0);
  });

  it("PUT rejects apple-fm on the byok tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      putRequest({ tier: "byok", provider: "apple-fm", modelId: "apple-fm" }),
    );

    expect(response.status).toBe(400);
    expect(mockGetAppleFmStatus).not.toHaveBeenCalled();
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(0);
  });

  it("PUT switches an existing local-openai row to apple-fm within the local tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(1);

    const response = await PUT(
      putRequest({ tier: "local", provider: "apple-fm", modelId: "apple-fm" }),
    );

    expect(response.status).toBe(200);
    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: "local", provider: "apple-fm", modelId: "apple-fm" });
  });

  it("PUT switches an existing apple-fm row back to local-openai within the local tier", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ tier: "local", provider: "apple-fm", modelId: "apple-fm" }));
    expect(testDb.select().from(schema.aiSettings).all()[0]?.provider).toBe("apple-fm");

    mockEnsureLocalModelLoaded.mockClear();
    const response = await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    expect(response.status).toBe(200);
    expect(mockEnsureLocalModelLoaded).toHaveBeenCalled();
    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: "local", provider: "local-openai", modelId: "qwen" });
  });

  // --- GET ---

  it("GET returns null tiers and the default routing when nothing is configured", async () => {
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await GET();

    expect(await response.json()).toEqual({
      local: null,
      byok: null,
      routing: {
        groups: {
          redaction: { tier: "local", explicit: false },
          metadata: { tier: "byok", explicit: false },
          insights: { tier: "byok", explicit: false },
          workflows: { tier: "byok", explicit: false },
        },
        fallback: false,
      },
    });
  });

  it("GET exposes both tiers with hasApiKey once configured", async () => {
    const { PUT, GET } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1-mini", apiKey: "sk-test", tier: "byok" }));
    await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    const response = await GET();
    const data = await response.json();

    expect(data.byok).toEqual({ provider: "openai", modelId: "gpt-4.1-mini", baseUrl: null, hasApiKey: true });
    expect(data.local).toEqual({
      provider: "local-openai",
      modelId: "qwen",
      baseUrl: "http://127.0.0.1:1234/v1",
      hasApiKey: true,
    });
  });

  // --- DELETE ---

  it("DELETE requires a tier query param", async () => {
    const { DELETE } = await import("@/app/api/settings/ai/route");

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(400);
  });

  it("DELETE rejects an invalid tier value", async () => {
    const { DELETE } = await import("@/app/api/settings/ai/route");

    const response = await DELETE(deleteRequest("bogus"));

    expect(response.status).toBe(400);
  });

  it("DELETE removes only the targeted tier's row", async () => {
    const { PUT, DELETE } = await import("@/app/api/settings/ai/route");

    await PUT(putRequest({ provider: "openai", modelId: "gpt-4.1", apiKey: "sk-test", tier: "byok" }));
    await PUT(putRequest({ provider: "local-openai", modelId: "qwen", tier: "local" }));

    const response = await DELETE(deleteRequest("byok"));

    expect(await response.json()).toEqual({ ok: true });
    const rows = testDb.select().from(schema.aiSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe("local");
  });
});
