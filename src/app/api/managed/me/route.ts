import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { proxyCloud } from "@/lib/managed/proxy";
import {
  changeEmail,
  changePassword,
  deleteAccount,
  ManagedAuthError,
  updateUsername,
} from "@/lib/managed/auth";

export function GET() {
  return proxyCloud("me");
}

// One field per request, discriminated: a username change, an email change and a
// password change go to the same GoTrue endpoint but are three different acts, and
// only one of them may carry a password.
const patchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("username"), username: z.string().trim().min(1).max(40) }),
  z.object({ field: z.literal("email"), email: z.string().email() }),
  z.object({
    field: z.literal("password"),
    // The current one is not optional – see changePassword: GoTrue does not ask for
    // it, so this is the only thing standing between an unlocked Mac and an account
    // takeover.
    currentPassword: z.string().min(1),
    password: z.string().min(8),
  }),
]);

/** Edits the account itself. Goes straight to GoTrue rather than through the `me` edge
 *  function: email, password and `user_metadata` are GoTrue's own store, and
 *  PUT /auth/v1/user is the supported way to write them with the user's own token. */
export async function PATCH(request: Request) {
  const parsed = await parseBody(request, patchSchema);
  if (parsed instanceof Response) return parsed;
  try {
    if (parsed.field === "username") await updateUsername(parsed.username);
    else if (parsed.field === "email") await changeEmail(parsed.email);
    else await changePassword(parsed.currentPassword, parsed.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A wrong current password, a duplicate email, a weak-password rejection: all
    // carry the GoTrue code so the page can say which one it was instead of
    // "unknown error".
    if (err instanceof ManagedAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}

/** Closes the account for good – see deleteAccount and the delete-account edge
 *  function. Not merged into the auth route's DELETE: that one signs out. */
export async function DELETE() {
  try {
    await deleteAccount();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ManagedAuthError) {
      // Forwarded, not flattened: cancel_failed leaves a billable subscription alive.
      return NextResponse.json({ error: err.code ?? "delete_failed" }, { status: 502 });
    }
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}
