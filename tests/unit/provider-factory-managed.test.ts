import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/managed/auth", () => ({ getValidAccessToken: mockGetValidAccessToken }));
const mockGetRoutingTier = vi.fn();
vi.mock("@/lib/app-preferences", () => ({
  getRoutingTier: mockGetRoutingTier,
  getRoutingFallbackEnabled: () => false,
}));
vi.mock("@/lib/ai/settings", () => ({ getTierSettings: vi.fn() }));

// Capture the config createOpenAI is built with – it's the only place the
// x-action-id header (the managed tier's billing unit) is set. Without this
// mock, a regression like dropping `context?.actionId` from that line (i.e.
// always minting a fresh uuid, charging one gesture N times for N calls)
// would pass every test in this file undetected.
const mockCreateOpenAI = vi.fn((_config: Record<string, unknown>) => {
  const provider = (modelId: string) => ({ modelId });
  provider.chat = (modelId: string) => ({ modelId });
  return provider;
});
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mockCreateOpenAI }));

describe("managed tier resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a managed model carrying the task id", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    const resolved = await getLanguageModelForTask("translate", { actionId: "3f2c1b34-0000-4000-8000-000000000001" });
    expect(resolved.tier).toBe("managed");
    expect(resolved.providerId).toBe("managed");
    expect(resolved.modelId).toBe("bascaso/translate");
  });

  it("passes the caller's action id verbatim as the x-action-id header, without minting a new one", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    const actionId = "3f2c1b34-0000-4000-8000-000000000001";

    await getLanguageModelForTask("translate", { actionId });

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-action-id": actionId } }),
    );
    expect(randomUUIDSpy).not.toHaveBeenCalled();
  });

  it("generates an action id when the caller does not provide one", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    const resolved = await getLanguageModelForTask("translate");
    expect(randomUUIDSpy).toHaveBeenCalled();
    expect(resolved.tier).toBe("managed");
  });

  it("stamps a freshly generated action id (not a constant) when the caller supplies none", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");

    await getLanguageModelForTask("translate");

    expect(randomUUIDSpy).toHaveBeenCalledTimes(1);
    const generated = randomUUIDSpy.mock.results[0]?.value;
    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-action-id": generated } }),
    );
  });

  it("throws ai_tier_not_configured when signed out", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    const { getLanguageModelForTask, AIRoutingError } = await import("@/lib/ai/provider-factory");
    await expect(getLanguageModelForTask("translate")).rejects.toThrow(AIRoutingError);
  });

  it("classifies proxy credit errors", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('402 {"error":{"code":"insufficient_credits"}}'))).toBe("credits");
  });

  // Les deux codes 429 renvoyés par le proxy managed – aucun des deux n'avait
  // de catégorie dédiée avant ce correctif (rate_limited retombait dans le
  // "rate_limit" générique BYOK, action_exhausted dans "unknown"), donc les
  // routes IA les faisaient tous deux échouer en 500 générique.
  it("classifies proxy hourly rate-limit errors distinctly from generic BYOK rate limits", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('429 {"error":{"code":"rate_limited"}}'))).toBe("rate_limited");
  });

  it("classifies proxy action-exhausted errors", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('429 {"error":{"code":"action_exhausted"}}'))).toBe("action_exhausted");
  });
});
