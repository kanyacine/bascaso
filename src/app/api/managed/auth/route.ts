import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  joinWaitlist,
  ManagedAuthError,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
  signUp,
  verifySignup,
} from "@/lib/managed/auth";

// Discriminated union on "mode": login/signup require a password, verify requires the
// confirmation code received by email – different fields, so not a plain z.object() with
// shared optional fields.
const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("login"), email: z.string().email(), password: z.string().min(8) }),
  z.object({
    mode: z.literal("signup"),
    email: z.string().email(),
    password: z.string().min(8),
    // Required at signup: an account created without one would have no presence label
    // anywhere and no way to gain one but a later PATCH.
    username: z.string().trim().min(1).max(40),
  }),
  z.object({ mode: z.literal("verify"), email: z.string().email(), code: z.string().min(6) }),
  // Password reset, in two steps: ask for the email, then hand back the code it
  // carries along with the new password.
  z.object({ mode: z.literal("recover"), email: z.string().email() }),
  z.object({
    mode: z.literal("reset"),
    email: z.string().email(),
    code: z.string().min(6),
    password: z.string().min(8),
  }),
  // Not an account operation, but the same door: it is only ever reached from the sign-up
  // form, right after GoTrue refused to create an account because signups are closed.
  // Its own route would be a second copy of this file's fetch/error plumbing for one call.
  z.object({
    mode: z.literal("waitlist"),
    email: z.string().email(),
    // Whatever was typed in the sign-up form's username field, which may still be empty.
    username: z.string().trim().max(40).optional(),
  }),
]);

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (parsed instanceof Response) return parsed;
  try {
    if (parsed.mode === "login") {
      const session = await signIn(parsed.email, parsed.password);
      return NextResponse.json({ email: session.email });
    }
    if (parsed.mode === "verify") {
      const session = await verifySignup(parsed.email, parsed.code);
      return NextResponse.json({ email: session.email });
    }
    if (parsed.mode === "recover") {
      await requestPasswordReset(parsed.email);
      // Says nothing about whether the address has an account – GoTrue answers the
      // same either way, and so does this route: an endpoint that distinguished the
      // two would tell anyone which emails are registered here.
      return NextResponse.json({ ok: true });
    }
    if (parsed.mode === "reset") {
      const session = await resetPassword(parsed.email, parsed.code, parsed.password);
      return NextResponse.json({ email: session.email });
    }
    if (parsed.mode === "waitlist") {
      await joinWaitlist(parsed.email, parsed.username);
      return NextResponse.json({ ok: true });
    }
    // signup: confirmations off → a session straight away (like login); on → no
    // session, and the client must switch to the confirmation screen (see (a) in the
    // brief: this is not a 401 failure).
    const outcome = await signUp(parsed.email, parsed.password, parsed.username);
    return outcome.status === "signed_in"
      ? NextResponse.json({ email: outcome.session.email })
      : NextResponse.json({ confirmationRequired: true });
  } catch (err) {
    if (err instanceof ManagedAuthError) {
      // GoTrue's code (e.g. "user_already_exists", "over_email_send_rate_limit") when
      // available – the client uses it for a case-specific message rather than the
      // generic "check your credentials" (see postManagedAuth).
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    // Not a ManagedAuthError: a network failure or internal bug while talking to the
    // managed cloud, not a credentials problem – a 401 would show "check your password"
    // on the client for a dropped connection.
    console.error("[managed/auth] unexpected error", err);
    return NextResponse.json({ error: "Unable to reach bascaso cloud" }, { status: 500 });
  }
}

/** Sign out. `revoked` reports whether the refresh token was actually killed on the
 *  server; the local session is gone either way, and the client warns instead of
 *  claiming a clean sign-out it cannot vouch for. */
export async function DELETE() {
  const { revoked } = await signOut();
  return NextResponse.json({ ok: true, revoked });
}
