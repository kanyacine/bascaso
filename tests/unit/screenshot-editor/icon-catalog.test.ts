import { describe, it, expect } from "vitest";
import { ICON_CATALOG, iconSvgDataUri } from "@/components/screenshot-editor/icon-catalog";

describe("icon catalog", () => {
  it("has unique kebab-case names", () => {
    const names = ICON_CATALOG.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("rasterizes a known icon to an svg data URI with the color baked in", () => {
    const uri = iconSvgDataUri("star", "#ff0000", "regular");
    expect(uri).toMatch(/^data:image\/svg\+xml;utf8,/);
    const svg = decodeURIComponent(uri!.slice("data:image/svg+xml;utf8,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("#ff0000");
    expect(svg).toContain('width="512"');
  });

  it("returns null for an unknown name", () => {
    expect(iconSvgDataUri("does-not-exist", "#fff", "regular")).toBeNull();
  });
});
