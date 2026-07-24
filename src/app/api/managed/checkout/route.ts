import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "@/lib/managed/config";
import { getValidAccessToken } from "@/lib/managed/auth";

const schema = z.object({ sku: z.enum(["pack_10", "pack_50", "pack_100", "sub_monthly"]) });

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (parsed instanceof Response) return parsed;
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
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
}
