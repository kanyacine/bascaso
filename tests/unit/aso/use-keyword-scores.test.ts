import { describe, expect, it } from "vitest";
import {
  normalizedKeywordsKey,
  pendingQueue,
} from "@/lib/hooks/use-keyword-scores";
import type { TagScore } from "@/components/keyword-tag-input";

const done: TagScore = {
  status: "done",
  opportunity: 50,
  popularity: 40,
  difficulty: 30,
  classification: "Moderate",
};

describe("normalizedKeywordsKey", () => {
  it("normalizes, dedupes and sorts", () => {
    expect(normalizedKeywordsKey([" Fitness ", "yoga", "FITNESS"])).toBe(
      normalizedKeywordsKey(["yoga", "fitness"]),
    );
  });

  it("drops empty entries", () => {
    expect(normalizedKeywordsKey(["", "  ", "yoga"])).toBe("yoga");
  });

  it("keeps multi-word keywords intact through a key round-trip", () => {
    const key = normalizedKeywordsKey(["meditation timer", "yoga"]);
    expect(pendingQueue(key, () => undefined)).toEqual([
      "meditation timer",
      "yoga",
    ]);
  });

  it("collapses NFC/NFD forms of the same keyword", () => {
    expect(normalizedKeywordsKey(["caf\u00e9", "cafe\u0301"])).toBe("caf\u00e9");
  });
});

describe("pendingQueue", () => {
  it("returns nothing for an empty key", () => {
    expect(pendingQueue("", () => done)).toEqual([]);
  });

  it("queues unscored keywords and ones a cancelled run left loading", () => {
    const scores: Record<string, TagScore> = {
      scored: done,
      failed: { status: "error" },
      stuck: { status: "loading" },
    };
    const key = normalizedKeywordsKey(["scored", "failed", "stuck", "new"]);
    expect(pendingQueue(key, (kw) => scores[kw])).toEqual(["new", "stuck"]);
  });
});
