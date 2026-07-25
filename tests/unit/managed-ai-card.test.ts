import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateManaged,
  isManagedSubscriptionActive,
  managedAuthErrorMessage,
  runWithBusyFlag,
  verifyManagedSignup,
} from "@/app/settings/ai/page";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("runWithBusyFlag", () => {
  // Régression : le formulaire de connexion managé restait bloqué (boutons
  // désactivés en permanence) après un échec, car un `return` précoce dans le
  // bloc `!res.ok` contournait la remise à zéro du flag "busy".
  it("clears the busy flag after a successful run", async () => {
    const setBusy = vi.fn();
    await runWithBusyFlag(setBusy, async () => {});
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("clears the busy flag even when fn returns early on a failure path", async () => {
    const setBusy = vi.fn();
    let sawFailureBranch = false;
    await runWithBusyFlag(setBusy, async () => {
      sawFailureBranch = true;
      return; // chemin d'échec – ne doit pas empêcher la remise à zéro
    });
    expect(sawFailureBranch).toBe(true);
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("clears the busy flag even when fn throws, and propagates the error", async () => {
    const setBusy = vi.fn();
    await expect(
      runWithBusyFlag(setBusy, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });
});

describe("authenticateManaged", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok on a successful response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ email: "a@b.c" }) });
    const result = await authenticateManaged("login", "a@b.co", "password123");
    expect(result).toEqual({ ok: true });
  });

  it("reports reason 'auth' on a 401 (bad credentials)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const result = await authenticateManaged("login", "a@b.co", "wrong-password");
    expect(result).toEqual({ ok: false, reason: "auth" });
  });

  // Coeur du correctif : le body du 401 porte déjà le vrai message serveur
  // (route.ts) – il ne doit plus être jeté, sinon settings.ai.managedAuthFailed
  // ("vérifiez votre mot de passe") s'affiche même quand ce n'est pas un
  // problème de mot de passe (compte déjà inscrit, quota d'emails dépassé).
  it("surfaces the server's error code and message on a 401", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "User already registered", code: "user_already_exists" }),
    });
    const result = await authenticateManaged("signup", "a@b.co", "password123");
    expect(result).toEqual({
      ok: false, reason: "auth", code: "user_already_exists", message: "User already registered",
    });
  });

  it("still reports reason 'auth' when the 401 body isn't JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new Error("not json")),
    });
    const result = await authenticateManaged("login", "a@b.co", "wrong-password");
    expect(result).toEqual({ ok: false, reason: "auth" });
  });

  it("reports reason 'network' when the fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await authenticateManaged("login", "a@b.co", "password123");
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  // #4 du roll-up (relecture) : le 500 renvoyé par route.ts pour une panne
  // réseau côté cloud managé ne doit pas retomber sur "reason: auth" – ça
  // afficherait "vérifiez votre mot de passe" pour une coupure réseau,
  // exactement le préjudice que #4 existait pour supprimer.
  it("reports reason 'network' (not 'auth') on a 500 from the route", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Unable to reach bascaso cloud" }),
    });
    const result = await authenticateManaged("login", "a@b.co", "password123");
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  // Coeur du correctif (a) : un signup accepté par GoTrue mais en attente de
  // confirmation doit se distinguer d'un succès simple, sans passer par la
  // branche "reason: auth" (ce n'est pas un échec d'identifiants).
  it("reports confirmationRequired when the server signals a pending email confirmation", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ confirmationRequired: true }) });
    const result = await authenticateManaged("signup", "a@b.co", "password123");
    expect(result).toEqual({ ok: true, confirmationRequired: true });
  });
});

describe("verifyManagedSignup", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when the code is accepted", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await verifyManagedSignup("a@b.co", "123456");
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      mode: "verify", email: "a@b.co", code: "123456",
    });
  });

  it("reports reason 'auth' on an invalid or expired code", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const result = await verifyManagedSignup("a@b.co", "000000");
    expect(result).toEqual({ ok: false, reason: "auth" });
  });

  it("reports reason 'network' when the fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await verifyManagedSignup("a@b.co", "123456");
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  // #4 du roll-up (relecture) : même correctif que authenticateManaged.
  it("reports reason 'network' (not 'auth') on a 500 from the route", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const result = await verifyManagedSignup("a@b.co", "123456");
    expect(result).toEqual({ ok: false, reason: "network" });
  });
});

