import fs from "node:fs";
import path from "node:path";
import { ulid } from "@/lib/ulid";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};
// appId and name arrive as URL path segments – allowlist both before touching the filesystem.
const APP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NAME_RE = /^[0-9A-HJKMNP-TV-Z]{26}\.(png|jpg|webp)$/;

function assetsDir(appId: string): string {
  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) throw new Error("DATABASE_PATH is not set");
  return path.join(path.dirname(dbPath), "screenshot-assets", appId);
}

/**
 * The container the bytes actually are, ignoring what the upload claimed – the extension we
 * store here is what the read route hands back as Content-Type.
 * ponytail: magic bytes, not a decode. It cannot tell a truncated PNG from a whole one; if
 * corrupt uploads ever matter, `sharp(data).metadata()` is the upgrade (and makes this async).
 */
function sniffImageMime(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** `declaredMime` is the client's claim and is only used to reject early – the bytes decide. */
export function saveAsset(appId: string, data: Buffer, declaredMime: string): string {
  if (!APP_ID_RE.test(appId)) throw new Error("Invalid app id");
  if (!EXT_BY_MIME[declaredMime]) throw new Error(`Unsupported image type: ${declaredMime}`);
  const mime = sniffImageMime(data);
  if (!mime) throw new Error("Unsupported image type: the file is not a PNG, JPEG or WebP");
  const ext = EXT_BY_MIME[mime];
  const dir = assetsDir(appId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${ulid()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), data);
  return name;
}

export function readAsset(appId: string, name: string): { data: Buffer; mime: string } | null {
  if (!APP_ID_RE.test(appId) || !NAME_RE.test(name)) return null;
  const file = path.join(assetsDir(appId), name);
  if (!fs.existsSync(file)) return null;
  const ext = name.slice(name.lastIndexOf(".") + 1);
  return { data: fs.readFileSync(file), mime: MIME_BY_EXT[ext] };
}
