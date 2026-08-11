import { createDefaultScreenshot } from "./defaults";
import { EDITOR_FORMATS } from "./devices";
import {
  applyTranslationEntries, docWithLanguage, normalizeDocLanguages, type TranslationEntry,
} from "./languages";
import type {
  Background, EditorElement, EditorScreenshot, GradientStop, LanguageLayout, Popout, ScreenshotDoc,
  ScreenshotSettings, Shadow, TextSettings,
} from "./types";

export type EditorAction =
  | { type: "replace-doc"; doc: ScreenshotDoc }
  | { type: "select-screenshot"; index: number }
  | { type: "add-screenshot"; imageRef?: string }
  | { type: "remove-screenshot"; index: number }
  | { type: "duplicate-screenshot"; index: number }
  | { type: "reorder-screenshots"; from: number; to: number }
  | { type: "set-screenshot-image"; index: number; language: string; imageRef: string }
  | { type: "clear-screenshot-image"; index: number; language: string }
  | { type: "set-output-device"; device: string }
  | { type: "set-custom-size"; width: number; height: number }
  | { type: "set-background"; index: number; patch: Partial<Background> }
  | { type: "set-gradient-stop"; index: number; stopIndex: number; patch: Partial<GradientStop> }
  | { type: "add-gradient-stop"; index: number }
  | { type: "remove-gradient-stop"; index: number; stopIndex: number }
  | { type: "set-screenshot-setting"; index: number; patch: Partial<ScreenshotSettings> }
  | { type: "set-shadow"; index: number; patch: Partial<Shadow> }
  | { type: "set-frame"; index: number; patch: Partial<ScreenshotSettings["frame"]> }
  | { type: "set-text-setting"; index: number; patch: Partial<TextSettings> }
  | { type: "set-headline"; index: number; language: string; value: string }
  | { type: "set-subheadline"; index: number; language: string; value: string }
  | { type: "add-element"; index: number; element: EditorElement }
  | { type: "update-element"; index: number; elementId: string; patch: Partial<EditorElement> }
  | { type: "set-element-text"; index: number; elementId: string; language: string; value: string }
  | { type: "set-element-icon-shadow"; index: number; elementId: string; patch: Partial<Shadow> }
  | { type: "remove-element"; index: number; elementId: string }
  | { type: "move-element"; index: number; elementId: string; direction: "up" | "down" }
  | { type: "add-popout"; index: number; popout: Popout }
  | { type: "update-popout"; index: number; popoutId: string; patch: Partial<Omit<Popout, "id" | "shadow" | "border">> }
  | { type: "set-popout-shadow"; index: number; popoutId: string; patch: Partial<Shadow> }
  | { type: "set-popout-border"; index: number; popoutId: string; patch: Partial<Popout["border"]> }
  | { type: "remove-popout"; index: number; popoutId: string }
  | { type: "move-popout"; index: number; popoutId: string; direction: "up" | "down" }
  | { type: "transfer-style"; from: number; to: number }
  | { type: "apply-style-to-all"; from: number }
  | { type: "set-current-language"; language: string }
  | { type: "add-language"; language: string }
  | { type: "remove-language"; language: string }
  | { type: "apply-doc-translations"; entries: TranslationEntry[] }
  | { type: "toggle-output-device"; device: string }
  | { type: "set-per-language-layout"; index: number; enabled: boolean }
  | { type: "set-language-layout"; index: number; language: string; patch: Partial<LanguageLayout> };

function patchShot(
  doc: ScreenshotDoc,
  index: number,
  update: (shot: EditorScreenshot) => EditorScreenshot,
): ScreenshotDoc {
  if (index < 0 || index >= doc.screenshots.length) return doc;
  const screenshots = doc.screenshots.map((s, i) => (i === index ? update(structuredClone(s)) : s));
  return { ...doc, screenshots };
}

function patchElement(
  doc: ScreenshotDoc,
  index: number,
  elementId: string,
  update: (el: EditorElement) => EditorElement,
): ScreenshotDoc {
  const shot = doc.screenshots[index];
  if (!shot || !shot.elements.some((e) => e.id === elementId)) return doc;
  return patchShot(doc, index, (s) => ({
    ...s,
    elements: s.elements.map((e) => (e.id === elementId ? update(e) : e)),
  }));
}

function patchPopout(
  doc: ScreenshotDoc,
  index: number,
  popoutId: string,
  update: (p: Popout) => Popout,
): ScreenshotDoc {
  const shot = doc.screenshots[index];
  if (!shot || !shot.popouts.some((p) => p.id === popoutId)) return doc;
  return patchShot(doc, index, (s) => ({
    ...s,
    popouts: s.popouts.map((p) => (p.id === popoutId ? update(p) : p)),
  }));
}

