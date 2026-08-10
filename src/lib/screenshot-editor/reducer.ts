import { createDefaultScreenshot } from "./defaults";
import type {
  Background, EditorScreenshot, GradientStop, ScreenshotDoc, ScreenshotSettings, Shadow, TextSettings,
} from "./types";

export type EditorAction =
  | { type: "replace-doc"; doc: ScreenshotDoc }
  | { type: "select-screenshot"; index: number }
  | { type: "add-screenshot"; imageRef: string }
  | { type: "remove-screenshot"; index: number }
  | { type: "duplicate-screenshot"; index: number }
  | { type: "reorder-screenshots"; from: number; to: number }
  | { type: "set-screenshot-image"; index: number; language: string; imageRef: string }
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
  | { type: "set-subheadline"; index: number; language: string; value: string };

function patchShot(
  doc: ScreenshotDoc,
  index: number,
  update: (shot: EditorScreenshot) => EditorScreenshot,
): ScreenshotDoc {
  if (index < 0 || index >= doc.screenshots.length) return doc;
  const screenshots = doc.screenshots.map((s, i) => (i === index ? update(structuredClone(s)) : s));
  return { ...doc, screenshots };
}

export function editorReducer(doc: ScreenshotDoc, action: EditorAction): ScreenshotDoc {
  switch (action.type) {
    case "replace-doc":
      return action.doc;
    case "select-screenshot":
      if (action.index < 0 || action.index >= doc.screenshots.length) return doc;
      return { ...doc, selectedIndex: action.index };
    case "add-screenshot": {
      const shot = createDefaultScreenshot(doc.defaults);
      shot.localizedImages = { [doc.currentLanguage]: { src: action.imageRef } };
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
    case "set-output-device":
      return { ...doc, outputDevice: action.device };
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
  }
}
