"use client";

import { useEffect, useState, useCallback } from "react";
import type { AscAppInfo, AscAppInfoLocalization } from "@/lib/asc/app-info";

interface UseAppInfoResult {
  appInfos: AscAppInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAppInfo(appId: string): UseAppInfoResult {
  const [appInfos, setAppInfos] = useState<AscAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!appId) {
      setAppInfos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/apps/${appId}/info${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load app info");
        setAppInfos([]);
        return;
      }

      const data = await res.json();
      setAppInfos(data.appInfos ?? []);
    } catch {
      setError("Network error");
      setAppInfos([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { appInfos, loading, error, refresh };
}

interface UseAppInfoLocalizationsResult {
  localizations: AscAppInfoLocalization[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAppInfoLocalizations(
  appId: string,
  appInfoId: string,
): UseAppInfoLocalizationsResult {
  const [localizations, setLocalizations] = useState<AscAppInfoLocalization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!appId || !appInfoId) {
      setLocalizations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(
        `/api/apps/${appId}/info/${appInfoId}/localizations${qs}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load app info localizations");
        setLocalizations([]);
        return;
      }

      const data = await res.json();
      setLocalizations(data.localizations ?? []);
    } catch {
      setError("Network error");
      setLocalizations([]);
    } finally {
      setLoading(false);
    }
  }, [appId, appInfoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { localizations, loading, error, refresh };
}
