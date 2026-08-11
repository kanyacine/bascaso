import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { parseAppscreenProject, renderScreenshotToCanvas, resolveScreenshotImage } from "@/lib/screenshot-editor/render/compose";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import { makeCanvas } from "./helpers";
import type { RenderAssets, RenderEnv, RenderImage } from "@/lib/screenshot-editor/types";

/** 2×2 px PNG data URL, produced through the same canvas the renderer uses. */
function dataUrl(color: string): string {
  const { canvas, ctx } = makeCanvas(2, 2);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 2, 2);
  return `data:image/png;base64,${Buffer.from(canvas.toBuffer("image/png")).toString("base64")}`;
}

async function decode(url: string): Promise<RenderImage> {
  const base64 = url.slice(url.indexOf(",") + 1);
  return await loadImage(Buffer.from(base64, "base64")) as unknown as RenderImage;
}

/** Minimal appscreen backup project: two screenshots, two languages, an element and a popout. */
function syntheticProject() {
  return {
    id: "proj-1",
    formatVersion: 2,
    screenshots: [
      {
        src: "",
        name: "Shot 1",
        deviceType: "iphone",
        localizedImages: {
          en: { src: dataUrl("#ff0000") },
          fr: { src: dataUrl("#0000ff") },
          de: { src: "" }, // present but never uploaded
        },
        background: { ...structuredClone(DEFAULTS.background), type: "image", image: dataUrl("#00ff00") },
        screenshot: structuredClone(DEFAULTS.screenshot),
        text: { ...structuredClone(DEFAULTS.text), headlines: { en: "Hello", fr: "Bonjour" } },
        elements: [
          { id: "icon-1", type: "icon", src: dataUrl("#ffff00"), x: 20, y: 20, width: 20,
            rotation: 0, opacity: 100, layer: "above-text" },
          { id: "text-1", type: "text", texts: { en: "Badge", fr: "Insigne" }, x: 50, y: 80, width: 40,
            rotation: 0, opacity: 100, layer: "above-screenshot", font: "sans-serif", fontSize: 40,
            fontWeight: "600", fontColor: "#ffffff", italic: false, frame: "none",
            frameColor: "#ffffff", frameScale: 100 },
        ],
        popouts: [
          { id: "pop-1", x: 75, y: 75, width: 30, rotation: 0, opacity: 100,
            cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, cornerRadius: 8,
            shadow: { enabled: false, color: "#000000", blur: 0, opacity: 0, x: 0, y: 0 },
            border: { enabled: false, color: "#ffffff", width: 4, opacity: 100 } },
        ],
      },
      {
        // Legacy shape: one image in `src`, no localizedImages, no elements or popouts
        src: dataUrl("#123456"),
        name: "Shot 2",
        background: structuredClone(DEFAULTS.background),
        screenshot: structuredClone(DEFAULTS.screenshot),
        text: structuredClone(DEFAULTS.text),
      },
    ],
    selectedIndex: 0,
    outputDevice: "iphone-6.9",
    customWidth: 1290,
    customHeight: 2796,
    currentLanguage: "en",
    projectLanguages: ["en", "fr"],
    defaults: structuredClone(DEFAULTS),
  };
}

