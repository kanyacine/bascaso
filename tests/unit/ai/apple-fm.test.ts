import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReadFileSync = vi.fn();

vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

const STATE_FILE = "/tmp/afm-state.test.json";

describe("apple-fm", () => {
  let originalStateFile: string | undefined;

  beforeEach(() => {
    mockReadFileSync.mockReset();
    originalStateFile = process.env.AFM_STATE_FILE;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalStateFile === undefined) {
      delete process.env.AFM_STATE_FILE;
    } else {
      process.env.AFM_STATE_FILE = originalStateFile;
    }
    vi.unstubAllGlobals();
  });

  describe("getAppleFmBaseUrl", () => {
    it("returns null when AFM_STATE_FILE is unset", async () => {
      delete process.env.AFM_STATE_FILE;
      const { getAppleFmBaseUrl } = await import("@/lib/ai/apple-fm");
      expect(getAppleFmBaseUrl()).toBeNull();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it("returns null when the state file cannot be read", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const { getAppleFmBaseUrl } = await import("@/lib/ai/apple-fm");
      expect(getAppleFmBaseUrl()).toBeNull();
    });

    it("returns null when the state file has an error but no port", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ error: "device_not_eligible" }));
      const { getAppleFmBaseUrl } = await import("@/lib/ai/apple-fm");
      expect(getAppleFmBaseUrl()).toBeNull();
    });

    it("derives the /v1 base URL from the live port", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ port: 54123 }));
      const { getAppleFmBaseUrl } = await import("@/lib/ai/apple-fm");
      expect(getAppleFmBaseUrl()).toBe("http://127.0.0.1:54123/v1");
      expect(mockReadFileSync).toHaveBeenCalledWith(STATE_FILE, "utf8");
    });
  });

  describe("getAppleFmStatus", () => {
    it("reports sidecar_missing when there is no state file", async () => {
      delete process.env.AFM_STATE_FILE;
      const { getAppleFmStatus } = await import("@/lib/ai/apple-fm");
      expect(await getAppleFmStatus()).toEqual({ available: false, reason: "sidecar_missing" });
    });

    it("hits /health at the ROOT (not /v1) and passes an available verdict through", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ port: 54123 }));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ available: true, reason: null }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { getAppleFmStatus } = await import("@/lib/ai/apple-fm");
      const status = await getAppleFmStatus();

      expect(status).toEqual({ available: true, reason: null });
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:54123/health");
    });

    it("passes an unavailable verdict and its reason through", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ port: 8080 }));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ available: false, reason: "model_not_ready" }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { getAppleFmStatus } = await import("@/lib/ai/apple-fm");
      expect(await getAppleFmStatus()).toEqual({ available: false, reason: "model_not_ready" });
    });

    it("reports sidecar_unreachable on a non-ok /health response", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ port: 8080 }));
      const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);

      const { getAppleFmStatus } = await import("@/lib/ai/apple-fm");
      expect(await getAppleFmStatus()).toEqual({ available: false, reason: "sidecar_unreachable" });
    });

    it("reports sidecar_unreachable when the /health fetch throws", async () => {
      process.env.AFM_STATE_FILE = STATE_FILE;
      mockReadFileSync.mockReturnValue(JSON.stringify({ port: 8080 }));
      const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
      vi.stubGlobal("fetch", fetchMock);

      const { getAppleFmStatus } = await import("@/lib/ai/apple-fm");
      expect(await getAppleFmStatus()).toEqual({ available: false, reason: "sidecar_unreachable" });
    });
  });
});
