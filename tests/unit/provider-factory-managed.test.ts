import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/managed/auth", () => ({ getValidAccessToken: mockGetValidAccessToken }));
const mockGetRoutingTier = vi.fn();
const mockGetRoutingFallbackEnabled = vi.fn(() => false);
const DEVICE_ID = "aaaaaaaa-0000-4000-8000-00000000000a";
vi.mock("@/lib/app-preferences", () => ({
  getRoutingTier: mockGetRoutingTier,
  getRoutingFallbackEnabled: () => mockGetRoutingFallbackEnabled(),
  getManagedDeviceId: () => DEVICE_ID,
}));
const mockGetTierSettings = vi.fn();
vi.mock("@/lib/ai/settings", () => ({ getTierSettings: mockGetTierSettings }));

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRoutingFallbackEnabled.mockReturnValue(false);
  });

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
      expect.objectContaining({ headers: { "x-action-id": actionId, "x-bascaso-device": DEVICE_ID } }),
    );
    expect(randomUUIDSpy).not.toHaveBeenCalled();
  });

  // The device header is the subscription's single-active-device key. A managed
  // provider built without it is refused by the proxy (400 invalid_device_id), so it
  // has to be asserted at the same place as x-action-id.
  it("managed tier sends the installation device header", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    await getLanguageModelForTask("translate", { actionId: "3f2c1b34-0000-4000-8000-000000000001" });
    const headers = mockCreateOpenAI.mock.calls[0][0].headers as Record<string, string>;
    expect(headers["x-bascaso-device"]).toBe(DEVICE_ID);
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
      expect.objectContaining({ headers: { "x-action-id": generated, "x-bascaso-device": DEVICE_ID } }),
    );
  });

  it("throws ai_tier_not_configured when signed out", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    const { getLanguageModelForTask, AIRoutingError } = await import("@/lib/ai/provider-factory");
    await expect(getLanguageModelForTask("translate")).rejects.toThrow(AIRoutingError);
  });

  // getValidAccessToken returns null both for "never signed in" and for "refresh token
  // expired". The second case was a hard failure even with fallback enabled and a BYOK
  // key configured – whereas the local tier already fell back.
  it("falls back to BYOK when the cloud session is gone and fallback is on", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    mockGetRoutingFallbackEnabled.mockReturnValue(true);
    mockGetTierSettings.mockResolvedValue({
      provider: "openai", modelId: "gpt-4o-mini", apiKey: "sk-test", baseUrl: null,
    });

    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    const resolved = await getLanguageModelForTask("translate");

    expect(resolved.tier).toBe("byok");
    expect(resolved.providerId).toBe("openai");
  });

  it("still throws when the cloud session is gone and no BYOK tier is configured", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    mockGetRoutingFallbackEnabled.mockReturnValue(true);
    mockGetTierSettings.mockResolvedValue(null);

    const { getLanguageModelForTask, AIRoutingError } = await import("@/lib/ai/provider-factory");
    await expect(getLanguageModelForTask("translate")).rejects.toThrow(AIRoutingError);
  });

  it("does not fall back when the fallback switch is off", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    mockGetTierSettings.mockResolvedValue({
      provider: "openai", modelId: "gpt-4o-mini", apiKey: "sk-test", baseUrl: null,
    });

    const { getLanguageModelForTask, AIRoutingError } = await import("@/lib/ai/provider-factory");
    await expect(getLanguageModelForTask("translate")).rejects.toThrow(AIRoutingError);
  });

  it("classifies proxy credit errors", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('402 {"error":{"code":"insufficient_credits"}}'))).toBe("credits");
  });

  // The two 429 codes the managed proxy returns – neither had a category of its own
  // before this fix (rate_limited fell into BYOK's generic "rate_limit",
  // action_exhausted into "unknown"), so the AI routes failed both with a generic
  // 500.
  it("classifies proxy hourly rate-limit errors distinctly from generic BYOK rate limits", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('429 {"error":{"code":"rate_limited"}}'))).toBe("rate_limited");
  });

  it("classifies proxy action-exhausted errors", async () => {
    const { classifyAIError } = await import("@/lib/ai/provider-factory");
    expect(classifyAIError(new Error('429 {"error":{"code":"action_exhausted"}}'))).toBe("action_exhausted");
  });
});
