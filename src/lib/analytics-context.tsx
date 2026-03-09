"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { AnalyticsData } from "@/lib/asc/analytics";
import { useRegisterRefresh } from "@/lib/refresh-context";

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  pending: boolean; // bg worker hasn't fetched this app yet
  /** Apple is generating reports for the first time (24–48h wait). */
  reportInitiated: boolean;
  /** Timestamp (ms) when reports were requested, if initiated by us. */
  initiatedAt: number | null;
  meta: { fetchedAt: number; ttlMs: number } | null;
  /** Last date with available data (e.g. "2026-02-27"). Presets anchor to this. */
  lastDate: string | undefined;
}

const AnalyticsContext = createContext<AnalyticsState | null>(null);

const POLL_INTERVAL = 3000;
const MAX_POLLS = 20; // 20 × 3s = 60s max wait
// When reports were just initiated by us, poll much less aggressively –
// Apple needs 24–48h, not 60s.
const INITIATED_POLL_INTERVAL = 5 * 60 * 1000; // 5 min

export function AnalyticsProvider({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const devSimulate = searchParams.get("analyticsState") === "initiated";

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reportInitiated, setReportInitiated] = useState(false);
  const [initiatedAt, setInitiatedAt] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ fetchedAt: number; ttlMs: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/apps/${appId}/analytics`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setPending(false);
        setRefreshing(false);
        return;
      }

      if (json.pending) {
        const initiated = json.reportInitiated === true;
        setReportInitiated(initiated);
        setInitiatedAt(json.initiatedAt ?? null);

        // When reports are freshly initiated (24–48h wait), don't burn
        // through MAX_POLLS in 60s – that's pointless.
        if (!initiated) {
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            setPending(false);
            setRefreshing(false);
            setError("Analytics refresh timed out – try again later");
            return;
          }
        }
        setPending(true);
        return;
      }

      pollCount.current = 0;
      setPending(false);
      setReportInitiated(false);
      setInitiatedAt(null);
      setRefreshing(false);
      setData(json.data);
      setMeta(json.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch analytics");
      setPending(false);
      setRefreshing(false);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while pending (bg worker hasn't reached this app yet).
  // Use a much slower interval when reports were just initiated –
  // Apple needs 24–48h so 3-second polls are wasteful.
  useEffect(() => {
    if (!pending || devSimulate) return;

    const interval = reportInitiated ? INITIATED_POLL_INTERVAL : POLL_INTERVAL;
    pollTimer.current = setInterval(() => {
      fetchData();
    }, interval);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [pending, reportInitiated, devSimulate, fetchData]);

  // Manual refresh: invalidate cache + trigger background rebuild
  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    pollCount.current = 0;
    try {
      await fetch(`/api/apps/${appId}/analytics/refresh`, { method: "POST" });
      setPending(true);
      await fetchData();
    } catch {
      setRefreshing(false);
    }
  }, [appId, fetchData]);

  // Register with header refresh button
  useRegisterRefresh({
    onRefresh: triggerRefresh,
    busy: refreshing || pending,
  });

  // Derive last available data date as the max last date across key series,
  // so presets anchor to the most recent data available.
  const lastDate = useMemo(() => {
    if (!data) return undefined;
    const lastDates: string[] = [];
    for (const series of [data.dailyDownloads, data.dailyRevenue, data.dailySessions, data.dailyEngagement, data.dailyCrashes]) {
      if (series && series.length > 0) lastDates.push(series[series.length - 1].date);
    }
    if (lastDates.length === 0) return undefined;
    return lastDates.reduce((max, d) => (d > max ? d : max));
  }, [data]);

  // Dev override: simulate the "report initiated" state for visual testing.
  const value: AnalyticsState = devSimulate
    ? {
        data: null,
        loading: false,
        error: null,
        pending: false,
        reportInitiated: true,
        initiatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        meta: null,
        lastDate: undefined,
      }
    : { data, loading, error, pending, reportInitiated, initiatedAt, meta, lastDate };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsState {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }
  return ctx;
}
