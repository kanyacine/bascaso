import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signIn: vi.fn(), signUp: vi.fn(), verifySignup: vi.fn(), getValidAccessToken: vi.fn(),
};
// Session locale factice : il n'y a pas de base ici, et les chemins ajoutés
// (signOut, changePassword, deleteAccount) la lisent tous. Mutable pour que le cas
// « déconnecté » puisse la retirer.
//
// À noter, et c'est ce qui rend cette variable nécessaire : les mocks ci-dessous ne
// s'appliquent qu'aux appelants EXTERNES du module. `updateUsername` ou `signOut`
// appellent `getValidAccessToken` en interne, où le mock ne passe pas – ils voient
// toujours la vraie fonction, donc la vraie session et le vrai fetch.
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
  // resetAllMocks (et non clearAllMocks) : seul reset vide la file des
  // mockResolvedValueOnce – sinon une valeur non consommée fuit sur le test suivant.
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

  // Le body porte déjà le vrai message serveur ; il doit aussi porter le code
  // GoTrue quand il existe, pour que le client distingue "déjà inscrit" et
  // "quota d'emails dépassé" d'un vrai problème d'identifiants au lieu de
  // tout collapse sur "vérifiez votre mot de passe".
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

  // Coeur du correctif (a) : un signup accepté par GoTrue mais en attente de
  // confirmation ne doit plus remonter comme un échec d'identifiants (401).
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

  // #4 du roll-up : une panne réseau en parlant au cloud managé n'est pas un
  // échec d'identifiants – ne doit plus se faire passer pour un 401.
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
    // Le point du correctif : sans cet appel le refresh token reste valide côté
    // GoTrue, et « déconnecté » ne veut rien dire pour le serveur.
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/logout");
  });

  it("auth DELETE reports a failed revocation instead of swallowing it", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { DELETE } = await import("@/app/api/managed/auth/route");
    // Session locale purgée quand même : une session qu'on ne peut pas révoquer
    // reste une session qu'il faut cesser d'utiliser.
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

  // #3 du roll-up : un fetch qui lève (backend injoignable) ou un res.json()
  // qui échoue (réponse non-JSON) doit remonter la forme {error} du contrat
  // docs/BACKEND.md plutôt que l'erreur Next générique hors contrat.
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
    // Rien ne change tant que les deux adresses n'ont pas confirmé : purger la session
    // ici déconnecterait un utilisateur dont l'e-mail n'a pas encore bougé.
    expect(account.clearManagedSession).not.toHaveBeenCalled();
  });

  it("me PATCH password re-authenticates before writing the new one", async () => {
    // La garde qui remplace celle que GoTrue n'a pas (secure_password_change off) :
    // sans elle, un Mac déverrouillé suffit pour prendre le compte.
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
    // Le nouveau mot de passe est écrit avec le jeton que la ré-authentification vient
    // d'émettre – GoTrue invalide les autres sessions du compte.
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
    // Une seule requête : rien n'a été écrit avec le mauvais mot de passe actuel.
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

  // L'auth doit primer sur la validation du sku : un appelant non connecté
  // ne doit jamais recevoir d'information sur le schéma d'entrée, même avec
  // un sku invalide. Doit rester rouge tant que checkout valide le sku
  // avant de vérifier le token.
  //
  // Le sku doit être refusé PAR LE SCHÉMA pour que ce test discrimine : "nope",
  // écrit ici à l'origine contre un z.enum, est devenu valide le jour où l'enum a
  // laissé place à la regex du catalogue, et le test passait au vert dans les deux
  // ordres. "NOPE" (majuscules) échoue bien à la regex.
  it("checkout returns 401 when signed out, even with an invalid sku", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/managed/checkout/route");
    const res = await POST(post({ sku: "NOPE" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not_logged_in" });
  });

  // Non couvert par le brief, mais BACKEND.md exige au moins un cas nominal
  // par route : le proxy portal n'a pas de schéma à valider, seule la garde
  // "not_logged_in" et le passthrough restent à vérifier.
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
