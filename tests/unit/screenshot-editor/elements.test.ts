import { describe, it, expect } from "vitest";
import {
  createTextElement, createEmojiElement, createIconElement, createGraphicElement, createPopout,
} from "@/lib/screenshot-editor/elements";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("element factories – appscreen defaults", () => {
  it("createTextElement matches addTextElement defaults with localized seed text", () => {
    const el = createTextElement("fr");
    expect(el.id).toMatch(UUID_RE);
    expect(el).toMatchObject({
      type: "text", x: 50, y: 50, width: 40, rotation: 0, opacity: 100, layer: "above-text",
      name: "Text", text: "Your Text", texts: { fr: "Your Text" },
      font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
      fontSize: 60, fontWeight: "600", fontColor: "#ffffff", italic: false,
      frame: "none", frameColor: "#ffffff", frameScale: 100,
    });
  });

  it("createEmojiElement stores the character at width 15", () => {
    const el = createEmojiElement("⭐", "Star");
    expect(el).toMatchObject({
      type: "emoji", emoji: "⭐", name: "Star", x: 50, y: 50, width: 15,
      rotation: 0, opacity: 100, layer: "above-text",
    });
  });

  it("createIconElement stores the rasterized src plus color and weight, with shadow off", () => {
    const el = createIconElement("star", "data:image/svg+xml,x", "#ffffff", "regular");
    expect(el).toMatchObject({
      type: "icon", name: "star", src: "data:image/svg+xml,x",
      iconColor: "#ffffff", iconWeight: "regular", width: 15, layer: "above-text",
      iconShadow: { enabled: false, color: "#000000", blur: 20, opacity: 40, x: 0, y: 10 },
    });
  });

  it("createGraphicElement keeps the asset ref at width 20", () => {
    const el = createGraphicElement("01ABC.png", "shot.png");
    expect(el).toMatchObject({ type: "graphic", src: "01ABC.png", name: "shot.png", width: 20 });
  });

  it("createPopout matches addPopout defaults", () => {
    const p = createPopout();
    expect(p.id).toMatch(UUID_RE);
    expect(p).toMatchObject({
      cropX: 25, cropY: 25, cropWidth: 30, cropHeight: 30,
      x: 70, y: 30, width: 30, rotation: 0, opacity: 100, cornerRadius: 12,
      shadow: { enabled: true, color: "#000000", blur: 30, opacity: 40, x: 0, y: 15 },
      border: { enabled: true, color: "#ffffff", width: 3, opacity: 100 },
    });
  });

  it("every factory call mints a fresh id", () => {
    expect(createTextElement("en").id).not.toBe(createTextElement("en").id);
    expect(createPopout().id).not.toBe(createPopout().id);
  });
});
