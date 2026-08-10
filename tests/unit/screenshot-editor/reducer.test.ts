import { describe, it, expect } from "vitest";
import { editorReducer, type EditorAction } from "@/lib/screenshot-editor/reducer";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

function docWithShots(n: number): ScreenshotDoc {
  let doc = createEmptyDoc();
  for (let i = 0; i < n; i++) {
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: `ref-${i}.png` });
  }
  return doc;
}

describe("editorReducer – screenshots list", () => {
  it("add-screenshot appends a defaults-based screenshot with the ref under the current language and selects it", () => {
    const doc = editorReducer(createEmptyDoc(), { type: "add-screenshot", imageRef: "a.png" });
    expect(doc.screenshots).toHaveLength(1);
    expect(doc.selectedIndex).toBe(0);
    expect(doc.screenshots[0].localizedImages).toEqual({ en: { src: "a.png" } });
    expect(doc.screenshots[0].background.type).toBe("gradient"); // from defaults
  });

  it("never mutates its input", () => {
    const before = createEmptyDoc();
    const frozen = JSON.stringify(before);
    editorReducer(before, { type: "add-screenshot", imageRef: "a.png" });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("remove-screenshot drops the index and clamps selection", () => {
    let doc = docWithShots(3);
    doc = editorReducer(doc, { type: "select-screenshot", index: 2 });
    doc = editorReducer(doc, { type: "remove-screenshot", index: 2 });
    expect(doc.screenshots).toHaveLength(2);
    expect(doc.selectedIndex).toBe(1);
  });

  it("duplicate-screenshot deep-copies and inserts after the source", () => {
    let doc = docWithShots(2);
    doc = editorReducer(doc, { type: "set-background", index: 0, patch: { solid: "#111111", type: "solid" } });
    doc = editorReducer(doc, { type: "duplicate-screenshot", index: 0 });
    expect(doc.screenshots).toHaveLength(3);
    expect(doc.screenshots[1].background.solid).toBe("#111111");
    doc = editorReducer(doc, { type: "set-background", index: 1, patch: { solid: "#222222" } });
    expect(doc.screenshots[0].background.solid).toBe("#111111"); // deep copy, no sharing
    expect(doc.selectedIndex).toBe(1); // duplicate becomes selected
  });

  it("reorder-screenshots moves an item and follows the selected screenshot", () => {
    let doc = docWithShots(3); // selected: 2 (last added)
    doc = editorReducer(doc, { type: "reorder-screenshots", from: 2, to: 0 });
    expect(doc.screenshots.map((s) => s.localizedImages.en?.src)).toEqual(["ref-2.png", "ref-0.png", "ref-1.png"]);
    expect(doc.selectedIndex).toBe(0);
  });

  it("select-screenshot ignores out-of-range indexes", () => {
    const doc = docWithShots(2);
    expect(editorReducer(doc, { type: "select-screenshot", index: 9 }).selectedIndex).toBe(doc.selectedIndex);
    expect(editorReducer(doc, { type: "select-screenshot", index: 1 }).selectedIndex).toBe(1);
  });

  it("list actions ignore out-of-range indexes", () => {
    const doc = docWithShots(2);
    expect(editorReducer(doc, { type: "remove-screenshot", index: 5 })).toBe(doc);
    expect(editorReducer(doc, { type: "remove-screenshot", index: -1 })).toBe(doc);
    expect(editorReducer(doc, { type: "duplicate-screenshot", index: 5 })).toBe(doc);
    expect(editorReducer(doc, { type: "duplicate-screenshot", index: -1 })).toBe(doc);
    expect(editorReducer(doc, { type: "reorder-screenshots", from: 5, to: 0 })).toBe(doc);
    expect(editorReducer(doc, { type: "reorder-screenshots", from: -1, to: 0 })).toBe(doc);
    expect(editorReducer(doc, { type: "reorder-screenshots", from: 0, to: 5 })).toBe(doc);
    expect(editorReducer(doc, { type: "reorder-screenshots", from: 0, to: -1 })).toBe(doc);
    expect(editorReducer(doc, { type: "select-screenshot", index: -1 })).toBe(doc);
  });

  it("set-screenshot-image writes the ref for the given language", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "set-screenshot-image", index: 0, language: "en", imageRef: "new.png" });
    expect(doc.screenshots[0].localizedImages.en).toEqual({ src: "new.png" });
  });
});

