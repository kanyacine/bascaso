import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY = "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Mock IS_MAS as true for StoreKit route tests
vi.mock("@/lib/license-shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/license-shared")>();
  return { ...original, IS_MAS: true };
});

import { resetProCache, isPro, getLicense, clearLicense } from "@/lib/license";

describe("license/storekit route", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    resetProCache();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  it("POST activates a StoreKit license", async () => {
    const { POST } = await import("@/app/api/license/storekit/route");

    const request = new Request("http://localhost/api/license/storekit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: "txn-12345" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);

    expect(isPro()).toBe(true);

    const license = getLicense();
    expect(license).not.toBeNull();
    expect(license!.key).toBe("storekit");
    expect(license!.instanceId).toBe("txn-12345");
    expect(license!.email).toBe("");
  });

  it("POST returns 400 for missing transactionId", async () => {
    const { POST } = await import("@/app/api/license/storekit/route");

    const request = new Request("http://localhost/api/license/storekit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("DELETE clears the license", async () => {
    const { POST, DELETE } = await import("@/app/api/license/storekit/route");

    // First activate
    const activateReq = new Request("http://localhost/api/license/storekit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: "txn-99" }),
    });
    await POST(activateReq);
    expect(isPro()).toBe(true);

    // Then delete
    const response = await DELETE();
    expect(response.status).toBe(200);

    resetProCache();
    expect(isPro()).toBe(false);
  });
});

