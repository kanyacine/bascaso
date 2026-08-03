import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiSettings, managedAccount } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  const row = db
    .select({ id: aiSettings.id })
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();
  // A managed account (bascaso cloud AI) also counts as "configured".
  const managed = db.select({ id: managedAccount.id }).from(managedAccount).get();

  return NextResponse.json({ configured: !!row || !!managed });
}
