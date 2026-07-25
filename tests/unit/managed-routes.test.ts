import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signIn: vi.fn(), signUp: vi.fn(), verifySignup: vi.fn(), getValidAccessToken: vi.fn(),
};
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
vi.mock("@/lib/managed/account", () => ({ clearManagedSession: account.clearManagedSession }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function post(body: unknown): Request {
  return new Request("http://local/api/managed/x", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("/api/managed/*", () => {
  // resetAllMocks (et non clearAllMocks) : seul reset vide la file des
  // mockResolvedValueOnce – sinon une valeur non consommée fuit sur le test suivant.
  beforeEach(() => { vi.resetAllMocks(); });

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
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123" }));
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
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.c" });
  });

  // Coeur du correctif (a) : un signup accepté par GoTrue mais en attente de
  // confirmation ne doit plus remonter comme un échec d'identifiants (401).
  it("auth POST signup reports confirmationRequired without erroring when GoTrue asks for confirmation", async () => {
    auth.signUp.mockResolvedValue({ status: "confirmation_required" });
    const { POST } = await import("@/app/api/managed/auth/route");
    const res = await POST(post({ mode: "signup", email: "a@b.co", password: "password123" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmationRequired: true });
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

  it("auth DELETE clears the session", async () => {
    const { DELETE } = await import("@/app/api/managed/auth/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(account.clearManagedSession).toHaveBeenCalled();
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

  it("checkout validates the sku and returns the url", async () => {
    auth.getValidAccessToken.mockResolvedValue("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ url: "https://stripe/x" }) });
    const { POST } = await import("@/app/api/managed/checkout/route");
    expect((await POST(post({ sku: "nope" }))).status).toBe(400);
    const res = await POST(post({ sku: "pack_10" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe/x" });
  });

  // L'auth doit primer sur la validation du sku : un appelant non connecté
  // ne doit jamais recevoir d'information sur le schéma d'entrée, même avec
  // un sku invalide. Doit rester rouge tant que checkout valide le sku
  // avant de vérifier le token.
  it("checkout returns 401 when signed out, even with an invalid sku", async () => {
    auth.getValidAccessToken.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/managed/checkout/route");
    const res = await POST(post({ sku: "nope" }));
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
