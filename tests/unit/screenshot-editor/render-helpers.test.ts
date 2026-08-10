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

  it("keeps a word longer than maxWidth on its own line", () => {
    expect(wrapText(fakeCtx, "aaaaaaaaaaaa bb", 60)).toEqual(["aaaaaaaaaaaa", "bb"]);
  });

  it("respects manual line breaks, including empty lines", () => {
    expect(wrapText(fakeCtx, "one\n\ntwo", 500)).toEqual(["one", "", "two"]);
    expect(wrapText(fakeCtx, "a\r\nb", 500)).toEqual(["a", "b"]);
  });

  it("coerces non-string input like the original", () => {
    expect(wrapText(fakeCtx, 42 as unknown as string, 500)).toEqual(["42"]);
  });
});
