import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { errorJson } from "@/lib/api-helpers";
import { MAX_ZIP_FILES } from "@/lib/screenshot-editor/export";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/; // no "..", no leading slash, no quotes
const NAME_RE = /^[A-Za-z0-9._-]+\.zip$/;

type RouteParams = { params: Promise<{ appId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  await params;
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "screenshots.zip");
    const paths = JSON.parse(String(form.get("paths") ?? "[]")) as unknown;
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!NAME_RE.test(name)) {
      return NextResponse.json({ error: "Invalid zip name" }, { status: 400 });
    }
    if (
      !Array.isArray(paths) || paths.length === 0 || paths.length !== files.length ||
      paths.length > MAX_ZIP_FILES || !paths.every((p) => typeof p === "string" && PATH_RE.test(p) && !p.includes(".."))
    ) {
      return NextResponse.json({ error: "Invalid file list" }, { status: 400 });
    }
    if (files.some((f) => f.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }
    const archive = new ZipArchive({ store: true }); // PNGs are already compressed
    for (let i = 0; i < files.length; i++) {
      archive.append(Buffer.from(await files[i].arrayBuffer()), { name: paths[i] as string });
    }
    void archive.finalize();
    return new NextResponse(Readable.toWeb(archive) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    return errorJson(err, 400);
  }
}
