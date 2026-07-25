import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { clearManagedSession } from "@/lib/managed/account";
import { ManagedAuthError, signIn, signUp, verifySignup } from "@/lib/managed/auth";

// Union discriminée sur "mode" : login/signup exigent un mot de passe, verify
// exige le code de confirmation reçu par email – des champs différents, donc
// pas un simple z.object() avec des champs optionnels partagés.
const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("login"), email: z.string().email(), password: z.string().min(8) }),
  z.object({ mode: z.literal("signup"), email: z.string().email(), password: z.string().min(8) }),
  z.object({ mode: z.literal("verify"), email: z.string().email(), code: z.string().min(6) }),
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
    // signup : confirmations désactivées → session directe (comme login) ;
    // activées → pas de session, le client doit basculer sur l'écran de
    // confirmation (voir (a) dans le brief : ceci n'est pas un échec 401).
    const outcome = await signUp(parsed.email, parsed.password);
    return outcome.status === "signed_in"
      ? NextResponse.json({ email: outcome.session.email })
      : NextResponse.json({ confirmationRequired: true });
  } catch (err) {
    const message = err instanceof ManagedAuthError ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE() {
  clearManagedSession();
  return NextResponse.json({ ok: true });
}
