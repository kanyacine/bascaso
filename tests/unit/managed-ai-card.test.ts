import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  postManagedAuth,
  isManagedSubscriptionActive,
  managedAuthErrorMessage,
  runWithBusyFlag,
  verifyManagedSignup,
} from "@/lib/managed/client";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("runWithBusyFlag", () => {
  // Regression: the managed sign-in form stayed stuck (buttons disabled for good) after
  // a failure, because an early `return` inside the `!res.ok` branch skipped resetting
  // the "busy" flag.
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
      return; // failure path – must not prevent the reset
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

describe("postManagedAuth", () => {
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
    const result = await postManagedAuth({ mode: "login", email: "a@b.co", password: "password123" });
    expect(result).toEqual({ ok: true });
  });

  it("reports reason 'auth' on a 401 (bad credentials)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const result = await postManagedAuth({ mode: "login", email: "a@b.co", password: "wrong-password" });
    expect(result).toEqual({ ok: false, reason: "auth" });
  });

  // The heart of the fix: the body of the 401 already carries the real server message
  // (route.ts) – it must no longer be thrown away, otherwise settings.account.authFailed
  // ("check your password") shows even when the password is not the problem (account
  // already registered, email quota exceeded).
  it("surfaces the server's error code and message on a 401", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "User already registered", code: "user_already_exists" }),
    });
    const result = await postManagedAuth({ mode: "signup", email: "a@b.co", password: "password123" });
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
    const result = await postManagedAuth({ mode: "login", email: "a@b.co", password: "wrong-password" });
    expect(result).toEqual({ ok: false, reason: "auth" });
  });

  it("reports reason 'network' when the fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await postManagedAuth({ mode: "login", email: "a@b.co", password: "password123" });
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  // Roll-up #4 (re-review): the 500 route.ts returns for a network failure against the
  // managed cloud must not fall through to "reason: auth" – that would show "check your
  // password" for a dropped connection, exactly the harm #4 existed to remove.
  it("reports reason 'network' (not 'auth') on a 500 from the route", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Unable to reach bascaso cloud" }),
    });
    const result = await postManagedAuth({ mode: "login", email: "a@b.co", password: "password123" });
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  // The heart of fix (a): a signup accepted by GoTrue but awaiting confirmation must be
  // distinguishable from a plain success, without going through the "reason: auth"
  // branch (it is not a credentials failure).
  it("reports confirmationRequired when the server signals a pending email confirmation", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ confirmationRequired: true }) });
    const result = await postManagedAuth({ mode: "signup", email: "a@b.co", password: "password123" });
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

  // Roll-up #4 (re-review): same fix as postManagedAuth.
  it("reports reason 'network' (not 'auth') on a 500 from the route", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const result = await verifyManagedSignup("a@b.co", "123456");
    expect(result).toEqual({ ok: false, reason: "network" });
  });
});

describe("managedAuthErrorMessage", () => {
  // The two cases email confirmation makes likely in production: neither is a
  // credentials problem.
  it("maps user_already_exists to its own localized message", () => {
    expect(managedAuthErrorMessage("user_already_exists", "User already registered", t))
      .toBe(en.settings.account.authUserExists);
  });

  it("maps over_email_send_rate_limit to its own localized message", () => {
    expect(managedAuthErrorMessage("over_email_send_rate_limit", "Email rate limit exceeded", t))
      .toBe(en.settings.account.authRateLimited);
  });

  // The login OAuth2 grant (wrong password) carries no code: it is the one case where
  // "check your credentials" is still the right message.
  it("falls back to the generic credentials message when no code is present", () => {
    expect(managedAuthErrorMessage(undefined, "Invalid login credentials", t))
      .toBe(en.settings.account.authFailed);
  });

  // Regression: GoTrue returns {code:400, error_code:"invalid_credentials",
  // msg:"Invalid login credentials"} for a wrong password (measured in production) – not
  // the OAuth2 shape {error, error_description} assumed before. Without this case, the
  // `default:` arm returned the raw English server message.
  it("maps invalid_credentials (bad password, real GoTrue shape) to the generic credentials message", () => {
    expect(managedAuthErrorMessage("invalid_credentials", "Invalid login credentials", t))
      .toBe(en.settings.account.authFailed);
  });

  // GoTrue returns this code when a sign-in is attempted before the account is
  // confirmed – the likeliest case, produced by clicking "I have confirmed – sign me in"
  // too early.
  it("maps email_not_confirmed to its own localized message", () => {
    expect(managedAuthErrorMessage("email_not_confirmed", "Email not confirmed", t))
      .toBe(en.settings.account.authEmailNotConfirmed);
  });

  // The fix's central regression: a code returned by the server but not mapped here
  // must never show "check your password" – that is probably not the problem. The server
  // message is the best information available.
  it("surfaces the server's own message for a coded but unmapped failure", () => {
    expect(managedAuthErrorMessage("signup_disabled", "Signups are disabled", t))
      .toBe("Signups are disabled");
  });

  it("falls back to the generic message when a coded failure has no message", () => {
    expect(managedAuthErrorMessage("some_future_code", undefined, t))
      .toBe(en.settings.account.authFailed);
  });
});

describe("isManagedSubscriptionActive", () => {
  const HOUR = 60 * 60 * 1000;
  const future = () => new Date(Date.now() + HOUR).toISOString();
  const past = () => new Date(Date.now() - HOUR).toISOString();

  // An exact mirror of debit_action's backend condition: status active/trialing AND (no
  // known expiry OR an expiry in the future).
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

  // The bug fixed here: a zombie row (status "active" but an expiry in the past) must no
  // longer show "Unlimited subscription" while the backend debits tokens on every
  // call.
  it("is false for active/trialing with a currentPeriodEnd already in the past", () => {
    expect(isManagedSubscriptionActive({ status: "active", currentPeriodEnd: past() })).toBe(false);
    expect(isManagedSubscriptionActive({ status: "trialing", currentPeriodEnd: past() })).toBe(false);
  });
});
