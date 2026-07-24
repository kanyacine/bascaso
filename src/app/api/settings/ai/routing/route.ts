import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  setAppleFmAllowUnsupportedLanguages,
  setRoutingFallbackEnabled,
  setRoutingTier,
} from "@/lib/app-preferences";
import { AI_ROUTED_GROUPS, type AIGroupId } from "@/lib/ai/tasks";

const groupSchema = z.object({
  group: z.enum(AI_ROUTED_GROUPS as [AIGroupId, ...AIGroupId[]]),
  tier: z.enum(["local", "byok"]).nullable(),
});

const fallbackSchema = z.object({
  fallback: z.boolean(),
});

const allowUnsupportedSchema = z.object({
  allowUnsupportedLanguages: z.boolean(),
});

const resetSchema = z.object({
  reset: z.literal(true),
});

const bodySchema = z.union([groupSchema, fallbackSchema, allowUnsupportedSchema, resetSchema]);

export async function PUT(request: Request) {
  const parsed = await parseBody(request, bodySchema);
  if (parsed instanceof Response) return parsed;

  if ("reset" in parsed) {
    for (const group of AI_ROUTED_GROUPS) setRoutingTier(group, null);
  } else if ("group" in parsed) {
    setRoutingTier(parsed.group, parsed.tier);
  } else if ("allowUnsupportedLanguages" in parsed) {
    setAppleFmAllowUnsupportedLanguages(parsed.allowUnsupportedLanguages);
  } else {
    setRoutingFallbackEnabled(parsed.fallback);
  }

  return NextResponse.json({ ok: true });
}
