import { describe, expect, it } from "vitest";
import {
  allImageRefs, categoryForFormat, categoryOrder, clearImage, hasOwnImage, imageSourceFor,
  imagesForCategory, setImage,
} from "@/lib/screenshot-editor/images";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import type { EditorScreenshot, ScreenshotDoc } from "@/lib/screenshot-editor/types";

/** A doc on iPhone + iPad, working in English and French. */
function doc(overrides: Partial<ScreenshotDoc> = {}): ScreenshotDoc {
  return {
    ...createEmptyDoc(["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_11"]),
    projectLanguages: ["en-US", "fr-FR"],
    currentLanguage: "en-US",
    ...overrides,
  };
}

const shot = (images: EditorScreenshot["images"], extra: Partial<EditorScreenshot> = {}) =>
  ({ images, elements: [], popouts: [], ...extra }) as unknown as EditorScreenshot;

const iphoneEnFr = shot({
  iPhone: { "en-US": { src: "iphone-en.png" }, "fr-FR": { src: "iphone-fr.png" } },
});

describe("categoryForFormat", () => {
  it("maps a display type to its device category, custom sizes aside", () => {
    expect(categoryForFormat("APP_IPHONE_67")).toBe("iPhone");
    expect(categoryForFormat("APP_IPAD_PRO_3GEN_11")).toBe("iPad");
    expect(categoryForFormat("APP_WATCH_ULTRA")).toBe("Apple Watch");
    expect(categoryForFormat("custom")).toBe("Other");
  });

  it("puts every iPad size in one bucket – nobody shoots five iPad captures", () => {
    const pads = ["APP_IPAD_PRO_3GEN_129", "APP_IPAD_PRO_3GEN_11", "APP_IPAD_105", "APP_IPAD_97"];
    expect(new Set(pads.map(categoryForFormat))).toEqual(new Set(["iPad"]));
  });
});

describe("categoryOrder", () => {
  it("starts on the device being edited, then the doc's working formats", () => {
    expect(categoryOrder(doc({ outputDevice: "APP_IPAD_PRO_3GEN_11" }))).toEqual(["iPad", "iPhone"]);
    expect(categoryOrder(doc({ outputDevice: "APP_IPHONE_67" }))).toEqual(["iPhone", "iPad"]);
  });
});

describe("imagesForCategory – device first", () => {
  it("uses the device's own captures when it has any", () => {
    const withPad = shot({ ...iphoneEnFr.images, iPad: { "en-US": { src: "ipad-en.png" } } });
    expect(imagesForCategory(withPad, "iPad", ["iPad", "iPhone"])["en-US"].src).toBe("ipad-en.png");
  });

  it("falls back to another device rather than showing nothing", () => {
    expect(imagesForCategory(iphoneEnFr, "iPad", ["iPad", "iPhone"])["en-US"].src).toBe("iphone-en.png");
  });

  it("prefers the right device in the wrong language over the right language on the wrong device", () => {
    const shots = shot({
      iPhone: { "fr-FR": { src: "iphone-fr.png" } },
      iPad: { "en-US": { src: "ipad-en.png" } },
    });
    const source = imageSourceFor(doc({ outputDevice: "APP_IPAD_PRO_3GEN_11", currentLanguage: "fr-FR" }), shots, "fr-FR");
    expect(source).toEqual({ src: "ipad-en.png", category: "iPad", language: "en-US" });
  });

  it("gives back nothing when no device has anything", () => {
    expect(imagesForCategory(shot({}), "iPad", ["iPad", "iPhone"])).toEqual({});
  });
});

describe("imageSourceFor", () => {
  const d = doc();

  it("names the cell the canvas is actually drawing", () => {
    expect(imageSourceFor(d, iphoneEnFr, "en-US"))
      .toEqual({ src: "iphone-en.png", category: "iPhone", language: "en-US" });
    expect(imageSourceFor(d, iphoneEnFr, "de-DE"))
      .toEqual({ src: "iphone-en.png", category: "iPhone", language: "en-US" });
  });

  it("returns nothing when the shot has no image at all", () => {
    expect(imageSourceFor(d, shot({}), "en-US")).toBeNull();
  });
});

describe("setImage / clearImage / hasOwnImage", () => {
  it("writes one cell without touching the others", () => {
    const next = setImage(iphoneEnFr, "iPad", "en-US", "ipad-en.png");
    expect(next.images).toEqual({
      iPhone: { "en-US": { src: "iphone-en.png" }, "fr-FR": { src: "iphone-fr.png" } },
      iPad: { "en-US": { src: "ipad-en.png" } },
    });
  });

  it("clearing a cell falls back instead of leaving a hole", () => {
    const cleared = clearImage(iphoneEnFr, "iPhone", "fr-FR");
    expect(hasOwnImage(cleared, "iPhone", "fr-FR")).toBe(false);
    expect(imageSourceFor(doc({ currentLanguage: "fr-FR" }), cleared, "fr-FR"))
      .toEqual({ src: "iphone-en.png", category: "iPhone", language: "en-US" });
  });

  it("tells an override apart from an inherited image", () => {
    expect(hasOwnImage(iphoneEnFr, "iPhone", "en-US")).toBe(true);
    expect(hasOwnImage(iphoneEnFr, "iPad", "en-US")).toBe(false);
  });
});

describe("allImageRefs", () => {
  it("collects every cell of every device", () => {
    const mixed = shot({
      iPhone: { "en-US": { src: "a.png" }, "fr-FR": { src: "b.png" } },
      iPad: { "fr-FR": { src: "c.png" } },
    });
    expect(new Set(allImageRefs(mixed))).toEqual(new Set(["a.png", "b.png", "c.png"]));
  });
});
