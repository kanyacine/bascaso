import { describe, it, expect } from "vitest";
import { hexToRgba, roundRect, wrapText } from "@/lib/screenshot-editor/render/helpers";
import { makeCanvas, px } from "./helpers";

describe("hexToRgba", () => {
  it("converts hex + alpha to rgba()", () => {
    expect(hexToRgba("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(hexToRgba("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("roundRect", () => {
  it("builds a path that clips the corners", () => {
    const { ctx } = makeCanvas(40, 40);
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    roundRect(ctx, 0, 0, 40, 40, 12);
    ctx.fill();
    expect(px(ctx, 1, 1)[3]).toBe(0); // corner clipped
    expect(px(ctx, 20, 20)).toEqual([255, 0, 0, 255]); // center filled
    expect(px(ctx, 20, 1)[3]).toBe(255); // edge midpoint filled
  });
});

describe("wrapText", () => {
  // Fake context: every char is 10px wide — font-independent, fully deterministic.
  const fakeCtx = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as
    Pick<CanvasRenderingContext2D, "measureText">;

  it("wraps on word boundaries at maxWidth", () => {
    expect(wrapText(fakeCtx, "aaa bbb ccc", 80)).toEqual(["aaa bbb", "ccc"]);
  });

  // appscreen let a too-long word overflow the canvas; this product translates into ja/zh,
  // where a whole headline is one space-less "word".
  it("breaks a word wider than the line instead of overflowing", () => {
    expect(wrapText(fakeCtx, "aaaaaaaaaaaa bb", 60)).toEqual(["aaaaaa", "aaaaaa", "bb"]);
    expect(wrapText(fakeCtx, "支出をすべて記録", 40)).toEqual(["支出をす", "べて記録"]);
  });

  it("never emits an empty piece when a single character is wider than the line", () => {
    expect(wrapText(fakeCtx, "abc", 5)).toEqual(["a", "b", "c"]);
  });

  it("respects manual line breaks, including empty lines", () => {
    expect(wrapText(fakeCtx, "one\n\ntwo", 500)).toEqual(["one", "", "two"]);
    expect(wrapText(fakeCtx, "a\r\nb", 500)).toEqual(["a", "b"]);
  });

  it("coerces non-string input like the original", () => {
    expect(wrapText(fakeCtx, 42 as unknown as string, 500)).toEqual(["42"]);
  });

  it("drops a trailing empty word instead of emitting a blank line", () => {
    // "a " splits into ["a", ""]; the empty word overflows and leaves currentLine empty
    expect(wrapText(fakeCtx, "a ", 5)).toEqual(["a"]);
  });
});
