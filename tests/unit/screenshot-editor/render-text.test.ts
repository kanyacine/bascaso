import { describe, it, expect } from "vitest";
import { getTextLayoutLanguage, getEffectiveLayout, drawTextToContext } from "@/lib/screenshot-editor/render/text";
import { DEFAULTS } from "@/lib/screenshot-editor/defaults";
import type { TextSettings } from "@/lib/screenshot-editor/types";

function text(overrides: Partial<TextSettings> = {}): TextSettings {
  return { ...structuredClone(DEFAULTS.text), ...overrides };
}

describe("getTextLayoutLanguage", () => {
  it("prefers currentLayoutLang, then headline lang, then subheadline lang", () => {
    expect(getTextLayoutLanguage(text({ currentLayoutLang: "fr" }))).toBe("fr");
    expect(getTextLayoutLanguage(text({ currentLayoutLang: "", currentHeadlineLang: "de" }))).toBe("de");
    expect(getTextLayoutLanguage(text({
      currentLayoutLang: "", headlineEnabled: false, subheadlineEnabled: true, currentSubheadlineLang: "it",
    }))).toBe("it");
    expect(getTextLayoutLanguage(text({
      currentLayoutLang: "", headlineEnabled: false, subheadlineEnabled: false, currentHeadlineLang: "",
      currentSubheadlineLang: "",
    }))).toBe("en");
  });
});

describe("getEffectiveLayout", () => {
  it("returns flat fields when perLanguageLayout is off", () => {
    expect(getEffectiveLayout(text({ headlineSize: 80, offsetY: 0 }), "fr"))
      .toEqual({ headlineSize: 80, subheadlineSize: 50, position: "top", offsetY: 0, lineHeight: 110 });
  });

  it("returns per-language settings when on, without mutating the doc", () => {
    const t = text({
      perLanguageLayout: true,
      languageSettings: { en: { headlineSize: 90, subheadlineSize: 40, position: "bottom", offsetY: 8, lineHeight: 120 } },
    });
    const before = structuredClone(t);
    expect(getEffectiveLayout(t, "en")).toEqual(before.languageSettings.en);
    // unknown language falls back to the source language's settings
    expect(getEffectiveLayout(t, "ja")).toEqual(before.languageSettings.en);
    expect(t).toEqual(before); // no memoization writes
  });
});

describe("layout fallbacks for legacy docs with missing fields", () => {
  const bare = {
    headlineSize: 0, subheadlineSize: 0, position: undefined,
    offsetY: "12", lineHeight: 0,
  } as unknown as TextSettings;

  it("falls back to the hardcoded defaults when the flat fields are missing", () => {
    expect(getEffectiveLayout(bare, "en"))
      .toEqual({ headlineSize: 100, subheadlineSize: 50, position: "top", offsetY: 12, lineHeight: 110 });
  });

  it("falls back to the hardcoded defaults when no source language settings exist", () => {
    const t = {
      ...bare, perLanguageLayout: true, languageSettings: undefined,
      currentLayoutLang: "", currentHeadlineLang: "", currentSubheadlineLang: "",
    } as unknown as TextSettings;
    expect(getEffectiveLayout(t, "ja"))
      .toEqual({ headlineSize: 100, subheadlineSize: 50, position: "top", offsetY: 12, lineHeight: 110 });
  });

  it("falls back to the flat fields when no source language settings exist", () => {
    const t = {
      perLanguageLayout: true, languageSettings: {},
      currentLayoutLang: "", currentHeadlineLang: "", currentSubheadlineLang: "",
      headlineSize: 80, subheadlineSize: 40, position: "bottom", offsetY: 5, lineHeight: 130,
    } as unknown as TextSettings;
    expect(getEffectiveLayout(t, "ja"))
      .toEqual({ headlineSize: 80, subheadlineSize: 40, position: "bottom", offsetY: 5, lineHeight: 130 });
  });

  it("defaults the layout language to 'en' when every language field is empty", () => {
    expect(getTextLayoutLanguage(text({ currentLayoutLang: "", currentHeadlineLang: "" }))).toBe("en");
    expect(getTextLayoutLanguage(text({
      currentLayoutLang: "", headlineEnabled: false, subheadlineEnabled: true, currentSubheadlineLang: "",
    }))).toBe("en");
  });
});

