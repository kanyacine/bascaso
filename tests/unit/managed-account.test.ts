import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY = "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";
let testDb: ReturnType<typeof createTestDb>;
vi.mock("@/db", () => ({ get db() { return testDb; } }));

describe("managed account session store", () => {
  beforeEach(() => {
    testDb = createTestDb();
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  // The tokens carry a dash: it is not part of the base64 alphabet, so no encrypted
  // output can contain them by accident. The "at" and "rt" values used before failed
  // this test in ~2 % of runs – a two-character sequence inevitably appears somewhere in
  // 88 characters of random base64, and the failure taught nothing about the
  // encryption.
  it("round-trips a session encrypted at rest", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    const session = {
      email: "a@b.c",
      accessToken: "access-token-plaintext-marker",
      refreshToken: "refresh-token-plaintext-marker",
      expiresAt: 123,
    };
    saveManagedSession(session);
    expect(getManagedSession()).toEqual(session);
    const row = testDb.$client.prepare("SELECT encrypted_session FROM managed_account").get() as { encrypted_session: string };
    expect(row.encrypted_session).not.toContain(session.accessToken);
    expect(row.encrypted_session).not.toContain(session.refreshToken);
  });

  it("returns null when empty, clears on demand, keeps a single row", async () => {
    const { saveManagedSession, getManagedSession, clearManagedSession } = await import("@/lib/managed/account");
    expect(getManagedSession()).toBeNull();
    saveManagedSession({ email: "a@b.c", accessToken: "1", refreshToken: "1", expiresAt: 1 });
    saveManagedSession({ email: "d@e.f", accessToken: "2", refreshToken: "2", expiresAt: 2 });
    expect(getManagedSession()!.email).toBe("d@e.f");
    const count = testDb.$client.prepare("SELECT COUNT(*) AS n FROM managed_account").get() as { n: number };
    expect(count.n).toBe(1);
    clearManagedSession();
    expect(getManagedSession()).toBeNull();
  });
});
