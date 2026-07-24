import { describe, expect, it, vi, beforeEach } from "vitest";
import { AIRoutingError, getLanguageModelForTask } from "@/lib/ai/provider-factory";

const mockGetTierSettings = vi.fn();
const mockGetRoutingTier = vi.fn();
const mockGetRoutingFallbackEnabled = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockGetAppleFmStatus = vi.fn();
const mockGetAppleFmBaseUrl = vi.fn();

vi.mock("@/lib/ai/settings", () => ({
  getTierSettings: (...args: unknown[]) => mockGetTierSettings(...args),
}));

vi.mock("@/lib/app-preferences", () => ({
  getRoutingTier: (...args: unknown[]) => mockGetRoutingTier(...args),
  getRoutingFallbackEnabled: (...args: unknown[]) => mockGetRoutingFallbackEnabled(...args),
}));

vi.mock("@/lib/ai/local-provider", () => ({
  ensureLocalModelLoaded: (...args: unknown[]) => mockEnsureLocalModelLoaded(...args),
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalOpenAIProvider(...args),
  resolveLocalOpenAIApiKey: (apiKey?: string) => (apiKey && apiKey.length > 0 ? apiKey : "lm-studio"),
  resolveLocalOpenAIBaseUrl: (baseUrl?: string) => baseUrl ?? "http://127.0.0.1:1234/v1",
}));

vi.mock("@/lib/ai/apple-fm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/apple-fm")>();
  return {
    ...actual,
    getAppleFmStatus: (...args: unknown[]) => mockGetAppleFmStatus(...args),
    getAppleFmBaseUrl: (...args: unknown[]) => mockGetAppleFmBaseUrl(...args),
  };
});

const LOCAL_SETTINGS = {
  provider: "local-openai",
  modelId: "qwen2.5-7b-instruct",
  baseUrl: "http://127.0.0.1:1234/v1",
  apiKey: "",
};

const APPLE_FM_SETTINGS = {
  provider: "apple-fm",
  modelId: "apple-fm",
  baseUrl: null,
  apiKey: "afm",
};

const BYOK_SETTINGS = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6",
  baseUrl: null,
  apiKey: "sk-test",
};

