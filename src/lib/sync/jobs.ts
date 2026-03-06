import { listApps } from "@/lib/asc/apps";
import { buildAnalyticsData } from "@/lib/asc/analytics";
import { listBuilds, listGroups } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { isPro, FREE_LIMITS } from "@/lib/license";
import { getFreeSelectedAppId } from "@/lib/app-preferences";

/** Return apps respecting the free tier limit and selection. */
async function visibleApps() {
  const all = await listApps();
  if (isPro()) return all;

  // Free user with only one app – no selection needed
  if (all.length <= FREE_LIMITS.apps) return all;

  // Free user with multiple apps – only sync the selected app
  const selectedId = getFreeSelectedAppId();
  if (selectedId) {
    const selected = all.find((a) => a.id === selectedId);
    if (selected) return [selected];
  }

  // No selection yet – don't sync any app until user picks one
  return [];
}

export async function syncApps(): Promise<void> {
  if (!hasCredentials()) return;
  await listApps(true);
}

export async function syncAnalytics(): Promise<void> {
  if (!hasCredentials()) return;
  const apps = await visibleApps();
  for (const app of apps) {
    await buildAnalyticsData(app.id);
  }
}

export async function syncTestFlight(): Promise<void> {
  if (!hasCredentials()) return;
  const apps = await visibleApps();
  for (const app of apps) {
    await listBuilds(app.id, true);
    await listGroups(app.id, true);
  }
}
