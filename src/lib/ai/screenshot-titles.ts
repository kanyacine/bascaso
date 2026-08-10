/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Response parsing for the screenshot-titles action (magical-titles.js:392-404). Tolerates
// fenced output and appscreen's index-keyed record shape.
import { z } from "zod";

export const screenshotTitlesSchema = z.object({
  titles: z.array(z.object({ headline: z.string(), subheadline: z.string() })),
});

const recordSchema = z.record(z.string(), z.object({ headline: z.string(), subheadline: z.string() }));

export function parseScreenshotTitles(text: string): { headline: string; subheadline: string }[] | null {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const match = /\{[\s\S]*\}/.exec(cleaned);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const asSchema = screenshotTitlesSchema.safeParse(raw);
  if (asSchema.success) return asSchema.data.titles;
  const asRecord = recordSchema.safeParse(raw);
  if (!asRecord.success) return null;
  return Object.keys(asRecord.data)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => asRecord.data[k]);
}
