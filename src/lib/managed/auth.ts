import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "./config";
import {
  clearManagedSession,
  getManagedSession,
  saveManagedSession,
  type ManagedSession,
} from "./account";

export class ManagedAuthError extends Error {
  // `code` carries GoTrue's error_code (e.g. "invalid_credentials", "user_already_exists",
  // "over_email_send_rate_limit", "email_not_confirmed"). Measured in production: this
  // GoTrue always answers {code, error_code, msg} on /token as on /signup – not the
  // OAuth2 shape {error, error_description} we assumed before. `code` stays undefined
  // only if the server omits error_code (defensive). It lets the caller tell these
  // cases apart from a genuine credentials problem instead of collapsing everything
  // onto the same generic message.
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "ManagedAuthError";
  }
}

interface GoTrueResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { email?: string };
  // Response of a signup awaiting confirmation: GoTrue returns the user object at
  // the root (an "id" field at the top level), not under a nested "user" key –
  // see internal/api/signup.go in supabase/auth (`sendJSON(w, http.StatusOK, user)`).
  id?: string;
  // Empty on the sanitised response for an address that already signed up; exactly one
  // entry on a genuine pending signup. The only signal that tells the two apart.
  identities?: unknown[];
  // Never sent by this GoTrue: a leftover of the OAuth2 assumption. Kept as the first
  // arm of the ?? purely in case a proxy were to reintroduce it.
  error_description?: string;
  msg?: string;
  // Machine-readable code, present on EVERY endpoint, /token included. The opposite
  // assumption (OAuth2 shape on /token) is what made managedAuthFailed unreachable
  // and showed raw English to non-English speakers.
  // Measured in production: wrong password → {code:400, error_code:"invalid_credentials", msg:…}.
  error_code?: string;
}

/** Low-level POST to GoTrue: never throws, leaves the caller to decide how to read
 *  a non-2xx status (signUp and verifySignup each have their own logic for that). */
async function postGoTrue(
  path: string,
  // `unknown` and not `string`: GoTrue's `data` field – the only route into
  // user_metadata – is an object, not a scalar.
  body: Record<string, unknown>,
): Promise<{ res: Response; json: GoTrueResponse }> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GoTrueResponse;
  return { res, json };
}

/** Strict variant used by signIn/refresh: a non-2xx status, or a response without an
 *  access_token, is always an authentication failure. */
async function goTrue(path: string, body: Record<string, string>): Promise<GoTrueResponse> {
  const { res, json } = await postGoTrue(path, body);
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Authentication failed", json.error_code);
  }
  return json;
}

/** PUT /auth/v1/user – GoTrue's own store for the account itself (email, password,
 *  user_metadata). Everything mutable about the account goes through here with the
 *  user's own token; none of it lives in a table of ours. */
async function putUser(accessToken: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as GoTrueResponse;
    throw new ManagedAuthError(json.msg ?? "Update failed", json.error_code);
  }
}

function toSession(json: GoTrueResponse, email: string): ManagedSession {
  return {
    email: json.user?.email ?? email,
    accessToken: json.access_token!,
    refreshToken: json.refresh_token!,
    expiresAt: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
  };
}

export async function signIn(email: string, password: string): Promise<ManagedSession> {
  const session = toSession(await goTrue("token?grant_type=password", { email, password }), email);
  saveManagedSession(session);
  return session;
}

type SignUpOutcome =
  | { status: "signed_in"; session: ManagedSession }
  | { status: "confirmation_required" };

/** `username` is required, not optional: it is the account's presence label in the
 *  sidebar, the account menu and the AI settings page. GoTrue stores it in
 *  user_metadata (via `data`), which the `me` endpoint reads back – no table of ours
 *  holds it. */
export async function signUp(email: string, password: string, username: string): Promise<SignUpOutcome> {
  const { res, json } = await postGoTrue("signup", { email, password, data: { username } });
  // Address already registered. GoTrue only returns 422 user_already_exists when email
  // OR SMS autoconfirm is on; both are off on this project, so it answers a "sanitised"
  // 200 indistinguishable from a pending signup – except through `identities`, empty here
  // where a genuine new signup carries exactly one. Without this test, a user coming back
  // to sign up is promised a confirmation email they will never receive.
  // The 422 case is still handled below: the code must stay correct if autoconfirm is
  // turned back on. Known caveat: GoTrue also empties `identities` for an INVITED user
  // (HasBeenInvited, internal/api/signup.go) – a genuine pending signup that would be
  // taken for a duplicate here. bascaso has no invitation flow; if one is added for the
  // paid tier, discriminate on `invited_at`.
  if (res.ok && !json.access_token && Array.isArray(json.identities) && json.identities.length === 0) {
    throw new ManagedAuthError("User already registered", "user_already_exists");
  }
  // Email confirmation enabled on the project: /signup answers 200 with no tokens.
  // This is not a credentials failure – throwing ManagedAuthError would show
  // "invalid credentials" for an account that was just created. The user object is
  // detected in both its possible shapes (see GoTrueResponse above): nested "user",
  // or "id" at the root.
  if (res.ok && !json.access_token && (json.user != null || json.id != null)) {
    return { status: "confirmation_required" };
  }
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Authentication failed", json.error_code);
  }
  const session = toSession(json, email);
  saveManagedSession(session);
  return { status: "signed_in", session };
}

