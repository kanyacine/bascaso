import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "./config";
import { getValidAccessToken } from "./auth";

/** Call an edge function of the managed backend with the signed-in user's token and
 *  forward its JSON and status verbatim.
 *
 *  Every `/api/managed` route but `auth` is this same three-step – check the session,
 *  call the function, pass the answer through – and each copy of it was one more place
 *  a header or a status code could drift. */
export async function proxyCloud(
  fn: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<NextResponse> {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/${fn}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    // Network failure, or a non-JSON answer from the managed backend – the {error}
    // shape of the docs/BACKEND.md contract rather than Next's generic error.
    return errorJson(err, 500, "Unable to reach bascaso cloud");
  }
}
