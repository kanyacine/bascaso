import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetFreeSelectedAppId = vi.fn();

vi.mock("@/lib/app-preferences", () => ({
  setFreeSelectedAppId: (...args: unknown[]) => mockSetFreeSelectedAppId(...args),
}));

describe("POST /api/apps/select", () => {
  beforeEach(() => {
    mockSetFreeSelectedAppId.mockReset();
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await import("@/app/api/apps/select/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("rejects missing appId", async () => {
    const { POST } = await import("@/app/api/apps/select/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("appId is required");
  });

  it("stores the selected app id", async () => {
    const { POST } = await import("@/app/api/apps/select/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "app-123" }),
      }),
    );
    const data = await response.json();

    expect(mockSetFreeSelectedAppId).toHaveBeenCalledWith("app-123");
    expect(data).toEqual({ ok: true });
  });
});
