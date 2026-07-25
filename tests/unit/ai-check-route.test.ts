import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

describe("GET /api/ai/check", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  it("reports configured when only a managed account exists", async () => {
    testDb.$client
      .prepare(
        "INSERT INTO managed_account (id, email, encrypted_session, iv, auth_tag, encrypted_dek, updated_at) VALUES ('1','a@b.c','x','x','x','x','now')",
      )
      .run();
    const { GET } = await import("@/app/api/ai/check/route");
    const res = await GET();
    expect(await res.json()).toEqual({ configured: true });
  });
});
