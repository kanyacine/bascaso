import { NextResponse } from "next/server";
import { deleteAllRuns } from "@/lib/ai/workflows/run-manager";
import { clearScoreCache } from "@/lib/aso/score-service";

// Destructive ASO settings actions. ?target=reports wipes every autonomous
// research run (workflow_runs); ?target=scores wipes the keyword scoring
// cache and its history. The research scratchpad (localStorage) is cleared
// client-side, so it isn't touched here.
export async function DELETE(request: Request) {
  const target = new URL(request.url).searchParams.get("target");
  if (target === "reports") {
    return NextResponse.json({ ok: true, deleted: deleteAllRuns() });
  }
  if (target === "scores") {
    clearScoreCache();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: "target must be 'reports' or 'scores'" },
    { status: 400 },
  );
}
