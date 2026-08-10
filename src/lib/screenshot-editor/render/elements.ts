/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type {
  Dimensions,
  EditorElement,
  ElementLayer,
  LaurelVariant,
  RenderAssets,
  RenderEnv,
} from "../types";
import { wrapText } from "./helpers";

type ElementAssets = Pick<RenderAssets, "elementImages" | "laurelImages">;

// Verbatim port of getElementText (app.js:215-223); state.currentLanguage becomes a parameter.
export function getElementText(el: EditorElement, language: string): string {
  if (el.texts) {
    return el.texts[language]
      || el.texts["en"]
      || Object.values(el.texts).find((v) => v)
      || el.text || "";
  }
  return el.text || "";
}

// Verbatim port of drawElementsToContext (app.js:7423-7500). Adaptation: el.image becomes the
// resolved bitmap in assets.elementImages[el.id].
export function drawElementsToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  elements: EditorElement[],
  layer: ElementLayer,
  env: RenderEnv,
  assets: ElementAssets,
): void {
  const filtered = elements.filter((el) => el.layer === layer);
  filtered.forEach((el) => {
    const image = assets.elementImages[el.id];
    context.save();
    context.globalAlpha = el.opacity / 100;

    const cx = dims.width * (el.x / 100);
    const cy = dims.height * (el.y / 100);
    const elWidth = dims.width * (el.width / 100);

    context.translate(cx, cy);
    if (el.rotation !== 0) {
      context.rotate((el.rotation * Math.PI) / 180);
    }

    if (el.type === "emoji" && el.emoji) {
      const emojiSize = elWidth * 0.85;
      context.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(el.emoji, 0, 0);
    } else if (el.type === "icon" && image) {
      // Shadow
      if (el.iconShadow?.enabled) {
        const s = el.iconShadow;
        const hex = s.color || "#000000";
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        context.shadowColor = `rgba(${r},${g},${b},${(s.opacity || 0) / 100})`;
        context.shadowBlur = s.blur || 0;
        context.shadowOffsetX = s.x || 0;
        context.shadowOffsetY = s.y || 0;
      }
      // Icons are square (1:1)
      context.drawImage(image, -elWidth / 2, -elWidth / 2, elWidth, elWidth);
      // Reset shadow
      if (el.iconShadow?.enabled) {
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
      }
    } else if (el.type === "graphic" && image) {
      const aspect = image.height / image.width;
      const elHeight = elWidth * aspect;
      context.drawImage(image, -elWidth / 2, -elHeight / 2, elWidth, elHeight);
    } else if (el.type === "text") {
      const elText = getElementText(el, env.language);
      if (!elText) { context.restore(); return; }
      const fontSize = el.fontSize as number;
      const fontStyle = el.italic ? "italic" : "normal";
      context.font = `${fontStyle} ${el.fontWeight} ${fontSize}px ${el.font}`;
      context.fillStyle = el.fontColor as string;
      context.textAlign = "center";
      context.textBaseline = "middle";

      // Word-wrap text within element width (respects manual line breaks)
      const lines = wrapText(context, elText, elWidth);
      const lineHeight = fontSize * 1.05;
      const totalHeight = (lines.length - 1) * lineHeight + fontSize;

      // Draw frame behind text if enabled
      if (el.frame && el.frame !== "none") {
        drawElementFrame(context, el, dims, totalHeight, env, assets);
      }

      // Draw text lines
      const startY = -(totalHeight / 2) + fontSize / 2;
      lines.forEach((line, i) => {
        context.fillText(line, 0, startY + i * lineHeight);
      });
    }

    context.restore();
  });
}

