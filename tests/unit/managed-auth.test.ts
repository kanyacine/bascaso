import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY = "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";
let testDb: ReturnType<typeof createTestDb>;
vi.mock("@/db", () => ({ get db() { return testDb; } }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { email: "a@b.c" },
      ...overrides,
    }),
  };
}

describe("managed auth (GoTrue REST)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    fetchMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("signIn stores the session and hits the password grant", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signIn } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    const session = await signIn("a@b.c", "password123");
    expect(session.email).toBe("a@b.c");
    expect(getManagedSession()!.accessToken).toBe("at-1");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/v1/token?grant_type=password");
  });

  it("signUp hits /signup", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signUp } = await import("@/lib/managed/auth");
    await signUp("a@b.c", "password123");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/v1/signup");
  });

  it("auth failure throws ManagedAuthError with the server message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error_description: "Invalid login credentials" }),
    });
    const { signIn, ManagedAuthError } = await import("@/lib/managed/auth");
    await expect(signIn("a@b.c", "bad")).rejects.toThrow(ManagedAuthError);
  });

  it("getValidAccessToken returns null when signed out", async () => {
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBeNull();
  });

  it("getValidAccessToken returns the token when fresh, without network", async () => {
    const { saveManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "fresh", refreshToken: "rt", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBe("fresh");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when < 60 s left and saves the new session", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-old", expiresAt: Math.floor(Date.now() / 1000) + 10 });
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: "at-2", refresh_token: "rt-2" }));
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBe("at-2");
    expect(fetchMock.mock.calls[0][0]).toContain("grant_type=refresh_token");
    expect(getManagedSession()!.refreshToken).toBe("rt-2");
  });

  it("invalid refresh token clears the session and returns null", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-dead", expiresAt: 0 });
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error_description: "Invalid Refresh Token" }) });
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBeNull();
    expect(getManagedSession()).toBeNull();
  });

  // Cas supplémentaires pour couvrir les chaînes de repli (??) de goTrue/toSession,
  // au-delà de ceux du brief.
  it("falls back to the server's msg field when error_description is absent", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ msg: "email not confirmed" }),
    });
    const { signIn } = await import("@/lib/managed/auth");
    await expect(signIn("a@b.c", "bad")).rejects.toThrow("email not confirmed");
  });

  it("falls back to a generic message when the server gives no detail", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    const { signIn } = await import("@/lib/managed/auth");
    await expect(signIn("a@b.c", "bad")).rejects.toThrow("Authentication failed");
  });

  it("defaults the session email to the login email when the response omits user", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ user: undefined }));
    const { signIn } = await import("@/lib/managed/auth");
    const session = await signIn("z@z.z", "password123");
    expect(session.email).toBe("z@z.z");
  });

  it("computes expiresAt from expires_in when the server omits expires_at", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ expires_at: undefined, expires_in: 120 }));
    const before = Math.floor(Date.now() / 1000);
    const { signIn } = await import("@/lib/managed/auth");
    const session = await signIn("a@b.c", "password123");
    const after = Math.floor(Date.now() / 1000);
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 120);
    expect(session.expiresAt).toBeLessThanOrEqual(after + 120);
  });

  it("defaults expiresAt to a one-hour window when the server omits both expiry fields", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ expires_at: undefined, expires_in: undefined }));
    const before = Math.floor(Date.now() / 1000);
    const { signIn } = await import("@/lib/managed/auth");
    const session = await signIn("a@b.c", "password123");
    const after = Math.floor(Date.now() / 1000);
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 3600);
    expect(session.expiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it("treats an undecryptable stored session as signed out instead of throwing", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({
      email: "a@b.c",
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    // Rotation de la clé maître entre l'écriture et la lecture : la ligne
    // existante devient indéchiffrable (authTag mismatch).
    process.env.ENCRYPTION_MASTER_KEY = "a".repeat(64);
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(getManagedSession()).toBeNull();
  });
});
