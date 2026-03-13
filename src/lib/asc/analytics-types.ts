// ---------- Constants ----------

export const ANALYTICS_TTL = 60 * 60 * 1000; // 1 hour (sync worker refreshes hourly)
export const ANALYTICS_EMPTY_RETRY_TTL = 10 * 60 * 1000; // 10 min (faster retry while ASC is still provisioning reports)
export const REPORT_ID_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (report request/report IDs never change)
export const INSTANCE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (immutable past data)
export const TODAY_TTL = 10 * 60 * 1000; // 10 min (today's data may update)
export const PERF_METRICS_TTL = 6 * 60 * 60 * 1000; // 6 hours (changes only on new version releases)

// ---------- Exported types ----------

export interface PerfMetricPoint {
  version: string;
  value: number;
}

export interface PerfMetricDataset {
  percentile: string;
  device: string;
  points: PerfMetricPoint[];
}

export interface PerfMetricSeries {
  category: string;
  metric: string;
  unit: string;
  platform: string;
  datasets: PerfMetricDataset[];
}

export interface PerfRegression {
  metric: string;
  metricCategory: string;
  latestVersion: string;
  summary: string;
}

export interface AnalyticsData {
  dailyDownloads: Array<{ date: string; firstTime: number; redownload: number; update: number }>;
  dailyRevenue: Array<{ date: string; proceeds: number; sales: number }>;
  dailyEngagement: Array<{ date: string; impressions: number; pageViews: number }>;
  dailySessions: Array<{ date: string; sessions: number; uniqueDevices: number; avgDuration: number }>;
  dailyInstallsDeletes: Array<{ date: string; installs: number; deletes: number }>;
  dailyDownloadsBySource: Array<{ date: string; search: number; browse: number; webReferrer: number; unavailable: number }>;
  dailyVersionSessions: Array<{ date: string; [version: string]: number | string }>;
  dailyOptIn: Array<{ date: string; downloading: number; optingIn: number }>;
  dailyWebPreview: Array<{ date: string; pageViews: number; appStoreTaps: number }>;
  dailyTerritoryDownloads: Array<{ date: string; code: string; downloads: number }>;
  territories: Array<{ territory: string; code: string; downloads: number; revenue: number }>;
  discoverySources: Array<{ source: string; count: number; fill: string }>;
  crashesByVersion: Array<{ version: string; platform: string; crashes: number; uniqueDevices: number }>;
  crashesByDevice: Array<{ device: string; crashes: number; uniqueDevices: number }>;
  dailyCrashes: Array<{ date: string; crashes: number; uniqueDevices: number }>;
  perfMetrics: PerfMetricSeries[];
  perfRegressions: PerfRegression[];
}

// ---------- Internal types (exported for cross-module use) ----------

export interface AscReportRequest {
  id: string;
  attributes: { accessType: string; [key: string]: unknown };
}

export interface AscReport {
  id: string;
  attributes: { name: string; category: string };
}

export interface AscReportInstance {
  id: string;
  attributes: { processingDate: string; granularity: string };
}

export interface AscReportSegment {
  id: string;
  attributes: { url: string; checksum: string };
}

export interface AscListResponse<T> {
  data: T[];
  links?: { next?: string };
}

export interface PerfPowerMetricsResponse {
  insights?: {
    regressions?: Array<{
      metric: string;
      metricCategory: string;
      latestVersion: string;
      summaryString: string;
    }>;
  };
  productData?: Array<{
    platform: string;
    metricCategories?: Array<{
      identifier: string;
      metrics?: Array<{
        identifier: string;
        unit?: { displayName: string };
        datasets?: Array<{
          filterCriteria?: { device?: string; percentile?: string };
          points?: Array<{ version: string; value: number }>;
        }>;
      }>;
    }>;
  }>;
}

// ---------- TSV parsing ----------

export function parseTsv(raw: string): Array<Record<string, string>> {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = (values[i] ?? "").replace(/^"|"$/g, "");
    }
    return record;
  });
}

// ---------- Helpers ----------

export function emptyAnalyticsData(): AnalyticsData {
  return {
    dailyDownloads: [],
    dailyRevenue: [],
    dailyEngagement: [],
    dailySessions: [],
    dailyInstallsDeletes: [],
    dailyDownloadsBySource: [],
    dailyTerritoryDownloads: [],
    dailyVersionSessions: [],
    dailyOptIn: [],
    dailyWebPreview: [],
    territories: [],
    discoverySources: [],
    crashesByVersion: [],
    crashesByDevice: [],
    dailyCrashes: [],
    perfMetrics: [],
    perfRegressions: [],
  };
}

export function hasAnyAnalyticsRows(data: AnalyticsData): boolean {
  return data.dailyDownloads.length > 0
    || data.dailyRevenue.length > 0
    || data.dailyEngagement.length > 0
    || data.dailySessions.length > 0
    || data.dailyInstallsDeletes.length > 0
    || data.dailyDownloadsBySource.length > 0
    || data.dailyTerritoryDownloads.length > 0
    || data.dailyVersionSessions.length > 0
    || data.dailyOptIn.length > 0
    || data.dailyWebPreview.length > 0
    || data.territories.length > 0
    || data.discoverySources.length > 0
    || data.crashesByVersion.length > 0
    || data.crashesByDevice.length > 0
    || data.dailyCrashes.length > 0;
}
