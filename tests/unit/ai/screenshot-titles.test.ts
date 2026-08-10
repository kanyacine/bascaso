import { describe, it, expect } from "vitest";
import { parseScreenshotTitles } from "@/lib/ai/screenshot-titles";

describe("parseScreenshotTitles", () => {
  it("parses the schema shape, with or without fences", () => {
    const json = '{"titles":[{"headline":"Track It","subheadline":"Every expense, sorted"}]}';
    expect(parseScreenshotTitles(json)).toEqual([{ headline: "Track It", subheadline: "Every expense, sorted" }]);
    expect(parseScreenshotTitles("```json\n" + json + "\n```")).toHaveLength(1);
    expect(parseScreenshotTitles("Sure! Here you go:\n" + json)).toHaveLength(1);
  });

  it("accepts the appscreen record shape keyed by index", () => {
    const record = '{"0":{"headline":"A","subheadline":"a"},"1":{"headline":"B","subheadline":"b"}}';
    expect(parseScreenshotTitles(record)).toEqual([
      { headline: "A", subheadline: "a" },
      { headline: "B", subheadline: "b" },
    ]);
  });

  it("drops non-numeric keys from the record shape", () => {
    const record = '{"0":{"headline":"A","subheadline":"a"},"note":{"headline":"B","subheadline":"b"}}';
    expect(parseScreenshotTitles(record)).toEqual([{ headline: "A", subheadline: "a" }]);
  });

  it("returns null on garbage", () => {
    expect(parseScreenshotTitles("no json here")).toBeNull();
    expect(parseScreenshotTitles('{"titles": "nope"}')).toBeNull();
    expect(parseScreenshotTitles("{not json at all")).toBeNull();
    expect(parseScreenshotTitles("{ broken: }")).toBeNull();
  });
});
