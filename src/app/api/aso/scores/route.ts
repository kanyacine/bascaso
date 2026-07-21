import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, errorJson } from "@/lib/api-helpers";
import { scoreKeyword } from "@/lib/aso/score-service";

const scoreSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  country: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{2}$/, "Country must be a 2-letter ISO code"),
  appAppleId: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, scoreSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const score = await scoreKeyword(parsed.keyword, parsed.country, parsed.appAppleId);
    return NextResponse.json({ score });
  } catch (err) {
    return errorJson(err);
  }
}
