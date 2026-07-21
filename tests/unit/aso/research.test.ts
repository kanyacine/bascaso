import { describe, it, expect } from "vitest";
import {
  parseResearchInput,
  mergeKeywords,
  appendKeywordToField,
  compareResearchRows,
  type ResearchRow,
} from "@/lib/aso/research";
import type { TagScore } from "@/components/keyword-tag-input";

/** Builds a "done" TagScore with sensible defaults, overridable per field. */
function doneScore(overrides: Partial<Extract<TagScore, { status: "done" }>> = {}): TagScore {
  return {
    status: "done",
    opportunity: 50,
    popularity: 50,
    difficulty: 50,
    classification: "Moderate",
    ...overrides,
  };
}

function row(keyword: string, score?: TagScore): ResearchRow {
  return { keyword, score };
}

describe("parseResearchInput", () => {
  it("splits on commas and newlines, trimming and normalizing each piece", () => {
    const input = " Fitness App ,Yoga\n MEDITATION \n,  , running\n";
    expect(parseResearchInput(input)).toEqual([
      "fitness app",
      "yoga",
      "meditation",
      "running",
    ]);
  });

  it("dedups case/space-insensitively, keeping first occurrence order", () => {
    const input = "Yoga, YOGA , meditation,Yoga";
    expect(parseResearchInput(input)).toEqual(["yoga", "meditation"]);
  });

  it("drops keywords longer than 100 characters", () => {
    const tooLong = "a".repeat(101);
    expect(parseResearchInput(`${tooLong},short`)).toEqual(["short"]);
  });

  it("keeps a keyword that is exactly 100 characters", () => {
    const maxLength = "a".repeat(100);
    expect(parseResearchInput(`${maxLength},short`)).toEqual([maxLength, "short"]);
  });

  it("returns an empty array when there is nothing usable", () => {
    expect(parseResearchInput("")).toEqual([]);
    expect(parseResearchInput(",,\n\n,  ,")).toEqual([]);
  });
});

