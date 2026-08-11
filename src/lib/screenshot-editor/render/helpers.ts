/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */

// Verbatim port of roundRect (app.js:8027-8038). Appends to the current path – the caller
// owns beginPath()/fill()/clip().
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Break one word that is wider than the line on its own, character by character.
 *
 * appscreen never did this: a space-less string just overflowed the canvas. That is fine for
 * English and fatal here – ja and zh headlines carry no spaces at all, so the whole headline
 * is one "word" and used to render as a single line running off both edges.
 * ponytail: splits on code points, not grapheme clusters. Emoji with modifiers can break
 * mid-sequence; `Intl.Segmenter` with granularity "grapheme" is the upgrade if that shows up.
 */
function breakLongWord(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  word: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return [word]; // no room to break into – overflow rather than one char a line
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    if (piece && ctx.measureText(piece + char).width > maxWidth) {
      pieces.push(piece);
      piece = "";
    }
    piece += char;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

// Port of wrapText (app.js:8040-8072), plus the long-word break above.
export function wrapText(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const rawLines = String(text).split(/\r?\n/);

  rawLines.forEach((rawLine) => {
    if (rawLine === "") {
      lines.push("");
      return;
    }

    const words = rawLine.split(" ");
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine + (currentLine ? " " : "") + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }

      // The word alone still overflows: cut it up and carry the tail into the next word.
      if (ctx.measureText(currentLine).width > maxWidth) {
        const pieces = breakLongWord(ctx, currentLine, maxWidth);
        lines.push(...pieces.slice(0, -1));
        currentLine = pieces[pieces.length - 1] ?? "";
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }
  });

  return lines;
}

// Verbatim port of hexToRgba (app.js:8074-8079).
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
