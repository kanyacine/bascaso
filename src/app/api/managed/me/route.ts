import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "@/lib/managed/config";
import { getValidAccessToken } from "@/lib/managed/auth";

export async function GET() {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/me`, {
      headers: { Authorization: `Bearer ${token}`, apikey: BASCASO_CLOUD_PUBLISHABLE_KEY },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    // Panne réseau ou réponse non-JSON du backend managé – forme {error}
    // du contrat docs/BACKEND.md plutôt que l'erreur Next générique.
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}

const patchSchema = z.object({ username: z.string().trim().min(1).max(40) });

/** Renames the account. Goes straight to GoTrue rather than through the `me` edge
 *  function: `user_metadata` is GoTrue's own store, and PUT /auth/v1/user is the
 *  supported way to write it with the user's own token. */
export async function PATCH(request: Request) {
  const parsed = await parseBody(request, patchSchema);
  if (parsed instanceof Response) return parsed;
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { username: parsed.username } }),
    });
    if (!res.ok) return NextResponse.json({ error: "update_failed" }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}
