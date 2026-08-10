import { describe, it, expect } from "vitest";
import { editorReducer, type EditorAction } from "@/lib/screenshot-editor/reducer";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import {
  createEmojiElement, createPopout, createTextElement,
} from "@/lib/screenshot-editor/elements";
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
    expect(doc.screenshots[0].localizedImages).toEqual({ "en-US": { src: "a.png" } });
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
    expect(doc.screenshots.map((s) => s.localizedImages["en-US"]?.src)).toEqual(["ref-2.png", "ref-0.png", "ref-1.png"]);
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
    // a copy, not the same reference – the action normalizes and clamps (phase 5)
    expect(editorReducer(createEmptyDoc(), { type: "replace-doc", doc: other })).toEqual(other);
  });
});

describe("editorReducer – elements", () => {
  function docWithElement() {
    let doc = docWithShots(1);
    const element = createTextElement("en");
    doc = editorReducer(doc, { type: "add-element", index: 0, element });
    return { doc, id: element.id };
  }

  it("add-element appends to the shot's elements", () => {
    const { doc } = docWithElement();
    expect(doc.screenshots[0].elements).toHaveLength(1);
    expect(doc.screenshots[0].elements[0].text).toBe("Your Text");
  });

  it("update-element patches by id without touching neighbors", () => {
    const { doc: doc0, id } = docWithElement();
    let doc = doc0;
    const other = createEmojiElement("⭐", "Star");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: other });
    doc = editorReducer(doc, { type: "update-element", index: 0, elementId: id, patch: { x: 10, opacity: 50 } });
    expect(doc.screenshots[0].elements[0]).toMatchObject({ x: 10, opacity: 50 });
    expect(doc.screenshots[0].elements[1]).toMatchObject({ x: 50, opacity: 100 });
  });

  it("update-element with an unknown id returns the doc unchanged", () => {
    const { doc } = docWithElement();
    expect(editorReducer(doc, { type: "update-element", index: 0, elementId: "nope", patch: { x: 1 } })).toBe(doc);
  });

  it("set-element-text writes the language map and the legacy mirror", () => {
    const { doc: doc0, id } = docWithElement();
    let doc = doc0;
    doc = editorReducer(doc, { type: "set-element-text", index: 0, elementId: id, language: "en", value: "Hello" });
    expect(doc.screenshots[0].elements[0].texts).toEqual({ en: "Hello" });
    expect(doc.screenshots[0].elements[0].text).toBe("Hello");
  });

  it("set-element-icon-shadow patches the nested shadow, creating it if absent", () => {
    const { doc: doc0, id } = docWithElement();
    let doc = doc0;
    doc = editorReducer(doc, { type: "set-element-icon-shadow", index: 0, elementId: id, patch: { enabled: true, blur: 5 } });
    expect(doc.screenshots[0].elements[0].iconShadow).toMatchObject({ enabled: true, blur: 5 });
  });

  it("remove-element deletes by id", () => {
    const { doc: doc0, id } = docWithElement();
    let doc = doc0;
    doc = editorReducer(doc, { type: "remove-element", index: 0, elementId: id });
    expect(doc.screenshots[0].elements).toHaveLength(0);
  });

  it("move-element up swaps toward the front, down toward the back, no wrap", () => {
    let doc = docWithShots(1);
    const a = createTextElement("en"); const b = createEmojiElement("⭐", "Star");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: a });
    doc = editorReducer(doc, { type: "add-element", index: 0, element: b });
    doc = editorReducer(doc, { type: "move-element", index: 0, elementId: a.id, direction: "up" });
    expect(doc.screenshots[0].elements.map((e) => e.id)).toEqual([b.id, a.id]);
    const same = editorReducer(doc, { type: "move-element", index: 0, elementId: a.id, direction: "up" });
    expect(same).toBe(doc); // already at the front
    doc = editorReducer(doc, { type: "move-element", index: 0, elementId: a.id, direction: "down" });
    expect(doc.screenshots[0].elements.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("element actions ignore out-of-range shot indexes", () => {
    const { doc } = docWithElement();
    expect(editorReducer(doc, { type: "remove-element", index: 9, elementId: "x" })).toBe(doc);
  });
});

