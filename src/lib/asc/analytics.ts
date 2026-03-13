import { eq } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/cache";
import { db } from "@/db";
import { analyticsBackfill } from "@/db/schema";
import {
  ANALYTICS_TTL,
  ANALYTICS_EMPTY_RETRY_TTL,
  emptyAnalyticsData,
  hasAnyAnalyticsRows,
  type AnalyticsData,
} from "./analytics-types";
import {
  aggregateDownloads,
  aggregateDownloadsBySource,
  aggregateDailyTerritoryDownloads,
  aggregateTerritories,
  aggregateDiscoverySources,
  aggregateRevenue,
  aggregateEngagement,
  aggregateSessions,
  aggregateVersionSessions,
  aggregateInstallsDeletes,
  aggregateOptIn,
  aggregateWebPreview,
  aggregateCrashesByVersion,
  aggregateCrashesByDevice,
  aggregateDailyCrashes,
} from "./analytics-aggregation";
import {
  findReportRequestIds,
  fetchReportData,
  fetchPerfPowerMetrics,
} from "./analytics-reports";

// ---------- Re-exports ----------

export type {
  PerfMetricPoint,
  PerfMetricDataset,
  PerfMetricSeries,
  PerfRegression,
  AnalyticsData,
} from "./analytics-types";

export { parseTsv } from "./analytics-types";
export { fetchPerfPowerMetrics } from "./analytics-reports";

/**
 * Returns the timestamp (ms) when we created report requests for this app,
 * or null if reports were already set up before Itsyconnect.
 */
export function getReportInitiatedAt(appId: string): number | null {
  return cacheGet<number>(`report-initiated:${appId}`, true);
}

// ---------- Build phase helper ----------

async function buildPhase(
  requestIds: string[],
  appId: string,
  maxInstances: number,
): Promise<AnalyticsData> {
  const fetchReport = async (
    label: string,
    category: string,
    reportName: string,
    granularity: string,
    limit: number,
    max = limit,
  ) => {
    try {
      return await fetchReportData(appId, requestIds, category, reportName, granularity, limit, max);
    } catch (err) {
      console.error(`[analytics] ${appId}: ${label} fetch failed`, err);
      throw err;
    }
  };

  const perfPromise = fetchPerfPowerMetrics(appId);

  // Crash reports are monthly -- always cap at 24 (2 years)
  const crashMax = Math.min(maxInstances, 24);

  const [
    downloadRows,
    purchaseRows,
    engagementRows,
    webPreviewRows,
    sessionRows,
    installDeleteRows,
    optInRows,
    crashRows,
    expandedCrashRows,
  ] = await Promise.all([
    fetchReport("downloads", "COMMERCE", "App Downloads Standard", "DAILY", 200, maxInstances),
    fetchReport("purchases", "COMMERCE", "App Store Purchases Standard", "DAILY", 200, maxInstances),
    fetchReport("engagement", "APP_STORE_ENGAGEMENT", "App Store Discovery and Engagement Standard", "DAILY", 200, maxInstances),
    fetchReport("web-preview", "APP_STORE_ENGAGEMENT", "App Store Web Preview Engagement Standard", "DAILY", 200, maxInstances),
    fetchReport("sessions", "APP_USAGE", "App Sessions Standard", "DAILY", 200, maxInstances),
    fetchReport("installs-deletes", "APP_USAGE", "App Store Installation and Deletion Standard", "DAILY", 200, maxInstances),
    fetchReport("opt-in", "APP_USAGE", "App Opt In", "DAILY", 200, maxInstances),
    fetchReport("crashes-monthly", "APP_USAGE", "App Crashes", "MONTHLY", 24, crashMax),
    fetchReport("crashes-expanded", "PERFORMANCE", "App Crashes Expanded", "DAILY", 200, maxInstances),
  ]);

  const perfData = await perfPromise;

  const filterByApp = (rows: Array<Record<string, string>>) => {
    if (rows.length === 0) return rows;
    if (rows[0]["App Apple Identifier"]) {
      return rows.filter((r) => r["App Apple Identifier"] === appId);
    }
    return rows;
  };

  const filteredDownloads = filterByApp(downloadRows);
  const filteredPurchases = filterByApp(purchaseRows);
  const filteredEngagement = filterByApp(engagementRows);
  const filteredWebPreview = filterByApp(webPreviewRows);
  const filteredSessions = filterByApp(sessionRows);
  const filteredInstallDeletes = filterByApp(installDeleteRows);
  const filteredOptIn = filterByApp(optInRows);
  const filteredCrashes = filterByApp(crashRows);
  const filteredExpandedCrashes = filterByApp(expandedCrashRows);

  return {
    dailyDownloads: aggregateDownloads(filteredDownloads),
    dailyRevenue: aggregateRevenue(filteredPurchases),
    dailyEngagement: aggregateEngagement(filteredEngagement),
    dailySessions: aggregateSessions(filteredSessions),
    dailyInstallsDeletes: aggregateInstallsDeletes(filteredInstallDeletes),
    dailyDownloadsBySource: aggregateDownloadsBySource(filteredDownloads),
    dailyTerritoryDownloads: aggregateDailyTerritoryDownloads(filteredDownloads),
    dailyVersionSessions: aggregateVersionSessions(filteredSessions),
    dailyOptIn: aggregateOptIn(filteredOptIn),
    dailyWebPreview: aggregateWebPreview(filteredWebPreview),
    territories: aggregateTerritories(filteredDownloads, filteredPurchases),
    discoverySources: aggregateDiscoverySources(filteredDownloads),
    crashesByVersion: aggregateCrashesByVersion(filteredCrashes),
    crashesByDevice: aggregateCrashesByDevice(filteredCrashes),
    dailyCrashes: aggregateDailyCrashes(filteredExpandedCrashes),
    perfMetrics: perfData.metrics,
    perfRegressions: perfData.regressions,
  };
}

