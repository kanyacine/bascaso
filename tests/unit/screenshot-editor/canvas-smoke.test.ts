import { describe, it, expect } from "vitest";
import { makeCanvas, px } from "./helpers";

describe("test canvas toolchain", () => {
  it("rasterizes a filled rect deterministically", () => {
    const { ctx } = makeCanvas(10, 10);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 10, 10);
    expect(px(ctx, 5, 5)).toEqual([255, 0, 0, 255]);
  });
});
