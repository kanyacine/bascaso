/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Factories port the addTextElement/addEmojiElement/addIconElement/addGraphicElement/addPopout
// defaults (app.js:311-480, 265-279). Runtime-only fields (image) and lucide fields
// (iconName/iconStrokeWidth) are replaced by src refs + iconColor/iconWeight.
import type { EditorElement, IconWeight, Popout } from "./types";

const ELEMENT_BASE = {
  x: 50, y: 50, rotation: 0, opacity: 100, layer: "above-text",
} as const satisfies Partial<EditorElement>;

const TEXT_STYLE = {
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
  fontSize: 60, fontWeight: "600", fontColor: "#ffffff", italic: false,
  frame: "none", frameColor: "#ffffff", frameScale: 100,
} as const satisfies Partial<EditorElement>;

export function createTextElement(language: string): EditorElement {
  return {
    id: crypto.randomUUID(), type: "text", ...ELEMENT_BASE, width: 40,
    name: "Text", text: "Your Text", texts: { [language]: "Your Text" }, ...TEXT_STYLE,
  };
}

export function createEmojiElement(emoji: string, name: string): EditorElement {
  return { id: crypto.randomUUID(), type: "emoji", ...ELEMENT_BASE, width: 15, emoji, name };
}

export function createIconElement(
  name: string, src: string, color: string, weight: IconWeight,
): EditorElement {
  return {
    id: crypto.randomUUID(), type: "icon", ...ELEMENT_BASE, width: 15,
    name, src, iconColor: color, iconWeight: weight,
    iconShadow: { enabled: false, color: "#000000", blur: 20, opacity: 40, x: 0, y: 10 },
  };
}

export function createGraphicElement(src: string, name: string): EditorElement {
  return { id: crypto.randomUUID(), type: "graphic", ...ELEMENT_BASE, width: 20, src, name };
}

export function createPopout(): Popout {
  return {
    id: crypto.randomUUID(),
    cropX: 25, cropY: 25, cropWidth: 30, cropHeight: 30,
    x: 70, y: 30, width: 30, rotation: 0, opacity: 100, cornerRadius: 12,
    shadow: { enabled: true, color: "#000000", blur: 30, opacity: 40, x: 0, y: 15 },
    border: { enabled: true, color: "#ffffff", width: 3, opacity: 100 },
  };
}
