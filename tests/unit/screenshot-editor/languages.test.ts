import { describe, it, expect } from "vitest";
import {
  normalizeDocLanguages, docWithLanguage, collectTranslatableItems, applyTranslationEntries,
  type TranslationEntry,
} from "@/lib/screenshot-editor/languages";
import { editorReducer } from "@/lib/screenshot-editor/reducer";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import { createTextElement, createEmojiElement } from "@/lib/screenshot-editor/elements";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

function legacyEnDoc(): ScreenshotDoc {
  // simulate a phase 2/3 doc: bare "en" everywhere
  const doc = createEmptyDoc();
  const raw = JSON.parse(JSON.stringify(doc).replaceAll('"en-US"', '"en"')) as ScreenshotDoc;
  return editorReducer(raw, { type: "add-screenshot", imageRef: "a.png" });
}

describe("normalizeDocLanguages", () => {
  it("renames bare en to en-US across every language-keyed structure", () => {
    let doc = legacyEnDoc();
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "en", value: "Hi" });
    const el = createTextElement("en");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    const normalized = normalizeDocLanguages(doc);
    expect(normalized.currentLanguage).toBe("en-US");
    expect(normalized.projectLanguages).toEqual(["en-US"]);
    const shot = normalized.screenshots[0];
    expect(shot.images?.iPhone).toEqual({ "en-US": { src: "a.png" } });
    expect(shot.text.headlines).toEqual({ "en-US": "Hi" });
    expect(shot.text.headlineLanguages).toEqual(["en-US"]);
    expect(shot.text.currentHeadlineLang).toBe("en-US");
    expect(shot.text.languageSettings["en-US"]).toBeDefined();
    expect(shot.text.languageSettings.en).toBeUndefined();
    expect(shot.elements[0].texts).toEqual({ "en-US": "Your Text" });
    expect(normalized.defaults.text.headlineLanguages).toEqual(["en-US"]);
  });

  it("leaves records without the legacy key untouched", () => {
    const doc = legacyEnDoc();
    doc.screenshots[0].images = {};
    doc.screenshots[0].text.languageSettings = {};
    doc.screenshots[0].text.headlineLanguages = [];
    const normalized = normalizeDocLanguages(doc);
    expect(normalized.screenshots[0].images).toEqual({});
    expect(normalized.screenshots[0].text.languageSettings).toEqual({});
    expect(normalized.screenshots[0].text.headlineLanguages).toEqual([]);
  });

  it("renames only the legacy language and leaves the others in place", () => {
    let doc = legacyEnDoc();
    doc = editorReducer(doc, { type: "add-element", index: 0, element: createEmojiElement("⭐", "Star") });
    doc.projectLanguages = ["en", "fr-FR"];
    doc.currentLanguage = "fr-FR";
    doc.screenshots[0].text.headlineLanguages = ["en", "fr-FR"];
    doc.screenshots[0].text.currentHeadlineLang = "fr-FR";
    doc.screenshots[0].text.currentSubheadlineLang = "fr-FR";
    doc.screenshots[0].text.currentLayoutLang = "fr-FR";
    const normalized = normalizeDocLanguages(doc);
    expect(normalized.currentLanguage).toBe("fr-FR");
    expect(normalized.projectLanguages).toEqual(["en-US", "fr-FR"]);
    const shot = normalized.screenshots[0];
    expect(shot.text.headlineLanguages).toEqual(["en-US", "fr-FR"]);
    expect(shot.text.currentHeadlineLang).toBe("fr-FR");
    expect(shot.elements[0].emoji).toBe("⭐"); // an element without texts is left as is
  });

  it("is a no-op (same reference) on an already-normalized doc", () => {
    const doc = createEmptyDoc();
    expect(normalizeDocLanguages(doc)).toBe(doc);
  });

  it("leaves en alone when en-US already exists separately", () => {
    const doc = legacyEnDoc();
    doc.projectLanguages = ["en", "en-US"];
    expect(normalizeDocLanguages(doc).projectLanguages).toEqual(["en", "en-US"]);
  });
});

