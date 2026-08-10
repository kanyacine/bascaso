import { describe, it, expect } from "vitest";
import {
  ASC_MAX_SCREENSHOTS_PER_SET, workingFormats, buildExportPlan, exportFileName, zipFileName,
} from "@/lib/screenshot-editor/export";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import { editorReducer } from "@/lib/screenshot-editor/reducer";

function multiDoc() {
  let doc = createEmptyDoc();
  doc = editorReducer(doc, { type: "add-language", language: "fr-FR" });
  doc = editorReducer(doc, { type: "toggle-output-device", device: "APP_IPHONE_65" });
  return doc;
}

describe("workingFormats", () => {
  it("defaults to the single current format and reads the list otherwise", () => {
    expect(workingFormats(createEmptyDoc())).toEqual(["APP_IPHONE_67"]);
    expect(workingFormats(multiDoc())).toEqual(["APP_IPHONE_67", "APP_IPHONE_65"]);
  });
});

describe("buildExportPlan", () => {
  it("current × current is one untranslated job", () => {
    expect(buildExportPlan(createEmptyDoc(), { languages: "current", formats: "current" })).toEqual([
      { language: "en-US", format: "APP_IPHONE_67", translated: false },
    ]);
  });

  it("working × working is the cartesian product", () => {
    const plan = buildExportPlan(multiDoc(), { languages: "working", formats: "working" });
    expect(plan).toHaveLength(4);
    expect(plan.map((j) => `${j.language}:${j.format}`)).toEqual([
      "en-US:APP_IPHONE_67", "en-US:APP_IPHONE_65", "fr-FR:APP_IPHONE_67", "fr-FR:APP_IPHONE_65",
    ]);
    expect(plan.every((j) => !j.translated)).toBe(true);
  });

  it("working-plus-listing appends only listing locales missing from the project, flagged translated", () => {
    const plan = buildExportPlan(multiDoc(), {
      languages: "working-plus-listing", formats: "current",
      listingLocales: ["en-US", "de-DE", "fr-FR", "ja"],
    });
    expect(plan.map((j) => [j.language, j.translated])).toEqual([
      ["en-US", false], ["fr-FR", false], ["de-DE", true], ["ja", true],
    ]);
  });

  it("working-plus-listing without listing locales is just the working languages", () => {
    const plan = buildExportPlan(multiDoc(), { languages: "working-plus-listing", formats: "current" });
    expect(plan.map((j) => j.language)).toEqual(["en-US", "fr-FR"]);
  });
});

describe("file names", () => {
  it("builds lang/format/index paths and zip names", () => {
    expect(exportFileName("fr-FR", "APP_IPHONE_67", 0)).toBe("fr-FR/APP_IPHONE_67/1.png");
    expect(zipFileName({ languages: "current", formats: "current" }, createEmptyDoc()))
      .toBe("screenshots_en-US_APP_IPHONE_67.zip");
    expect(zipFileName({ languages: "working", formats: "working" }, multiDoc()))
      .toBe("screenshots_all-languages_all-formats.zip");
    expect(ASC_MAX_SCREENSHOTS_PER_SET).toBe(10);
  });
});