// ---------- Background backfill ----------

const backfilling = new Set<string>();

function isBackfilled(appId: string): boolean {
  const row = db.select().from(analyticsBackfill).where(eq(analyticsBackfill.appId, appId)).get();
  return !!row;
}

function markBackfilled(appId: string): void {
  db.insert(analyticsBackfill).values({ appId }).onConflictDoNothing().run();
}

function dataPointCount(data: AnalyticsData): number {
  return data.dailyDownloads.length + data.dailySessions.length + data.dailyRevenue.length;
}

function startBackfill(requestIds: string[], appId: string, cacheKey: string) {
  /* v8 ignore next -- @preserve */
  if (backfilling.has(appId)) return;
  backfilling.add(appId);

  (async () => {
    const DEPTHS = [60, 120, 240, 480, Infinity];
    let prevCount = 0;
    for (const depth of DEPTHS) {
      /* v8 ignore next -- @preserve */
      const label = depth === Infinity ? "all" : String(depth);
      const start = Date.now();
      const data = await buildPhase(requestIds, appId, depth);
      cacheSet(cacheKey, data, ANALYTICS_TTL);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const count = dataPointCount(data);
      console.log(`[analytics] Backfill ${appId}: depth=${label}, ${count} pts, ${elapsed}s`);
      if (count <= prevCount) break;
      prevCount = count;
      /* v8 ignore next -- @preserve */
      if (depth === Infinity) break;
    }
    if (prevCount > 0) {
      markBackfilled(appId);
      console.log(`[analytics] Backfill complete for ${appId}: ${prevCount} total data points`);
    } else {
      console.warn(
        `[analytics] Backfill ${appId}: completed with 0 data points, leaving app unmarked so future syncs can retry`,
      );
    }
  })()
    .catch((err) => console.error(`[analytics] Backfill failed for ${appId}:`, err))
    .finally(() => backfilling.delete(appId));
}

// ---------- Main entry point ----------

const inFlight = new Map<string, Promise<AnalyticsData>>();

export function buildAnalyticsData(appId: string): Promise<AnalyticsData> {
  const cacheKey = `analytics:${appId}`;
  const cached = cacheGet<AnalyticsData>(cacheKey);
  if (cached) return Promise.resolve(cached);

  // Deduplicate concurrent builds for the same app
  const existing = inFlight.get(appId);
  if (existing) return existing;

  const promise = (async () => {
    console.log(`[analytics] Building ${appId}...`);
    return await buildAnalyticsDataInner(appId, cacheKey);
  })().finally(() => inFlight.delete(appId));

  inFlight.set(appId, promise);
  return promise;
}

async function buildAnalyticsDataInner(
  appId: string,
  cacheKey: string,
): Promise<AnalyticsData> {
  let requestIds: string[];
  try {
    console.log(`[analytics] ${appId}: loading report request IDs`);
    requestIds = await findReportRequestIds(appId);
  } catch (err) {
    console.error(`[analytics] ${appId}: failed to load report request IDs`, err);
    throw err;
  }
  if (requestIds.length === 0) {
    console.warn(`[analytics] ${appId}: no ONGOING or ONE_TIME_SNAPSHOT report requests`);
    const empty = emptyAnalyticsData();
    cacheSet(cacheKey, empty, ANALYTICS_EMPTY_RETRY_TTL);
    return empty;
  }

  // Phase 1: fetch recent 30 instances for fast initial load
  const phase1Start = Date.now();
  const data = await buildPhase(requestIds, appId, 30);
  const phase1Ms = Date.now() - phase1Start;

  const reports = [
    `downloads=${data.dailyDownloads.length}d`,
    `revenue=${data.dailyRevenue.length}d`,
    `engagement=${data.dailyEngagement.length}d`,
    `sessions=${data.dailySessions.length}d`,
    `installs=${data.dailyInstallsDeletes.length}d`,
    `optIn=${data.dailyOptIn.length}d`,
    `crashes=${data.dailyCrashes.length}d`,
  ].join(", ");
  console.log(`[analytics] ${appId}: phase 1 in ${(phase1Ms / 1000).toFixed(1)}s – ${reports}`);

  const hasRows = hasAnyAnalyticsRows(data);
  cacheSet(cacheKey, data, hasRows ? ANALYTICS_TTL : ANALYTICS_EMPTY_RETRY_TTL);
  if (hasRows) {
    // Data arrived -- clear the "report initiated" flag so the banner disappears.
    cacheSet(`report-initiated:${appId}`, null, 0);
  }
  if (!hasRows) {
    console.warn(
      `[analytics] ${appId}: phase 1 returned no rows, using short cache TTL (${ANALYTICS_EMPTY_RETRY_TTL / 60000}m) for retry`,
    );
  }

  // Phase 2: backfill all historical data (fire-and-forget).
  // Only runs once per app -- the DB flag persists across restarts.
  if (!isBackfilled(appId)) {
    startBackfill(requestIds, appId, cacheKey);
  }

  return data;
}
