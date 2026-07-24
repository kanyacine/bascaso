import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIRoutingError } from "@/lib/ai/provider-factory";

const mockClassifyAIError = vi.fn();
const mockGetLanguageModelForTask = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockBuildAnalyticsInsightsPrompt = vi.fn();
const mockGenerateObjectWithRepair = vi.fn();
const mockHasCredentials = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoAnalytics = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("@/lib/ai/provider-factory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider-factory")>();
  return {
    ...actual,
    classifyAIError: (...args: unknown[]) => mockClassifyAIError(...args),
    getLanguageModelForTask: (...args: unknown[]) => mockGetLanguageModelForTask(...args),
  };
});

vi.mock("@/lib/ai/local-provider", () => ({
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalOpenAIProvider(...args),
}));

vi.mock("@/lib/ai/prompts", () => ({
  buildAnalyticsInsightsPrompt: (...args: unknown[]) => mockBuildAnalyticsInsightsPrompt(...args),
}));

vi.mock("@/lib/ai/structured-output", () => ({
  generateObjectWithRepair: (...args: unknown[]) => mockGenerateObjectWithRepair(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoAnalytics: (...args: unknown[]) => mockGetDemoAnalytics(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

const analyticsData = {
  dailyDownloads: [
    { date: "2026-03-01", firstTime: 2 },
    { date: "2026-03-02", firstTime: 3 },
  ],
  dailyRevenue: [{ date: "2026-03-02", proceeds: 12.5 }],
};

describe("analytics insights route", () => {
  beforeEach(() => {
    mockClassifyAIError.mockReset();
    mockClassifyAIError.mockReturnValue("unknown");
    mockGetLanguageModelForTask.mockReset();
    mockGetLanguageModelForTask.mockResolvedValue({
      model: { id: "model" },
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      tier: "byok",
    });
    mockIsLocalOpenAIProvider.mockReset();
    mockIsLocalOpenAIProvider.mockReturnValue(false);
    mockBuildAnalyticsInsightsPrompt.mockReset();
    mockBuildAnalyticsInsightsPrompt.mockReturnValue("prompt");
    mockGenerateObjectWithRepair.mockReset();
    mockGenerateObjectWithRepair.mockResolvedValue({
      object: {
        highlights: ["Growth"],
        opportunities: ["ASO"],
      },
    });
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoAnalytics.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500, fallback = "mapped") =>
        new Response(JSON.stringify({ error: fallback }), { status: status as number }),
    );
    vi.resetModules();
  });

  it("GET returns cached insights when present", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "hash-1",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "hash-1",
      cached: true,
    });
  });

  it("GET returns an empty cache response when nothing is stored", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({ insights: null, cached: false });
  });

  it("POST uses demo analytics data in demo mode", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoAnalytics.mockReturnValue(analyticsData);
    mockCacheGet.mockReturnValueOnce(null); // no cached insights

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGetDemoAnalytics).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: false,
    });
  });

  it("POST returns errorJson when data fetching throws", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockImplementation(() => {
      throw new Error("cache read failed");
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
    expect(response.status).toBe(500);
  });

  it("POST rejects requests without ASC credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });
  });

  it("POST rejects requests without analytics data", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce({ dailyDownloads: [], dailyRevenue: [] });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No analytics data available" });
  });

  it("POST returns cached insights when the analytics hash matches and force is not set", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet
      .mockReturnValueOnce(analyticsData)
      .mockReturnValueOnce({
        insights: { highlights: ["Growth"], opportunities: ["ASO"] },
        dataHash: "2:2026-03-02:5:12.5",
      });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: true,
    });
    expect(mockGenerateObjectWithRepair).not.toHaveBeenCalled();
  });

  it("POST returns a local model load error before generating insights", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockRejectedValue(
      new AIRoutingError("local_server_unavailable", "model not loaded"),
    );

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model not loaded" });
  });

  it("POST reports ai_not_configured when the model resolution rejects with a non-routing error", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockRejectedValue(new Error("boom"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ai_not_configured" });
  });

  it("POST returns 400 with the routing code when the tier is not configured", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockRejectedValue(
      new AIRoutingError("ai_tier_not_configured", "The insights tier is not configured"),
    );

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ai_tier_not_configured",
      reason: "The insights tier is not configured",
    });
  });

  it("POST generates insights, caches them, and returns uncached results", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockBuildAnalyticsInsightsPrompt).toHaveBeenCalledWith(analyticsData);
    expect(mockGetLanguageModelForTask).toHaveBeenCalledWith("analytics-insights");
    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "prompt",
        providerId: "openai",
        providerOptions: { openai: { reasoningEffort: "low" } },
      }),
    );
    expect(mockCacheSet).toHaveBeenCalledWith(
      "analytics-insights:app-1",
      {
        insights: { highlights: ["Growth"], opportunities: ["ASO"] },
        dataHash: "2:2026-03-02:5:12.5",
      },
      86400000,
    );
    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: false,
    });
  });

  it("POST rejects oversized input with 422 when maxInputChars is set", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockResolvedValue({
      model: { id: "model" },
      providerId: "apple-fm",
      modelId: "apple-fm",
      tier: "local",
      maxInputChars: 100,
    });
    // ~20000 Latin chars ≈ 5000 tokens, over the 3000-token budget.
    mockBuildAnalyticsInsightsPrompt.mockReturnValue("x".repeat(20_000));

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "apple_fm_input_too_large" });
    expect(mockGenerateObjectWithRepair).not.toHaveBeenCalled();
  });

  it("POST passes Google gemini-3 thinking options", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockResolvedValue({
      model: { id: "model" },
      providerId: "google",
      modelId: "gemini-3-flash",
      tier: "byok",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      }),
    );
  });

  it("POST passes Google non-gemini-3 thinking options", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockResolvedValue({
      model: { id: "model" },
      providerId: "google",
      modelId: "gemini-2.5-pro",
      tier: "byok",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      }),
    );
  });

  it("POST passes empty provider options for unknown providers", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetLanguageModelForTask.mockResolvedValue({
      model: { id: "model" },
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      tier: "byok",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "anthropic",
        providerOptions: {},
      }),
    );
  });

  it("POST falls back to stale cached insights when generation fails", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet
      .mockReturnValueOnce(analyticsData)
      .mockReturnValueOnce({
        insights: { highlights: ["Old"], opportunities: ["Old opp"] },
        dataHash: "old-hash",
      });
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("timeout"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Old"], opportunities: ["Old opp"] },
      dataHash: "old-hash",
      cached: true,
      stale: true,
    });
  });

  it("POST maps auth and permission failures to ai_auth_error", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("auth"));
    mockClassifyAIError.mockReturnValue("auth");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ai_auth_error" });
  });

  it("POST uses errorJson for non-auth AI failures", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("boom"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500, "AI request failed");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI request failed" });
  });
});
