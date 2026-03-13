import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

const mockValidateApiKey = vi.fn();
const mockClearFreeSelectedAppId = vi.fn();
const mockStartSyncWorker = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockNormalizeBaseUrl = vi.fn();
const mockResolveLocalApiKey = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockGenerateAscJwt = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/ai/provider-factory", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock("@/lib/app-preferences", () => ({
  clearFreeSelectedAppId: () => mockClearFreeSelectedAppId(),
}));

vi.mock("@/lib/sync/worker", () => ({
  startSyncWorker: () => mockStartSyncWorker(),
}));

vi.mock("@/lib/ai/local-provider", () => ({
  DEFAULT_LOCAL_OPENAI_BASE_URL: "http://127.0.0.1:1234/v1",
  ensureLocalModelLoaded: (...args: unknown[]) => mockEnsureLocalModelLoaded(...args),
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalOpenAIProvider(...args),
  normalizeOpenAICompatibleBaseUrl: (...args: unknown[]) => mockNormalizeBaseUrl(...args),
  resolveLocalOpenAIApiKey: (...args: unknown[]) => mockResolveLocalApiKey(...args),
}));

vi.mock("@/lib/asc/jwt", () => ({
  generateAscJwt: (...args: unknown[]) => mockGenerateAscJwt(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("setup routes", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
    mockClearFreeSelectedAppId.mockReset();
    mockStartSyncWorker.mockReset();
    mockIsLocalOpenAIProvider.mockReset();
    mockIsLocalOpenAIProvider.mockReturnValue(false);
    mockNormalizeBaseUrl.mockReset();
    mockNormalizeBaseUrl.mockReturnValue("http://localhost:1234/v1");
    mockResolveLocalApiKey.mockReset();
    mockResolveLocalApiKey.mockImplementation((value) => value ?? "local-key");
    mockEnsureLocalModelLoaded.mockReset();
    mockEnsureLocalModelLoaded.mockResolvedValue(null);
    mockGenerateAscJwt.mockReset();
    mockGenerateAscJwt.mockReturnValue("jwt-token");
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 422 }),
    );
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

  it("POST /api/setup rejects repeated setup", async () => {
    const { encrypt } = await import("@/lib/encryption");

    const encrypted = encrypt("private-key");
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-1",
        issuerId: "issuer-1",
        keyId: "key-1",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const { POST } = await import("@/app/api/setup/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-new",
          keyId: "key-new",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Setup already completed");
  });

  it("POST /api/setup stores credentials and starts sync", async () => {
    const { POST } = await import("@/app/api/setup/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My team",
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(1);
    expect(mockClearFreeSelectedAppId).toHaveBeenCalled();
    expect(mockStartSyncWorker).toHaveBeenCalled();
  });

  it("POST /api/setup validates local provider configuration before saving", async () => {
    const { POST } = await import("@/app/api/setup/route");

    mockIsLocalOpenAIProvider.mockReturnValue(true);
    mockNormalizeBaseUrl.mockReturnValue("http://localhost:1234/v1");
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
          aiProvider: "local-openai",
          aiModelId: "qwen",
          aiBaseUrl: "http://localhost:1234",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("model not loaded");
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(0);
  });

  it("POST /api/setup rejects invalid local AI base URL", async () => {
    const { POST } = await import("@/app/api/setup/route");

    mockIsLocalOpenAIProvider.mockReturnValue(true);
    mockNormalizeBaseUrl.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
          aiProvider: "local-openai",
          aiModelId: "qwen",
          aiBaseUrl: "bad-url",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid local server URL" });
  });

  it("POST /api/setup uses default local base URL when none provided", async () => {
    const { POST } = await import("@/app/api/setup/route");

    mockIsLocalOpenAIProvider.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
          aiProvider: "local-openai",
          aiModelId: "qwen",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockEnsureLocalModelLoaded).toHaveBeenCalledWith(
      "qwen",
      "http://127.0.0.1:1234/v1",
      "local-key",
    );
  });

  it("POST /api/setup returns AI validation error when validateApiKey fails", async () => {
    const { POST } = await import("@/app/api/setup/route");

    mockValidateApiKey.mockResolvedValue("invalid AI key");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
          aiProvider: "openai",
          aiModelId: "gpt-4.1",
          aiApiKey: "bad-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("invalid AI key");
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(0);
  });

  it("POST /api/setup stores AI settings alongside credentials", async () => {
    const { POST } = await import("@/app/api/setup/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
          aiProvider: "openai",
          aiModelId: "gpt-4.1",
          aiApiKey: "sk-test",
        }),
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(1);
    expect(testDb.select().from(schema.aiSettings).all()).toHaveLength(1);
    const ai = testDb.select().from(schema.aiSettings).all()[0];
    expect(ai.provider).toBe("openai");
    expect(ai.modelId).toBe("gpt-4.1");
  });

  it("POST /api/setup/test-connection returns 403 for non-admin keys", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "app-1" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 403 }));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Key does not have sufficient permissions. Admin access is required.",
    });
  });

  it("POST /api/setup/test-connection returns validation details", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
  });

  it("POST /api/setup/test-connection returns ASC auth errors with response text", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("App Store Connect returned 401");
    expect(data.details).toBe("Unauthorized");
  });

  it("POST /api/setup/test-connection rejects invalid JSON bodies", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("POST /api/setup/test-connection returns success when auth succeeds without apps", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("POST /api/setup/test-connection rejects non-admin keys and maps jwt failures", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "app-1" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    let response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Key does not have sufficient permissions. Admin access is required.",
    });

    mockGenerateAscJwt.mockImplementationOnce(() => {
      throw new Error("jwt failed");
    });
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /api/setup/test-connection returns permission errors from analytics access", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "app-1" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 403 }));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Key does not have sufficient permissions. Admin access is required.",
    });
  });

  it("POST /api/setup/test-connection maps JWT generation failures through errorJson", async () => {
    const { POST } = await import("@/app/api/setup/test-connection/route");
    mockGenerateAscJwt.mockImplementation(() => {
      throw new Error("bad key");
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );

    expect(mockErrorJson).toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "mapped" });
  });
});