/** Records every ctx call; measureText = 10px/char. Enough surface for drawTextToContext. */
function recordingCtx() {
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = {
    font: "", fillStyle: "", textAlign: "", textBaseline: "",
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText: (...args: unknown[]) => calls.push({ method: "fillText", args }),
    fillRect: (...args: unknown[]) => calls.push({ method: "fillRect", args }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const dims = { width: 1000, height: 2000 };

describe("drawTextToContext", () => {
  it("draws nothing when headline and subheadline are empty", () => {
    const { ctx, calls } = recordingCtx();
    drawTextToContext(ctx, dims, text());
    expect(calls).toEqual([]);
  });

  it("draws the headline at top offsetY with the composed font string", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({ headlines: { en: "Hello" }, headlineItalic: true });
    drawTextToContext(ctx, dims, t);
    // textY = 2000 * 12/100 = 240; single line at currentY
    expect(calls).toEqual([{ method: "fillText", args: ["Hello", 500, 240] }]);
    expect(ctx.font).toBe("italic 600 100px -apple-system, BlinkMacSystemFont, 'SF Pro Display'");
  });

  it("stacks wrapped headline lines by lineHeight and draws underline + strikethrough", () => {
    const { ctx, calls } = recordingCtx();
    // 84 chars/line max (840px usable = 1000 - 2*80 padding, 10px/char)
    const t = text({
      headlines: { en: "line one\nline two" },
      headlineUnderline: true, headlineStrikethrough: true,
    });
    drawTextToContext(ctx, dims, t);
    const fillTexts = calls.filter((c) => c.method === "fillText");
    expect(fillTexts.map((c) => c.args)).toEqual([
      ["line one", 500, 240],
      ["line two", 500, 240 + 100 * 1.1], // lineHeight 110% of size 100
    ]);
    expect(calls.filter((c) => c.method === "fillRect")).toHaveLength(4); // 2 lines × (underline + strike)
  });

  it("positions from the bottom when position=bottom", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({ headlines: { en: "a\nb" }, position: "bottom", offsetY: 10 });
    drawTextToContext(ctx, dims, t);
    // textY = 2000*(1-0.10) = 1800, two lines → first line shifted up by lineHeight
    const ys = calls.filter((c) => c.method === "fillText").map((c) => c.args[2]);
    expect(ys).toEqual([1800 - 110, 1800]);
  });

  it("draws the subheadline below the headline with rgba color and its own wrapping", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({
      headlines: { en: "Head" },
      subheadlineEnabled: true, subheadlines: { en: "Sub" },
    });
    drawTextToContext(ctx, dims, t);
    const ys = calls.filter((c) => c.method === "fillText").map((c) => c.args);
    // headline at 240; gap = lineHeight - size = 10 → sub starts at 240 + 100 + 10 = 350
    expect(ys).toEqual([["Head", 500, 240], ["Sub", 500, 350]]);
    expect(ctx.fillStyle).toBe("rgba(255, 255, 255, 0.7)");
  });

  it("draws nothing when the headline and subheadline maps are missing", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({ subheadlineEnabled: true });
    drawTextToContext(ctx, dims, {
      ...t, headlines: undefined, subheadlines: undefined,
    } as unknown as TextSettings);
    expect(calls).toEqual([]);
  });

  it("draws the headline alone when the subheadline is enabled but empty for that language", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({
      headlines: { en: "Head" },
      subheadlineEnabled: true, subheadlines: { fr: "Sous-titre" },
    });
    drawTextToContext(ctx, dims, t);
    expect(calls).toEqual([{ method: "fillText", args: ["Head", 500, 240] }]);
  });

  it("resolves empty language codes to 'en' and decorates a bottom-positioned headline", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({
      currentHeadlineLang: "", currentSubheadlineLang: "",
      headlines: { en: "Bottom" }, position: "bottom", offsetY: 10,
      headlineUnderline: true, headlineStrikethrough: true,
    });
    drawTextToContext(ctx, dims, t);
    expect(calls.filter((c) => c.method === "fillText")).toEqual([
      { method: "fillText", args: ["Bottom", 500, 1800] },
    ]);
    // underline at y + size*0.1, strikethrough at y - size*0.4 for the bottom baseline
    expect(calls.filter((c) => c.method === "fillRect").map((c) => c.args[1]))
      .toEqual([1800 + 10, 1800 - 40]);
  });

  it("composes the subheadline font from the headline font when its own fields are missing", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({
      headlineEnabled: false, subheadlineEnabled: true, subheadlines: { en: "Sub" },
      subheadlineItalic: true, subheadlineWeight: "", subheadlineFont: "",
    });
    drawTextToContext(ctx, dims, t);
    expect(ctx.font).toBe("italic 400 50px -apple-system, BlinkMacSystemFont, 'SF Pro Display'");
    expect(calls.filter((c) => c.method === "fillText")).toHaveLength(1);
  });

  it("draws subheadline alone (headline disabled) and bottom-position subheadline decorations", () => {
    const { ctx, calls } = recordingCtx();
    const t = text({
      headlineEnabled: false,
      subheadlineEnabled: true, subheadlines: { en: "Solo" },
      position: "bottom", subheadlineUnderline: true, subheadlineStrikethrough: true,
    });
    drawTextToContext(ctx, dims, t);
    expect(calls.filter((c) => c.method === "fillText")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "fillRect")).toHaveLength(2);
  });
});
