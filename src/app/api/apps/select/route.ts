import { NextResponse } from "next/server";
import { setFreeSelectedAppId } from "@/lib/app-preferences";

export async function POST(request: Request) {
  try {
    const { appId } = await request.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "appId is required" }, { status: 400 });
    }

    setFreeSelectedAppId(appId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