describe("editorReducer – popouts", () => {
  function docWithPopout() {
    let doc = docWithShots(1);
    const popout = createPopout();
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout });
    return { doc, id: popout.id };
  }

  it("add-popout appends", () => {
    const { doc } = docWithPopout();
    expect(doc.screenshots[0].popouts).toHaveLength(1);
    expect(doc.screenshots[0].popouts[0].cropX).toBe(25);
  });

  it("update-popout patches flat fields by id; unknown id is a no-op", () => {
    const { doc: doc0, id } = docWithPopout();
    let doc = doc0;
    doc = editorReducer(doc, { type: "update-popout", index: 0, popoutId: id, patch: { cropX: 10, width: 45 } });
    expect(doc.screenshots[0].popouts[0]).toMatchObject({ cropX: 10, width: 45 });
    expect(editorReducer(doc, { type: "update-popout", index: 0, popoutId: "nope", patch: { x: 1 } })).toBe(doc);
  });

  it("set-popout-shadow and set-popout-border patch nested objects", () => {
    const { doc: doc0, id } = docWithPopout();
    let doc = doc0;
    doc = editorReducer(doc, { type: "set-popout-shadow", index: 0, popoutId: id, patch: { blur: 99 } });
    doc = editorReducer(doc, { type: "set-popout-border", index: 0, popoutId: id, patch: { enabled: false } });
    expect(doc.screenshots[0].popouts[0].shadow).toMatchObject({ blur: 99, opacity: 40, enabled: true });
    expect(doc.screenshots[0].popouts[0].border).toMatchObject({ enabled: false, width: 3 });
  });

  it("popout and element actions ignore unknown ids and out-of-range indexes", () => {
    let doc = docWithShots(1);
    const a = createPopout(); const b = createPopout();
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout: a });
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout: b });
    // patching one popout leaves its neighbor untouched
    doc = editorReducer(doc, { type: "update-popout", index: 0, popoutId: b.id, patch: { x: 5 } });
    expect(doc.screenshots[0].popouts[0].x).toBe(a.x);
    expect(doc.screenshots[0].popouts[1].x).toBe(5);
    expect(editorReducer(doc, { type: "move-element", index: 0, elementId: "nope", direction: "up" })).toBe(doc);
    expect(editorReducer(doc, { type: "move-element", index: 9, elementId: "x", direction: "up" })).toBe(doc);
    expect(editorReducer(doc, { type: "move-popout", index: 0, popoutId: "nope", direction: "up" })).toBe(doc);
    expect(editorReducer(doc, { type: "move-popout", index: 9, popoutId: "x", direction: "up" })).toBe(doc);
    expect(editorReducer(doc, { type: "remove-popout", index: 0, popoutId: "nope" })).toBe(doc);
    expect(editorReducer(doc, { type: "remove-popout", index: 9, popoutId: "x" })).toBe(doc);
  });

  it("remove-popout and move-popout mirror the element semantics", () => {
    let doc = docWithShots(1);
    const a = createPopout(); const b = createPopout();
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout: a });
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout: b });
    doc = editorReducer(doc, { type: "move-popout", index: 0, popoutId: a.id, direction: "up" });
    expect(doc.screenshots[0].popouts.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(editorReducer(doc, { type: "move-popout", index: 0, popoutId: a.id, direction: "up" })).toBe(doc);
    doc = editorReducer(doc, { type: "move-popout", index: 0, popoutId: a.id, direction: "down" });
    expect(doc.screenshots[0].popouts.map((p) => p.id)).toEqual([a.id, b.id]);
    doc = editorReducer(doc, { type: "remove-popout", index: 0, popoutId: a.id });
    expect(doc.screenshots[0].popouts.map((p) => p.id)).toEqual([b.id]);
  });
});