describe("mergeKeywords", () => {
  it("appends only added keywords absent from existing, preserving order", () => {
    const existing = ["fitness", "yoga"];
    const added = ["yoga", "running", "fitness", "meditation"];
    expect(mergeKeywords(existing, added)).toEqual([
      "fitness",
      "yoga",
      "running",
      "meditation",
    ]);
  });

  it("returns added as-is when existing is empty", () => {
    expect(mergeKeywords([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns existing unchanged when added is empty", () => {
    expect(mergeKeywords(["a"], [])).toEqual(["a"]);
  });
});

describe("appendKeywordToField", () => {
  it("returns the keyword alone when the field is empty", () => {
    expect(appendKeywordToField("", "yoga")).toBe("yoga");
  });

  it("appends with a comma separator to a non-empty field", () => {
    expect(appendKeywordToField("fitness,yoga", "running")).toBe(
      "fitness,yoga,running",
    );
  });

  it("returns null when the keyword is already present, case/space-insensitively", () => {
    expect(appendKeywordToField("fitness, Yoga ,run", "YOGA")).toBeNull();
  });

  it("returns null when appending would exceed 100 characters", () => {
    const field = "a".repeat(90);
    const keyword = "b".repeat(10); // 90 + 1 (comma) + 10 = 101
    expect(appendKeywordToField(field, keyword)).toBeNull();
  });

  it("accepts an append that lands at exactly 100 characters", () => {
    const field = "a".repeat(90);
    const keyword = "b".repeat(9); // 90 + 1 (comma) + 9 = 100
    const result = appendKeywordToField(field, keyword);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(100);
  });
});

describe("compareResearchRows", () => {
  describe("keyword column", () => {
    it("sorts alphabetically ascending", () => {
      const rows = [row("cherry"), row("apple"), row("banana")];
      rows.sort(compareResearchRows("keyword", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["apple", "banana", "cherry"]);
    });

    it("sorts alphabetically descending", () => {
      const rows = [row("cherry"), row("apple"), row("banana")];
      rows.sort(compareResearchRows("keyword", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["cherry", "banana", "apple"]);
    });
  });

  describe("opportunity column", () => {
    it("sorts ascending with missing-value rows pushed to the end, alphabetically", () => {
      const rows = [
        row("b", doneScore({ opportunity: 80 })),
        row("a", doneScore({ opportunity: 20 })),
        row("e", { status: "error" }),
        row("d"),
        row("c", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("opportunity", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("sorts descending with missing-value rows still pushed to the end", () => {
      const rows = [
        row("b", doneScore({ opportunity: 80 })),
        row("a", doneScore({ opportunity: 20 })),
        row("e", { status: "error" }),
        row("d"),
        row("c", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("opportunity", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["b", "a", "c", "d", "e"]);
    });
  });

  describe("difficulty column", () => {
    it("sorts ascending and descending", () => {
      const rows = [
        row("y", doneScore({ difficulty: 70 })),
        row("x", doneScore({ difficulty: 10 })),
        row("z", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("difficulty", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["x", "y", "z"]);

      rows.sort(compareResearchRows("difficulty", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["y", "x", "z"]);
    });
  });

  describe("popularity column", () => {
    it("treats a null popularity (even on a done row) as missing", () => {
      const rows = [
        row("p3", doneScore({ popularity: 50 })),
        row("p1", doneScore({ popularity: 10 })),
        row("p2", doneScore({ popularity: null })),
      ];
      rows.sort(compareResearchRows("popularity", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["p1", "p3", "p2"]);

      rows.sort(compareResearchRows("popularity", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["p3", "p1", "p2"]);
    });
  });

  describe("rank column", () => {
    it("ranks 1 (best) first in ascending order, undefined/null treated as missing", () => {
      const rows = [
        row("r3", doneScore({ rank: 5 })),
        row("r1", doneScore({ rank: 1 })),
        row("r2", doneScore({ rank: undefined })),
        row("r4", doneScore({ rank: null })),
      ];
      rows.sort(compareResearchRows("rank", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["r1", "r3", "r2", "r4"]);
    });

    it("still pushes missing ranks to the end in descending order", () => {
      const rows = [
        row("r3", doneScore({ rank: 5 })),
        row("r1", doneScore({ rank: 1 })),
        row("r2", doneScore({ rank: undefined })),
        row("r4", doneScore({ rank: null })),
      ];
      rows.sort(compareResearchRows("rank", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["r3", "r1", "r2", "r4"]);
    });
  });

  describe("pairwise comparator behavior", () => {
    it("always orders a valued row before a valueless row, in either direction", () => {
      const withValue = row("z", doneScore({ opportunity: 10 }));
      const withoutValue = row("a", { status: "loading" });

      expect(
        compareResearchRows("opportunity", "asc")(withoutValue, withValue),
      ).toBeGreaterThan(0);
      expect(
        compareResearchRows("opportunity", "asc")(withValue, withoutValue),
      ).toBeLessThan(0);
      expect(
        compareResearchRows("opportunity", "desc")(withoutValue, withValue),
      ).toBeGreaterThan(0);
      expect(
        compareResearchRows("opportunity", "desc")(withValue, withoutValue),
      ).toBeLessThan(0);
    });

    it("breaks ties on equal values alphabetically ascending, regardless of direction", () => {
      const beta = row("beta", doneScore({ opportunity: 50 }));
      const alpha = row("alpha", doneScore({ opportunity: 50 }));

      expect(compareResearchRows("opportunity", "asc")(beta, alpha)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "asc")(alpha, beta)).toBeLessThan(0);
      expect(compareResearchRows("opportunity", "desc")(beta, alpha)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "desc")(alpha, beta)).toBeLessThan(0);
    });

    it("breaks ties between two valueless rows alphabetically ascending", () => {
      const b = row("b", { status: "loading" });
      const a = row("a", undefined);

      expect(compareResearchRows("opportunity", "asc")(b, a)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "desc")(b, a)).toBeGreaterThan(0);
    });
  });
});
