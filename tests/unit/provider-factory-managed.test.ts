import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/managed/auth", () => ({ getValidAccessToken: mockGetValidAccessToken }));
const mockGetRoutingTier = vi.fn();
vi.mock("@/lib/app-preferences", () => ({
  getRoutingTier: mockGetRoutingTier,
  getRoutingFallbackEnabled: () => false,
}));
vi.mock("@/lib/ai/settings", () => ({ getTierSettings: vi.fn() }));

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

  it("generates an action id when the caller does not provide one", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue("jwt-token");
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID");
    const { getLanguageModelForTask } = await import("@/lib/ai/provider-factory");
    const resolved = await getLanguageModelForTask("translate");
    expect(randomUUIDSpy).toHaveBeenCalled();
    expect(resolved.tier).toBe("managed");
  });

  it("throws ai_tier_not_configured when signed out", async () => {
    mockGetRoutingTier.mockReturnValue("managed");
    mockGetValidAccessToken.mockResolvedValue(null);
    const { getLanguageModelForTask, AIRoutingError } = await import("@/lib/ai/provider-factory");
    await expect(getLanguageModelForTask("translate")).rejects.toThrow(AIRoutingError);
  });
});