/**
 * Confirms a signup with the verification code sent by email. GoTrue expects
 * `type: "signup"` for this flow, but depending on the project's version that type
 * can be rejected (400) in favour of `type: "email"` – the fallback is handled here
 * rather than frozen at authoring time, so the code stays correct whichever version
 * this backend accepts. An invalid/expired code (observed empirically: 403
 * "otp_expired") is NOT a type problem, so the retry only happens on a 400.
 */
export async function verifySignup(email: string, code: string): Promise<ManagedSession> {
  let { res, json } = await postGoTrue("verify", { type: "signup", email, token: code });
  if (res.status === 400) {
    ({ res, json } = await postGoTrue("verify", { type: "email", email, token: code }));
  }
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Verification failed", json.error_code);
  }
  const session = toSession(json, email);
  saveManagedSession(session);
  return session;
}

function readSessionOrClear(): ManagedSession | null {
  try {
    return getManagedSession();
  } catch (err) {
    // Unreadable session (master key changed, corrupted row…): treated as signed
    // out. It will never be usable again, so it is purged to avoid repeating the
    // failure on every call. Logged (never the token's contents) so that a
    // mishandled key rotation stays visible in production instead of showing up
    // as a silent "signed out".
    console.warn(
      "[managed/auth] unreadable session, clearing:",
      err instanceof Error ? err.message : String(err),
    );
    clearManagedSession();
    return null;
  }
}

/** In-flight refresh, shared by every concurrent caller. GoTrue rotates the refresh
 *  token: the second refresh of a concurrent pair (a bulk AI run starts as many as it
 *  fires calls) presents an already-revoked token, fails, and purges the session – the
 *  user is signed out in the middle of their work. Single process (the Next server
 *  embedded in Electron), so a module variable is enough. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Re-read UNDER the lock: a caller queued behind an in-flight refresh holds a
  // snapshot taken before it, whose refresh token has just been invalidated.
  const session = readSessionOrClear();
  if (!session) return null;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session.accessToken;
  try {
    const refreshed = toSession(
      await goTrue("token?grant_type=refresh_token", { refresh_token: session.refreshToken }),
      session.email,
    );
    saveManagedSession(refreshed);
    return refreshed.accessToken;
  } catch (err) {
    console.warn(
      "[managed/auth] token refresh failed, clearing session:",
      err instanceof Error ? err.message : String(err),
    );
    clearManagedSession();
    return null;
  }
}

/** A valid access token (refreshed if under 60 s remain), or null if signed out. */
export async function getValidAccessToken(): Promise<string | null> {
  const session = readSessionOrClear();
  if (!session) return null;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session.accessToken;
  // `??=` only evaluates its right-hand side when the left is nullish, and nothing
  // runs between the test and the assignment: two callers cannot start two refreshes.
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Sign out, both ends.
 *
 *  Deleting our row is the easy half and used to be the only half: GoTrue keeps a
 *  refresh token valid until something revokes it, so a "signed out" machine still
 *  held a credential that could mint access tokens for the account. `scope=global`
 *  kills every session of this user, which is what a user asking to sign out of a
 *  desktop app they may be giving away actually means.
 *
 *  The local session is cleared whichever way the revocation goes – one we cannot
 *  revoke is still one we must stop using – and the return value says whether the
 *  server side landed, so the caller can say so rather than swallow it. */
export async function signOut(): Promise<{ revoked: boolean }> {
  // Refreshed first: an expired access token is rejected by /logout, and this is
  // exactly the state a machine left alone overnight is in.
  const token = await getValidAccessToken();
  clearManagedSession();
  if (!token) return { revoked: true }; // nothing on the server to revoke
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: { apikey: BASCASO_CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    });
    return { revoked: res.ok };
  } catch {
    return { revoked: false };
  }
}

