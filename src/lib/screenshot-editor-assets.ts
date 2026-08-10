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

export function saveAsset(appId: string, data: Buffer, mime: string): string {
  if (!APP_ID_RE.test(appId)) throw new Error("Invalid app id");
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`Unsupported image type: ${mime}`);
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
