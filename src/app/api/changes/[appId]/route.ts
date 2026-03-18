import { NextResponse } from "next/server";
import {
  getChangesForApp,
  deleteAllChanges,
  getChangeCount,
} from "@/lib/change-buffer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const changes = getChangesForApp(appId);
  const totalCount = getChangeCount();
  return NextResponse.json({ changes, totalCount });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  deleteAllChanges(appId);
  return NextResponse.json({ ok: true });
}
