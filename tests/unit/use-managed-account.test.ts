import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchManagedAccount,
  invalidateManagedAccount,
  parseManagedAccount,
  takeSessionExpired,
} from "@/lib/hooks/use-managed-account";
import { accountDisplayName } from "@/lib/managed/client";

// The store itself is a React hook, but everything that can be wrong about it is in the
// mapping: which bodies count as signed in, and what a missing field defaults to. That
// part is pure, so it is tested without a renderer.
describe("parseManagedAccount", () => {
  it("maps the /api/managed/me body and derives subscribed", () => {
    expect(parseManagedAccount(true, {
      email: "a@b.c", username: "Yacine", balance: 42,
      subscription: { status: "active", currentPeriodEnd: null },
    })).toEqual({ email: "a@b.c", username: "Yacine", balance: 42, subscribed: true, endsAt: null });
  });
  it("is null when signed out and defensively on odd bodies", () => {
    expect(parseManagedAccount(false, { error: "not_logged_in" })).toBeNull();
    expect(parseManagedAccount(true, null)).toBeNull();
  });
  it("expired subscription reads as not subscribed, balance defaults to 0", () => {
    const parsed = parseManagedAccount(true, {
      email: "a@b.c", username: null,
      subscription: { status: "active", currentPeriodEnd: "2020-01-01T00:00:00Z" },
    });
    expect(parsed).toEqual({ email: "a@b.c", username: null, balance: 0, subscribed: false, endsAt: null });
  });
  it("a cancelled but unexpired subscription stays subscribed and carries its end date", () => {
    const parsed = parseManagedAccount(true, {
      email: "a@b.c", username: null, balance: 0,
      subscription: { status: "active", currentPeriodEnd: "2099-01-01T00:00:00Z", cancelAtPeriodEnd: true },
    });
    expect(parsed).toEqual({
      email: "a@b.c", username: null, balance: 0, subscribed: true, endsAt: "2099-01-01T00:00:00Z",
    });
  });
  it("ignores cancelAtPeriodEnd without a date – nothing to warn about", () => {
    const parsed = parseManagedAccount(true, {
      email: "a@b.c", username: null, balance: 0,
      subscription: { status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: true },
    });
    expect(parsed?.endsAt).toBeNull();
    expect(parsed?.subscribed).toBe(true);
  });
});

// One stub for the whole file: two module-level `vi.stubGlobal("fetch", …)` calls
// overwrite each other (last one wins), leaving the first describe driving a mock nobody
// configured.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("fetchManagedAccount coalescing", () => {
  function body(balance: number) {
    return new Response(JSON.stringify({ email: "a@b.c", username: null, balance, subscription: null }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateManagedAccount();
  });

  it("serves concurrent callers from one request", async () => {
    fetchMock.mockResolvedValue(body(42));
    const [a, b, c] = await Promise.all([
      fetchManagedAccount(), fetchManagedAccount(), fetchManagedAccount(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a?.balance).toBe(42);
  });

  it("refetches after an invalidation instead of replaying the settled request", async () => {
    fetchMock.mockResolvedValueOnce(body(42)).mockResolvedValueOnce(body(41));
    expect((await fetchManagedAccount())?.balance).toBe(42);
    invalidateManagedAccount();
    expect((await fetchManagedAccount())?.balance).toBe(41);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // The debit path invalidates then immediately reads. If a request already in flight
  // could still write back, that stale balance would land in the cache after the
  // refresh that was meant to replace it – and the footer would show the pre-debit
  // figure until something else invalidated.
  it("discards a response that lands after an invalidation", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { release = r; }));
    const stale = fetchManagedAccount();
    invalidateManagedAccount();
    release(body(99));
    await stale;

    fetchMock.mockResolvedValueOnce(body(7));
    expect((await fetchManagedAccount())?.balance).toBe(7);
  });

  it("does not cache a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await fetchManagedAccount()).toBeNull();
    fetchMock.mockResolvedValueOnce(body(5));
    expect((await fetchManagedAccount())?.balance).toBe(5);
  });
});

// An expiring session used to flip the app to "signed out" without a word: the balance
// vanishes, managed AI refuses, and nothing says why. The flag below is what lets the
// hook show a toast once – and only once.
describe("session expiry detection", () => {
  function signedIn() {
    return new Response(JSON.stringify({ email: "a@b.c", username: null, balance: 1, subscription: null }));
  }
  const unauthorized = () => new Response(JSON.stringify({ error: "not_logged_in" }), { status: 401 });

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateManagedAccount();
    takeSessionExpired();
  });

  it("flags a 401 that follows a signed-in read, exactly once", async () => {
    fetchMock.mockResolvedValueOnce(signedIn());
    await fetchManagedAccount();
    invalidateManagedAccount();
    fetchMock.mockResolvedValueOnce(unauthorized());
    await fetchManagedAccount();
    expect(takeSessionExpired()).toBe(true);
    // Consumed: one toast per expiry, however many mounted consumers ask the
    // question.
    expect(takeSessionExpired()).toBe(false);
  });

  it("stays quiet for a user who was never signed in", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await fetchManagedAccount();
    invalidateManagedAccount();
    await fetchManagedAccount();
    expect(takeSessionExpired()).toBe(false);
  });

  it("stays quiet on a network failure – offline is not expired", async () => {
    fetchMock.mockResolvedValueOnce(signedIn());
    await fetchManagedAccount();
    invalidateManagedAccount();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await fetchManagedAccount();
    expect(takeSessionExpired()).toBe(false);
  });
});

describe("accountDisplayName", () => {
  it("prefers the username, falls back to the email local part", () => {
    expect(accountDisplayName({ username: "Yacine", email: "yacinemouf@gmail.com" })).toBe("Yacine");
    expect(accountDisplayName({ username: null, email: "yacinemouf@gmail.com" })).toBe("yacinemouf");
  });
});
