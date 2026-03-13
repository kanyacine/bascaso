import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockDecrypt = vi.fn();
const mockGenerateAscJwt = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ kind: "eq", args }),
}));

vi.mock("@/db/schema", () => ({
  ascCredentials: {
    id: "id-column",
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: (...args: unknown[]) => mockGet(...args),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock("@/lib/asc/jwt", () => ({
  generateAscJwt: (...args: unknown[]) => mockGenerateAscJwt(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("POST /api/settings/credentials/test", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDecrypt.mockReset();
    mockGenerateAscJwt.mockReset();
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 422 }),
    );
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when credential ID is missing", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing credential ID");
  });

  it("maps decrypt/jwt errors through errorJson", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    mockGet.mockReturnValue({
      issuerId: "issuer-1",
      keyId: "key-1",
      encryptedPrivateKey: "cipher",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
    });
    mockDecrypt.mockImplementation(() => {
      throw new Error("decrypt failed");
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1" }),
      }),
    );

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 422);
    expect(response.status).toBe(422);
  });

  it("returns 404 when credential is missing", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    mockGet.mockReturnValue(undefined);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Credential not found");
  });

  it("returns 422 when ASC rejects authentication", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    mockGet.mockReturnValue({
      issuerId: "issuer-1",
      keyId: "key-1",
      encryptedPrivateKey: "cipher",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
    });
    mockDecrypt.mockReturnValue("private-key");
    mockGenerateAscJwt.mockReturnValue("jwt-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("App Store Connect returned 401");
  });

  it("returns 403 when analytics permission check fails", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    mockGet.mockReturnValue({
      issuerId: "issuer-1",
      keyId: "key-1",
      encryptedPrivateKey: "cipher",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
    });
    mockDecrypt.mockReturnValue("private-key");
    mockGenerateAscJwt.mockReturnValue("jwt-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "app-1" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Admin access is required");
  });

  it("returns ok when authentication and permission checks pass", async () => {
    const { POST } = await import("@/app/api/settings/credentials/test/route");

    mockGet.mockReturnValue({
      issuerId: "issuer-1",
      keyId: "key-1",
      encryptedPrivateKey: "cipher",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
    });
    mockDecrypt.mockReturnValue("private-key");
    mockGenerateAscJwt.mockReturnValue("jwt-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "app-1" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cred-1" }),
      }),
    );
    const data = await response.json();

    expect(mockDecrypt).toHaveBeenCalled();
    expect(mockGenerateAscJwt).toHaveBeenCalledWith(
      "issuer-1",
      "key-1",
      "private-key",
    );
    expect(data).toEqual({ ok: true });
  });
});