function removeFromRecord<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function textWithLanguageAdded(text: TextSettings, language: string): TextSettings {
  return {
    ...text,
    headlineLanguages: [...text.headlineLanguages, language],
    subheadlineLanguages: [...text.subheadlineLanguages, language],
    // seeds first so an existing value survives a re-add
    headlines: { [language]: "", ...text.headlines },
    subheadlines: { [language]: "", ...text.subheadlines },
  };
}

function textWithLanguageRemoved(text: TextSettings, language: string): TextSettings {
  return {
    ...text,
    headlineLanguages: text.headlineLanguages.filter((l) => l !== language),
    subheadlineLanguages: text.subheadlineLanguages.filter((l) => l !== language),
    headlines: removeFromRecord(text.headlines, language),
    subheadlines: removeFromRecord(text.subheadlines, language),
    languageSettings: removeFromRecord(text.languageSettings, language),
  };
}

function baseLayout(text: TextSettings): LanguageLayout {
  return {
    headlineSize: text.headlineSize,
    subheadlineSize: text.subheadlineSize,
    position: text.position,
    offsetY: text.offsetY,
    lineHeight: text.lineHeight,
  };
}

function inFormatOrder(devices: string[]): string[] {
  return [...devices].sort(
    (a, b) => EDITOR_FORMATS.findIndex((f) => f.key === a) - EDITOR_FORMATS.findIndex((f) => f.key === b),
  );
}

/**
 * The format menu only lists working formats, so the current device has to be one of them.
 * Restores and .json imports carry any pairing; "custom" stays out of the list on purpose.
 */
function withCurrentDeviceListed(doc: ScreenshotDoc): ScreenshotDoc {
  const list = doc.outputDevices;
  if (!list || list.includes(doc.outputDevice)) return doc;
  if (!EDITOR_FORMATS.some((f) => f.key === doc.outputDevice)) return doc;
  return { ...doc, outputDevices: inFormatOrder([...list, doc.outputDevice]) };
}

/** Copy styling from one screenshot onto another – content (headlines, popouts) stays. */
function restyleFrom(source: EditorScreenshot, target: EditorScreenshot): EditorScreenshot {
  return {
    ...target,
    background: structuredClone(source.background),
    screenshot: structuredClone(source.screenshot),
    text: {
      ...structuredClone(source.text),
      headlines: structuredClone(target.text.headlines),
      subheadlines: structuredClone(target.text.subheadlines),
    },
    elements: source.elements.map((el) => ({ ...structuredClone(el), id: crypto.randomUUID() })),
    // popouts intentionally kept – crop regions are specific to each shot's source image
  };
}

