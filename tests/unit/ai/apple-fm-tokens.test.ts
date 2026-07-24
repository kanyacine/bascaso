import { describe, expect, it } from "vitest";
import {
  APPLE_FM_MAX_INPUT_TOKENS,
  appleFmInputTooLarge,
  estimateAppleFmTokens,
} from "@/lib/ai/apple-fm";

describe("estimateAppleFmTokens", () => {
  it("counts Latin text at ~4 chars per token", () => {
    expect(estimateAppleFmTokens("x".repeat(12_000))).toBe(3_000);
    expect(estimateAppleFmTokens("x".repeat(13_000))).toBe(3_250);
  });

  it("counts CJK characters at ~1 token each", () => {
    // 4000 Japanese hiragana → ~4000 tokens (script-aware), far above a
    // char/4 estimate that would wrongly report ~1000 tokens.
    const japanese = "あ".repeat(4_000);
    expect(estimateAppleFmTokens(japanese)).toBe(4_000);

    const chinese = "字".repeat(4_000);
    expect(estimateAppleFmTokens(chinese)).toBe(4_000);
  });

  it("mixes CJK and Latin additively", () => {
    // 400 CJK (~400 tokens) + 400 Latin (~100 tokens) = 500 tokens.
    expect(estimateAppleFmTokens("字".repeat(400) + "x".repeat(400))).toBe(500);
  });
});

describe("appleFmInputTooLarge", () => {
  it("accepts 12000 Latin chars (~3000 tokens, within budget)", () => {
    expect(APPLE_FM_MAX_INPUT_TOKENS).toBe(3_000);
    expect(appleFmInputTooLarge("x".repeat(12_000))).toBe(false);
  });

  it("rejects 13000 Latin chars (~3250 tokens, over budget)", () => {
    expect(appleFmInputTooLarge("x".repeat(13_000))).toBe(true);
  });

  it("rejects a 4000-char Japanese string that fits the char guard but not the token budget", () => {
    expect(appleFmInputTooLarge("あ".repeat(4_000))).toBe(true);
  });

  it("rejects a 4000-char Chinese string", () => {
    expect(appleFmInputTooLarge("字".repeat(4_000))).toBe(true);
  });

  it("accepts a short mixed string", () => {
    expect(appleFmInputTooLarge("Hello 世界, this is short")).toBe(false);
  });
});
