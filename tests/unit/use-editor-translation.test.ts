import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkBatchItems, runTranslationBatches } from "@/lib/hooks/use-editor-translation";
import { MAX_BATCH_CHARS, MAX_BATCH_ITEMS } from "@/lib/ai/tasks";
import type { TranslatableItem } from "@/lib/screenshot-editor/languages";

// The React part of the hook is three useState calls; the part that can be wrong is the
// per-language batching, and that is pure. Same shape as the sibling use-ai-routing test.
describe("runTranslationBatches", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const items: TranslatableItem[] = [
    { kind: "headline", index: 0, text: "Track every expense" },
    { kind: "subheadline", index: 0, text: "Automatic categories" },
    { kind: "element", index: 1, elementId: "el-7", text: "Free forever" },
  ];

  /** A batch response echoing back the ids it was given, translated by suffixing. */
  function batchOk(tier = "byok") {
    return async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({
        tier,
        results: body.items.map((i: { id: string; text: string }) => ({
          id: i.id, value: `${i.text} (${body.toLocale})`,
        })),
      }));
    };
  }

  function run(targets: string[], signal?: AbortSignal) {
    return runTranslationBatches({
      items, sourceLanguage: "en-US", targetLanguages: targets,
      appName: "Weatherly", actionId: "action-1", signal,
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
  });

  // The reason this hook was rewritten: 3 items × 2 locales used to be 6 calls, and a real
  // gesture (40 items × 38 locales) blew through the managed backend's per-action cap.
  it("makes exactly one call per target language", async () => {
    fetchMock.mockImplementation(batchOk());

    const result = await run(["de-DE", "fr-FR"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.entries).toHaveLength(6);
  });

  it("sends every item of the gesture in each call, under one action id", async () => {
    fetchMock.mockImplementation(batchOk());

    await run(["de-DE", "fr-FR"]);

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.actionId)).toEqual(["action-1", "action-1"]);
    expect(bodies.map((b) => b.toLocale)).toEqual(["de-DE", "fr-FR"]);
    for (const body of bodies) {
      expect(body.action).toBe("translate");
      expect(body.fromLocale).toBe("en-US");
      expect(body.items).toEqual([
        { id: "0", kind: "headline", text: "Track every expense" },
        { id: "1", kind: "subheadline", text: "Automatic categories" },
        { id: "2", kind: "element", text: "Free forever" },
      ]);
    }
  });

  // The ids are positional and mean nothing to the editor: what it applies is the
  // (kind, index, elementId) triple the item came from.
  it("zips results back onto the items they came from", async () => {
    fetchMock.mockImplementation(batchOk());

    const result = await run(["fr-FR"]);

    expect(result?.entries).toEqual([
      { kind: "headline", index: 0, elementId: undefined, language: "fr-FR", value: "Track every expense (fr-FR)" },
      { kind: "subheadline", index: 0, elementId: undefined, language: "fr-FR", value: "Automatic categories (fr-FR)" },
      { kind: "element", index: 1, elementId: "el-7", language: "fr-FR", value: "Free forever (fr-FR)" },
    ]);
  });

  it("ignores results whose id matches no item", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      tier: "byok", results: [{ id: "0", value: "ok" }, { id: "9", value: "ghost" }],
    })));

    const result = await run(["fr-FR"]);

    expect(result?.entries).toEqual([
      { kind: "headline", index: 0, elementId: undefined, language: "fr-FR", value: "ok" },
    ]);
  });

  it("reports progress once per finished language", async () => {
    fetchMock.mockImplementation(batchOk());
    const seen: number[] = [];

    await runTranslationBatches({
      items, sourceLanguage: "en-US", targetLanguages: ["de-DE", "fr-FR", "ja"],
      actionId: "action-1", onProgress: (done) => seen.push(done),
    });

    expect(seen).toEqual([1, 2, 3]);
  });

  // One dead locale must not cost the user the other 37 they just paid a credit for.
  it("keeps translating after a language fails and reports the first error", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "ai_rate_limited" }), { status: 429 }))
      .mockImplementationOnce(batchOk());

    const result = await run(["de-DE", "fr-FR"]);

    expect(result?.firstError).toBe("ai_rate_limited");
    expect(result?.entries).toHaveLength(3);
    expect(result?.entries.every((e) => e.language === "fr-FR")).toBe(true);
  });

  it("reports a network failure as an error rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const result = await run(["de-DE"]);

    expect(result).toEqual({ entries: [], firstError: "network" });
  });

  // The tier of the first success is what tells the UI whether the gesture spent a credit.
  it("carries back the tier of the first successful call", async () => {
    fetchMock.mockImplementation(batchOk("managed"));

    expect((await run(["de-DE", "fr-FR"]))?.tier).toBe("managed");
  });

  it("stops at the next language when the caller aborts", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      controller.abort();
      return batchOk()(_url, init);
    });

    const result = await run(["de-DE", "fr-FR"], controller.signal);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // An abort surfaces as a rejected fetch, and that must not be reported as a failure.
  it("returns null when the in-flight request is aborted", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });

    expect(await run(["de-DE"], controller.signal)).toBeNull();
  });

  it("does nothing when there is no language to translate into", async () => {
    expect(await run([])).toEqual({ entries: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A 10-screenshot doc carries more than 60 translatable strings on its own. Unchunked,
  // /api/ai rejected the whole language and the export lost it.
  it("splits a language over several calls rather than busting the route's caps", async () => {
    fetchMock.mockImplementation(batchOk());
    const many: TranslatableItem[] = Array.from({ length: 145 }, (_, i) => ({
      kind: "headline", index: i, text: `Headline ${i}`,
    }));

    const result = await runTranslationBatches({
      items: many, sourceLanguage: "en-US", targetLanguages: ["fr-FR"], actionId: "action-1",
    });

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.items.length)).toEqual([MAX_BATCH_ITEMS, MAX_BATCH_ITEMS, 25]);
    expect(bodies.every((b) => b.actionId === "action-1")).toBe(true); // still one credit
    expect(result?.entries).toHaveLength(145);
  });
});

