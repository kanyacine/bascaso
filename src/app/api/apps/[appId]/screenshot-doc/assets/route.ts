import { NextResponse } from "next/server";
import { saveAsset } from "@/lib/screenshot-editor-assets";
import { errorJson } from "@/lib/api-helpers";

const MAX_ASSET_BYTES = 20 * 1024 * 1024;

type RouteParams = { params: Promise<{ appId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { appId } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (file.size > MAX_ASSET_BYTES) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = saveAsset(appId, buffer, file.type);
    return NextResponse.json({ name }, { status: 201 });
  } catch (err) {
    return errorJson(err, 400);
  }
}
