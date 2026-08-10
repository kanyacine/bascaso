import { describe, it, expect } from "vitest";
import { ALL_FONTS, POPULAR_FONTS, SYSTEM_FONTS } from "@/lib/screenshot-editor/font-catalog";
import {
  collectFontFamilies, fontFamilyName, fontValueForFamily, googleFontCss2Url, isSystemFont,
} from "@/lib/screenshot-editor/fonts";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import { editorReducer } from "@/lib/screenshot-editor/reducer";
import { createEmojiElement, createTextElement } from "@/lib/screenshot-editor/elements";

describe("font catalog", () => {
  it("ships the appscreen curated catalog", () => {
    expect(SYSTEM_FONTS).toHaveLength(10);
    expect(SYSTEM_FONTS[0]).toEqual({
      name: "SF Pro Display",
      value: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
    });
    expect(POPULAR_FONTS).toHaveLength(112);
    expect(POPULAR_FONTS.slice(0, 3)).toEqual(["Inter", "Poppins", "Roboto"]);
    expect(ALL_FONTS.length).toBeGreaterThan(1000);
    expect(ALL_FONTS).toEqual([...ALL_FONTS].sort()); // sorted
    expect(new Set(ALL_FONTS).size).toBe(ALL_FONTS.length); // deduped
    expect(ALL_FONTS).toContain("Inter");
    expect(ALL_FONTS).toContain("ABeeZee");
  });
});

describe("font value mapping", () => {
  it("maps names to CSS stacks and back", () => {
    expect(isSystemFont("Georgia")).toBe(true);
    expect(isSystemFont("Inter")).toBe(false);
    expect(fontValueForFamily("Georgia")).toBe("Georgia, serif");
    expect(fontValueForFamily("Inter")).toBe("'Inter', sans-serif");
    expect(fontFamilyName("'Inter', sans-serif")).toBe("Inter");
    expect(fontFamilyName("Georgia, serif")).toBe("Georgia");
    expect(fontFamilyName("-apple-system, BlinkMacSystemFont, 'SF Pro Display'")).toBe("SF Pro Display");
    expect(fontFamilyName("garbage")).toBe("SF Pro Display");
  });

  it("builds the css2 URL with all weights", () => {
    expect(googleFontCss2Url("Open Sans")).toBe(
      "https://fonts.googleapis.com/css2?family=Open%20Sans:wght@300;400;500;600;700;800;900&display=swap",
    );
  });
});

describe("collectFontFamilies", () => {
  it("collects unique non-system families across shots and elements", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "b.png" });
    expect(collectFontFamilies(doc)).toEqual([]); // defaults are system fonts
    doc = editorReducer(doc, { type: "set-text-setting", index: 0, patch: { headlineFont: "'Inter', sans-serif" } });
    doc = editorReducer(doc, { type: "set-text-setting", index: 1, patch: { subheadlineFont: "'Inter', sans-serif" } });
    const el = createTextElement("en-US");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    doc = editorReducer(doc, {
      type: "update-element", index: 0, elementId: el.id, patch: { font: "'Abel', sans-serif" },
    });
    // an element without a font (emoji) must not contribute
    doc = editorReducer(doc, { type: "add-element", index: 0, element: createEmojiElement("🎉", "Party") });
    expect(collectFontFamilies(doc)).toEqual(["Abel", "Inter"]);
  });
});
