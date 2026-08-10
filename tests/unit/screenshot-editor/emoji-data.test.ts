import { describe, it, expect } from "vitest";
import { EMOJI_CATEGORIES, allEmoji, searchEmoji } from "@/lib/screenshot-editor/emoji-data";

describe("emoji data", () => {
  it("ports the eight appscreen categories with their sizes", () => {
    const sizes = Object.fromEntries(EMOJI_CATEGORIES.map((c) => [c.key, c.entries.length]));
    expect(sizes).toEqual({
      popular: 32, smileys: 30, objects: 39, symbols: 44,
      animals: 30, food: 26, travel: 33, flags: 39,
    });
  });

  it("allEmoji dedupes across categories, popular first", () => {
    const all = allEmoji();
    expect(all.length).toBeLessThanOrEqual(273); // dedupe never grows the list
    expect(new Set(all.map((e) => e.emoji)).size).toBe(all.length); // the real invariant
    expect(all[0]).toEqual(EMOJI_CATEGORIES[0].entries[0]);
  });

  it("searchEmoji matches names and keywords, case-insensitive, deduped", () => {
    const byName = searchEmoji("Star");
    expect(byName.some((e) => e.emoji === "⭐")).toBe(true);
    expect(new Set(byName.map((e) => e.emoji)).size).toBe(byName.length);
    expect(searchEmoji("zzznothing")).toEqual([]);
    expect(searchEmoji("")).toEqual(allEmoji());
  });
});
