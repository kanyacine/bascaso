import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signIn: vi.fn(), signUp: vi.fn(), getValidAccessToken: vi.fn(),
};
const account = { clearManagedSession: vi.fn() };
vi.mock("@/lib/managed/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/managed/auth")>("@/lib/managed/auth");
  return { ...actual, signIn: auth.signIn, signUp: auth.signUp, getValidAccessToken: auth.getValidAccessToken };
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
  beforeEach(() => { vi.clearAllMocks(); });

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
});
