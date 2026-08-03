import type { MessageKey } from "@/lib/i18n/messages";

/** Client-side helpers for the Bascaso cloud account: the fetch wrappers the
 *  billing page drives, and the two predicates its display depends on.
 *
 *  They used to live in the AI settings page and be imported from it by tests.
 *  The account UI has since moved to its own page, so a module is the honest
 *  home for them – a page exporting logic another page's tests import is not. */

type ManagedAuthResult =
  | { ok: true; confirmationRequired?: boolean }
  // `code`/`message` come from the body of the 401 (see route.ts): GoTrue's real
  // code and its message, so the caller can show something other than "check your
  // credentials" when that is not the problem (see managedAuthErrorMessage).
  | { ok: false; reason: "auth"; code?: string; message?: string }
  | { ok: false; reason: "network" };

/** `res.json().catch(...)` does not catch a missing `res.json` (the throw is
 *  synchronous, before the promise) – which is what tests mocking only `ok`/`status`
 *  produce. This wrapper covers both cases: missing method and non-JSON body. */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Step one of the reset: ask for the email carrying the code. */
export function requestManagedPasswordReset(email: string): Promise<ManagedAuthResult> {
  return postManagedAuth({ mode: "recover", email });
}

/** Step two: the code plus the new password. Succeeds signed in. */
export function resetManagedPassword(
  email: string,
  code: string,
  password: string,
): Promise<ManagedAuthResult> {
  return postManagedAuth({ mode: "reset", email, code, password });
}

/**
 * Kept out of the component so it can be tested without rendering React: it tells an
 * authentication failure (401 – credentials) apart from a network failure (a fetch that
 * throws), so the caller can show the right message in each case. A signup that is
 * accepted but awaiting email confirmation is an HTTP success (200) carrying
 * `confirmationRequired: true` in the body – neither a failure nor an actual sign-in.
 */
export async function postManagedAuth(
  body: Record<string, string | undefined>,
): Promise<ManagedAuthResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // A 5xx is a network/server failure while talking to the managed cloud (see
    // route.ts), not a credentials problem – tested before reading the body, otherwise
    // that 500 (which carries no `code`) falls through to managedAuthFailed ("check
    // your password") for what is really a dropped connection.
    if (res.status >= 500) return { ok: false, reason: "network" };
    if (!res.ok) {
      // Email confirmation being on in production makes "already registered" and
      // "email quota exceeded" likely – neither is a credentials problem (see
      // managedAuthErrorMessage on the caller's side).
      const data = await safeJson(res);
      return { ok: false, reason: "auth", code: data.code as string | undefined, message: data.error as string | undefined };
    }
    const data = await safeJson(res);
    return data.confirmationRequired ? { ok: true, confirmationRequired: true } : { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * The message shown under the managed form for an "auth" failure (401). The known
 * codes – account already registered, Supabase email quota exceeded, email not yet
 * confirmed – each call for a different action and get their own message.
 * `invalid_credentials` (wrong password – real shape measured in production:
 * {code:400, error_code:"invalid_credentials", msg:…}, not the OAuth2 shape
 * {error, error_description} assumed before) and the absence of a code share the
 * generic "check your credentials" message. For any other code (returned by the
 * server but not mapped here) its own message is shown rather than blaming a password
 * that may not be at fault – never the generic default for a code we do not recognise.
 */
/**
 * GoTrue's two ways of saying "not taking new accounts right now": `signup_disabled` is the
 * project's "allow new users to sign up" switch, `email_provider_disabled` the email
 * provider being off entirely. Neither is a credentials problem, and neither is permanent –
 * this is the state the app ships in while the repository is public and signups are not yet
 * open. The form offers the waiting list instead of leaving the user at a dead end.
 */
export function signupsClosed(code: string | undefined): boolean {
  return code === "signup_disabled" || code === "email_provider_disabled";
}

export function managedAuthErrorMessage(
  code: string | undefined,
  message: string | undefined,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case "user_already_exists":
      return t("settings.account.authUserExists");
    case "over_email_send_rate_limit":
      return t("settings.account.authRateLimited");
    case "email_not_confirmed":
      return t("settings.account.authEmailNotConfirmed");
    // Distinct from over_email_send_rate_limit: GoTrue also rate-limits /token and
    // /signup per IP, which is what impatiently clicking "I have confirmed" produces.
    case "over_request_rate_limit":
      return t("settings.account.authTooManyRequests");
    // Reset and email-change codes. Without them the default arm below would print
    // GoTrue's raw English at a French user, at the one moment they are least able to
    // guess what to do next.
    case "otp_expired":
      return t("settings.account.confirmFailed");
    case "email_exists":
      return t("settings.account.authUserExists");
    case "weak_password":
      return t("settings.account.authWeakPassword");
    case "same_password":
      return t("settings.account.authSamePassword");
    // Signups closed. Without this the default arm would print GoTrue's raw "Signups not
    // allowed for this instance" – English, and describing an instance the user has no
    // notion of, for what is simply "not yet".
    case "signup_disabled":
    case "email_provider_disabled":
      return t("settings.account.authSignupsClosed");
    case "invalid_credentials":
    case undefined:
      return t("settings.account.authFailed");
    default:
      return message || t("settings.account.authFailed");
  }
}

