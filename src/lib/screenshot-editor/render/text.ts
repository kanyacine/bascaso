/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type { Dimensions, LanguageLayout, TextSettings } from "../types";
import { hexToRgba, wrapText } from "./helpers";

// Verbatim port of getTextLayoutLanguage (app.js:141-146).
export function getTextLayoutLanguage(text: TextSettings): string {
  if (text.currentLayoutLang) return text.currentLayoutLang;
  if (text.headlineEnabled !== false) return text.currentHeadlineLang || "en";
  if (text.subheadlineEnabled) return text.currentSubheadlineLang || "en";
  return text.currentHeadlineLang || text.currentSubheadlineLang || "en";
}

// Port of getEffectiveLayout (app.js:164-175) with getTextLanguageSettings (app.js:148-161)
// inlined. Adaptation: the original memoizes by writing the computed layout back into
// text.languageSettings; rendering must not mutate the doc, so the same fallback chain is
// computed read-only.
export function getEffectiveLayout(text: TextSettings, lang: string): LanguageLayout {
  if (!text.perLanguageLayout) {
    return {
      headlineSize: text.headlineSize || 100,
      subheadlineSize: text.subheadlineSize || 50,
      position: text.position || "top",
      offsetY: typeof text.offsetY === "number" ? text.offsetY : 12,
      lineHeight: text.lineHeight || 110,
    };
  }

  const existing = text.languageSettings?.[lang];
  if (existing) return existing;

  const sourceLang = text.currentLayoutLang || text.currentHeadlineLang || text.currentSubheadlineLang || "en";
  const sourceSettings = text.languageSettings?.[sourceLang];
  return {
    headlineSize: sourceSettings ? sourceSettings.headlineSize : (text.headlineSize || 100),
    subheadlineSize: sourceSettings ? sourceSettings.subheadlineSize : (text.subheadlineSize || 50),
    position: sourceSettings ? sourceSettings.position : (text.position || "top"),
    offsetY: sourceSettings ? sourceSettings.offsetY : (typeof text.offsetY === "number" ? text.offsetY : 12),
    lineHeight: sourceSettings ? sourceSettings.lineHeight : (text.lineHeight || 110),
  };
}

// Verbatim port of drawTextToContext (app.js:7286-7420).
export function drawTextToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  txt: TextSettings,
): void {
  // Check enabled states (default headline to true for backwards compatibility)
  const headlineEnabled = txt.headlineEnabled !== false;
  const subheadlineEnabled = txt.subheadlineEnabled || false;

  const headlineLang = txt.currentHeadlineLang || "en";
  const subheadlineLang = txt.currentSubheadlineLang || "en";
  const layoutLang = getTextLayoutLanguage(txt);
  const headlineLayout = getEffectiveLayout(txt, headlineLang);
  const subheadlineLayout = getEffectiveLayout(txt, subheadlineLang);
  const layoutSettings = getEffectiveLayout(txt, layoutLang);

  const headline = headlineEnabled && txt.headlines ? (txt.headlines[headlineLang] || "") : "";
  const subheadline = subheadlineEnabled && txt.subheadlines ? (txt.subheadlines[subheadlineLang] || "") : "";

  if (!headline && !subheadline) return;

  const padding = dims.width * 0.08;
  const textY = layoutSettings.position === "top"
    ? dims.height * (layoutSettings.offsetY / 100)
    : dims.height * (1 - layoutSettings.offsetY / 100);

  context.textAlign = "center";
  context.textBaseline = layoutSettings.position === "top" ? "top" : "bottom";

  let currentY = textY;

  // Draw headline
  if (headline) {
    const fontStyle = txt.headlineItalic ? "italic" : "normal";
    context.font = `${fontStyle} ${txt.headlineWeight} ${headlineLayout.headlineSize}px ${txt.headlineFont}`;
    context.fillStyle = txt.headlineColor;

    const lines = wrapText(context, headline, dims.width - padding * 2);
    const lineHeight = headlineLayout.headlineSize * (layoutSettings.lineHeight / 100);

    // For bottom positioning, offset currentY so lines draw correctly
    if (layoutSettings.position === "bottom") {
      currentY -= (lines.length - 1) * lineHeight;
    }

    let lastLineY = currentY;
    lines.forEach((line, i) => {
      const y = currentY + i * lineHeight;
      lastLineY = y;
      context.fillText(line, dims.width / 2, y);

      // Calculate text metrics for decorations
      const textWidth = context.measureText(line).width;
      const fontSize = headlineLayout.headlineSize;
      const lineThickness = Math.max(2, fontSize * 0.05);
      const x = dims.width / 2 - textWidth / 2;

      // Draw underline
      if (txt.headlineUnderline) {
        const underlineY = layoutSettings.position === "top"
          ? y + fontSize * 0.9
          : y + fontSize * 0.1;
        context.fillRect(x, underlineY, textWidth, lineThickness);
      }

      // Draw strikethrough
      if (txt.headlineStrikethrough) {
        const strikeY = layoutSettings.position === "top"
          ? y + fontSize * 0.4
          : y - fontSize * 0.4;
        context.fillRect(x, strikeY, textWidth, lineThickness);
      }
    });

    // Track where subheadline should start (below the bottom edge of headline)
    // The gap between headline and subheadline should be (lineHeight - fontSize)
    // This is the "extra" spacing beyond the text itself
    const gap = lineHeight - headlineLayout.headlineSize;
    if (layoutSettings.position === "top") {
      // For top: lastLineY is top of last line, add fontSize to get bottom, then add gap
      currentY = lastLineY + headlineLayout.headlineSize + gap;
    } else {
      // For bottom: lastLineY is already the bottom of last line, just add gap
      currentY = lastLineY + gap;
    }
  }

  // Draw subheadline (always below headline visually)
  if (subheadline) {
    const subFontStyle = txt.subheadlineItalic ? "italic" : "normal";
    const subWeight = txt.subheadlineWeight || "400";
    context.font = `${subFontStyle} ${subWeight} ${subheadlineLayout.subheadlineSize}px ${txt.subheadlineFont || txt.headlineFont}`;
    context.fillStyle = hexToRgba(txt.subheadlineColor, txt.subheadlineOpacity / 100);

    const lines = wrapText(context, subheadline, dims.width - padding * 2);
    const subLineHeight = subheadlineLayout.subheadlineSize * 1.4;

    // Subheadline starts after headline with gap determined by headline lineHeight
    // For bottom position, switch to 'top' baseline so subheadline draws downward
    const subY = currentY;
    if (layoutSettings.position === "bottom") {
      context.textBaseline = "top";
    }

    lines.forEach((line, i) => {
      const y = subY + i * subLineHeight;
      context.fillText(line, dims.width / 2, y);

      // Calculate text metrics for decorations
      const textWidth = context.measureText(line).width;
      const fontSize = subheadlineLayout.subheadlineSize;
      const lineThickness = Math.max(2, fontSize * 0.05);
      const x = dims.width / 2 - textWidth / 2;

      // Draw underline (using 'top' baseline for subheadline)
      if (txt.subheadlineUnderline) {
        const underlineY = y + fontSize * 0.9;
        context.fillRect(x, underlineY, textWidth, lineThickness);
      }

      // Draw strikethrough
      if (txt.subheadlineStrikethrough) {
        const strikeY = y + fontSize * 0.4;
        context.fillRect(x, strikeY, textWidth, lineThickness);
      }
    });

    // Restore baseline if we changed it
    if (layoutSettings.position === "bottom") {
      context.textBaseline = "bottom";
    }
  }
}