describe("managedAuthErrorMessage", () => {
  // Les deux cas rendus probables par la confirmation email en prod : ni
  // l'un ni l'autre n'est un problème d'identifiants.
  it("maps user_already_exists to its own localized message", () => {
    expect(managedAuthErrorMessage("user_already_exists", "User already registered", t))
      .toBe(en.settings.ai.managedAuthUserExists);
  });

  it("maps over_email_send_rate_limit to its own localized message", () => {
    expect(managedAuthErrorMessage("over_email_send_rate_limit", "Email rate limit exceeded", t))
      .toBe(en.settings.ai.managedAuthRateLimited);
  });

  // Le grant OAuth2 du login (mauvais mot de passe) ne porte pas de code :
  // c'est le seul cas où "vérifiez identifiants" reste le bon message.
  it("falls back to the generic credentials message when no code is present", () => {
    expect(managedAuthErrorMessage(undefined, "Invalid login credentials", t))
      .toBe(en.settings.ai.managedAuthFailed);
  });

  // Régression : GoTrue renvoie {code:400, error_code:"invalid_credentials",
  // msg:"Invalid login credentials"} pour un mauvais mot de passe (mesuré en
  // prod) – pas la forme OAuth2 {error, error_description} supposée avant.
  // Sans ce cas, le `default:` renvoyait le message serveur brut en anglais.
  it("maps invalid_credentials (bad password, real GoTrue shape) to the generic credentials message", () => {
    expect(managedAuthErrorMessage("invalid_credentials", "Invalid login credentials", t))
      .toBe(en.settings.ai.managedAuthFailed);
  });

  // GoTrue renvoie ce code quand la connexion est tentée avant que le compte
  // ne soit confirmé – le cas le plus probable produit par le bouton "Je me
  // suis confirmé – me connecter" cliqué trop tôt.
  it("maps email_not_confirmed to its own localized message", () => {
    expect(managedAuthErrorMessage("email_not_confirmed", "Email not confirmed", t))
      .toBe(en.settings.ai.managedAuthEmailNotConfirmed);
  });

  // Régression centrale du correctif : un code renvoyé par le serveur mais
  // non mappé ne doit jamais afficher "vérifiez votre mot de passe" – ce
  // n'est probablement pas le problème. Le message serveur est la meilleure
  // information disponible.
  it("surfaces the server's own message for a coded but unmapped failure", () => {
    expect(managedAuthErrorMessage("signup_disabled", "Signups are disabled", t))
      .toBe("Signups are disabled");
  });

  it("falls back to the generic message when a coded failure has no message", () => {
    expect(managedAuthErrorMessage("some_future_code", undefined, t))
      .toBe(en.settings.ai.managedAuthFailed);
  });
});

describe("isManagedSubscriptionActive", () => {
  const HOUR = 60 * 60 * 1000;
  const future = () => new Date(Date.now() + HOUR).toISOString();
  const past = () => new Date(Date.now() - HOUR).toISOString();

  // Miroir exact de la condition backend de debit_action : status actif/essai
  // ET (pas d'échéance connue OU échéance dans le futur).
  it("is false when there is no subscription", () => {
    expect(isManagedSubscriptionActive(null)).toBe(false);
    expect(isManagedSubscriptionActive(undefined)).toBe(false);
  });

  it("is false for a status outside active/trialing, regardless of currentPeriodEnd", () => {
    expect(isManagedSubscriptionActive({ status: "past_due", currentPeriodEnd: future() })).toBe(false);
    expect(isManagedSubscriptionActive({ status: "canceled", currentPeriodEnd: null })).toBe(false);
  });

  it("is true for active/trialing with no known expiry (currentPeriodEnd null)", () => {
    expect(isManagedSubscriptionActive({ status: "active", currentPeriodEnd: null })).toBe(true);
    expect(isManagedSubscriptionActive({ status: "trialing", currentPeriodEnd: null })).toBe(true);
  });

  it("is true for active/trialing with a currentPeriodEnd in the future", () => {
    expect(isManagedSubscriptionActive({ status: "active", currentPeriodEnd: future() })).toBe(true);
    expect(isManagedSubscriptionActive({ status: "trialing", currentPeriodEnd: future() })).toBe(true);
  });

  // Le bug corrigé ici : une ligne zombie (status "active" mais échéance
  // dépassée) ne doit plus afficher "Abonnement illimité" pendant que le
  // backend débite des jetons à chaque appel.
  it("is false for active/trialing with a currentPeriodEnd already in the past", () => {
    expect(isManagedSubscriptionActive({ status: "active", currentPeriodEnd: past() })).toBe(false);
    expect(isManagedSubscriptionActive({ status: "trialing", currentPeriodEnd: past() })).toBe(false);
  });
});
