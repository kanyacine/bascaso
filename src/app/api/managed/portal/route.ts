import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "@/lib/managed/config";
import { getValidAccessToken } from "@/lib/managed/auth";

export async function POST() {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: BASCASO_CLOUD_PUBLISHABLE_KEY },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    // Panne réseau ou réponse non-JSON du backend managé – forme {error}
    // du contrat docs/BACKEND.md plutôt que l'erreur Next générique.
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}
