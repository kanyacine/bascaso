import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { clearManagedSession } from "@/lib/managed/account";
import { ManagedAuthError, signIn, signUp } from "@/lib/managed/auth";

const schema = z.object({
  mode: z.enum(["login", "signup"]),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (parsed instanceof Response) return parsed;
  try {
    const session = parsed.mode === "login"
      ? await signIn(parsed.email, parsed.password)
      : await signUp(parsed.email, parsed.password);
    return NextResponse.json({ email: session.email });
  } catch (err) {
    const message = err instanceof ManagedAuthError ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE() {
  clearManagedSession();
  return NextResponse.json({ ok: true });
}
