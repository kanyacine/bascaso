import { describe, it, expect } from "vitest";

import {
  splitMetaWords,
  buildForbiddenKeywords,
} from "@/lib/asc/keyword-utils";

describe("splitMetaWords", () => {
  it("splits normal text into lowercase words", () => {
    const result = splitMetaWords("Hello World Foo");
    expect(result).toEqual(new Set(["hello", "world", "foo"]));
  });

  it("splits on hyphens and en dashes", () => {
    const result = splitMetaWords("multi-word app–name");
    expect(result).toEqual(new Set(["multi", "word", "app", "name"]));
  });

  it("splits on slashes, ampersands, and commas", () => {
    const result = splitMetaWords("photo/video & edit,share");
    expect(result).toEqual(new Set(["photo", "video", "edit", "share"]));
  });

  it("returns empty set for empty string", () => {
    const result = splitMetaWords("");
    expect(result).toEqual(new Set());
  });

  it("filters out single-character words", () => {
    const result = splitMetaWords("a big B app");
    expect(result).toEqual(new Set(["big", "app"]));
  });

  it("handles mixed separators", () => {
    const result = splitMetaWords("one-two/three & four, five");
    expect(result).toEqual(new Set(["one", "two", "three", "four", "five"]));
  });
});

describe("buildForbiddenKeywords", () => {
  it("returns words from appName only", () => {
    const result = buildForbiddenKeywords({ appName: "My Cool App" });
    expect(result.sort()).toEqual(["app", "cool", "my"]);
  });

  it("includes words from subtitle", () => {
    const result = buildForbiddenKeywords({
      appName: "Cool App",
      subtitle: "Best Tool",
    });
    expect(result.sort()).toEqual(["app", "best", "cool", "tool"]);
  });

  it("includes keywords from otherLocaleKeywords as array", () => {
    const result = buildForbiddenKeywords({
      otherLocaleKeywords: ["photo,camera", "edit,filter"],
    });
    expect(result.sort()).toEqual(["camera", "edit", "filter", "photo"]);
  });

  it("includes keywords from otherLocaleKeywords as Record", () => {
    const result = buildForbiddenKeywords({
      otherLocaleKeywords: {
        "en-US": "photo,camera",
        "de-DE": "foto,kamera",
      },
    });
    expect(result.sort()).toEqual(["camera", "foto", "kamera", "photo"]);
  });

  it("combines all sources and deduplicates", () => {
    const result = buildForbiddenKeywords({
      appName: "Photo App",
      subtitle: "Best Camera",
      otherLocaleKeywords: ["photo,edit"],
    });
    expect(result.sort()).toEqual([
      "app",
      "best",
      "camera",
      "edit",
      "photo",
    ]);
  });

  it("returns empty array for empty opts", () => {
    const result = buildForbiddenKeywords({});
    expect(result).toEqual([]);
  });

  it("trims and lowercases other locale keywords", () => {
    const result = buildForbiddenKeywords({
      otherLocaleKeywords: [" Photo , Camera "],
    });
    expect(result.sort()).toEqual(["camera", "photo"]);
  });

  it("skips empty keyword entries from commas", () => {
    const result = buildForbiddenKeywords({
      otherLocaleKeywords: [",,photo,,"],
    });
    expect(result).toEqual(["photo"]);
  });
});
