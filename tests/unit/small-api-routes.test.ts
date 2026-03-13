import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

const mockCacheInvalidate = vi.fn();
const mockResetToken = vi.fn();
const mockTriggerSync = vi.fn();
const mockMarkFeedbackCompleted = vi.fn();
const mockUnmarkFeedbackCompleted = vi.fn();
const mockIsDemoMode = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/cache", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  resetToken: () => mockResetToken(),
}));

vi.mock("@/lib/sync/worker", () => ({
  triggerSync: () => mockTriggerSync(),
}));

vi.mock("@/lib/feedback-completed", () => ({
  markFeedbackCompleted: (...args: unknown[]) => mockMarkFeedbackCompleted(...args),
  unmarkFeedbackCompleted: (...args: unknown[]) => mockUnmarkFeedbackCompleted(...args),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
}));

describe("small API routes", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    mockCacheInvalidate.mockReset();
    mockResetToken.mockReset();
    mockTriggerSync.mockReset();
    mockMarkFeedbackCompleted.mockReset();
    mockUnmarkFeedbackCompleted.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  it("GET /api/ai/check reports whether AI settings exist", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const { GET } = await import("@/app/api/ai/check/route");

    const before = await GET();
    expect(await before.json()).toEqual({ configured: false });

    const encrypted = encrypt("sk-test");
    testDb.insert(schema.aiSettings).values({
      id: "ai-1",
      provider: "openai",
      modelId: "gpt-4.1",
      encryptedApiKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    }).run();

    const after = await GET();
    expect(await after.json()).toEqual({ configured: true });
  });

  it("POST /api/settings/credentials/[id]/activate returns 404 when missing", async () => {
    const { POST } = await import("@/app/api/settings/credentials/[id]/activate/route");

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Credential not found");
  });

  it("POST /api/settings/credentials/[id]/activate switches the active credential", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const { POST } = await import("@/app/api/settings/credentials/[id]/activate/route");

    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");
    testDb.insert(schema.ascCredentials).values({
      id: "cred-1",
      name: "Team A",
      issuerId: "issuer-1",
      keyId: "key-1",
      isActive: true,
      encryptedPrivateKey: enc1.ciphertext,
      iv: enc1.iv,
      authTag: enc1.authTag,
      encryptedDek: enc1.encryptedDek,
    }).run();
    testDb.insert(schema.ascCredentials).values({
      id: "cred-2",
      name: "Team B",
      issuerId: "issuer-2",
      keyId: "key-2",
      isActive: false,
      encryptedPrivateKey: enc2.ciphertext,
      iv: enc2.iv,
      authTag: enc2.authTag,
      encryptedDek: enc2.encryptedDek,
    }).run();

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred-2" }),
    });
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mockCacheInvalidate).toHaveBeenCalledWith("apps");
    expect(mockResetToken).toHaveBeenCalled();
    expect(mockTriggerSync).toHaveBeenCalled();

    const active = testDb.select().from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true)).all();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("cred-2");
  });

  it("POST /testflight/feedback/completed validates feedbackId", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/completed/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("feedbackId is required");
  });

  it("POST and DELETE /testflight/feedback/completed mark and unmark feedback", async () => {
    const route = await import(
      "@/app/api/apps/[appId]/testflight/feedback/completed/route"
    );

    const postResponse = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: "fb-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(await postResponse.json()).toEqual({ ok: true });
    expect(mockMarkFeedbackCompleted).toHaveBeenCalledWith("fb-1", "app-1");

    const deleteResponse = await route.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: "fb-1" }),
      }),
    );
    expect(await deleteResponse.json()).toEqual({ ok: true });
    expect(mockUnmarkFeedbackCompleted).toHaveBeenCalledWith("fb-1");
  });

  it("POST /testflight/feedback/completed returns ok in demo mode", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/completed/route"
    );

    mockIsDemoMode.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: "fb-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockMarkFeedbackCompleted).not.toHaveBeenCalled();
  });

  it("DELETE /testflight/feedback/completed returns ok in demo mode", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/completed/route"
    );

    mockIsDemoMode.mockReturnValue(true);

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: "fb-1" }),
      }),
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockUnmarkFeedbackCompleted).not.toHaveBeenCalled();
  });

  it("DELETE /testflight/feedback/completed validates feedbackId", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/completed/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("feedbackId is required");
  });
});