describe("getLanguageModelForTask", () => {
  beforeEach(() => {
    mockGetTierSettings.mockReset();
    mockGetRoutingTier.mockReset();
    mockGetRoutingFallbackEnabled.mockReset();
    mockEnsureLocalModelLoaded.mockReset();
    mockIsLocalOpenAIProvider.mockReset();
    mockGetAppleFmStatus.mockReset();
    mockGetAppleFmBaseUrl.mockReset();

    // Mirrors the shipped defaults: redaction -> local, everything else -> byok.
    mockGetRoutingTier.mockImplementation((group: string) => (group === "redaction" ? "local" : "byok"));
    mockGetRoutingFallbackEnabled.mockReturnValue(false);
    mockIsLocalOpenAIProvider.mockImplementation((provider: string) => provider === "local-openai");
    mockEnsureLocalModelLoaded.mockResolvedValue(null);
    mockGetAppleFmStatus.mockResolvedValue({ available: true, reason: null });
    mockGetAppleFmBaseUrl.mockReturnValue("http://127.0.0.1:59999/v1");
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? LOCAL_SETTINGS : BYOK_SETTINGS,
    );
  });

  it("resolves the local tier config for draft-reply (redaction group, default local)", async () => {
    const result = await getLanguageModelForTask("draft-reply");

    expect(mockGetRoutingTier).toHaveBeenCalledWith("redaction");
    expect(result.tier).toBe("local");
    expect(result.providerId).toBe("local-openai");
    expect(result.modelId).toBe("qwen2.5-7b-instruct");
    expect(result.model).toBeDefined();
  });

  it("resolves the byok tier config for translate (metadata group, default byok)", async () => {
    const result = await getLanguageModelForTask("translate");

    expect(mockGetRoutingTier).toHaveBeenCalledWith("metadata");
    expect(result.tier).toBe("byok");
    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-6");
  });

  it("routes translate to local when the metadata group has an explicit local preference", async () => {
    mockGetRoutingTier.mockImplementation((group: string) => (group === "metadata" ? "local" : "byok"));

    const result = await getLanguageModelForTask("translate");

    expect(result.tier).toBe("local");
    expect(result.providerId).toBe("local-openai");
  });

  it("throws ai_tier_not_configured when the resolved tier has no row", async () => {
    mockGetTierSettings.mockResolvedValue(null);

    await expect(getLanguageModelForTask("translate")).rejects.toMatchObject({
      code: "ai_tier_not_configured",
      status: 400,
    });
    await expect(getLanguageModelForTask("translate")).rejects.toBeInstanceOf(AIRoutingError);
  });

  it("throws local_server_unavailable when the local server fails to load and fallback is off", async () => {
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");
    mockGetRoutingFallbackEnabled.mockReturnValue(false);

    await expect(getLanguageModelForTask("draft-reply")).rejects.toMatchObject({
      code: "local_server_unavailable",
      status: 422,
      message: "model not loaded",
    });
  });

  it("falls back to byok when the local server fails and fallback is enabled with byok configured", async () => {
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");
    mockGetRoutingFallbackEnabled.mockReturnValue(true);

    const result = await getLanguageModelForTask("draft-reply");

    expect(result.tier).toBe("byok");
    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-6");
  });

  it("throws local_server_unavailable when fallback is enabled but byok is not configured", async () => {
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");
    mockGetRoutingFallbackEnabled.mockReturnValue(true);
    mockGetTierSettings.mockImplementation(async (tier: string) => (tier === "local" ? LOCAL_SETTINGS : null));

    await expect(getLanguageModelForTask("draft-reply")).rejects.toMatchObject({
      code: "local_server_unavailable",
      status: 422,
    });
  });

  // --- apple-fm (embedded Apple Foundation Model on the local tier) ---

  it("resolves the apple-fm model with maxInputChars when the sidecar is available", async () => {
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? APPLE_FM_SETTINGS : BYOK_SETTINGS,
    );

    const result = await getLanguageModelForTask("draft-reply");

    expect(mockGetAppleFmStatus).toHaveBeenCalled();
    expect(mockEnsureLocalModelLoaded).not.toHaveBeenCalled();
    expect(result.tier).toBe("local");
    expect(result.providerId).toBe("apple-fm");
    expect(result.modelId).toBe("apple-fm");
    expect(result.maxInputChars).toBe(12_000);
    expect(result.model).toBeDefined();
  });

  it("throws apple_fm_unavailable when the sidecar is down and fallback is off", async () => {
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? APPLE_FM_SETTINGS : BYOK_SETTINGS,
    );
    mockGetAppleFmStatus.mockResolvedValue({ available: false, reason: "model_not_ready" });
    mockGetRoutingFallbackEnabled.mockReturnValue(false);

    await expect(getLanguageModelForTask("draft-reply")).rejects.toMatchObject({
      code: "apple_fm_unavailable",
      status: 422,
      message: "model_not_ready",
    });
  });

  it("falls back to byok when the sidecar is down and fallback is enabled", async () => {
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? APPLE_FM_SETTINGS : BYOK_SETTINGS,
    );
    mockGetAppleFmStatus.mockResolvedValue({ available: false, reason: "sidecar_unreachable" });
    mockGetRoutingFallbackEnabled.mockReturnValue(true);

    const result = await getLanguageModelForTask("draft-reply");

    expect(result.tier).toBe("byok");
    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-6");
  });

  it("throws apple_fm_unavailable when status is available but the base URL is null (sidecar died mid-check) and fallback is off", async () => {
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? APPLE_FM_SETTINGS : BYOK_SETTINGS,
    );
    mockGetAppleFmStatus.mockResolvedValue({ available: true, reason: null });
    mockGetAppleFmBaseUrl.mockReturnValue(null);
    mockGetRoutingFallbackEnabled.mockReturnValue(false);

    await expect(getLanguageModelForTask("draft-reply")).rejects.toMatchObject({
      code: "apple_fm_unavailable",
      status: 422,
      message: "sidecar_unreachable",
    });
  });

  it("falls back to byok when status is available but the base URL is null and fallback is enabled with byok configured", async () => {
    mockGetTierSettings.mockImplementation(async (tier: string) =>
      tier === "local" ? APPLE_FM_SETTINGS : BYOK_SETTINGS,
    );
    mockGetAppleFmStatus.mockResolvedValue({ available: true, reason: null });
    mockGetAppleFmBaseUrl.mockReturnValue(null);
    mockGetRoutingFallbackEnabled.mockReturnValue(true);

    const result = await getLanguageModelForTask("draft-reply");

    expect(result.tier).toBe("byok");
    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-6");
  });
});