describe("editorReducer – style transfer", () => {
  function styledPair() {
    let doc = docWithShots(2);
    doc = editorReducer(doc, { type: "set-background", index: 0, patch: { type: "solid", solid: "#123456" } });
    doc = editorReducer(doc, { type: "set-text-setting", index: 0, patch: { headlineSize: 150 } });
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "en", value: "Source title" });
    doc = editorReducer(doc, { type: "set-headline", index: 1, language: "en", value: "Target title" });
    doc = editorReducer(doc, { type: "add-element", index: 0, element: createTextElement("en") });
    doc = editorReducer(doc, { type: "add-popout", index: 0, popout: createPopout() });
    doc = editorReducer(doc, { type: "add-popout", index: 1, popout: createPopout() });
    return doc;
  }

  it("transfer-style copies background, screenshot and text style but keeps target headlines", () => {
    let doc = styledPair();
    doc = editorReducer(doc, { type: "transfer-style", from: 0, to: 1 });
    const target = doc.screenshots[1];
    expect(target.background.solid).toBe("#123456");
    expect(target.text.headlineSize).toBe(150);
    expect(target.text.headlines.en).toBe("Target title"); // content preserved
  });

  it("transfer-style copies elements with fresh ids and never copies popouts", () => {
    let doc = styledPair();
    const targetPopoutId = doc.screenshots[1].popouts[0].id;
    doc = editorReducer(doc, { type: "transfer-style", from: 0, to: 1 });
    const source = doc.screenshots[0]; const target = doc.screenshots[1];
    expect(target.elements).toHaveLength(1);
    expect(target.elements[0].text).toBe(source.elements[0].text);
    expect(target.elements[0].id).not.toBe(source.elements[0].id);
    expect(target.popouts.map((p) => p.id)).toEqual([targetPopoutId]);
  });

  it("transfer-style is a no-op for same or invalid indexes", () => {
    const doc = styledPair();
    expect(editorReducer(doc, { type: "transfer-style", from: 0, to: 0 })).toBe(doc);
    expect(editorReducer(doc, { type: "transfer-style", from: 5, to: 1 })).toBe(doc);
    expect(editorReducer(doc, { type: "transfer-style", from: 0, to: 5 })).toBe(doc);
  });

  it("apply-style-to-all restyles every other shot and skips the source", () => {
    let doc = styledPair();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "c.png" });
    doc = editorReducer(doc, { type: "apply-style-to-all", from: 0 });
    expect(doc.screenshots[1].background.solid).toBe("#123456");
    expect(doc.screenshots[2].background.solid).toBe("#123456");
    expect(doc.screenshots[1].text.headlines.en).toBe("Target title");
    expect(doc.screenshots[0].elements[0].id) // source untouched
      .not.toBe(doc.screenshots[1].elements[0].id);
    expect(editorReducer(doc, { type: "apply-style-to-all", from: 9 })).toBe(doc);
  });
});

