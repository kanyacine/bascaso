import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

const mockCacheInvalidateAll = vi.fn();
const mockResetToken = vi.fn();
const mockIsPro = vi.fn();
const mockStartSyncWorker = vi.fn();
const mockTriggerSync = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/cache", () => ({
  cacheInvalidateAll: () => mockCacheInvalidateAll(),
}));

vi.mock("@/lib/asc/client", () => ({
  resetToken: () => mockResetToken(),
}));

vi.mock("@/lib/license", () => ({
  isPro: () => mockIsPro(),
  FREE_LIMITS: { teams: 1 },
}));

vi.mock("@/lib/sync/worker", () => ({
  startSyncWorker: () => mockStartSyncWorker(),
  triggerSync: () => mockTriggerSync(),
}));

describe("settings credentials route", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    mockCacheInvalidateAll.mockReset();
    mockResetToken.mockReset();
    mockIsPro.mockReturnValue(false);
    mockStartSyncWorker.mockReset();
    mockTriggerSync.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  it("GET returns stored non-demo credentials", async () => {
    const { encrypt } = await import("@/lib/encryption");

    const encrypted = encrypt("private-key");
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-1",
        name: "My team",
        issuerId: "issuer-1",
        keyId: "key-1",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const { GET } = await import("@/app/api/settings/credentials/route");
    const response = await GET();
    const data = await response.json();

    expect(data.credentials).toHaveLength(1);
    expect(data.credentials[0]).toMatchObject({
      id: "cred-1",
      name: "My team",
      issuerId: "issuer-1",
      keyId: "key-1",
      isActive: true,
    });
  });

  it("POST rejects duplicate issuer and key", async () => {
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

    const { POST } = await import("@/app/api/settings/credentials/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Another team",
          issuerId: "issuer-1",
          keyId: "key-1",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already exists");
  });

  it("POST enforces the free plan team limit", async () => {
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

    const { POST } = await import("@/app/api/settings/credentials/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Another team",
          issuerId: "issuer-2",
          keyId: "key-2",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.upgrade).toBe(true);
  });

  it("POST stores a credential, deactivates existing ones, and starts sync", async () => {
    const { encrypt } = await import("@/lib/encryption");

    const existing = encrypt("existing-key");
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-old",
        issuerId: "issuer-old",
        keyId: "key-old",
        encryptedPrivateKey: existing.ciphertext,
        iv: existing.iv,
        authTag: existing.authTag,
        encryptedDek: existing.encryptedDek,
      })
      .run();

    mockIsPro.mockReturnValue(true);

    const { POST } = await import("@/app/api/settings/credentials/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New team",
          issuerId: "issuer-new",
          keyId: "key-new",
          privateKey: "private-key",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.ok).toBe(true);

    const all = testDb.select().from(schema.ascCredentials).all();
    expect(all).toHaveLength(2);
    expect(all.find((row) => row.id === "cred-old")?.isActive).toBe(false);
    expect(all.find((row) => row.id === data.id)?.name).toBe("New team");
    expect(mockCacheInvalidateAll).toHaveBeenCalled();
    expect(mockResetToken).toHaveBeenCalled();
    expect(mockStartSyncWorker).toHaveBeenCalled();
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it("PATCH renames a stored credential", async () => {
    const { encrypt } = await import("@/lib/encryption");

    const encrypted = encrypt("private-key");
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-1",
        name: "Old name",
        issuerId: "issuer-1",
        keyId: "key-1",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const { PATCH } = await import("@/app/api/settings/credentials/route");
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1", name: "New name" }),
      }),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    const updated = testDb
      .select({ name: schema.ascCredentials.name })
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.id, "cred-1"))
      .get();
    expect(updated?.name).toBe("New name");
  });

  it("DELETE returns 400 when id is missing", async () => {
    const { DELETE } = await import("@/app/api/settings/credentials/route");
    const response = await DELETE(
      new Request("http://localhost/api/settings/credentials"),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing id");
  });

  it("DELETE auto-activates the first remaining credential when the active one is deleted", async () => {
    const { encrypt } = await import("@/lib/encryption");

    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-1",
        name: "Team A",
        issuerId: "issuer-1",
        keyId: "key-1",
        isActive: true,
        encryptedPrivateKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();
    testDb
      .insert(schema.ascCredentials)
      .values({
        id: "cred-2",
        name: "Team B",
        issuerId: "issuer-2",
        keyId: "key-2",
        isActive: false,
        encryptedPrivateKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    const { DELETE } = await import("@/app/api/settings/credentials/route");
    const response = await DELETE(
      new Request("http://localhost/api/settings/credentials?id=cred-1"),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, redirectToSetup: false });
    const remaining = testDb.select().from(schema.ascCredentials).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("cred-2");
    expect(remaining[0].isActive).toBe(true);
    expect(mockCacheInvalidateAll).toHaveBeenCalled();
  });

  it("DELETE removes a credential and redirects to setup when none remain", async () => {
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

    const { DELETE } = await import("@/app/api/settings/credentials/route");
    const response = await DELETE(
      new Request("http://localhost/api/settings/credentials?id=cred-1"),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, redirectToSetup: true });
    expect(testDb.select().from(schema.ascCredentials).all()).toHaveLength(0);
    expect(mockResetToken).toHaveBeenCalled();
  });
});
