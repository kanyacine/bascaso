import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY = "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

describe("license route – LemonSqueezy guarded by IS_MAS", () => {
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

  it("POST returns 404 when IS_MAS is true", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: true };
    });

    const { POST } = await import("@/app/api/license/route");

    const request = new Request("http://localhost/api/license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey: "test-key" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("DELETE returns 404 when IS_MAS is true", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: true };
    });

    const { DELETE } = await import("@/app/api/license/route");

    const response = await DELETE();
    expect(response.status).toBe(404);
  });

  it("storekit POST returns 404 when IS_MAS is false", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { POST } = await import("@/app/api/license/storekit/route");

    const request = new Request("http://localhost/api/license/storekit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: "txn-1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("storekit DELETE returns 404 when IS_MAS is false", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { DELETE } = await import("@/app/api/license/storekit/route");

    const response = await DELETE();
    expect(response.status).toBe(404);
  });

  it("GET returns source:storekit for StoreKit licenses", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { setLicense, resetProCache } = await import("@/lib/license");
    resetProCache();

    setLicense({
      licenseKey: "storekit",
      instanceId: "txn-42",
      email: "",
    });

    const { GET } = await import("@/app/api/license/route");
    const response = await GET();
    const data = await response.json();

    expect(data.isPro).toBe(true);
    expect(data.source).toBe("storekit");
    expect(data.maskedKey).toBeUndefined();
    expect(data.email).toBeUndefined();
  });
});
