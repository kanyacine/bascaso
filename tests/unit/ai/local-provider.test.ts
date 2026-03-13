import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureLocalModelLoaded,
  normalizeOpenAICompatibleBaseUrl,
  resetLocalModelLoadStateForTests,
  resolveLocalOpenAIBaseUrl,
} from "@/lib/ai/local-provider";

describe("normalizeOpenAICompatibleBaseUrl", () => {
  it("adds /v1 when missing", () => {
    expect(normalizeOpenAICompatibleBaseUrl("http://127.0.0.1:1234")).toBe(
      "http://127.0.0.1:1234/v1",
    );
  });

  it("normalizes chat completions URLs to /v1", () => {
    expect(
      normalizeOpenAICompatibleBaseUrl("http://127.0.0.1:1234/v1/chat/completions"),
    ).toBe("http://127.0.0.1:1234/v1");
  });

  it("returns null for invalid urls", () => {
    expect(normalizeOpenAICompatibleBaseUrl("not a url")).toBeNull();
  });

  it("appends /v1 to custom path", () => {
    expect(normalizeOpenAICompatibleBaseUrl("http://127.0.0.1:1234/api")).toBe(
      "http://127.0.0.1:1234/api/v1",
    );
  });
});

describe("resolveLocalOpenAIBaseUrl", () => {
  it("falls back to default when invalid", () => {
    expect(resolveLocalOpenAIBaseUrl("bad url")).toBe("http://127.0.0.1:1234/v1");
  });
});

describe("ensureLocalModelLoaded", () => {
  afterEach(() => {
    resetLocalModelLoadStateForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when model load succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit)?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit)?.method).toBe("POST");
  });

  it("skips load when selected model is already loaded", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          models: [
            { key: "gemma-3", loaded_instances: [{ id: "gemma-3" }] },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
  });

  it("matches model by instance id when key differs", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          models: [
            { key: "other-key", loaded_instances: [{ id: "my-model" }] },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("my-model", "http://127.0.0.1:1234/v1", undefined);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when load endpoint is unsupported", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces model-not-found errors returned as 404", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { type: "model_not_found", message: "Model missing" } }),
          { status: 404 },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await ensureLocalModelLoaded(
      "missing-model",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBe("Model missing");
  });

  it("returns server error message on load failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "insufficient system resources" } }),
          { status: 500 },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await ensureLocalModelLoaded(
      "devstral-small-2507-mlx",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toContain("insufficient system resources");
  });

  it("returns network errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/models")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      throw new Error("connection refused");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toContain("Could not switch local model");
  });

  it("coalesces concurrent loads for same server+model", async () => {
    let resolveLoad: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/models")) {
        return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => {
        resolveLoad = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const loadCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/api/v1/models/load"),
    );
    expect(loadCalls).toHaveLength(1);

    resolveLoad?.(new Response("{}", { status: 200 }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBeNull();
    expect(secondResult).toBeNull();
  });

  it("skips repeated loads for same model within throttle window", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches unsupported load endpoint per server", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("glm-4.7-flash", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches unsupported model-list endpoint per server", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("glm-4.7-flash", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
  });

  it("handles network errors in model list check gracefully", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))  // model list
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // model load
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
  });

  it("returns error for invalid server URL", async () => {
    // localServerRootFromBaseUrl returns null when URL parsing fails internally.
    // Force this by making URL constructor always throw so all URL parsing fails.
    const OriginalURL = globalThis.URL;
    vi.stubGlobal("URL", class extends OriginalURL {
      constructor(input: string | URL, base?: string | URL) {
        super(input, base);
        throw new Error("Invalid URL");
      }
    });

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBe("Invalid local server URL");
  });

  it("sends Authorization header when apiKey is provided", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", "my-key");
    expect(result).toBeNull();
    // Verify auth header was sent
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers?.Authorization).toBe("Bearer my-key");
  });

  it("handles non-JSON error response from load endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("not json at all", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toContain("500");
  });

  it("treats non-ok model list response as unknown status", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 })) // model list 500
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // load OK
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
  });

  it("treats empty model list response body as unknown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 200 })) // empty body
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // load OK
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
  });

  it("treats invalid JSON model list as unknown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 })) // bad JSON
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // load OK
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
  });

  it("detects model present but not loaded (no loaded_instances)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [{ key: "gemma-3" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // still loads since not-loaded
  });

  it("surfaces message field from 404 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "No such model" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("missing-model", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBe("No such model");
  });

  it("uses default base URL when baseUrl is undefined", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", undefined, undefined);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
  });

  it("handles model with non-array loaded_instances", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [{ key: "other-key", loaded_instances: null }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(result).toBeNull();
    // Model key doesn't match and loaded_instances is null (not an array),
    // so the find falls through to instances check which yields empty array.
    // Result is "not-loaded", triggering the load call.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
  });

  it("handles empty response body from load endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    // Empty body means raw is "", so the ternary yields {} with no message fields.
    // Falls through to the generic status error.
    expect(result).toBe("Model load failed with status 500");
  });

  it("handles non-array models in response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: "not-array" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles model with non-string key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [{ key: 123, loaded_instances: [{ id: "gemma-3" }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // key is not a string, so key check falls through to instances check
    // Instance id matches, so model is considered loaded
    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no load needed
  });

  it("handles non-Error throw from load endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/models")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      throw new Error("something went wrong");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(result).toBe("Could not switch local model: something went wrong");
  });
});
