// Prompt builders and zod schemas for the autonomous keyword-research
// pipeline. Each builder returns { system, prompt, schema } so the
// orchestrator can size the input against a model's maxInputChars before
// calling it. Prose stays terse – the small on-device models follow short
// instructions best.

import { z } from "zod";

export const seedsSchema = z.object({ seeds: z.array(z.string()).min(3).max(60) });
export const relevanceSchema = z.object({ relevant: z.array(z.number().int().nonnegative()) });
export const composeSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  summary: z.string(),
});

export function buildSeedsPrompt(input: {
  appName: string; country: string; locale: string;
  title?: string; subtitle?: string; description?: string;
  currentKeywords?: string; competitorTitles: string[];
}) {
  return {
    system: "You are an App Store Optimization expert. Output only what is asked, no commentary.",
    prompt: [
      `App: ${input.appName}`,
      `Storefront country: ${input.country}`,
      `Target language: ${input.locale}`,
      input.title ? `Current title: ${input.title}` : "",
      input.subtitle ? `Current subtitle: ${input.subtitle}` : "",
      input.currentKeywords ? `Current keyword field: ${input.currentKeywords}` : "",
      input.description ? `Description (excerpt): ${input.description.slice(0, 1500)}` : "",
      `Competitor titles: ${input.competitorTitles.join(" | ")}`,
      "",
      "Generate 20 distinct App Store search phrases (1-3 words each) that real users",
      "in this storefront would type to find this kind of app, in the target language.",
      "Mix category terms, problem/benefit terms and feature terms.",
      "No competitor brand names. No plural duplicating an included singular.",
    ].filter(Boolean).join("\n"),
    schema: seedsSchema,
  };
}

export function buildRelevancePrompt(input: {
  appName: string; subtitle?: string; description?: string; keywords: string[];
}) {
  return {
    system: "You are an App Store Optimization expert. Output only what is asked.",
    prompt: [
      `App: ${input.appName}`,
      input.subtitle ? `Subtitle: ${input.subtitle}` : "",
      input.description ? `Description (excerpt): ${input.description.slice(0, 600)}` : "",
      "For each numbered keyword below, decide whether someone searching it plausibly wants this app.",
      "Competitor brand names are not relevant.",
      "Return the numbers of the relevant keywords, nothing else.",
      ...input.keywords.map((k, i) => `${i}. ${k}`),
    ].filter(Boolean).join("\n"),
    schema: relevanceSchema,
  };
}

export function buildComposePrompt(input: {
  appName: string; locale: string; title?: string; subtitle?: string;
  topKeywords: Array<{ keyword: string; popularity: number | null; difficulty: number; opportunity: number }>;
}) {
  return {
    system: "You are an App Store Optimization expert. Output only what is asked.",
    prompt: [
      `App: ${input.appName}`,
      `Target language: ${input.locale}`,
      input.title ? `Current title: ${input.title}` : "",
      input.subtitle ? `Current subtitle: ${input.subtitle}` : "",
      "Top keywords (with popularity/difficulty/opportunity scores):",
      ...input.topKeywords.map((k) => `- ${k.keyword} (pop ${k.popularity ?? "?"}, diff ${k.difficulty}, opp ${k.opportunity})`),
      "",
      "Propose App Store metadata in the target language:",
      "- title: max 30 characters, keep the app name recognisable",
      "- subtitle: max 30 characters, no word repeated from the title",
      "- summary: 2-3 sentences explaining the strategy, in the target language",
    ].filter(Boolean).join("\n"),
    schema: composeSchema,
  };
}
