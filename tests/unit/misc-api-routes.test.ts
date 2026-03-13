import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

const mockGetSyncStatus = vi.fn();
const mockHasGeminiKey = vi.fn();
const mockSaveGeminiKey = vi.fn();
const mockRemoveGeminiKey = vi.fn();
const mockGetAISettings = vi.fn();
const mockValidateApiKey = vi.fn();
const mockClearFreeSelectedAppId = vi.fn();
const mockNormalizeBaseUrl = vi.fn();
const mockResolveLocalApiKey = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalProvider = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/sync/worker", () => ({
  getSyncStatus: () => mockGetSyncStatus(),
}));

vi.mock("@/lib/ai/gemini-key", () => ({
  hasGeminiKey: () => mockHasGeminiKey(),
  saveGeminiKey: (...args: unknown[]) => mockSaveGeminiKey(...args),
  removeGeminiKey: () => mockRemoveGeminiKey(),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAISettings: () => mockGetAISettings(),
}));

vi.mock("@/lib/ai/provider-factory", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock("@/lib/app-preferences", () => ({
  clearFreeSelectedAppId: () => mockClearFreeSelectedAppId(),
}));

vi.mock("@/lib/ai/local-provider", () => ({
  DEFAULT_LOCAL_OPENAI_BASE_URL: "http://127.0.0.1:1234/v1",
  normalizeOpenAICompatibleBaseUrl: (...args: unknown[]) => mockNormalizeBaseUrl(...args),
  resolveLocalOpenAIApiKey: (...args: unknown[]) => mockResolveLocalApiKey(...args),
  ensureLocalModelLoaded: (...args: unknown[]) => mockEnsureLocalModelLoaded(...args),
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalProvider(...args),
}));

describe("misc API routes", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    mockGetSyncStatus.mockReset();
    mockHasGeminiKey.mockReset();
    mockSaveGeminiKey.mockReset();
    mockRemoveGeminiKey.mockReset();
    mockGetAISettings.mockReset();
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
    mockClearFreeSelectedAppId.mockReset();
    mockNormalizeBaseUrl.mockReset();
    mockNormalizeBaseUrl.mockReturnValue("http://localhost:1234/v1");
    mockResolveLocalApiKey.mockReset();
    mockResolveLocalApiKey.mockImplementation((key) => key ?? "local-key");
    mockEnsureLocalModelLoaded.mockReset();
    mockEnsureLocalModelLoaded.mockResolvedValue(null);
    mockIsLocalProvider.mockReset();
    mockIsLocalProvider.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  it("GET /api/health reports setup required with no active credential", async () => {
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ status: "ok", setup: true, demo: false });
  });

  it("GET /api/health reports active demo credentials and tolerates setup-table errors", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const { GET } = await import("@/app/api/health/route");

    const encrypted = encrypt("private-key");
    testDb.insert(schema.ascCredentials).values({
      id: "cred-1",
      issuerId: "issuer-1",
      keyId: "key-1",
      encryptedPrivateKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
      isActive: true,
      isDemo: true,
    }).run();

    let response = await GET();
    expect(await response.json()).toEqual({ status: "ok", setup: false, demo: true });

    testDb = {
      select() {
        throw new Error("db unavailable");
      },
    } as unknown as ReturnType<typeof createTestDb>;

    response = await GET();
    expect(await response.json()).toEqual({ status: "ok", setup: true, demo: false });
  });

  it("GET /api/sync/status returns worker schedules", async () => {
    const { GET } = await import("@/app/api/sync/status/route");

    mockGetSyncStatus.mockReturnValue({ running: true });

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ schedules: { running: true } });
  });

  it("GET /api/settings/gemini-key reflects main provider usage", async () => {
    const { GET } = await import("@/app/api/settings/gemini-key/route");

    mockHasGeminiKey.mockResolvedValue(true);
    mockGetAISettings.mockResolvedValue({ provider: "google" });

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ available: true, fromMainProvider: true });
  });

  it("PUT /api/settings/gemini-key saves the key", async () => {
    const { PUT } = await import("@/app/api/settings/gemini-key/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "gemini-key" }),
      }),
    );
    const data = await response.json();

    expect(mockSaveGeminiKey).toHaveBeenCalledWith("gemini-key");
    expect(data).toEqual({ ok: true });
  });

  it("settings/gemini-key validates payloads and supports deletion", async () => {
    const route = await import("@/app/api/settings/gemini-key/route");

    let response = await route.PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "   " }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    response = await route.DELETE();
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRemoveGeminiKey).toHaveBeenCalled();
  });

  it("POST /api/settings/ai/local-models lists models from a local server", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "qwen" }, { id: "llama" }] }), {
        status: 200,
      }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:1234" }),
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ models: ["qwen", "llama"] });
  });

  it("POST /api/settings/ai/local-models handles invalid urls, upstream errors, and fetch failures", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    mockNormalizeBaseUrl.mockReturnValueOnce(null);
    let response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "bad-url" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid local server URL" });

    mockNormalizeBaseUrl.mockReturnValueOnce("http://localhost:1234/v1");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "upstream bad" } }), { status: 500 }),
    );
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:1234", apiKey: "abc" }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "upstream bad" });

    vi.mocked(fetch).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:1234" }),
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Could not reach local server");
  });

  it("POST /api/setup/demo creates a demo credential and DELETE removes it", async () => {
    const setupDemo = await import("@/app/api/setup/demo/route");

    const createResponse = await setupDemo.POST();
    const createData = await createResponse.json();
    expect(createData).toEqual({ ok: true });
    expect(mockClearFreeSelectedAppId).toHaveBeenCalled();
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(1);

    const deleteResponse = await setupDemo.DELETE();
    const deleteData = await deleteResponse.json();
    expect(deleteData).toEqual({ ok: true });
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(0);
  });

  it("POST /api/setup/demo rejects repeated setup", async () => {
    const setupDemo = await import("@/app/api/setup/demo/route");

    await setupDemo.POST();
    const response = await setupDemo.POST();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Setup already completed" });
  });

  it("PUT /api/settings/ai stores initial provider settings", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mockValidateApiKey).toHaveBeenCalledWith(
      "openai",
      "gpt-4.1",
      "sk-test",
      undefined,
    );
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(1);
  });

  it("GET /api/settings/ai returns null when no settings exist", async () => {
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await GET();

    expect(await response.json()).toEqual({ settings: null });
  });

  it("GET /api/settings/ai returns the latest saved settings with hasApiKey", async () => {
    const { PUT, GET } = await import("@/app/api/settings/ai/route");

    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1-mini",
          apiKey: "sk-test",
        }),
      }),
    );

    const response = await GET();

    expect(await response.json()).toEqual({
      settings: expect.objectContaining({
        provider: "openai",
        modelId: "gpt-4.1-mini",
        baseUrl: null,
        hasApiKey: true,
      }),
    });
  });

  it("PUT /api/settings/ai rejects missing API key for first non-local setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "API key is required for initial setup",
    });
  });

  it("PUT /api/settings/ai rejects invalid local URLs", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    mockNormalizeBaseUrl.mockReturnValue(null);

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          baseUrl: "bad-url",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid local server URL" });
  });

  it("PUT /api/settings/ai updates an existing provider without replacing the API key", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );

    mockValidateApiKey.mockClear();

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1-mini",
        }),
      }),
    );

    const settings = testDb.select().from(schema.aiSettings).all();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(settings).toHaveLength(1);
    expect(settings[0]?.modelId).toBe("gpt-4.1-mini");
  });

  it("PUT /api/settings/ai requires a new API key when switching non-local providers", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "anthropic",
          modelId: "claude-sonnet-4",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Switching provider requires a new API key",
    });
  });

  it("PUT /api/settings/ai configures a local provider without an explicit API key", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    mockEnsureLocalModelLoaded.mockResolvedValue(null);

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
        }),
      }),
    );

    const settings = testDb.select().from(schema.aiSettings).all();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockResolveLocalApiKey).toHaveBeenCalledWith(undefined);
    expect(mockEnsureLocalModelLoaded).toHaveBeenCalledWith(
      "qwen",
      "http://127.0.0.1:1234/v1",
      "local-key",
    );
    expect(mockValidateApiKey).toHaveBeenCalledWith(
      "local-openai",
      "qwen",
      "local-key",
      "http://127.0.0.1:1234/v1",
    );
    expect(settings).toHaveLength(1);
  });

  it("PUT /api/settings/ai switches from a remote provider to a local provider", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );

    mockIsLocalProvider.mockReturnValue(true);
    mockValidateApiKey.mockClear();

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          baseUrl: "http://localhost:1234",
        }),
      }),
    );

    const settings = testDb.select().from(schema.aiSettings).all();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockResolveLocalApiKey).toHaveBeenCalledWith(undefined);
    expect(mockValidateApiKey).toHaveBeenCalledWith(
      "local-openai",
      "qwen",
      "local-key",
      "http://localhost:1234/v1",
    );
    expect(settings).toHaveLength(1);
    expect(settings[0]?.provider).toBe("local-openai");
  });

  it("PUT /api/settings/ai validates local model availability when updating an existing local provider", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
        }),
      }),
    );

    mockEnsureLocalModelLoaded.mockResolvedValueOnce("still loading");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen-2",
          baseUrl: "http://localhost:1234",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "still loading" });
  });

  it("PUT /api/settings/ai returns key validation error for initial local provider setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    mockValidateApiKey.mockResolvedValue("invalid key for local");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid key for local" });
  });

  it("PUT /api/settings/ai returns load error for initial local provider setup", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    mockEnsureLocalModelLoaded.mockResolvedValue("model not available");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model not available" });
  });

  it("PUT /api/settings/ai returns load and key errors when apiKey is provided for local provider", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    mockIsLocalProvider.mockReturnValue(true);
    mockEnsureLocalModelLoaded.mockResolvedValueOnce("local model load failed");

    let response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          apiKey: "explicit-key",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "local model load failed" });

    mockEnsureLocalModelLoaded.mockResolvedValueOnce(null);
    mockValidateApiKey.mockResolvedValueOnce("key validation failed");

    response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          apiKey: "explicit-key",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "key validation failed" });
  });

  it("PUT /api/settings/ai returns load and key errors when switching to local provider", async () => {
    const { PUT } = await import("@/app/api/settings/ai/route");

    // First, set up an existing remote provider
    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );

    // Now switch to local – test loadErr path
    mockIsLocalProvider.mockReturnValue(true);
    mockEnsureLocalModelLoaded.mockResolvedValueOnce("model unavailable");

    let response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          baseUrl: "http://localhost:1234",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model unavailable" });

    // Test keyErr path when switching to local
    mockEnsureLocalModelLoaded.mockResolvedValueOnce(null);
    mockValidateApiKey.mockResolvedValueOnce("bad local key");

    response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "local-openai",
          modelId: "qwen",
          baseUrl: "http://localhost:1234",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "bad local key" });
  });

  it("POST /api/settings/ai/local-models returns fallback message for non-ok responses without error.message", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ something: "else" }), { status: 500 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:1234" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Model lookup failed with status 500" });
  });

  it("POST /api/settings/ai/local-models rejects invalid JSON body", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid JSON body" });
  });

  it("POST /api/settings/ai/local-models handles non-Error thrown values", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockRejectedValueOnce("string error");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:1234" }),
      }),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Could not reach local server: string error");
  });

  it("POST /api/settings/ai/local-models uses default base URL when none provided", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "model-1" }] }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: ["model-1"] });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("POST /api/settings/ai/local-models handles empty response body", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(await response.json()).toEqual({ models: [] });
  });

  it("POST /api/settings/ai/local-models handles response without data array", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ models: ["a"] }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(await response.json()).toEqual({ models: [] });
  });

  it("POST /api/settings/ai/local-models filters out empty model IDs", async () => {
    const { POST } = await import("@/app/api/settings/ai/local-models/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "model-1" }, { id: "" }, { id: "  " }, {}] }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(await response.json()).toEqual({ models: ["model-1"] });
  });

  it("DELETE /api/settings/ai removes saved settings", async () => {
    const settingsRoute = await import("@/app/api/settings/ai/route");

    await settingsRoute.PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          modelId: "gpt-4.1",
          apiKey: "sk-test",
        }),
      }),
    );

    const response = await settingsRoute.DELETE();

    expect(await response.json()).toEqual({ ok: true });
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(0);
  });
});
