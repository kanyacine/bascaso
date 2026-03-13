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

  it("GET returns isPro false when no license exists", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { resetProCache, clearLicense } = await import("@/lib/license");
    resetProCache();
    clearLicense();

    const { GET } = await import("@/app/api/license/route");
    const response = await GET();

    expect(await response.json()).toEqual({ isPro: false });
  });

  it("GET returns masked license details for direct licenses", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { setLicense, resetProCache } = await import("@/lib/license");
    resetProCache();
    setLicense({
      licenseKey: "abcd-1234-efgh-5678",
      instanceId: "inst-1",
      email: "user@example.com",
    });

    const { GET } = await import("@/app/api/license/route");
    const response = await GET();
    const data = await response.json();

    expect(data.isPro).toBe(true);
    expect(data.email).toBe("user@example.com");
    expect(data.maskedKey).not.toBe("abcd-1234-efgh-5678");
    expect(data.maskedKey).toContain("...");
  });

  it("POST activates a license successfully", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          activated: true,
          error: null,
          license_key: { id: 1 },
          instance: { id: "inst-1" },
          meta: { customer_email: "user@example.com", product_name: "Itsyconnect" },
        }),
        { status: 200 },
      ),
    );

    const { POST, GET } = await import("@/app/api/license/route");

    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: "test-key" }),
      }),
    );

    expect(await response.json()).toEqual({ ok: true, email: "user@example.com" });
    const getResponse = await GET();
    const data = await getResponse.json();
    expect(data.isPro).toBe(true);
    expect(data.email).toBe("user@example.com");
  });

  it("POST maps activation errors from LemonSqueezy", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          activated: false,
          error: "license_key not found",
          license_key: null,
          instance: null,
          meta: null,
        }),
        { status: 404 },
      ),
    );

    const { POST } = await import("@/app/api/license/route");
    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: "bad-key" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "License key not found" });
  });

  it("POST rejects invalid request body", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { POST } = await import("@/app/api/license/route");
    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid JSON body" });
  });

  it("POST uses fallback error and status 422 when activation fails without error text and status < 400", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          activated: false,
          error: null,
          license_key: null,
          instance: null,
          meta: null,
        }),
        { status: 200 },
      ),
    );

    const { POST } = await import("@/app/api/license/route");
    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: "bad-key" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Activation failed" });
  });

  it("POST handles unparseable JSON from LemonSqueezy", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const { POST } = await import("@/app/api/license/route");
    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: "test-key" }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Unexpected response from LemonSqueezy",
    });
  });

  it("POST handles LemonSqueezy network failures", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));

    const { POST } = await import("@/app/api/license/route");
    const response = await POST(
      new Request("http://localhost/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: "bad-key" }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not reach LemonSqueezy – check your internet connection",
    });
  });

  it("DELETE returns 404 when no active license exists", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { clearLicense, resetProCache } = await import("@/lib/license");
    resetProCache();
    clearLicense();

    const { DELETE } = await import("@/app/api/license/route");
    const response = await DELETE();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No active license" });
  });

  it("DELETE clears licenses even if remote deactivation fails", async () => {
    vi.doMock("@/lib/license-shared", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/license-shared")>();
      return { ...original, IS_MAS: false };
    });

    const { setLicense, resetProCache } = await import("@/lib/license");
    resetProCache();
    setLicense({
      licenseKey: "abcd-1234-efgh-5678",
      instanceId: "inst-1",
      email: "user@example.com",
    });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));

    const route = await import("@/app/api/license/route");
    const response = await route.DELETE();

    expect(await response.json()).toEqual({ ok: true });
    const getResponse = await route.GET();
    expect(await getResponse.json()).toEqual({ isPro: false });
  });
});