describe("chunkBatchItems", () => {
  const item = (id: number, text: string) => ({ id: String(id), kind: "headline" as const, text });

  it("keeps a payload the route accepts in a single call", () => {
    expect(chunkBatchItems([item(0, "a"), item(1, "b")])).toHaveLength(1);
  });

  it("breaks on the character cap before the item cap", () => {
    const long = Array.from({ length: 10 }, (_, i) => item(i, "x".repeat(500)));
    const chunks = chunkBatchItems(long);
    expect(chunks.map((c) => c.length)).toEqual([8, 2]);
    for (const chunk of chunks) {
      expect(chunk.reduce((n, i) => n + i.text.length, 0)).toBeLessThanOrEqual(MAX_BATCH_CHARS);
      expect(chunk.length).toBeLessThanOrEqual(MAX_BATCH_ITEMS);
    }
  });

  // The ids are offsets into the caller's item list – chunking must not renumber them.
  it("preserves the global ids across chunks", () => {
    const chunks = chunkBatchItems(Array.from({ length: 70 }, (_, i) => item(i, "t")));
    expect(chunks.flat().map((i) => i.id)).toEqual(
      Array.from({ length: 70 }, (_, i) => String(i)),
    );
  });

  it("never emits an empty chunk, even for an item over the char cap on its own", () => {
    const chunks = chunkBatchItems([item(0, "x".repeat(MAX_BATCH_CHARS + 1)), item(1, "b")]);
    expect(chunks.map((c) => c.length)).toEqual([1, 1]);
  });

  it("has nothing to send for an empty list", () => {
    expect(chunkBatchItems([])).toEqual([]);
  });
});