/** Send the password-reset email. Never says whether the address exists: GoTrue
 *  answers 200 either way, and so do we – the alternative is an oracle telling
 *  anyone which emails have an account here. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { res, json } = await postGoTrue("recover", { email });
  if (!res.ok) throw new ManagedAuthError(json.msg ?? "Reset failed", json.error_code);
}

/**
 * Second half of the reset: the six-digit code from the email, plus the new password.
 *
 * A code and not the link the email also carries – the link goes to a website, and
 * this is a desktop app with no browser callback to land on. `type: "recovery"`
 * exchanges the code for a session, and that session is the only thing GoTrue accepts
 * as authority to set a password without knowing the old one. The user ends up signed
 * in, which is what they wanted in the first place.
 */
export async function resetPassword(email: string, code: string, password: string): Promise<ManagedSession> {
  const { res, json } = await postGoTrue("verify", { type: "recovery", email, token: code });
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.msg ?? "Verification failed", json.error_code);
  }
  await putUser(json.access_token, { password });
  const session = toSession(json, email);
  saveManagedSession(session);
  return session;
}

/** Rename the account (GoTrue user_metadata – no table of ours holds it). */
export async function updateUsername(username: string): Promise<void> {
  const token = await requireAccessToken();
  await putUser(token, { data: { username } });
}

/**
 * Change the account's email. `double_confirm_changes` is on, so GoTrue mails both
 * the old and the new address and nothing moves until both are confirmed – which is
 * also why the session keeps working meanwhile and the local row is left alone.
 */
export async function changeEmail(email: string): Promise<void> {
  const token = await requireAccessToken();
  await putUser(token, { email });
}

/**
 * Change the password, current one required.
 *
 * GoTrue does not ask for it (`secure_password_change` is off on this project), so
 * without the re-authentication below anyone at an unlocked Mac could take the
 * account over – lock the owner out of a balance they paid for, and out of the
 * address the receipts go to. The grant doubles as the source of the session we
 * keep: GoTrue invalidates the other sessions of an account whose password changed.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const session = readSessionOrClear();
  if (!session) throw new ManagedAuthError("Not signed in");
  const fresh = await signIn(session.email, currentPassword);
  await putUser(fresh.accessToken, { password: newPassword });
}

/**
 * Delete the account and everything the cloud holds about it. The edge function does
 * the work with the service role (cancelling any live Stripe subscription first);
 * this side only proves who is asking and drops the local session once it is gone.
 */
export async function deleteAccount(): Promise<void> {
  const token = await requireAccessToken();
  const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/delete-account`, {
    method: "DELETE",
    headers: { apikey: BASCASO_CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  // The local session is kept on failure, on purpose: clearing it would show a
  // signed-out app while the account and its subscription are still very much alive.
  if (!res.ok) {
    // The two failures are not the same to the user: "cancel_failed" means the Stripe
    // subscription is still live and the card can keep being charged, "delete_failed"
    // is a plain retry. Collapsing them hides the one that costs money.
    const code = await res.json().then((b) => b?.error).catch(() => undefined);
    throw new ManagedAuthError("Account deletion failed", typeof code === "string" ? code : undefined);
  }
  clearManagedSession();
}

/**
 * Ask to be told when signups open, while they are closed.
 *
 * No session and no token: the caller is, by definition, someone who has just been refused
 * an account. The edge function is the only thing that touches the table – it writes, never
 * reads, and answers the same whether the address was already there or not.
 *
 * A plain Error, deliberately, where every sibling in this file raises ManagedAuthError:
 * that class exists to carry a GoTrue code the form turns into a specific message, and
 * nothing here is an authentication outcome. Raising it would make the route answer 401,
 * which the client reads as `reason: "auth"` – "check your credentials" for a write that
 * failed with no credentials in play. Left as an Error, the route's own handler logs it and
 * answers 500, which the client classifies as a network failure. Which is what it is: the
 * function's two error bodies (`invalid_email`, unreachable behind the route's `z.email()`,
 * and `insert_failed`) mean the same thing to the user – it was not written down, try again.
 */
export async function joinWaitlist(email: string, username?: string): Promise<void> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/waitlist`, {
    method: "POST",
    headers: { apikey: BASCASO_CLOUD_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, username }),
  });
  if (!res.ok) {
    // The body goes to the server log, never to the user – it is the only place the
    // difference between the two failures is recorded, and the only place it is useful.
    const body = await res.text().catch(() => "");
    throw new Error(`waitlist request failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

async function requireAccessToken(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new ManagedAuthError("Not signed in");
  return token;
}
