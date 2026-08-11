import { describe, it, expect } from "vitest";
import {
  ASC_MAX_SCREENSHOTS_PER_SET, workingFormats, buildExportPlan, exportFileName, zipFileName,
  zipPartName,
} from "@/lib/screenshot-editor/export";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import { editorReducer } from "@/lib/screenshot-editor/reducer";

// The empty doc already works on two formats (iPhone 6.5" + iPad 11"), so only the language is added.
function multiDoc() {
  return editorReducer(createEmptyDoc(), { type: "add-language", language: "fr-FR" });
}

describe("workingFormats", () => {
  it("reads the list, falling back to the current format when it is absent", () => {
    expect(workingFormats(createEmptyDoc())).toEqual(["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"]);
    expect(workingFormats({ ...createEmptyDoc(), outputDevices: undefined })).toEqual(["APP_IPHONE_65"]);
  });
});

describe("buildExportPlan", () => {
  it("current × current is one untranslated job", () => {
    expect(buildExportPlan(createEmptyDoc(), { languages: "current", formats: "current" })).toEqual([
      { language: "en-US", format: "APP_IPHONE_65", translated: false },
    ]);
  });

  it("working × working is the cartesian product", () => {
    const plan = buildExportPlan(multiDoc(), { languages: "working", formats: "working" });
    expect(plan).toHaveLength(4);
    expect(plan.map((j) => `${j.language}:${j.format}`)).toEqual([
      "en-US:APP_IPHONE_65", "en-US:APP_IPAD_PRO_3GEN_11",
      "fr-FR:APP_IPHONE_65", "fr-FR:APP_IPAD_PRO_3GEN_11",
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
      .toBe("screenshots_en-US_APP_IPHONE_65.zip");
    expect(zipFileName({ languages: "working", formats: "working" }, multiDoc()))
      .toBe("screenshots_all-languages_all-formats.zip");
    expect(ASC_MAX_SCREENSHOTS_PER_SET).toBe(10);
  });

  // A run past MAX_ZIP_FILES ships several archives; a run under it keeps the plain name.
  it("numbers the parts of a split zip only when there is more than one", () => {
    expect(zipPartName("screenshots_all-languages_all-formats.zip", 0, 1))
      .toBe("screenshots_all-languages_all-formats.zip");
    expect(zipPartName("screenshots_all-languages_all-formats.zip", 0, 3))
      .toBe("screenshots_all-languages_all-formats-1.zip");
    expect(zipPartName("screenshots_all-languages_all-formats.zip", 2, 3))
      .toBe("screenshots_all-languages_all-formats-3.zip");
  });
});
