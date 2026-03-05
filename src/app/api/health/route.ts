import { NextResponse } from "next/server";
import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const cred = db
      .select({ id: ascCredentials.id, isDemo: ascCredentials.isDemo })
      .from(ascCredentials)
      .where(eq(ascCredentials.isActive, true))
      .get();

    return NextResponse.json({
      status: "ok",
      setup: !cred,
      demo: !!cred?.isDemo,
    });
  } catch {
    // Table doesn't exist yet – setup is needed
    return NextResponse.json({
      status: "ok",
      setup: true,
      demo: false,
    });
  }
}
