"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { renderMarkers } from "@/components/chart-markers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Eye,
  DownloadSimple,
  CurrencyDollar,
  Timer,
} from "@phosphor-icons/react";
import { formatDateShort } from "@/lib/format";
import { useAnalytics } from "@/lib/analytics-context";
import { parseRange, filterByDateRange, previousRange, pctChange, getStoredRange } from "@/lib/analytics-range";
import { KpiCard } from "@/components/kpi-card";
import { AnalyticsStateGuard } from "@/components/analytics-state-guard";
import { EmptyState } from "@/components/empty-state";

// ---------- Chart configs ----------

const downloadsConfig = {
  firstTime: { label: "First-time downloads", color: "var(--color-chart-1)" },
  redownload: { label: "Redownloads", color: "var(--color-chart-2)" },
  update: { label: "Updates", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

const revenueConfig = {
  proceeds: { label: "Proceeds", color: "var(--color-chart-1)" },
  sales: { label: "Sales", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const territoryConfig = {
  downloads: { label: "Total downloads", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const funnelConfig = {
  impressions: { label: "Impressions", color: "var(--color-chart-3)" },
  pageViews: { label: "Product page views", color: "var(--color-chart-2)" },
  downloads: { label: "First-time downloads", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// ---------- Page ----------

export default function AnalyticsOverviewPage() {
  const searchParams = useSearchParams();
  const { appId } = useParams<{ appId: string }>();
  const { markers } = useAppMarkers(appId);
  const { data, lastDate } = useAnalytics();
  const range = useMemo(() => parseRange(searchParams.get("range") ?? getStoredRange(), lastDate), [searchParams, lastDate]);
  const prevRange = useMemo(() => previousRange(range), [range]);

  const downloads = useMemo(
    () => filterByDateRange(data?.dailyDownloads ?? [], range),
    [data, range],
  );
  const revenue = useMemo(
    () => filterByDateRange(data?.dailyRevenue ?? [], range),
    [data, range],
  );

  const totalDownloads = downloads.reduce(
    (s, d) => s + d.firstTime + d.redownload,
    0,
  );
  const prevDownloadsData = useMemo(
    () => filterByDateRange(data?.dailyDownloads ?? [], prevRange),
    [data, prevRange],
  );
  const prevDownloads = prevDownloadsData.reduce(
    (s, d) => s + d.firstTime + d.redownload,
    0,
  );
  const prevFirstTime = prevDownloadsData.reduce(
    (s, d) => s + d.firstTime,
    0,
  );

  const totalRevenue = revenue.reduce((s, d) => s + d.proceeds, 0);
  const prevRevenueData = useMemo(
    () => filterByDateRange(data?.dailyRevenue ?? [], prevRange),
    [data, prevRange],
  );
  const prevRevenue = prevRevenueData.reduce((s, d) => s + d.proceeds, 0);

  const totalFirstTime = downloads.reduce((s, d) => s + d.firstTime, 0);

  const engagement = useMemo(
    () => filterByDateRange(data?.dailyEngagement ?? [], range),
    [data, range],
  );
  const totalImpressions = engagement.reduce((s, d) => s + d.impressions, 0);
  const prevEngagementData = useMemo(
    () => filterByDateRange(data?.dailyEngagement ?? [], prevRange),
    [data, prevRange],
  );
  const prevImpressions = prevEngagementData.reduce(
    (s, d) => s + d.impressions,
    0,
  );
  const totalPageViews = engagement.reduce((s, d) => s + d.pageViews, 0);

  const territories = useMemo(() => {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const filtered = (data?.dailyTerritoryDownloads ?? []).filter(
      (d) => d.date >= range.from && d.date <= range.to,
    );
    const byCode = new Map<string, number>();
    for (const row of filtered) {
      byCode.set(row.code, (byCode.get(row.code) || 0) + row.downloads);
    }
    return Array.from(byCode.entries())
      .map(([code, downloads]) => {
        let territory: string;
        try { territory = displayNames.of(code) ?? code; } catch { territory = code; }
        return { territory, code, downloads };
      })
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 10);
  }, [data, range]);

  const funnelData = [
    { stage: "impressions", value: totalImpressions, fill: "var(--color-impressions)" },
    { stage: "pageViews", value: totalPageViews, fill: "var(--color-pageViews)" },
    { stage: "downloads", value: totalFirstTime, fill: "var(--color-downloads)" },
  ];

  const isEmpty = (data?.dailyDownloads.length ?? 0) === 0
    && (data?.dailySessions.length ?? 0) === 0
    && (data?.dailyEngagement.length ?? 0) === 0;

  return (
    <AnalyticsStateGuard>
    {isEmpty ? (
      <EmptyState title="No analytics data" description="No analytics data is available for this app yet." />
    ) : (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Impressions"
          value={totalImpressions.toLocaleString()}
          subtitle={pctChange(totalImpressions, prevImpressions, engagement.length, prevEngagementData.length)}
          icon={Eye}
        />
        <KpiCard
          title="Total downloads"
          value={totalDownloads.toLocaleString()}
          subtitle={pctChange(totalDownloads, prevDownloads, downloads.length, prevDownloadsData.length)}
          icon={DownloadSimple}
        />
        <KpiCard
          title="Proceeds"
          value={`$${totalRevenue.toLocaleString()}`}
          subtitle={pctChange(totalRevenue, prevRevenue, revenue.length, prevRevenueData.length)}
          icon={CurrencyDollar}
        />
        <KpiCard
          title="First-time downloads"
          value={totalFirstTime.toLocaleString()}
          subtitle={pctChange(totalFirstTime, prevFirstTime, downloads.length, prevDownloadsData.length)}
          icon={Timer}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Downloads and updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={downloadsConfig}
              className="h-[280px] w-full"
            >
              <BarChart data={downloads} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDateShort}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDateShort(v as string)}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="firstTime"
                  stackId="downloads"
                  fill="var(--color-firstTime)"
                />
                <Bar
                  dataKey="redownload"
                  stackId="downloads"
                  fill="var(--color-redownload)"
                />
                <Bar
                  dataKey="update"
                  stackId="downloads"
                  fill="var(--color-update)"
                  radius={[2, 2, 0, 0]}
                />
                {renderMarkers({
                  markers,
                  visibleDates: downloads.map((d) => d.date),
                })}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Proceeds and sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={revenueConfig}
              className="h-[280px] w-full"
            >
              <LineChart data={revenue} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDateShort}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  tickFormatter={(v) => `$${v}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDateShort(v as string)}
                      formatter={(value, name) => (
                        <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                          <span className="text-muted-foreground">
                            {name === "proceeds" ? "Proceeds" : "Sales"}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            ${(value as number).toLocaleString()}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="proceeds"
                  stroke="var(--color-proceeds)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                />
                {renderMarkers({
                  markers,
                  visibleDates: revenue.map((d) => d.date),
                })}
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top territories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={territoryConfig}
              className="h-[320px] w-full"
            >
              <BarChart
                data={territories}
                layout="vertical"
                accessibilityLayer
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="territory"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  className="text-xs"
                />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="downloads"
                  fill="var(--color-downloads)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Conversion funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={funnelConfig}
              className="h-[320px] w-full"
            >
              <BarChart data={funnelData} accessibilityLayer margin={{ top: 24 }}>
                <XAxis
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    funnelConfig[v as keyof typeof funnelConfig]?.label ?? v
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="stage"
                      labelFormatter={(v) =>
                        funnelConfig[v as keyof typeof funnelConfig]?.label ?? v
                      }
                    />
                  }
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    className="fill-foreground"
                    fontSize={13}
                    fontWeight={600}
                    formatter={(v: number) => v.toLocaleString()}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span>
                Product page view rate:{" "}
                <strong className="text-foreground">
                  {totalImpressions > 0
                    ? ((totalPageViews / totalImpressions) * 100).toFixed(1)
                    : "0"}
                  %
                </strong>
              </span>
              <span>
                First-time download rate:{" "}
                <strong className="text-foreground">
                  {totalPageViews > 0
                    ? ((totalFirstTime / totalPageViews) * 100).toFixed(1)
                    : "0"}
                  %
                </strong>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    )}
    </AnalyticsStateGuard>
  );
}