describe("editorReducer – languages", () => {
  function bilingual(): ScreenshotDoc {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "add-language", language: "fr-FR" });
    return doc;
  }

  it("add-language seeds project list, mirrors and empty texts on shots and defaults", () => {
    const doc = bilingual();
    expect(doc.projectLanguages).toEqual(["en-US", "fr-FR"]);
    const t = doc.screenshots[0].text;
    expect(t.headlineLanguages).toContain("fr-FR");
    expect(t.subheadlineLanguages).toContain("fr-FR");
    expect(t.headlines["fr-FR"]).toBe("");
    expect(t.subheadlines["fr-FR"]).toBe("");
    expect(doc.defaults.text.headlines["fr-FR"]).toBe("");
    expect(editorReducer(doc, { type: "add-language", language: "fr-FR" })).toBe(doc); // dup no-op
  });

  it("add-language keeps an existing translation when a language is re-added", () => {
    let doc = bilingual();
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "fr-FR", value: "Tête" });
    doc = editorReducer(doc, { type: "remove-language", language: "de-DE" }); // unknown, no-op
    const readded = editorReducer(
      { ...doc, projectLanguages: ["en-US"] },
      { type: "add-language", language: "fr-FR" },
    );
    expect(readded.screenshots[0].text.headlines["fr-FR"]).toBe("Tête");
  });

  it("set-current-language switches doc and per-shot text langs, guards membership", () => {
    let doc = bilingual();
    doc = editorReducer(doc, { type: "set-current-language", language: "fr-FR" });
    expect(doc.currentLanguage).toBe("fr-FR");
    expect(doc.screenshots[0].text.currentHeadlineLang).toBe("fr-FR");
    expect(doc.screenshots[0].text.currentLayoutLang).toBe("fr-FR");
    expect(editorReducer(doc, { type: "set-current-language", language: "de-DE" })).toBe(doc);
    expect(editorReducer(doc, { type: "set-current-language", language: "fr-FR" })).toBe(doc);
  });

  it("remove-language cleans texts, layouts, images and element texts (appscreen leaks fixed)", () => {
    let doc = bilingual();
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "fr-FR", value: "Tête" });
    doc = editorReducer(doc, { type: "set-screenshot-image", index: 0, language: "fr-FR", imageRef: "fr.png" });
    doc = editorReducer(doc, { type: "set-language-layout", index: 0, language: "fr-FR", patch: { offsetY: 20 } });
    const el = createTextElement("en-US");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    doc = editorReducer(doc, { type: "add-element", index: 0, element: createEmojiElement("⭐", "Star") });
    doc = editorReducer(doc, { type: "set-element-text", index: 0, elementId: el.id, language: "fr-FR", value: "FR" });
    doc = editorReducer(doc, { type: "set-current-language", language: "fr-FR" });
    doc = editorReducer(doc, { type: "remove-language", language: "fr-FR" });
    expect(doc.projectLanguages).toEqual(["en-US"]);
    expect(doc.currentLanguage).toBe("en-US"); // switched off the removed language
    const t = doc.screenshots[0].text;
    expect(t.headlines["fr-FR"]).toBeUndefined();
    expect(t.headlineLanguages).toEqual(["en-US"]);
    expect(t.languageSettings["fr-FR"]).toBeUndefined();
    expect(doc.screenshots[0].localizedImages["fr-FR"]).toBeUndefined();
    expect(doc.screenshots[0].elements.find((e) => e.id === el.id)?.texts?.["fr-FR"]).toBeUndefined();
  });

  it("remove-language keeps the current language when another one goes", () => {
    let doc = bilingual();
    doc = editorReducer(doc, { type: "remove-language", language: "fr-FR" });
    expect(doc.currentLanguage).toBe("en-US");
    expect(doc.projectLanguages).toEqual(["en-US"]);
  });

  it("remove-language refuses the last language and unknown languages", () => {
    const doc = docWithShots(1);
    expect(editorReducer(doc, { type: "remove-language", language: "en-US" })).toBe(doc);
    expect(editorReducer(bilingual(), { type: "remove-language", language: "de-DE" })).toEqual(bilingual());
  });

  it("apply-doc-translations writes through the shared pure helper", () => {
    let doc = bilingual();
    doc = editorReducer(doc, {
      type: "apply-doc-translations",
      entries: [{ kind: "headline", index: 0, language: "fr-FR", value: "Tête" }],
    });
    expect(doc.screenshots[0].text.headlines["fr-FR"]).toBe("Tête");
  });
});

