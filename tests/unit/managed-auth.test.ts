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
    // One test deliberately rotates the master key; the beforeEach restores it for this
    // file, but not for suites sharing the same vitest worker.
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
    await signUp("a@b.c", "password123", "Yacine");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/v1/signup");
  });

  // The username is the account's presence label across the app; GoTrue keeps it in
  // user_metadata, which the `me` endpoint reads back. Sent under `data`, the only key
  // GoTrue routes into user_metadata.
  it("signUp sends the username as GoTrue user_metadata", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signUp } = await import("@/lib/managed/auth");
    await signUp("a@b.c", "password123", "Yacine");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data).toEqual({ username: "Yacine" });
  });

  // Confirmations off (the live project's current state): /signup returns a session
  // straight away, like signIn – unchanged behaviour.
  it("signUp returns a signed_in outcome and stores the session when confirmations are off", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signUp } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    const outcome = await signUp("a@b.c", "password123", "Yacine");
    expect(outcome).toEqual({ status: "signed_in", session: expect.objectContaining({ email: "a@b.c", accessToken: "at-1" }) });
    expect(getManagedSession()!.accessToken).toBe("at-1");
  });

  // Confirmations on (the target state in production): GoTrue answers 200 with no
  // tokens. Per supabase/auth's source (internal/api/signup.go,
  // `sendJSON(w, http.StatusOK, user)`), the user object is returned as-is at the root
  // of the response (an "id" field at the top level), not under a nested "user" key –
  // so both shapes are covered.
  it("signUp reports confirmation_required when GoTrue returns a bare user object (no nested 'user' key)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "11111111-1111-1111-1111-111111111111", email: "a@b.c", confirmation_sent_at: "2026-07-24T00:00:00Z" }),
    });
    const { signUp } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    const outcome = await signUp("a@b.c", "password123", "Yacine");
    expect(outcome).toEqual({ status: "confirmation_required" });
    expect(getManagedSession()).toBeNull();
  });

  // Address already registered: GoTrue (autoconfirm off on both sides, as in production)
  // returns a sanitised 200 indistinguishable from a pending signup, EXCEPT through an
  // empty `identities`. Without this test, the "we sent you an email" promise goes out
  // again for an account that will never receive one.
  it("signUp reports user_already_exists when the sanitized 200 carries an empty identities array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "11111111-1111-1111-1111-111111111111", email: "a@b.c", identities: [] }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    await expect(signUp("a@b.c", "password123", "Yacine")).rejects.toBeInstanceOf(ManagedAuthError);
  });

  // A genuine pending signup carries exactly one identity: it must NOT be confused with
  // the case above.
  it("signUp still reports confirmation_required when identities carries one entry", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "22222222-2222-4222-8222-222222222222", email: "a@b.c", identities: [{ id: "x" }] }),
    });
    const { signUp } = await import("@/lib/managed/auth");
    expect(await signUp("a@b.c", "password123", "Yacine")).toEqual({ status: "confirmation_required" });
  });

  it("signUp reports confirmation_required when GoTrue nests the user under a 'user' key", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { email: "a@b.c" } }),
    });
    const { signUp } = await import("@/lib/managed/auth");
    const outcome = await signUp("a@b.c", "password123", "Yacine");
    expect(outcome).toEqual({ status: "confirmation_required" });
  });

  it("signUp still throws ManagedAuthError on a genuine failure (no tokens, no user)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error_description: "User already registered" }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    await expect(signUp("a@b.c", "password123", "Yacine")).rejects.toThrow(ManagedAuthError);
  });

  // Regression: email confirmation being on in production makes these two cases likely
  // (account already registered, Supabase hourly email quota exceeded) – neither is a
  // credentials problem, so GoTrue's code must survive all the way to the client to
  // avoid the generic "check your password" message.
  it("signUp carries the server's error_code for an already-registered account (422)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ error_code: "user_already_exists", msg: "User already registered" }),
    });
    const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
    const err = await signUp("a@b.c", "password123", "Yacine").catch((e) => e);
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
    const err = await signUp("a@b.c", "password123", "Yacine").catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect((err as InstanceType<typeof ManagedAuthError>).code).toBe("over_email_send_rate_limit");
  });

  // Measured in production: /token?grant_type=password with a wrong password returns
  // {code:400, error_code:"invalid_credentials", msg:"Invalid login credentials"} – not
  // the OAuth2 shape {error, error_description} assumed before (never sent by this
  // GoTrue). `code` must carry "invalid_credentials", which managedAuthErrorMessage
  // (page.tsx) maps to the localised generic message rather than showing that raw
  // English text.
  it("signIn's ManagedAuthError carries invalid_credentials for the real GoTrue password-grant shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, json: () => Promise.resolve({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }),
    });
    const { signIn, ManagedAuthError } = await import("@/lib/managed/auth");
    const err = await signIn("a@b.c", "bad").catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect((err as InstanceType<typeof ManagedAuthError>).code).toBe("invalid_credentials");
    expect((err as Error).message).toBe("Invalid login credentials");
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

    // Explicit fallback: if this GoTrue project rejects type "signup" with a 400 (type
    // unsupported by that version), retry once with "email".
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

    // An invalid/expired code is not a "type" story: GoTrue answers 403 otp_expired
    // (observed empirically on the live project), so there is no second attempt and the
    // error propagates as-is.
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

  // GoTrue rotates the refresh token: without a lock, two concurrent refreshes (a bulk
  // AI run starts as many as it fires calls) presented the same token, the second one
  // arrived after revocation, failed, and purged the session – signing the user out
  // mid-work.
  it("shares a single refresh between concurrent callers", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-old", expiresAt: 0 });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await gate;
      return tokenResponse({ access_token: "at-2", refresh_token: "rt-2" });
    });

    const { getValidAccessToken } = await import("@/lib/managed/auth");
    const both = Promise.all([getValidAccessToken(), getValidAccessToken(), getValidAccessToken()]);
    release();

    expect(await both).toEqual(["at-2", "at-2", "at-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getManagedSession()!.refreshToken).toBe("rt-2");
  });

  it("refreshes again after the shared refresh has settled", async () => {
    const { saveManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-old", expiresAt: 0 });
    // The second call must start a fresh refresh: were the lock never released, the
    // session would stay frozen on the first result.
    fetchMock
      .mockResolvedValueOnce(tokenResponse({ access_token: "at-2", refresh_token: "rt-2", expires_at: 0 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: "at-3", refresh_token: "rt-3", expires_at: 0 }));

    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBe("at-2");
    expect(await getValidAccessToken()).toBe("at-3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalid refresh token clears the session and returns null", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-dead", expiresAt: 0 });
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error_description: "Invalid Refresh Token" }) });
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBeNull();
    expect(getManagedSession()).toBeNull();
  });

  // Roll-up #6: getValidAccessToken's two bare catches were silent – a master-key
  // rotation or a corrupted row in production stayed invisible. Now logged, without
  // ever exposing the token.
  it("logs (without the token) when a refresh fails, before clearing the session", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { saveManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({ email: "a@b.c", accessToken: "old", refreshToken: "rt-dead-secret", expiresAt: 0 });
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error_description: "Invalid Refresh Token" }) });
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    expect(await getValidAccessToken()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = warnSpy.mock.calls[0].join(" ");
    expect(loggedArgs).toContain("Invalid Refresh Token");
    expect(loggedArgs).not.toContain("rt-dead-secret");
  });

  // Extra cases covering goTrue/toSession's fallback chains (??), beyond those in the
  // brief.
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

  it("signOut revokes globally and drops the local session", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signIn, signOut } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    await signIn("a@b.c", "password123");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await expect(signOut()).resolves.toEqual({ revoked: true });
    expect(getManagedSession()).toBeNull();
    const [url] = fetchMock.mock.calls[1];
    // The fix: without /logout the refresh token stays usable on GoTrue's side.
    expect(String(url)).toContain("/auth/v1/logout?scope=global");
  });

  it("signOut still clears locally when the revocation fails, and says so", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signIn, signOut } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    await signIn("a@b.c", "password123");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    // A session we cannot revoke is still a session we must stop using – but the caller
    // must be able to say so to the user.
    await expect(signOut()).resolves.toEqual({ revoked: false });
    expect(getManagedSession()).toBeNull();
  });

  it("resetPassword exchanges the recovery code, writes the password, and signs in", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const { resetPassword } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    await resetPassword("a@b.c", "123456", "newpassword");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/verify");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: "recovery", email: "a@b.c", token: "123456",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ password: "newpassword" });
    expect(getManagedSession()!.accessToken).toBe("at-1");
  });

  it("resetPassword on an expired code writes nothing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({ error_code: "otp_expired", msg: "Token has expired" }),
    });
    const { resetPassword, ManagedAuthError } = await import("@/lib/managed/auth");
    await expect(resetPassword("a@b.c", "000000", "newpassword")).rejects.toBeInstanceOf(ManagedAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deleteAccount keeps the session when the cloud refuses", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signIn, deleteAccount } = await import("@/lib/managed/auth");
    const { getManagedSession } = await import("@/lib/managed/account");
    await signIn("a@b.c", "password123");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(deleteAccount()).rejects.toThrow();
    // A signed-out screen on top of an account that is still live (and still billed)
    // would be worse than the error.
    expect(getManagedSession()).not.toBeNull();
  });

  // cancel_failed = the Stripe subscription is still live and the card can still be
  // charged; delete_failed = a plain retry. Collapsing the two would hide the one that
  // costs money, so the code travels up to the caller.
  it("deleteAccount forwards the cloud's failure code", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { signIn, deleteAccount, ManagedAuthError } = await import("@/lib/managed/auth");
    await signIn("a@b.c", "password123");
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 500, json: () => Promise.resolve({ error: "cancel_failed" }),
    });
    await expect(deleteAccount()).rejects.toMatchObject({ code: "cancel_failed" });

    // An unreadable body must not break reading the code.
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 500, json: () => Promise.reject(new Error("not json")),
    });
    const err = await deleteAccount().catch((e) => e);
    expect(err).toBeInstanceOf(ManagedAuthError);
    expect(err.code).toBeUndefined();
  });

  it("treats an undecryptable stored session as signed out instead of throwing", async () => {
    const { saveManagedSession, getManagedSession } = await import("@/lib/managed/account");
    saveManagedSession({
      email: "a@b.c",
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    // Master key rotated between the write and the read: the existing row becomes
    // undecryptable (authTag mismatch).
    process.env.ENCRYPTION_MASTER_KEY = "a".repeat(64);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getValidAccessToken } = await import("@/lib/managed/auth");
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(getManagedSession()).toBeNull();
    // Roll-up #6: this key rotation must now leave a trace, never the decryptable token
    // ("old") that was purged.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(" ")).not.toContain("old");
  });

  // Signups closed on the project while the repository goes public. The whole point of
  // this path is that the user sees an offer instead of GoTrue's raw English, so the two
  // things worth pinning are the code surviving the round trip and the message it maps to.
  describe("signups closed", () => {
    it("signUp's ManagedAuthError carries signup_disabled", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance",
        }),
      });
      const { signUp, ManagedAuthError } = await import("@/lib/managed/auth");
      const err = await signUp("a@b.c", "password123", "yacine").catch((e) => e);
      expect(err).toBeInstanceOf(ManagedAuthError);
      expect((err as InstanceType<typeof ManagedAuthError>).code).toBe("signup_disabled");
    });

    it("maps both closed-signup codes to the localized message, never the raw English", async () => {
      const { managedAuthErrorMessage, signupsClosed } = await import("@/lib/managed/client");
      const t = ((key: string) => key) as Parameters<typeof managedAuthErrorMessage>[2];
      for (const code of ["signup_disabled", "email_provider_disabled"]) {
        expect(signupsClosed(code)).toBe(true);
        expect(managedAuthErrorMessage(code, "Signups not allowed for this instance", t))
          .toBe("settings.account.authSignupsClosed");
      }
      expect(signupsClosed("invalid_credentials")).toBe(false);
      expect(signupsClosed(undefined)).toBe(false);
    });

    it("joinWaitlist posts the address to the public function, with no bearer token", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const { joinWaitlist } = await import("@/lib/managed/auth");
      await joinWaitlist("a@b.c", "yacine");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("/functions/v1/waitlist");
      expect(JSON.parse(init.body)).toEqual({ email: "a@b.c", username: "yacine" });
      expect(init.headers.Authorization).toBeUndefined();
    });

    // Not a ManagedAuthError, and that distinction is the whole point: that class makes the
    // route answer 401, which the client reads as "check your credentials" – for a write
    // that carries none. A plain Error lands on the route's 500, which the client
    // classifies as a network failure, which is what it is.
    it("joinWaitlist rejects a failed write as a plain Error, never as an auth failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false, status: 500, text: () => Promise.resolve('{"error":"insert_failed"}'),
      });
      const { joinWaitlist, ManagedAuthError } = await import("@/lib/managed/auth");
      const err = await joinWaitlist("a@b.c").catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(ManagedAuthError);
      expect((err as Error).message).toContain("insert_failed");
    });
  });
});
