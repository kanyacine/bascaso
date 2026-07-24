import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { setRoutingFallbackEnabled, setRoutingTier } from "@/lib/app-preferences";
import { AI_ROUTED_GROUPS, type AIGroupId } from "@/lib/ai/tasks";

const groupSchema = z.object({
  group: z.enum(AI_ROUTED_GROUPS as [AIGroupId, ...AIGroupId[]]),
  tier: z.enum(["local", "byok"]).nullable(),
});

const fallbackSchema = z.object({
  fallback: z.boolean(),
});

const bodySchema = z.union([groupSchema, fallbackSchema]);

export async function PUT(request: Request) {
  const parsed = await parseBody(request, bodySchema);
  if (parsed instanceof Response) return parsed;

  if ("group" in parsed) {
    setRoutingTier(parsed.group, parsed.tier);
  } else {
    setRoutingFallbackEnabled(parsed.fallback);
  }

  return NextResponse.json({ ok: true });
}