describe("docWithLanguage", () => {
  it("sets the doc language and every shot's text language fields", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "b.png" });
    const switched = docWithLanguage(doc, "fr-FR");
    expect(switched.currentLanguage).toBe("fr-FR");
    for (const shot of switched.screenshots) {
      expect(shot.text.currentHeadlineLang).toBe("fr-FR");
      expect(shot.text.currentSubheadlineLang).toBe("fr-FR");
      expect(shot.text.currentLayoutLang).toBe("fr-FR");
    }
    expect(doc.currentLanguage).toBe("en-US"); // input untouched
  });
});

describe("collectTranslatableItems", () => {
  it("collects non-blank headlines, subheadlines and text-element texts in the source language", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    doc = editorReducer(doc, { type: "set-headline", index: 0, language: "en-US", value: "Head" });
    doc = editorReducer(doc, { type: "set-subheadline", index: 0, language: "en-US", value: "  " });
    const el = createTextElement("en-US");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    doc = editorReducer(doc, { type: "add-element", index: 0, element: createEmojiElement("⭐", "Star") });
    const items = collectTranslatableItems(doc, "en-US");
    expect(items).toEqual([
      { kind: "headline", index: 0, text: "Head" },
      { kind: "element", index: 0, elementId: el.id, text: "Your Text" },
    ]);
  });

  it("collects subheadlines when they carry text", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    doc = editorReducer(doc, { type: "set-subheadline", index: 0, language: "en-US", value: "Sub" });
    expect(collectTranslatableItems(doc, "en-US")).toEqual([
      { kind: "subheadline", index: 0, text: "Sub" },
    ]);
  });

  it("never falls back to the element legacy text mirror", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    const el = createTextElement("en-US");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    doc = editorReducer(doc, { type: "update-element", index: 0, elementId: el.id, patch: { texts: {}, text: "stale" } });
    expect(collectTranslatableItems(doc, "en-US")).toEqual([]);
  });
});

describe("applyTranslationEntries", () => {
  it("writes headlines, subheadlines (enabling them) and element texts per language", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    const el = createTextElement("en-US");
    doc = editorReducer(doc, { type: "add-element", index: 0, element: el });
    doc = editorReducer(doc, { type: "set-text-setting", index: 0, patch: { subheadlineEnabled: false } });
    const entries: TranslationEntry[] = [
      { kind: "headline", index: 0, language: "fr-FR", value: "Tête" },
      { kind: "subheadline", index: 0, language: "fr-FR", value: "Sous" },
      { kind: "element", index: 0, elementId: el.id, language: "fr-FR", value: "Votre texte" },
    ];
    const out = applyTranslationEntries(doc, entries);
    const shot = out.screenshots[0];
    expect(shot.text.headlines["fr-FR"]).toBe("Tête");
    expect(shot.text.subheadlines["fr-FR"]).toBe("Sous");
    expect(shot.text.subheadlineEnabled).toBe(true);
    expect(shot.elements[0].texts?.["fr-FR"]).toBe("Votre texte");
    expect(shot.elements[0].text).toBe("Your Text"); // mirror untouched
    expect(doc.screenshots[0].text.headlines["fr-FR"]).toBeUndefined(); // input untouched
  });

  it("skips invalid targets and no-ops on an empty list", () => {
    let doc = createEmptyDoc();
    doc = editorReducer(doc, { type: "add-screenshot", imageRef: "a.png" });
    expect(applyTranslationEntries(doc, [])).toBe(doc);
    const out = applyTranslationEntries(doc, [
      { kind: "headline", index: 9, language: "fr-FR", value: "x" },
      { kind: "element", index: 0, elementId: "nope", language: "fr-FR", value: "x" },
    ]);
    expect(out.screenshots[0].text.headlines["fr-FR"]).toBeUndefined();
  });
});
