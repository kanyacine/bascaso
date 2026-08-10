import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveAsset, readAsset } from "@/lib/screenshot-editor-assets";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bascaso-assets-"));
  process.env.DATABASE_PATH = path.join(dir, "bascaso.db");
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("saveAsset / readAsset", () => {
  it("round-trips a png under screenshot-assets/<appId>/", () => {
    const name = saveAsset("123456789", Buffer.from("png-bytes"), "image/png");
    expect(name).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}\.png$/);
    const read = readAsset("123456789", name);
    expect(read).toEqual({ data: Buffer.from("png-bytes"), mime: "image/png" });
  });

  it("maps jpeg and webp extensions", () => {
    expect(saveAsset("a", Buffer.from("x"), "image/jpeg")).toMatch(/\.jpg$/);
    expect(saveAsset("a", Buffer.from("x"), "image/webp")).toMatch(/\.webp$/);
  });

  it("rejects unknown mime types", () => {
    expect(() => saveAsset("a", Buffer.from("x"), "image/gif")).toThrow(/unsupported/i);
  });

  it("rejects malicious appId and name (path traversal)", () => {
    expect(() => saveAsset("../evil", Buffer.from("x"), "image/png")).toThrow(/invalid/i);
    expect(readAsset("a", "../../etc/passwd")).toBeNull();
    expect(readAsset("a", "01ARZ3NDEKTSV4RRFFQ69G5FAV.png/../x.png")).toBeNull();
  });

  it("returns null for a missing asset", () => {
    expect(readAsset("a", "01ARZ3NDEKTSV4RRFFQ69G5FAV.png")).toBeNull();
  });

  it("keeps apps isolated on disk", () => {
    const name = saveAsset("app-a", Buffer.from("x"), "image/png");
    expect(readAsset("app-b", name)).toBeNull();
  });
});

describe("asset routes", () => {
  const routeParams = (name?: string) =>
    ({ params: Promise.resolve(name ? { appId: "app-1", name } : { appId: "app-1" }) }) as never;

  it("POST stores an uploaded file and GET streams it back", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/assets/route");
    const formData = new FormData();
    formData.set("file", new File([Buffer.from("img")], "shot.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), routeParams());
    expect(res.status).toBe(201);
    const { name } = await res.json();

    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/assets/[name]/route");
    const got = await GET(new Request("http://localhost"), routeParams(name));
    expect(got.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await got.arrayBuffer())).toEqual(Buffer.from("img"));
  });

  it("POST rejects a missing file and an oversized file", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/assets/route");
    const empty = new FormData();
    const res = await POST(new Request("http://localhost", { method: "POST", body: empty }), routeParams());
    expect(res.status).toBe(400);

    const big = new FormData();
    big.set("file", new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    const res2 = await POST(new Request("http://localhost", { method: "POST", body: big }), routeParams());
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toMatch(/too large/i);
  });

  it("GET 404s for unknown or invalid names", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/assets/[name]/route");
    const res = await GET(new Request("http://localhost"), routeParams("01ARZ3NDEKTSV4RRFFQ69G5FAV.png"));
    expect(res.status).toBe(404);
    const res2 = await GET(new Request("http://localhost"), routeParams("../evil.png"));
    expect(res2.status).toBe(404);
  });
});
