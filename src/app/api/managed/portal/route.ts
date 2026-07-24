import { NextResponse } from "next/server";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "@/lib/managed/config";
import { getValidAccessToken } from "@/lib/managed/auth";

export async function POST() {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: BASCASO_CLOUD_PUBLISHABLE_KEY },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
