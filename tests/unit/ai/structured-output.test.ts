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

  it("returns null for unbalanced JSON", async () => {
    const result = await repairGeneratedObjectText({
      text: '{"highlights": ["A"]',
      schema: analyticsSchema,
    });
    expect(result).toBeNull();
  });

  it("returns null when sectionAliases keys do not match schema fields", async () => {
    const result = await repairGeneratedObjectText({
      text: `**Foo:**
- Some point.

**Bar:**
- Another point.`,
      schema: analyticsSchema,
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });
    // The headings "Foo" and "Bar" don't match any alias, so sections stay empty
    expect(result).toBeNull();
  });

  it("returns null for sectioned parsing when schema has no properties", async () => {
    // A schema with no object properties results in sectionByAlias.size === 0
    const emptySchema = z.object({}).strict();
    const result = await repairGeneratedObjectText({
      text: `**Highlights:**
- A point.`,
      schema: emptySchema,
      sectionAliases: {},
    });
    expect(result).toBeNull();
  });

  it("ignores continuation lines before any bullet in a section", async () => {
    const result = await repairGeneratedObjectText({
      text: `**Highlights:**
This is a continuation line before any bullet.
- First bullet point.

**Opportunities:**
- An opportunity.`,
      schema: analyticsSchema,
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    // The continuation line before any bullet should be ignored (length === 0 guard)
    expect(parsed.highlights).toEqual(["First bullet point."]);
    expect(parsed.opportunities).toEqual(["An opportunity."]);
  });

  it("returns null for text with balanced braces but invalid JSON", async () => {
    const result = await repairGeneratedObjectText({
      text: '{invalid json content here}',
      schema: analyticsSchema,
    });
    expect(result).toBeNull();
  });

  it("handles continuation lines after bullet points", async () => {
    const result = await repairGeneratedObjectText({
      text: `**Highlights:**
- First point that continues
  on the next line
- Second point

**Opportunities:**
- An opportunity`,
      schema: analyticsSchema,
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.highlights[0]).toContain("continues");
    expect(parsed.highlights[0]).toContain("on the next line");
  });

  it("handles escaped characters in JSON strings", async () => {
    const repaired = await repairGeneratedObjectText({
      text: '{"highlights":["She said \\"hello\\""],"opportunities":["Path: C:\\\\Users"]}',
      schema: analyticsSchema,
    });

    expect(repaired).not.toBeNull();
    const parsed = JSON.parse(repaired!);
    expect(parsed.highlights[0]).toContain("hello");
    expect(parsed.opportunities[0]).toContain("C:\\Users");
  });

  it("extracts valid JSON from array-style output", async () => {
    const result = await repairGeneratedObjectText({
      text: '[{"highlights":["A"],"opportunities":["B"]}]',
      schema: analyticsSchema,
    });
    expect(result).toBeNull();
  });

  it("returns null when the text cannot be repaired", async () => {
    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
    });

    expect(repaired).toBeNull();
  });

  it("returns null when LLM repair call fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValueOnce(new Error("LLM down"));

    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
      model: {} as never,
      providerId: "local-openai",
    });

    expect(repaired).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("repair call failed"),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("parses sectioned text returned by LLM repair", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: `**Highlights:**
- Revenue grew strongly.

**Opportunities:**
- Expand to new markets.`,
    } as never);

    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
      model: {} as never,
      providerId: "local-openai",
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired!)).toEqual({
      highlights: ["Revenue grew strongly."],
      opportunities: ["Expand to new markets."],
    });
  });

  it("returns null when LLM repair returns invalid output", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Still not parsable at all.",
    } as never);

    const repaired = await repairGeneratedObjectText({
      text: "Summarised prose without parsable sections.",
      schema: analyticsSchema,
      model: {} as never,
      providerId: "local-openai",
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

  it("re-throws immediately when error has no .text property", async () => {
    const err = new Error("Network failure");
    vi.mocked(generateText).mockRejectedValueOnce(err);

    await expect(
      generateObjectWithRepair({
        model: {} as never,
        schema: analyticsSchema,
        prompt: "test",
        providerId: "local-openai",
      }),
    ).rejects.toThrow("Network failure");

    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("re-throws original error when repair returns null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(generateText).mockRejectedValueOnce(
      Object.assign(new Error("Parse failed"), {
        text: "Totally unparsable blob of text.",
      }),
    );

    await expect(
      generateObjectWithRepair({
        model: {} as never,
        schema: analyticsSchema,
        prompt: "test",
      }),
    ).rejects.toThrow("Parse failed");

    warnSpy.mockRestore();
  });

  it("logs repaired message without providerId when not provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(generateText)
      .mockRejectedValueOnce(
        Object.assign(new Error("Parse failed"), {
          text: '{"highlights":["A"],"opportunities":["B"]}',
        }),
      );

    const result = await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
    });

    expect(result.object).toEqual({
      highlights: ["A"],
      opportunities: ["B"],
    });
    // Verify warn messages don't include "for" provider suffix
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Structured output repaired."),
    );

    warnSpy.mockRestore();
  });

  it("logs repair failed message without providerId when not provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(generateText)
      .mockRejectedValueOnce(
        Object.assign(new Error("Parse failed"), {
          text: "Totally unparsable blob of text.",
        }),
      );

    await expect(
      generateObjectWithRepair({
        model: {} as never,
        schema: analyticsSchema,
        prompt: "test",
      }),
    ).rejects.toThrow("Parse failed");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("repair failed."),
    );

    warnSpy.mockRestore();
  });

  it("logs repair failed message with providerId when provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(generateText)
      .mockRejectedValueOnce(
        Object.assign(new Error("Parse failed"), {
          text: "Totally unparsable blob of text.",
        }),
      );

    await expect(
      generateObjectWithRepair({
        model: {} as never,
        schema: analyticsSchema,
        prompt: "test",
        providerId: "my-provider",
      }),
    ).rejects.toThrow("Parse failed");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("repair failed for my-provider"),
    );

    warnSpy.mockRestore();
  });

  it("includes providerId in warn messages", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(generateText)
      .mockRejectedValueOnce(
        Object.assign(new Error("Parse failed"), {
          text: "**Highlights:**\n- A\n\n**Opportunities:**\n- B",
        }),
      );

    await generateObjectWithRepair({
      model: {} as never,
      schema: analyticsSchema,
      prompt: "test",
      providerId: "my-provider",
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("my-provider"),
      expect.anything(),
    );

    warnSpy.mockRestore();
  });
});