describe("editorReducer – working formats", () => {
  it("toggle-output-device materializes, adds and removes, in EDITOR_FORMATS order", () => {
    let doc = createEmptyDoc(); // outputDevice APP_IPHONE_67, outputDevices absent
    doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPAD_PRO_3GEN_129" });
    expect(doc.outputDevices).toEqual(["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"]);
    doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_65" });
    expect(doc.outputDevices).toEqual(["APP_IPHONE_67", "APP_IPHONE_65", "APP_IPAD_PRO_3GEN_129"]);
    doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_65" });
    expect(doc.outputDevices).toEqual(["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_129"]);
  });

  it("refuses to remove the current device or add unknown keys", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_65" });
    expect(editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_67" })).toBe(doc);
    expect(editorReducer(doc, { type: "toggle-output-device", device: "custom" })).toBe(doc);
    expect(editorReducer(doc, { type: "toggle-output-device", device: "nope" })).toBe(doc);
  });

  it("set-output-device keeps the working list consistent", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_65" });
    doc = editorReducer(doc, { type: "set-output-device", device: "APP_IPAD_PRO_129" });
    expect(doc.outputDevice).toBe("APP_IPAD_PRO_129");
    expect(doc.outputDevices).toContain("APP_IPAD_PRO_129");
    const again = editorReducer(doc, { type: "set-output-device", device: "APP_IPHONE_65" });
    expect(again.outputDevices).toEqual(doc.outputDevices); // already listed
    const noList = editorReducer(createEmptyDoc(), { type: "set-output-device", device: "APP_IPHONE_65" });
    expect(noList.outputDevices).toBeUndefined(); // absent list stays absent
  });
});

describe("editorReducer – per-language layout", () => {
  it("enable seeds only missing languages from the base values", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "add-language", language: "fr-FR" });
    doc = editorReducer(doc, { type: "add-language", language: "de-DE" });
    doc = editorReducer(doc, { type: "set-language-layout", index: 0, language: "fr-FR", patch: { offsetY: 25 } });
    doc = editorReducer(doc, { type: "set-per-language-layout", index: 0, enabled: true });
    const t = doc.screenshots[0].text;
    expect(t.perLanguageLayout).toBe(true);
    expect(t.languageSettings["de-DE"]).toEqual({ // seeded from the base values on enable
      headlineSize: t.headlineSize, subheadlineSize: t.subheadlineSize,
      position: t.position, offsetY: t.offsetY, lineHeight: t.lineHeight,
    });
    expect(t.languageSettings["en-US"]).toEqual({
      headlineSize: t.headlineSize, subheadlineSize: t.subheadlineSize,
      position: t.position, offsetY: t.offsetY, lineHeight: t.lineHeight,
    });
    expect(t.languageSettings["fr-FR"].offsetY).toBe(25); // tuned layout survives enable
    const off = editorReducer(doc, { type: "set-per-language-layout", index: 0, enabled: false });
    expect(off.screenshots[0].text.perLanguageLayout).toBe(false);
    expect(off.screenshots[0].text.languageSettings["fr-FR"].offsetY).toBe(25); // kept for re-enable
  });

  it("set-language-layout merges, seeds from base when absent, and repoints currentLayoutLang", () => {
    let doc = docWithShots(1);
    doc = editorReducer(doc, { type: "add-language", language: "de-DE" });
    doc = editorReducer(doc, { type: "set-language-layout", index: 0, language: "de-DE", patch: { position: "bottom" } });
    const t = doc.screenshots[0].text;
    expect(t.languageSettings["de-DE"]).toMatchObject({ position: "bottom", headlineSize: t.headlineSize });
    expect(t.currentLayoutLang).toBe("de-DE");
    expect(editorReducer(doc, { type: "set-language-layout", index: 9, language: "de-DE", patch: {} })).toBe(doc);
  });
});

describe("editorReducer – replace-doc", () => {
  it("swaps in the new doc, normalized and index-clamped", () => {
    const current = docWithShots(1);
    let incoming = createEmptyDoc();
    incoming = editorReducer(incoming, { type: "add-screenshot", imageRef: "x.png" });
    incoming.selectedIndex = 9; // stale index from an import
    const legacy = JSON.parse(JSON.stringify(incoming).replaceAll('"en-US"', '"en"')) as ScreenshotDoc;
    const out = editorReducer(current, { type: "replace-doc", doc: legacy });
    expect(out.projectLanguages).toEqual(["en-US"]); // normalized
    expect(out.selectedIndex).toBe(0); // clamped
    expect(out.screenshots).toHaveLength(1);
  });

  it("clamps a negative index on an empty doc", () => {
    const empty = createEmptyDoc();
    empty.selectedIndex = 4;
    const out = editorReducer(docWithShots(2), { type: "replace-doc", doc: empty });
    expect(out.selectedIndex).toBe(0);
  });
});
