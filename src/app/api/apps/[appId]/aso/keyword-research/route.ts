import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  cancelRun,
  getLatestRun,
  startKeywordResearch,
} from "@/lib/ai/workflows/run-manager";

const bodySchema = z.object({
  country: z.string().length(2),
  locale: z.string().min(2),
  appName: z.string().min(1),
  appAppleId: z.number().nullable().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  currentKeywords: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const parsed = await parseBody(request, bodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await startKeywordResearch({
    appId,
    ...parsed,
    appAppleId: parsed.appAppleId ?? null,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: "workflow_already_running" },
      { status: 409 },
    );
  }
  return NextResponse.json({ runId: result.runId });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  return NextResponse.json({ run: getLatestRun(appId) });
}

export async function DELETE(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !cancelRun(runId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