describe("parseAppscreenProject", () => {
  it("maps an appscreen device onto a custom format of the same pixel size", () => {
    const { doc } = parseAppscreenProject(syntheticProject());
    expect(doc.outputDevice).toBe("custom");
    expect(doc.customWidth).toBe(1320);
    expect(doc.customHeight).toBe(2868);
    expect(doc.currentLanguage).toBe("en");
    expect(doc.projectLanguages).toEqual(["en", "fr"]);
    expect(doc.selectedIndex).toBe(0);
    expect(doc.defaults).toEqual(DEFAULTS);
  });

  it("keeps the stored custom size for a project already on a custom format", () => {
    const raw = { ...syntheticProject(), outputDevice: "custom" };
    const { doc } = parseAppscreenProject(raw);
    expect(doc.customWidth).toBe(1290);
    expect(doc.customHeight).toBe(2796);
  });

  it("keeps localized images in the Other bucket and drops languages with no image", () => {
    const { doc } = parseAppscreenProject(syntheticProject());
    expect(Object.keys(doc.screenshots[0].images.Other)).toEqual(["en", "fr"]);
    expect(doc.screenshots[0].images.Other.en.src).toMatch(/^data:image\/png;base64,/);
  });

  it("folds a legacy src into the current language and defaults missing collections", () => {
    const { doc } = parseAppscreenProject(syntheticProject());
    const legacy = doc.screenshots[1];
    expect(Object.keys(legacy.images.Other)).toEqual(["en"]);
    expect(legacy.images.Other.en.src).toMatch(/^data:image\/png;base64,/);
    expect(legacy.elements).toEqual([]);
    expect(legacy.popouts).toEqual([]);
    expect(legacy.name).toBe("Shot 2");
  });

  it("ignores a legacy src when the current language already has an image", () => {
    const raw = syntheticProject();
    raw.screenshots[0].src = dataUrl("#ffffff");
    const { doc, imageRefs } = parseAppscreenProject(raw);
    expect(doc.screenshots[0].images.Other.en.src).not.toBe(raw.screenshots[0].src);
    expect(imageRefs.get("screenshot:0:en")).toBe(doc.screenshots[0].images.Other.en.src);
  });

  it("migrates pre-v2 3D positions on import", () => {
    const raw = syntheticProject();
    raw.screenshots[0].screenshot.use3D = true;
    raw.screenshots[0].screenshot.scale = 70;
    raw.screenshots[0].screenshot.x = 60;
    delete (raw as { formatVersion?: number }).formatVersion;
    const { doc } = parseAppscreenProject(raw);
    expect(doc.screenshots[0].screenshot.x).toBeCloseTo(Math.min(100, 50 + 10 * (2 / (0.3 * 0.9))));
    (raw as { formatVersion?: number }).formatVersion = 2;
    raw.screenshots[0].screenshot.x = 60;
    expect(parseAppscreenProject(raw).doc.screenshots[0].screenshot.x).toBe(60);
  });

  it("collects every image ref under a resolvable key", () => {
    const { imageRefs } = parseAppscreenProject(syntheticProject());
    expect([...imageRefs.keys()].sort()).toEqual([
      "background:0", "element:icon-1", "screenshot:0:en", "screenshot:0:fr", "screenshot:1:en",
    ]);
  });

  it("emits no refs for a screenshot with no images at all", () => {
    const raw = syntheticProject();
    raw.screenshots = [{
      src: "",
      name: "Empty",
      localizedImages: {},
      background: structuredClone(DEFAULTS.background),
      screenshot: structuredClone(DEFAULTS.screenshot),
      text: structuredClone(DEFAULTS.text),
      elements: [{ id: "text-only", type: "text", text: "hi", x: 50, y: 50, width: 40,
        rotation: 0, opacity: 100, layer: "above-text", font: "sans-serif", fontSize: 20,
        fontWeight: "400", fontColor: "#ffffff", italic: false, frame: "none",
        frameColor: "#ffffff", frameScale: 100 }],
      popouts: [],
    }] as unknown as typeof raw.screenshots;
    const { imageRefs, doc } = parseAppscreenProject(raw);
    expect([...imageRefs.keys()]).toEqual([]);
    expect(doc.screenshots[0].images.Other).toEqual({});
  });

  it("parses a screenshot whose localizedImages field is absent", () => {
    const raw = syntheticProject();
    delete (raw.screenshots[0] as { localizedImages?: unknown }).localizedImages;
    const { doc } = parseAppscreenProject(raw);
    expect(doc.screenshots[0].images.Other).toEqual({});
  });
});