/** Minimum password length – same value as the zod schemas on both managed routes, so
 *  the checklist below and the server agree. A checklist that ticked green on a
 *  password the route rejects is exactly the kind of lying validation this replaces. */
const MIN_PASSWORD_LENGTH = 8;

interface PasswordRule {
  key: MessageKey;
  ok: boolean;
}

/**
 * The live checklist under a new-password field. Deliberately short: it lists what is
 * actually enforced and nothing else. The old form claimed nothing until the server
 * refused, then blamed the credentials for a password that was merely too short.
 *
 * `confirm` is part of it rather than a separate error line so that the two rules read
 * as one gate – the button turns on exactly when both are green (see allRulesPass).
 */
export function passwordRules(password: string, confirm: string): PasswordRule[] {
  return [
    { key: "settings.account.ruleLength", ok: password.length >= MIN_PASSWORD_LENGTH },
    { key: "settings.account.ruleMatch", ok: password.length > 0 && password === confirm },
  ];
}

export function allRulesPass(rules: PasswordRule[]): boolean {
  return rules.every((r) => r.ok);
}

type ManagedVerifyResult = { ok: true } | { ok: false; reason: "auth" | "network" };

/**
 * Secondary path of email confirmation: verifies a code the user received (when the
 * email template carries one rather than just a confirmation link). Same auth/network
 * distinction as postManagedAuth.
 */
export async function verifyManagedSignup(email: string, code: string): Promise<ManagedVerifyResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify", email, code }),
    });
    if (res.status >= 500) return { ok: false, reason: "network" };
    return res.ok ? { ok: true } : { ok: false, reason: "auth" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Restores `setBusy(false)` whichever way `fn` exits – success, early return or
 * exception. Fixes a regression where an early `return` inside the `!res.ok` branch
 * skipped resetting the "busy" flag and left the form's buttons disabled for good
 * after a failure.
 */
export async function runWithBusyFlag(setBusy: (busy: boolean) => void, fn: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await fn();
  } finally {
    setBusy(false);
  }
}

interface ManagedSubscription {
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * An exact mirror of `debit_action`'s condition on the backend: a subscription only
 * waives the debit if it is active/trialing AND not expired (`currentPeriodEnd` null =
 * no known expiry → treated as valid, otherwise compared against "now"). Drifting from
 * it here would show "Unlimited subscription" on the card while a zombie subscription
 * has tokens debited on every AI call.
 */
export function isManagedSubscriptionActive(
  subscription: ManagedSubscription | null | undefined,
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (subscription.currentPeriodEnd == null) return true;
  return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
}

/** Presence label for the account: the chosen username, else the email local part.
 *  Never the full email – it shows in the sidebar footer, where an address is both too
 *  long and more than the user asked to display. */
export function accountDisplayName(a: { username: string | null; email: string }): string {
  return a.username ?? a.email.split("@")[0];
}

/** Currencies Stripe carries without a minor unit: their `amount` is already the
 *  whole figure, not hundredths. Dividing those by 100 would show ¥10 for a
 *  ¥1000 price – a hundredfold error on a button that charges money.
 *  https://docs.stripe.com/currencies#zero-decimal */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Format a Stripe amount for display.
 *
 *  The currency comes from the price, not from the locale: Stripe charges in
 *  whatever the price is denominated in, and showing a euro figure to a user
 *  whose locale implies dollars would misstate what they are about to pay. Only
 *  the grouping and decimal marks follow the locale. */
export function formatPrice(amount: number, currency: string, locale: string): string {
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
  const value = zeroDecimal ? amount : amount / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    // Stripe amounts are exact, so a round price reads better as "10 €" than
    // "10,00 €" on a price list.
    minimumFractionDigits: zeroDecimal || amount % 100 === 0 ? 0 : 2,
  }).format(value);
}
