import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateManaged, runWithBusyFlag, verifyManagedSignup } from "@/app/settings/ai/page";

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

  it("reports reason 'network' when the fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
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
});
