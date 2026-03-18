import { NextResponse } from "next/server";
import {
  getSectionChange,
  upsertSectionChange,
  deleteSectionChange,
} from "@/lib/change-buffer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; section: string }> },
) {
  const { appId, section } = await params;
  const scope = new URL(_request.url).searchParams.get("scope") ?? "";
  const change = getSectionChange(appId, section, scope);
  return NextResponse.json({ change });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; section: string }> },
) {
  const { appId, section } = await params;
  const body = await request.json() as {
    scope: string;
    data: Record<string, unknown>;
    originalData: Record<string, unknown>;
  };

  upsertSectionChange(appId, section, body.scope, body.data, body.originalData);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string; section: string }> },
) {
  const { appId, section } = await params;
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  deleteSectionChange(appId, section, scope);
  return NextResponse.json({ ok: true });
}
