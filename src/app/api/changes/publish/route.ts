import { NextResponse } from "next/server";
import { getChangesForApp, deleteSectionChange } from "@/lib/change-buffer";
import { publishSection } from "@/lib/publish-changes";
import type { PublishResult } from "@/lib/publish-changes";

export async function POST(request: Request) {
  const { appId } = (await request.json()) as { appId: string };
  if (!appId) {
    return NextResponse.json({ error: "appId is required" }, { status: 400 });
  }

  const changes = getChangesForApp(appId);
  if (changes.length === 0) {
    return NextResponse.json({ results: [], ok: true });
  }

  const results: PublishResult[] = [];

  // Publish sections sequentially to respect ASC rate limits
  for (const change of changes) {
    const result = await publishSection(change);
    results.push(result);
    // Clear buffer for successful sections
    if (result.ok) {
      deleteSectionChange(change.appId, change.section, change.scope);
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results, ok: allOk }, { status: allOk ? 200 : 207 });
}
