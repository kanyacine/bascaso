import { describe, expect, it } from "vitest";
import { mergeRecent } from "@/lib/screenshot-editor/recent-fonts";

describe("mergeRecent", () => {
  it("puts the pick first", () => {
    expect(mergeRecent(["Inter", "Lato"], "Georgia")).toEqual(["Georgia", "Inter", "Lato"]);
  });

  it("moves a font already in the list instead of repeating it", () => {
    expect(mergeRecent(["Inter", "Lato", "Georgia"], "Lato")).toEqual(["Lato", "Inter", "Georgia"]);
  });

  it("drops the oldest past the cap", () => {
    const full = ["a", "b", "c"];
    expect(mergeRecent(full, "d", 3)).toEqual(["d", "a", "b"]);
  });
});
