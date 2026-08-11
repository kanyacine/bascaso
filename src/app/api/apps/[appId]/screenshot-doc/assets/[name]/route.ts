import { NextResponse } from "next/server";
import { readAsset } from "@/lib/screenshot-editor-assets";

type RouteParams = { params: Promise<{ appId: string; name: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { appId, name } = await params;
  const asset = readAsset(appId, name);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.data), {
    headers: { "Content-Type": asset.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
