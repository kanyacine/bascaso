import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { generateText } from "ai";
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
  });

  it("returns the SDK structured output when generation succeeds", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        highlights: ["A"],
        opportunities: ["B"],
      },
      text: "{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}",
    } as never);

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      system: "system",
      providerId: "local-openai",
      maxOutputTokens: 400,
    });

    expect(result.object).toEqual({
      highlights: ["A"],
      opportunities: ["B"],
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("repairs sectioned markdown without a second model call", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(Object.assign(
      new Error("No object generated: could not parse the response."),
      {
        text: `**Highlights:**
- Search drove 38% of downloads.

**Opportunities:**
- Improve search visibility with keyword work.`,
      },
    ));

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      providerId: "local-openai",
    });

    expect(result.object).toEqual({
      highlights: ["Search drove 38% of downloads."],
      opportunities: ["Improve search visibility with keyword work."],
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("uses a second SDK call to repair unparsable local output", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(Object.assign(
        new Error("No object generated: could not parse the response."),
        {
          text: "Summarised prose without parsable sections.",
        },
      ))
      .mockResolvedValueOnce({
        text: "{\"highlights\":[\"A\"],\"opportunities\":[\"B\"]}",
      } as never);

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      system: "system",
      providerId: "local-openai",
      maxOutputTokens: 400,
    });

    expect(result.object).toEqual({
      highlights: ["A"],
      opportunities: ["B"],
    });
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