// Verbatim port of drawElementFrame (app.js:7588-7631). The unused textWidth parameter of the
// original is dropped; env/assets are threaded through for the laurel branch.
function drawElementFrame(
  context: CanvasRenderingContext2D,
  el: EditorElement,
  dims: Dimensions,
  textHeight: number,
  env: RenderEnv,
  assets: ElementAssets,
): void {
  const frame = el.frame as string;
  const fontSize = el.fontSize as number;
  const scale = (el.frameScale as number) / 100;
  const padding = fontSize * 0.4 * scale;
  // Measure the widest line (using wrapText to match rendering)
  const elWidth = dims.width * (el.width / 100);
  const lines = wrapText(context, getElementText(el, env.language), elWidth);
  const maxLineW = Math.max(...lines.map((l) => context.measureText(l).width));
  const frameW = maxLineW + padding * 2;
  const frameH = textHeight + padding * 2;

  context.save();
  context.strokeStyle = el.frameColor as string;
  context.lineWidth = Math.max(2, fontSize * 0.04) * scale;

  const isLaurel = frame.startsWith("laurel-");
  const hasStar = frame.endsWith("-star");

  if (isLaurel) {
    const variant: LaurelVariant = frame.includes("detailed") ? "laurel-detailed-left" : "laurel-simple-left";
    drawLaurelSVG(context, variant, frameW, frameH, scale, el.frameColor as string, env, assets);
    if (hasStar) {
      drawStar(context, 0, -frameH / 2 - fontSize * 0.2 * scale, fontSize * 0.3 * scale, el.frameColor as string);
    }
  } else if (frame === "badge-circle") {
    context.beginPath();
    const radius = Math.max(frameW, frameH) / 2 + padding * 0.5;
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  } else if (frame === "badge-ribbon") {
    const sw = frameW + padding;
    const sh = frameH + padding * 1.5;
    context.beginPath();
    context.moveTo(-sw / 2, -sh / 2);
    context.lineTo(sw / 2, -sh / 2);
    context.lineTo(sw / 2, sh / 2 - padding);
    context.lineTo(0, sh / 2);
    context.lineTo(-sw / 2, sh / 2 - padding);
    context.closePath();
    context.stroke();
  }

  context.restore();
}

// Draw laurel wreath using SVG image — left branch + mirrored right branch.
// Verbatim port of drawLaurelSVG (app.js:7634-7671). Adaptations: the laurelImages global becomes
// assets.laurelImages, document.createElement('canvas') becomes env.createCanvas, and the
// complete/naturalWidth readiness guard becomes a null/size check on the resolved bitmap.
function drawLaurelSVG(
  context: CanvasRenderingContext2D,
  variant: LaurelVariant,
  w: number,
  h: number,
  scale: number,
  color: string,
  env: RenderEnv,
  assets: ElementAssets,
): void {
  const img = assets.laurelImages[variant];
  if (!img || !img.width || !img.height) return;

  // Scale SVG branch to match the frame height
  const branchH = h * 1.1 * scale;
  const aspect = img.width / img.height;
  const branchW = branchH * aspect;

  // The SVG is black fill — use a temp canvas to recolor it
  const tmp = env.createCanvas(Math.ceil(branchW), Math.ceil(branchH));
  const tctx = tmp.getContext("2d") as CanvasRenderingContext2D;

  // Draw the SVG scaled into the temp canvas
  tctx.drawImage(img, 0, 0, branchW, branchH);

  // Recolor: draw color on top using source-in composite
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, branchW, branchH);

  // Position: left branch sits to the left of the text area
  const gap = 2 * scale;
  const leftX = -w / 2 - branchW - gap;
  const topY = -branchH / 2;

  const surface = tmp as unknown as CanvasImageSource;

  // Draw left branch
  context.drawImage(surface, leftX, topY, branchW, branchH);

  // Draw right branch (mirrored horizontally)
  context.save();
  context.scale(-1, 1);
  context.drawImage(surface, leftX, topY, branchW, branchH);
  context.restore();
}

// Draw a 5-point star. Verbatim port of drawStar (app.js:7673-7692).
export function drawStar(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  for (let i = 0; i < 5; i++) {
    const outer = ((i * 2 * Math.PI) / 5) - Math.PI / 2;
    const inner = outer + Math.PI / 5;
    const ox = cx + Math.cos(outer) * size;
    const oy = cy + Math.sin(outer) * size;
    const ix = cx + Math.cos(inner) * size * 0.4;
    const iy = cy + Math.sin(inner) * size * 0.4;
    if (i === 0) context.moveTo(ox, oy);
    else context.lineTo(ox, oy);
    context.lineTo(ix, iy);
  }
  context.closePath();
  context.fill();
  context.restore();
}
