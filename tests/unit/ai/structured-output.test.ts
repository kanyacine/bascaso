import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: vi.fn(),
    generateText: vi.fn(),
  };
});

import { generateObject, generateText } from "ai";
import { generateObjectWithRepair, repairGeneratedObjectText } from "@/lib/ai/structured-output";

const analyticsSchema = z.object({
  highlights: z.array(z.string()),
  opportunities: z.array(z.string()),
});

describe("repairGeneratedObjectText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts valid JSON from fenced output", async () => {
    const repaired = await repairGeneratedObjectText({
      text: "```json\n{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}\n```",
      schema: analyticsSchema,
    });

    expect(repaired).toBe("{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}");
  });

  it("converts markdown sections into schema-matching JSON", async () => {
    const repaired = await repairGeneratedObjectText({
      text: `**Highlights:**
- Search drove 38% of downloads.
- Philippines and UK led total downloads.

**Opportunities:**
- Improve search visibility with keyword work.
- Localise campaigns for the strongest territories.`,
      schema: analyticsSchema,
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired!)).toEqual({
      highlights: [
        "Search drove 38% of downloads.",
        "Philippines and UK led total downloads.",
      ],
      opportunities: [
        "Improve search visibility with keyword work.",
        "Localise campaigns for the strongest territories.",
      ],
    });
  });

  it("re-prompts local OpenAI-compatible models for JSON when heuristics fail", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}",
    } as never);

    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
      model: {} as never,
      providerId: "local-openai",
      system: "You are an analytics expert.",
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(repaired).toBe("{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}");
  });

  it("returns null when the text cannot be repaired", async () => {
    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
    });

    expect(repaired).toBeNull();
  });
});

describe("generateObjectWithRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses LM Studio chat completions structured output for local-openai", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}",
            },
          },
        ],
      }),
    } as Response);

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      system: "system",
      providerId: "local-openai",
      localOpenAI: {
        modelId: "qwen/test",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiKey: "lm-studio",
        maxOutputTokens: 300,
      },
    });

    expect(result.object).toEqual({
      highlights: ["A"],
      opportunities: ["B"],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("falls back to AI SDK object generation when local structured call fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "unsupported",
    } as Response);
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        highlights: ["A"],
        opportunities: ["B"],
      },
    } as never);

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      providerId: "local-openai",
      localOpenAI: {
        modelId: "qwen/test",
      },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(result.object).toEqual({
      highlights: ["A"],
      opportunities: ["B"],
    });
  });
});
