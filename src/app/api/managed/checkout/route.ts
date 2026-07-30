import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "@/lib/managed/config";
import { getValidAccessToken } from "@/lib/managed/auth";

// Format only, mirroring the CHECK on the cloud's skus table: the catalog of sellable
// SKUs lives in that table, and hardcoding its keys here made every new pack wait for a
// desktop release. The cloud answers unknown_sku for a well-formed sku it does not sell.
const schema = z.object({ sku: z.string().regex(/^[a-z0-9_]{1,40}$/) });

export async function POST(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const parsed = await parseBody(request, schema);
  if (parsed instanceof Response) return parsed;
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sku: parsed.sku }),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    // Panne réseau ou réponse non-JSON du backend managé – forme {error}
    // du contrat docs/BACKEND.md plutôt que l'erreur Next générique.
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}
