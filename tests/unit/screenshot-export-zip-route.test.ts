import { describe, it, expect } from "vitest";

const routeParams = { params: Promise.resolve({ appId: "app-1" }) };

function makeForm(paths: string[], contents: string[], name = "test.zip") {
  const form = new FormData();
  form.set("name", name);
  form.set("paths", JSON.stringify(paths));
  contents.forEach((c, i) => form.append("files", new File([c], `f${i}.png`, { type: "image/png" })));
  return form;
}

describe("POST /api/apps/[appId]/screenshot-doc/export-zip", () => {
  it("zips the files under their paths", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/export-zip/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: makeForm(["en-US/APP_IPHONE_67/1.png", "en-US/APP_IPHONE_67/2.png"], ["a", "b"]),
    }), routeParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain('filename="test.zip"');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("en-US/APP_IPHONE_67/1.png"))).toBe(true);
  });

  it("rejects path traversal, count mismatch, oversized files and bad names", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/export-zip/route");
    const bad = await POST(new Request("http://localhost", {
      method: "POST", body: makeForm(["../evil.png"], ["a"]),
    }), routeParams);
    expect(bad.status).toBe(400);
    const mismatch = await POST(new Request("http://localhost", {
      method: "POST", body: makeForm(["a.png", "b.png"], ["only-one"]),
    }), routeParams);
    expect(mismatch.status).toBe(400);
    const badName = await POST(new Request("http://localhost", {
      method: "POST", body: makeForm(["a.png"], ["a"], 'x"; rm.zip'),
    }), routeParams);
    expect(badName.status).toBe(400);
    const notAList = new FormData();
    notAList.set("name", "test.zip");
    notAList.set("paths", '"nope"');
    notAList.append("files", new File(["a"], "f.png", { type: "image/png" }));
    const invalidJson = await POST(new Request("http://localhost", { method: "POST", body: notAList }), routeParams);
    expect(invalidJson.status).toBe(400);
  });

  it("rejects a file above the size limit", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/export-zip/route");
    const big = new FormData();
    big.set("name", "test.zip");
    big.set("paths", JSON.stringify(["a.png"]));
    big.append("files", new File([new Uint8Array(26 * 1024 * 1024)], "a.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost", { method: "POST", body: big }), routeParams);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File too large" });
  });

  it("rejects a body that is not multipart form data", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/export-zip/route");
    const res = await POST(new Request("http://localhost", { method: "POST", body: "not a form" }), routeParams);
    expect(res.status).toBe(400);
  });
});