export function editorReducer(doc: ScreenshotDoc, action: EditorAction): ScreenshotDoc {
  switch (action.type) {
    case "replace-doc": {
      // restores and .json imports can carry any language shape and any stale index
      const incoming = normalizeDocLanguages(action.doc);
      return withCurrentDeviceListed({
        ...incoming,
        selectedIndex: Math.max(0, Math.min(incoming.selectedIndex, incoming.screenshots.length - 1)),
      });
    }
    case "select-screenshot":
      if (action.index < 0 || action.index >= doc.screenshots.length) return doc;
      return { ...doc, selectedIndex: action.index };
    case "add-screenshot": {
      const shot = createDefaultScreenshot(doc.defaults);
      // No ref = blank screenshot (background + text only), like appscreen's "add" button.
      if (action.imageRef) shot.localizedImages = { [doc.currentLanguage]: { src: action.imageRef } };
      const screenshots = [...doc.screenshots, shot];
      return { ...doc, screenshots, selectedIndex: screenshots.length - 1 };
    }
    case "remove-screenshot": {
      if (action.index < 0 || action.index >= doc.screenshots.length) return doc;
      const screenshots = doc.screenshots.filter((_, i) => i !== action.index);
      const selectedIndex = Math.max(0, Math.min(doc.selectedIndex, screenshots.length - 1));
      return { ...doc, screenshots, selectedIndex };
    }
    case "duplicate-screenshot": {
      if (action.index < 0 || action.index >= doc.screenshots.length) return doc;
      const copy = structuredClone(doc.screenshots[action.index]);
      const screenshots = [...doc.screenshots];
      screenshots.splice(action.index + 1, 0, copy);
      return { ...doc, screenshots, selectedIndex: action.index + 1 };
    }
    case "reorder-screenshots": {
      const { from, to } = action;
      if (from < 0 || from >= doc.screenshots.length || to < 0 || to >= doc.screenshots.length) return doc;
      const screenshots = [...doc.screenshots];
      const [moved] = screenshots.splice(from, 1);
      screenshots.splice(to, 0, moved);
      const selected = doc.screenshots[doc.selectedIndex];
      return { ...doc, screenshots, selectedIndex: screenshots.indexOf(selected) };
    }
    case "set-screenshot-image":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        localizedImages: { ...s.localizedImages, [action.language]: { src: action.imageRef } },
      }));
    case "clear-screenshot-image":
      // `src` holds the image of pre-localizedImages docs – it would resurface once the entry is gone.
      return patchShot(doc, action.index, (s) => ({
        ...s,
        src: null,
        localizedImages: removeFromRecord(s.localizedImages, action.language),
      }));
    case "set-output-device":
      return withCurrentDeviceListed({ ...doc, outputDevice: action.device });
    case "set-custom-size":
      return { ...doc, outputDevice: "custom", customWidth: action.width, customHeight: action.height };
    case "set-background":
      return patchShot(doc, action.index, (s) => ({ ...s, background: { ...s.background, ...action.patch } }));
    case "set-gradient-stop":
      return patchShot(doc, action.index, (s) => {
        const stops = s.background.gradient.stops.map((st, i) =>
          i === action.stopIndex ? { ...st, ...action.patch } : st,
        );
        return { ...s, background: { ...s.background, gradient: { ...s.background.gradient, stops } } };
      });
    case "add-gradient-stop":
      return patchShot(doc, action.index, (s) => {
        const stops = [...s.background.gradient.stops, { color: "#ffffff", position: 100 }];
        return { ...s, background: { ...s.background, gradient: { ...s.background.gradient, stops } } };
      });
    case "remove-gradient-stop":
      return patchShot(doc, action.index, (s) => {
        if (s.background.gradient.stops.length <= 2) return s;
        const stops = s.background.gradient.stops.filter((_, i) => i !== action.stopIndex);
        return { ...s, background: { ...s.background, gradient: { ...s.background.gradient, stops } } };
      });
    case "set-screenshot-setting":
      return patchShot(doc, action.index, (s) => ({ ...s, screenshot: { ...s.screenshot, ...action.patch } }));
    case "set-shadow":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        screenshot: { ...s.screenshot, shadow: { ...s.screenshot.shadow, ...action.patch } },
      }));
    case "set-frame":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        screenshot: { ...s.screenshot, frame: { ...s.screenshot.frame, ...action.patch } },
      }));
    case "set-text-setting":
      return patchShot(doc, action.index, (s) => ({ ...s, text: { ...s.text, ...action.patch } }));
    case "set-headline":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        text: { ...s.text, headlines: { ...s.text.headlines, [action.language]: action.value } },
      }));
    case "set-subheadline":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        text: { ...s.text, subheadlines: { ...s.text.subheadlines, [action.language]: action.value } },
      }));
    case "add-element":
      return patchShot(doc, action.index, (s) => ({ ...s, elements: [...s.elements, action.element] }));
    case "update-element":
      return patchElement(doc, action.index, action.elementId, (e) => ({ ...e, ...action.patch }));
    case "set-element-text":
      return patchElement(doc, action.index, action.elementId, (e) => ({
        ...e,
        text: action.value,
        texts: { ...e.texts, [action.language]: action.value },
      }));
    case "set-element-icon-shadow":
      return patchElement(doc, action.index, action.elementId, (e) => ({
        ...e,
        iconShadow: { ...e.iconShadow, ...action.patch },
      }));
    case "remove-element": {
      const shot = doc.screenshots[action.index];
      if (!shot?.elements.some((e) => e.id === action.elementId)) return doc;
      return patchShot(doc, action.index, (s) => ({
        ...s,
        elements: s.elements.filter((e) => e.id !== action.elementId),
      }));
    }
    case "move-element": {
      const shot = doc.screenshots[action.index];
      if (!shot) return doc;
      const i = shot.elements.findIndex((e) => e.id === action.elementId);
      const j = action.direction === "up" ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= shot.elements.length) return doc;
      return patchShot(doc, action.index, (s) => {
        const elements = [...s.elements];
        [elements[i], elements[j]] = [elements[j], elements[i]];
        return { ...s, elements };
      });
    }
    case "add-popout":
      return patchShot(doc, action.index, (s) => ({ ...s, popouts: [...s.popouts, action.popout] }));
    case "update-popout":
      return patchPopout(doc, action.index, action.popoutId, (p) => ({ ...p, ...action.patch }));
    case "set-popout-shadow":
      return patchPopout(doc, action.index, action.popoutId, (p) => ({
        ...p,
        shadow: { ...p.shadow, ...action.patch },
      }));
    case "set-popout-border":
      return patchPopout(doc, action.index, action.popoutId, (p) => ({
        ...p,
        border: { ...p.border, ...action.patch },
      }));
    case "remove-popout": {
      const shot = doc.screenshots[action.index];
      if (!shot?.popouts.some((p) => p.id === action.popoutId)) return doc;
      return patchShot(doc, action.index, (s) => ({
        ...s,
        popouts: s.popouts.filter((p) => p.id !== action.popoutId),
      }));
    }
    case "move-popout": {
      const shot = doc.screenshots[action.index];
      if (!shot) return doc;
      const i = shot.popouts.findIndex((p) => p.id === action.popoutId);
      const j = action.direction === "up" ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= shot.popouts.length) return doc;
      return patchShot(doc, action.index, (s) => {
        const popouts = [...s.popouts];
        [popouts[i], popouts[j]] = [popouts[j], popouts[i]];
        return { ...s, popouts };
      });
    }
    case "transfer-style": {
      const source = doc.screenshots[action.from];
      const target = doc.screenshots[action.to];
      if (!source || !target || action.from === action.to) return doc;
      return {
        ...doc,
        screenshots: doc.screenshots.map((s, i) => (i === action.to ? restyleFrom(source, s) : s)),
      };
    }
    case "apply-style-to-all": {
      const source = doc.screenshots[action.from];
      if (!source || doc.screenshots.length < 2) return doc;
      return {
        ...doc,
        screenshots: doc.screenshots.map((s, i) => (i === action.from ? s : restyleFrom(source, s))),
      };
    }
    case "set-current-language":
      if (action.language === doc.currentLanguage || !doc.projectLanguages.includes(action.language)) return doc;
      return docWithLanguage(doc, action.language);
    case "add-language": {
      if (doc.projectLanguages.includes(action.language)) return doc;
      return {
        ...doc,
        projectLanguages: [...doc.projectLanguages, action.language],
        defaults: { ...doc.defaults, text: textWithLanguageAdded(doc.defaults.text, action.language) },
        screenshots: doc.screenshots.map((s) => ({ ...s, text: textWithLanguageAdded(s.text, action.language) })),
      };
    }
    case "remove-language": {
      if (doc.projectLanguages.length <= 1 || !doc.projectLanguages.includes(action.language)) return doc;
      const projectLanguages = doc.projectLanguages.filter((l) => l !== action.language);
      const next: ScreenshotDoc = {
        ...doc,
        projectLanguages,
        defaults: { ...doc.defaults, text: textWithLanguageRemoved(doc.defaults.text, action.language) },
        screenshots: doc.screenshots.map((s) => ({
          ...s,
          localizedImages: removeFromRecord(s.localizedImages, action.language),
          text: textWithLanguageRemoved(s.text, action.language),
          elements: s.elements.map((el) =>
            el.texts && action.language in el.texts
              ? { ...el, texts: removeFromRecord(el.texts, action.language) }
              : el,
          ),
        })),
      };
      return doc.currentLanguage === action.language ? docWithLanguage(next, projectLanguages[0]) : next;
    }
    case "apply-doc-translations":
      return applyTranslationEntries(doc, action.entries);
    case "toggle-output-device": {
      if (!EDITOR_FORMATS.some((f) => f.key === action.device)) return doc;
      const list = doc.outputDevices ?? [doc.outputDevice];
      if (list.includes(action.device)) {
        if (action.device === doc.outputDevice) return doc;
        return { ...doc, outputDevices: list.filter((d) => d !== action.device) };
      }
      return { ...doc, outputDevices: inFormatOrder([...list, action.device]) };
    }
    case "set-per-language-layout":
      return patchShot(doc, action.index, (s) => {
        const languageSettings = { ...s.text.languageSettings };
        if (action.enabled) {
          for (const lang of doc.projectLanguages) {
            // only fills what is missing – re-enabling never wipes a tuned layout (appscreen bug)
            if (!languageSettings[lang]) languageSettings[lang] = baseLayout(s.text);
          }
        }
        return { ...s, text: { ...s.text, perLanguageLayout: action.enabled, languageSettings } };
      });
    case "set-language-layout":
      return patchShot(doc, action.index, (s) => ({
        ...s,
        text: {
          ...s.text,
          currentLayoutLang: action.language,
          languageSettings: {
            ...s.text.languageSettings,
            [action.language]: {
              ...(s.text.languageSettings[action.language] ?? baseLayout(s.text)),
              ...action.patch,
            },
          },
        },
      }));
  }
}
