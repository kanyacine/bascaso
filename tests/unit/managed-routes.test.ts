import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signIn: vi.fn(), signUp: vi.fn(), verifySignup: vi.fn(), getValidAccessToken: vi.fn(),
};
// Fake local session: there is no database here, and the paths added since (signOut,
// changePassword, deleteAccount) all read it. Mutable so the "signed out" case can take
// it away.
//
// Worth noting, and what makes this variable necessary: the mocks below only apply to
// callers OUTSIDE the module. `updateUsername` or `signOut` call `getValidAccessToken`
// internally, where the mock does not reach – they always see the real function, hence
// the real session and the real fetch.
const VALID_SESSION = { email: "a@b.co", accessToken: "at", refreshToken: "rt", expiresAt: 2 ** 31 };
let session: typeof VALID_SESSION | null = VALID_SESSION;
const account = { clearManagedSession: vi.fn() };
vi.mock("@/lib/managed/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/managed/auth")>("@/lib/managed/auth");
  return {
    ...actual,
    signIn: auth.signIn,
    signUp: auth.signUp,
    verifySignup: auth.verifySignup,
    getValidAccessToken: auth.getValidAccessToken,
  };
});
vi.mock("@/lib/managed/account", () => ({
  clearManagedSession: account.clearManagedSession,
  getManagedSession: () => session,
  saveManagedSession: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function post(body: unknown): Request {
  return new Request("http://local/api/managed/x", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function patch(body: unknown): Request {
  return new Request("http://local/api/managed/me", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("/api/managed/*", () => {
  // resetAllMocks (not clearAllMocks): only reset drains the mockResolvedValueOnce
  // queue – otherwise an unconsumed value leaks into the next test.
  beforeEach(() => { vi.resetAllMocks(); session = VALID_SESSION; });

  it("auth POST login saves and returns the email", async () => {
    auth.signIn.mockResolvedValue({ email: "a@b.c" });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "login", email: "a@b.co", password: "password123" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.c" });
  });

  it("auth POST propagates auth failures as 401", async () => {
    const { ManagedAuthError } = await import("@/lib/managed/auth");
    auth.signIn.mockRejectedValue(new ManagedAuthError("Invalid login credentials"));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "login", email: "a@b.co", password: "bad-pass" }));
    expect(res.status).toBe(401);
  });

  // The body already carries the real server message; it must also carry GoTrue's code
  // when there is one, so the client can tell "already registered" and "email quota
  // exceeded" apart from a genuine credentials problem instead of collapsing everything
  // onto "check your password".
  it("auth POST surfaces the server's error code alongside the message", async () => {
    const { ManagedAuthError } = await import("@/lib/managed/auth");
    auth.signUp.mockRejectedValue(new ManagedAuthError("User already registered", "user_already_exists"));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123", username: "Yacine" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "User already registered", code: "user_already_exists" });
  });

  it("auth POST omits code when the server error carries none", async () => {
    const { ManagedAuthError } = await import("@/lib/managed/auth");
    auth.signIn.mockRejectedValue(new ManagedAuthError("Invalid login credentials"));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "login", email: "a@b.co", password: "bad-pass" }));
    expect(await res.json()).toEqual({ error: "Invalid login credentials" });
  });

  it("auth POST signup returns the email when confirmations are off", async () => {
    auth.signUp.mockResolvedValue({ status: "signed_in", session: { email: "a@b.c" } });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123", username: "Yacine" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.c" });
  });

  // The heart of fix (a): a signup accepted by GoTrue but awaiting confirmation must no
  // longer surface as a credentials failure (401).
  it("auth POST signup reports confirmationRequired without erroring when GoTrue asks for confirmation", async () => {
    auth.signUp.mockResolvedValue({ status: "confirmation_required" });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123", username: "Yacine" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmationRequired: true });
  });

  // The username is not optional at signup: an account created without one would have
  // no presence label anywhere in the app, and no way to gain one but a later PATCH.
  it("auth POST signup without a username is a 400", async () => {
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123" }));
    expect(res.status).toBe(400);
  });

  it("auth POST signup forwards the username", async () => {
    auth.signUp.mockResolvedValue({ status: "signed_in", session: { email: "a@b.c" } });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123", username: " Yacine " }));
    expect(res.status).toBe(200);
    expect(auth.signUp).toHaveBeenCalledWith("a@b.co", "password123", "Yacine");
  });

  it("auth POST verify stores the session and returns the email", async () => {
    auth.verifySignup.mockResolvedValue({ email: "a@b.c" });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "verify", email: "a@b.co", code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.c" });
    expect(auth.verifySignup).toHaveBeenCalledWith("a@b.co", "123456");
  });

  it("auth POST verify propagates an invalid/expired code as 401", async () => {
    const { ManagedAuthError } = await import("@/lib/managed/auth");
    auth.verifySignup.mockRejectedValue(new ManagedAuthError("Token has expired or is invalid"));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "verify", email: "a@b.co", code: "000000" }));
    expect(res.status).toBe(401);
  });

  it("auth POST rejects verify without a code", async () => {
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "verify", email: "a@b.co" }));
    expect(res.status).toBe(400);
    expect(auth.verifySignup).not.toHaveBeenCalled();
  });

  // Roll-up #4: a network failure while talking to the managed cloud is not a
  // credentials failure – it must no longer pass itself off as a 401.
  it("auth POST maps a non-ManagedAuthError exception (network fault) to 500, not 401", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signIn.mockRejectedValue(new TypeError("fetch failed"));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "login", email: "a@b.co", password: "password123" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to reach bascaso cloud" });
    errorSpy.mockRestore();
  });

  it("auth DELETE clears the session and revokes the refresh token server-side", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { DELETE } = await import("@/app/api/managed/auth/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revoked: true });
    expect(account.clearManagedSession).toHaveBeenCalled();
    // The point of the fix: without this call the refresh token stays valid on GoTrue's
    // side, and "signed out" means nothing to the server.
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/logout");
  });

  it("auth DELETE reports a failed revocation instead of swallowing it", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { DELETE } = await import("@/app/api/managed/auth/route");
    // The local session is purged anyway: a session we cannot revoke is still a session
    // we must stop using.
    expect(await (await DELETE()).json()).toEqual({ ok: true, revoked: false });
    expect(account.clearManagedSession).toHaveBeenCalled();
  });

  it("auth POST recover asks GoTrue for a reset email and never says whether the address exists", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "recover", email: "a@b.co" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/recover");
  });

  it("auth POST reset exchanges the code then writes the new password", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, user: { email: "a@b.co" } }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "reset", email: "a@b.co", code: "123456", password: "password123" }));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/verify");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: "recovery", token: "123456" });
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/v1/user");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ password: "password123" });
  });

  it("auth POST reset rejects a password the checklist would have refused", async () => {
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "reset", email: "a@b.co", code: "123456", password: "short" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auth POST waitlist posts the address to the public function, with no bearer token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "waitlist", email: "a@b.co", username: "Yacine" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/functions/v1/waitlist");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "a@b.co", username: "Yacine" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("auth POST waitlist rejects a malformed address before calling the cloud", async () => {
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "waitlist", email: "pasunemail" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A failed write is a 500 and not a 401: nothing here is an authentication outcome, and
  // the client maps 401 to "check your credentials" – for a call that carries none.
  it("auth POST waitlist reports a failed write as a server failure, not as an auth one", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "insert_failed" }), { status: 500 }));
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "waitlist", email: "a@b.co" }));
    expect(res.status).toBe(500);
  });

  it("me returns 401 when signed out, proxies when signed in", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/managed/me/route");
    expect((await GET()).status).toBe(401);

    auth.getValidAccessToken.mockResolvedValueOnce("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ email: "a@b.c", balance: 4, subscription: null }) });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.c", balance: 4, subscription: null });
  });

  // Roll-up #3: a fetch that throws (backend unreachable) or a res.json() that fails
  // (non-JSON response) must return the {error} shape docs/BACKEND.md specifies, rather
  // than Next's generic off-contract error.
  it("me returns a 500 {error} when the upstream fetch throws", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce("token");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { GET } = await import("@/app/api/managed/me/route");
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "fetch failed" });
  });

  it("me returns a 500 {error} when the upstream response isn't JSON", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new Error("not json")) });
    const { GET } = await import("@/app/api/managed/me/route");
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "not json" });
  });

  it("me PATCH proxies the username to GoTrue", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const { PATCH } = await import("@/app/api/managed/me/route");
    const res = await PATCH(patch({ field: "username", username: " Yacine " }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/v1/user");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ data: { username: "Yacine" } });
  });

  it("me PATCH is 401 when signed out and 400 on an empty username", async () => {
    session = null;
    const { PATCH } = await import("@/app/api/managed/me/route");
    expect((await PATCH(patch({ field: "username", username: "x" }))).status).toBe(401);
    session = VALID_SESSION;
    expect((await PATCH(patch({ field: "username", username: "  " }))).status).toBe(400);
  });

  it("me PATCH email goes to GoTrue and leaves the local session alone", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { PATCH } = await import("@/app/api/managed/me/route");
    expect((await PATCH(patch({ field: "email", email: "new@b.co" }))).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "new@b.co" });
    // Nothing moves until both addresses have confirmed: purging the session here would
    // sign out a user whose email has not changed yet.
    expect(account.clearManagedSession).not.toHaveBeenCalled();
  });

  it("me PATCH password re-authenticates before writing the new one", async () => {
    // The guard standing in for the one GoTrue does not have (secure_password_change
    // off): without it, an unlocked Mac is enough to take the account over.
    fetchMock
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ access_token: "fresh", refresh_token: "rt", expires_in: 3600 }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { PATCH } = await import("@/app/api/managed/me/route");
    const res = await PATCH(patch({ field: "password", currentPassword: "old", password: "password123" }));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("grant_type=password");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "a@b.co", password: "old" });
    // The new password is written with the token the re-authentication just issued –
    // GoTrue invalidates the account's other sessions.
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ password: "password123" });
  });

  it("me PATCH password relays the GoTrue code so a wrong current password reads as itself", async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }),
      { status: 400 },
    ));
    const { PATCH } = await import("@/app/api/managed/me/route");
    const res = await PATCH(patch({ field: "password", currentPassword: "wrong", password: "password123" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "invalid_credentials" });
    // A single request: nothing was written with the wrong current password.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("me DELETE closes the account and only then drops the local session", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { DELETE } = await import("@/app/api/managed/me/route");
    expect((await DELETE()).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/functions/v1/delete-account");
    expect(account.clearManagedSession).toHaveBeenCalled();
  });

  it("me DELETE keeps the session when the cloud refuses – nothing was deleted", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const { DELETE } = await import("@/app/api/managed/me/route");
    expect((await DELETE()).status).toBe(502);
    expect(account.clearManagedSession).not.toHaveBeenCalled();
  });

  it("checkout validates the sku format and returns the url", async () => {
    auth.getValidAccessToken.mockResolvedValue("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ url: "https://stripe/x" }) });
    const { POST } = await import("@/app/api/managed/checkout/route");
    // Format only – uppercase, spaces, emptiness. Which skus actually exist is the
    // cloud's call (skus table): a well-formed unknown sku must reach it, not die here.
    for (const sku of ["NOPE", "pack 10", "", "pack-10"]) {
      expect((await POST(post({ sku }))).status).toBe(400);
    }
    const res = await POST(post({ sku: "pack_10" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe/x" });
  });

  it("checkout proxies a well-formed unknown sku and relays the cloud's 400", async () => {
    auth.getValidAccessToken.mockResolvedValue("token");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "unknown_sku" }),
    });
    const { POST } = await import("@/app/api/managed/checkout/route");
    const res = await POST(post({ sku: "pack_9000" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown_sku" });
  });

  // Auth must come before sku validation: a caller who is not signed in must never
  // learn anything about the input schema, even with an invalid sku. This must stay red
  // as long as checkout validates the sku before checking the token.
  //
  // The sku has to be rejected BY THE SCHEMA for this test to discriminate: "nope",
  // originally written here against a z.enum, became valid the day the enum gave way to
  // the catalogue's regex, and the test went green in both orders. "NOPE" (uppercase)
  // does fail the regex.
  it("checkout returns 401 when signed out, even with an invalid sku", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/managed/checkout/route");
    const res = await POST(post({ sku: "NOPE" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not_logged_in" });
  });

  // Not covered by the brief, but BACKEND.md requires at least one nominal case per
  // route: the portal proxy has no schema to validate, so only the "not_logged_in" guard
  // and the passthrough are left to check.
  it("portal returns 401 when signed out, proxies when signed in", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/managed/portal/route");
    expect((await POST()).status).toBe(401);

    auth.getValidAccessToken.mockResolvedValueOnce("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ url: "https://stripe/portal" }) });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe/portal" });
  });

  it("checkout returns a 500 {error} when the upstream fetch throws", async () => {
    auth.getValidAccessToken.mockResolvedValue("token");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { POST } = await import("@/app/api/managed/checkout/route");
    const res = await POST(post({ sku: "pack_10" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "fetch failed" });
  });

  it("portal returns a 500 {error} when the upstream fetch throws", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce("token");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { POST } = await import("@/app/api/managed/portal/route");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "fetch failed" });
  });
});
