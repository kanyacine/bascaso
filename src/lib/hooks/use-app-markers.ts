"use client";

import { useCallback, useEffect, useState } from "react";

export interface AppMarker {
  id: string;
  appId: string;
  date: string; // YYYY-MM-DD
  label: string;
  color: string | null;
  createdAt: string;
}

export interface NewMarker {
  date: string;
  label: string;
  color?: string | null;
}

const MARKERS_CHANGED_EVENT = "app-markers-changed";

function dispatchMarkersChanged(appId: string) {
  window.dispatchEvent(new CustomEvent(MARKERS_CHANGED_EVENT, { detail: appId }));
}

export function useAppMarkers(appId: string | undefined) {
  const [markers, setMarkers] = useState<AppMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${appId}/markers`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setMarkers(data.markers ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markers");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cross-component sync: listen for changes fired by other mounts.
  useEffect(() => {
    if (!appId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === appId) refresh();
    };
    window.addEventListener(MARKERS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(MARKERS_CHANGED_EVENT, handler);
  }, [appId, refresh]);

  const addMarker = useCallback(
    async (input: NewMarker) => {
      if (!appId) return;
      const res = await fetch(`/api/apps/${appId}/markers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      dispatchMarkersChanged(appId);
    },
    [appId],
  );

  const updateMarker = useCallback(
    async (id: string, patch: Partial<NewMarker>) => {
      if (!appId) return;
      const res = await fetch(`/api/apps/${appId}/markers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      dispatchMarkersChanged(appId);
    },
    [appId],
  );

  const deleteMarker = useCallback(
    async (id: string) => {
      if (!appId) return;
      const res = await fetch(`/api/apps/${appId}/markers?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      dispatchMarkersChanged(appId);
    },
    [appId],
  );

  return { markers, loading, error, refresh, addMarker, updateMarker, deleteMarker };
}