describe("rendering a parsed appscreen project", () => {
  it("renders every screenshot in every language, deterministically", async () => {
    const { doc, imageRefs } = parseAppscreenProject(syntheticProject());
    const env: RenderEnv = {
      language: "en", projectLanguages: doc.projectLanguages,
      createCanvas: (w, h) => createCanvas(w, h) as unknown as ReturnType<RenderEnv["createCanvas"]>,
      rng: () => 0.5,
    };

    for (const [index, screenshot] of doc.screenshots.entries()) {
      for (const language of doc.projectLanguages) {
        const screenshotImages: RenderAssets["screenshotImages"] = {};
        for (const lang of Object.keys(screenshot.images.Other)) {
          screenshotImages[lang] = await decode(imageRefs.get(`screenshot:${index}:${lang}`) as string);
        }
        const backgroundRef = imageRefs.get(`background:${index}`);
        const elementImages: RenderAssets["elementImages"] = {};
        for (const el of screenshot.elements) {
          const ref = imageRefs.get(`element:${el.id}`);
          if (ref) elementImages[el.id] = await decode(ref);
        }
        const assets: RenderAssets = {
          screenshotImages,
          backgroundImage: backgroundRef ? await decode(backgroundRef) : null,
          elementImages,
          laurelImages: {},
        };

        expect(resolveScreenshotImage(assets, language, doc.projectLanguages)).not.toBeNull();

        const a = createCanvas(1, 1);
        const b = createCanvas(1, 1);
        renderScreenshotToCanvas(a as never, doc, index, assets, { ...env, language });
        renderScreenshotToCanvas(b as never, doc, index, assets, { ...env, language });
        expect(a.width).toBe(1320);
        expect(a.height).toBe(2868);
        expect(Buffer.from(a.toBuffer("image/png")).equals(Buffer.from(b.toBuffer("image/png")))).toBe(true);
      }
    }
  });
});

const FIXTURE = "tests/fixtures/screenshot-editor/appscreen-reference.json";

// Activates automatically once a real appscreen export (2 screenshots, 2 languages, elements and a
// popout) is saved at the path above. Visual parity against appscreen itself is validated by eye in
// phase 2, in the browser, where the fonts match — node font rasterization differs by design.
describe.skipIf(!existsSync(FIXTURE))("appscreen reference doc parity", () => {
  it("parses and renders every screenshot in every language without throwing, deterministically", async () => {
    const backup = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const { doc, imageRefs } = parseAppscreenProject(backup.projects[0]);
    expect(doc.screenshots.length).toBeGreaterThanOrEqual(2);
    expect(doc.projectLanguages.length).toBeGreaterThanOrEqual(2);

    const env: RenderEnv = {
      language: doc.currentLanguage, projectLanguages: doc.projectLanguages,
      createCanvas: (w, h) => createCanvas(w, h) as unknown as ReturnType<RenderEnv["createCanvas"]>,
      rng: () => 0.5,
    };

    for (const [index, screenshot] of doc.screenshots.entries()) {
      const screenshotImages: RenderAssets["screenshotImages"] = {};
      for (const lang of Object.keys(screenshot.images.Other)) {
        screenshotImages[lang] = await decode(imageRefs.get(`screenshot:${index}:${lang}`) as string);
      }
      const backgroundRef = imageRefs.get(`background:${index}`);
      const elementImages: RenderAssets["elementImages"] = {};
      for (const el of screenshot.elements) {
        const ref = imageRefs.get(`element:${el.id}`);
        if (ref) elementImages[el.id] = await decode(ref);
      }
      const assets: RenderAssets = {
        screenshotImages,
        backgroundImage: backgroundRef ? await decode(backgroundRef) : null,
        elementImages,
        laurelImages: {},
      };

      for (const language of doc.projectLanguages) {
        const a = createCanvas(1, 1);
        const b = createCanvas(1, 1);
        renderScreenshotToCanvas(a as never, doc, index, assets, { ...env, language });
        renderScreenshotToCanvas(b as never, doc, index, assets, { ...env, language });
        const pixels = a.getContext("2d").getImageData(0, 0, a.width, a.height).data;
        expect(pixels.some((v) => v !== 0)).toBe(true);
        expect(Buffer.from(a.toBuffer("image/png")).equals(Buffer.from(b.toBuffer("image/png")))).toBe(true);
      }
    }
  });
});
