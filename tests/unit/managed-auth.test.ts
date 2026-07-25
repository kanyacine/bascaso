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
  afterEach(() => {
    vi.restoreAllMocks();
    // Un test tourne volontairement la clé maître ; la beforeEach la restaure pour ce
    // fichier, mais pas pour les suites qui partagent le même worker vitest.
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

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

  // Confirmations désactivées (état actuel du projet live) : /signup renvoie
  // une session directement, comme signIn – comportement inchangé.
  it("signUp returns a signed_in outcome and stores the session when confirmations are off", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signUp } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    const outcome = await signUp("a@b.c", "password123");
    expect(outcome).toEqual({ status: "signed_in", session: expect.objectContaining({ email: "a@b.c", accessToken: "at-1" }) });
    expect(getManagedSession()!.accessToken).toBe("at-1");
  });

  // Confirmations activées (état cible en prod) : GoTrue répond 200 sans
  // tokens. D'après le code source de supabase/auth (internal/api/signup.go,
  // `sendJSON(w, http.StatusOK, user)`), l'objet utilisateur est renvoyé tel
  // quel à la racine de la réponse (champ "id" au premier niveau), pas sous
  // une clé "user" imbriquée – on couvre donc les deux formes.
  it("signUp reports confirmation_required when GoTrue returns a bare user object (no nested 'user' key)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "11111111-1111-1111-1111-111111111111", email: "a@b.c", confirmation_sent_at: "2026-07-24T00:00:00Z" }),
    });
    const { signUp } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    const outcome = await signUp("a@b.c", "password123");
    expect(outcome).toEqual({ status: "confirmation_required" });
    expect(getManagedSession()).toBeNull();
  });

  it("signUp reports confirmation_required when GoTrue nests the user under a 'user' key", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { email: "a@b.c" } }),
    });
    const { signUp } = await import("@/lib/managed/auth");
    const outcome = await signUp("a@b.c", "password123");
    expect(outcome).toEqual({ status: "confirmation_required" });
  });

  it("signUp still throws ManagedAuthError on a genuine failure (no tokens, no user)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error_description: "User already registered" }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    await expect(signUp("a@b.c", "password123")).rejects.toThrow(ManagedAuthError);
  });

  // Régression : la confirmation email activée en prod rend ces deux cas
  // probables (compte déjà inscrit, quota Supabase d'emails/heure dépassé) –
  // ni l'un ni l'autre n'est un problème d'identifiants, donc le code GoTrue
  // doit survivre jusqu'au client pour éviter le message générique "vérifiez
  // votre mot de passe".
  it("signUp carries the server's error_code for an already-registered account (422)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error_code: "user_already_exists", msg: "User already registered" }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    const err = await signUp("a@b.c", "password123").catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect((err as InstanceType<typeof ManagedAuthError>).code).toBe("user_already_exists");
    expect((err as Error).message).toBe("User already registered");
  });

  it("signUp carries the server's error_code when Supabase's email rate limit is hit (429)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({
        error_code: "over_email_send_rate_limit",
        msg: "For security purposes, you can only request this after 57 seconds.",
      }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    const err = await signUp("a@b.c", "password123").catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect((err as InstanceType<typeof ManagedAuthError>).code).toBe("over_email_send_rate_limit");
  });

  // Le grant OAuth2 du login (mauvais mot de passe) ne porte pas de
  // error_code, seulement error/error_description – confirmé par le shape
  // observé de /token?grant_type=password. `code` doit rester undefined
  // plutôt qu'une valeur inventée.
  it("signIn's ManagedAuthError has no code for the OAuth2 invalid_grant shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error: "invalid_grant", error_description: "Invalid login credentials" }),
    });
    const { signIn, ManagedAuthError } = await import("@/lib/managed/auth");
    const err = await signIn("a@b.c", "bad").catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect((err as InstanceType<typeof ManagedAuthError>).code).toBeUndefined();
  });

  describe("verifySignup", () => {
    it("posts to /verify with type signup and stores the session on success", async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse());
      const { verifySignup } = await import("@/lib/managed/auth");
      const { getManagedSession } = await import("@/lib/managed/account");
      const session = await verifySignup("a@b.c", "123456");
      expect(session.accessToken).toBe("at-1");
      expect(fetchMock.mock.calls[0][0]).toContain("/auth/v1/verify");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ type: "signup", email: "a@b.c", token: "123456" });
      expect(getManagedSession()!.accessToken).toBe("at-1");
    });

    // Repli explicite : si ce projet GoTrue rejette type "signup" avec un 400
    // (type non supporté par cette version), on retente une fois avec "email".
    it("retries with type email when the signup type is rejected with a 400", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ error_code: "validation_failed", msg: "Type should be one of..." }) })
        .mockResolvedValueOnce(tokenResponse());
      const { verifySignup } = await import("@/lib/managed/auth");
      const session = await verifySignup("a@b.c", "123456");
      expect(session.accessToken).toBe("at-1");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ type: "email", email: "a@b.c", token: "123456" });
    });

    // Un code invalide/expiré n'est pas une histoire de "type" : GoTrue répond
    // 403 otp_expired (observé empiriquement sur le projet live), donc pas de
    // deuxième tentative, et l'erreur remonte telle quelle.
    it("does not retry and throws on an invalid/expired code (403)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false, status: 403, json: () => Promise.resolve({ error_code: "otp_expired", msg: "Token has expired or is invalid" }),
      });
      const { verifySignup, ManagedAuthError } = await import("@/lib/managed/auth");
      await expect(verifySignup("a@b.c", "000000")).rejects.toThrow(ManagedAuthError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws if the retried type also fails", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ msg: "bad type" }) })
        .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ msg: "still bad" }) });
      const { verifySignup, ManagedAuthError } = await import("@/lib/managed/auth");
      await expect(verifySignup("a@b.c", "123456")).rejects.toThrow(ManagedAuthError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
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
