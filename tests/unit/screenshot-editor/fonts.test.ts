import { describe, it, expect } from "vitest";
import { ONLINE_FONTS, SYSTEM_FONTS } from "@/lib/screenshot-editor/font-catalog";
import {
  collectFontFamilies, fontFamilyName, fontValueForFamily, googleFontCss2Url, isSystemFont,
  registerDeviceFonts, systemFontNames,
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
    expect(ONLINE_FONTS.length).toBeGreaterThan(1000);
    expect(new Set(ONLINE_FONTS).size).toBe(ONLINE_FONTS.length); // deduped
    // Popularity first – the tab is capped, so an alphabetical head would be useless to browse.
    expect(ONLINE_FONTS.slice(0, 3)).toEqual(["Inter", "Poppins", "Roboto"]);
    const tail = ONLINE_FONTS.slice(110);
    expect(tail).toEqual([...tail].sort()); // then alphabetical
    expect(ONLINE_FONTS).toContain("ABeeZee");
  });

  // Checked against fonts.google.com/metadata/fonts on 2026-08-11: appscreen's list carried names
  // Google has since renamed or retired. A name that does not resolve is a picker entry that
  // silently falls back to the system font, so the catalog only keeps families Google still serves.
  it("carries no family Google has renamed or retired", () => {
    for (const gone of [
      "Source Sans Pro", "Source Serif Pro", "Muli", "Spartan", "Fredoka One", "Droid Sans",
      "Droid Serif", "Open Sans Condensed", "Gentium Basic", "Big Shoulders Display",
    ]) {
      expect(ONLINE_FONTS, gone).not.toContain(gone);
    }
    for (const current of [
      "Source Sans 3", "Source Serif 4", "Mulish", "League Spartan", "Fredoka", "Noto Sans",
      "Noto Serif", "Open Sans", "Gentium Plus", "Big Shoulders",
    ]) {
      expect(ONLINE_FONTS, current).toContain(current);
    }
    // Fontshare families that were never on Google Fonts, and the icon fonts – no text use.
    expect(ONLINE_FONTS).not.toContain("Satoshi");
    expect(ONLINE_FONTS).not.toContain("General Sans");
    expect(ONLINE_FONTS.filter((f) => f.startsWith("Material "))).toEqual([]);
  });
});

describe("device fonts", () => {
  it("lists the curated stacks first, then whatever the machine has, without repeats", () => {
    expect(systemFontNames()).toEqual(SYSTEM_FONTS.map((f) => f.name));
    // macOS reports its installed families but hides the SF faces, hence the curated head.
    const names = systemFontNames(["Zapfino", "Georgia", "Apple Chancery"]);
    expect(names.slice(0, 10)).toEqual(SYSTEM_FONTS.map((f) => f.name));
    expect(names.slice(10)).toEqual(["Apple Chancery", "Zapfino"]); // sorted, Georgia deduped
    expect(names).toContain("SF Pro Display");
  });

  it("treats a registered device family as a system font, so nothing fetches it from Google", () => {
    expect(isSystemFont("Zapfino")).toBe(false);
    registerDeviceFonts(["Zapfino"]);
    expect(isSystemFont("Zapfino")).toBe(true);
    expect(isSystemFont("Inter")).toBe(false); // a Google family stays a Google family

    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    doc = editorReducer(doc, {
      type: "set-text-setting", index: 0, patch: { headlineFont: "'Zapfino', sans-serif" },
    });
    expect(collectFontFamilies(doc)).toEqual([]);
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