describe("editorReducer – settings patches", () => {
  it("set-background / set-screenshot-setting / set-text-setting patch the selected screenshot", () => {
    let doc = docWithShots(2);
    doc = editorReducer(doc, { type: "set-background", index: 1, patch: { type: "solid", solid: "#123456" } });
    doc = editorReducer(doc, { type: "set-screenshot-setting", index: 1, patch: { scale: 85, rotation: 5 } });
    doc = editorReducer(doc, { type: "set-text-setting", index: 1, patch: { headlineSize: 120 } });
    const s = doc.screenshots[1];
    expect(s.background.solid).toBe("#123456");
    expect(s.screenshot.scale).toBe(85);
    expect(s.text.headlineSize).toBe(120);
    expect(doc.screenshots[0].screenshot.scale).toBe(70); // untouched
  });

  it("set-shadow and set-frame patch nested objects without clobbering siblings", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "set-shadow", index: 0, patch: { blur: 60 } });
    doc = editorReducer(doc, { type: "set-frame", index: 0, patch: { enabled: true } });
    expect(doc.screenshots[0].screenshot.shadow).toMatchObject({ blur: 60, opacity: 30, enabled: true });
    expect(doc.screenshots[0].screenshot.frame).toMatchObject({ enabled: true, color: "#1d1d1f" });
  });

  it("gradient stop actions edit, add and remove stops", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "set-gradient-stop", index: 0, stopIndex: 0, patch: { color: "#000000" } });
    expect(doc.screenshots[0].background.gradient.stops[0]).toEqual({ color: "#000000", position: 0 });
    doc = editorReducer(doc, { type: "add-gradient-stop", index: 0 });
    expect(doc.screenshots[0].background.gradient.stops).toHaveLength(3);
    doc = editorReducer(doc, { type: "remove-gradient-stop", index: 0, stopIndex: 2 });
    expect(doc.screenshots[0].background.gradient.stops).toHaveLength(2);
    // a background must keep at least 2 stops
    doc = editorReducer(doc, { type: "remove-gradient-stop", index: 0, stopIndex: 1 });
    doc = editorReducer(doc, { type: "remove-gradient-stop", index: 0, stopIndex: 1 });
    expect(doc.screenshots[0].background.gradient.stops).toHaveLength(2);
  });

  it("set-headline / set-subheadline write per-language text", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "en", value: "Hello" });
    doc = editorReducer(doc, { type: "set-subheadline", index: 0, language: "en", value: "World" });
    expect(doc.screenshots[0].text.headlines.en).toBe("Hello");
    expect(doc.screenshots[0].text.subheadlines.en).toBe("World");
  });

  it("settings actions ignore out-of-range indexes", () => {
    const doc = docWithShots(1);
    const same = editorReducer(doc, { type: "set-background", index: 5, patch: { solid: "#fff" } } as EditorAction);
    expect(same).toBe(doc);
  });
});

describe("editorReducer – document level", () => {
  it("set-output-device and set-custom-size", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "set-output-device", device: "APP_IPHONE_65" });
    expect(doc.outputDevice).toBe("APP_IPHONE_65");
    doc = editorReducer(doc, { type: "set-custom-size", width: 800, height: 600 });
    expect(doc.outputDevice).toBe("custom");
    expect(doc.customWidth).toBe(800);
    expect(doc.customHeight).toBe(600);
  });

  it("replace-doc swaps the whole document (initial load)", () => {
    const other = createEmptyDoc();
    other.outputDevice = "custom";
    expect(editorReducer(createEmptyDoc(), { type: "replace-doc", doc: other })).toBe(other);
  });
});
