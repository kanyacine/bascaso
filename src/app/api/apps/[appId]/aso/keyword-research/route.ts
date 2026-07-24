import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  cancelRun,
  deleteRun,
  getLatestRun,
  listRuns,
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
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("list") === "1") {
    const country = url.searchParams.get("country") ?? "";
    const locale = url.searchParams.get("locale") ?? "";
    return NextResponse.json({ runs: listRuns(appId, { country, locale }) });
  }
  return NextResponse.json({ run: getLatestRun(appId) });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  // ?delete=1 removes a persisted (terminal) run – the history delete button;
  // otherwise the request cancels an in-flight run.
  if (runId && url.searchParams.get("delete") === "1") {
    return NextResponse.json({ ok: deleteRun(runId) });
  }
  if (!runId || !cancelRun(runId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
