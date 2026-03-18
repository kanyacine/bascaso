"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import type { SectionChange } from "@/lib/change-buffer";

interface ChangeBufferContextValue {
  /** Whether the review-before-saving mode is enabled. */
  bufferEnabled: boolean;
  /** All pending changes for the current app. */
  changes: SectionChange[];
  /** Total pending change count across all apps (for badge). */
  totalCount: number;
  /** Get buffered data for a specific section + scope. */
  getSection: (section: string, scope: string) => SectionChange | null;
  /** Check if a section has pending changes. */
  hasChanges: (section: string, scope?: string) => boolean;
  /** Save (upsert) a section's changes to the buffer. */
  saveSection: (
    appId: string,
    section: string,
    scope: string,
    data: Record<string, unknown>,
    originalData: Record<string, unknown>,
  ) => void;
  /** Discard a single field from a section's changes. */
  discardField: (appId: string, section: string, scope: string, locale: string | null, field: string) => void;
  /** Discard changes for a section + scope. */
  discardSection: (appId: string, section: string, scope: string) => void;
  /** Discard all changes for the current app. */
  discardAll: (appId: string) => void;
  /** Publish all changes for an app to ASC. Returns true if all succeeded. */
  publishAll: (appId: string) => Promise<boolean>;
  /** Refresh from server. */
  refresh: (appId: string) => Promise<void>;
}

const ChangeBufferContext = createContext<ChangeBufferContextValue | null>(null);

export function useChangeBuffer() {
  const ctx = useContext(ChangeBufferContext);
  if (!ctx) throw new Error("useChangeBuffer must be used within ChangeBufferProvider");
  return ctx;
}

export function ChangeBufferProvider({ children }: { children: ReactNode }) {
  const { appId } = useParams<{ appId?: string }>();
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [changes, setChanges] = useState<SectionChange[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const loadedAppRef = useRef<string | null>(null);

  // Fetch review-before-saving preference on mount
  useEffect(() => {
    fetch("/api/app-preferences/review-mode")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setBufferEnabled(data.enabled);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async (appId: string) => {
    try {
      const res = await fetch(`/api/changes/${appId}`);
      if (res.ok) {
        const data = await res.json();
        setChanges(data.changes ?? []);
        setTotalCount(data.totalCount ?? 0);
        loadedAppRef.current = appId;
      }
    } catch {
      // Silently fail – buffer is optional
    }
  }, []);

  // Auto-load changes when app ID is known (from URL)
  useEffect(() => {
    if (!appId || appId === loadedAppRef.current) return;
    loadedAppRef.current = appId;
    let cancelled = false;
    fetch(`/api/changes/${appId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        setChanges(data.changes ?? []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [appId]);

  const getSection = useCallback(
    (section: string, scope: string) =>
      changes.find((c) => c.section === section && c.scope === scope) ?? null,
    [changes],
  );

  const hasChanges = useCallback(
    (section: string, scope?: string) => {
      if (scope) return changes.some((c) => c.section === section && c.scope === scope);
      return changes.some((c) => c.section === section);
    },
    [changes],
  );

  const saveSection = useCallback(
    (
      appId: string,
      section: string,
      scope: string,
      data: Record<string, unknown>,
      originalData: Record<string, unknown>,
    ) => {
      // Optimistic update
      setChanges((prev) => {
        const idx = prev.findIndex((c) => c.section === section && c.scope === scope);
        const entry: SectionChange = {
          id: idx >= 0 ? prev[idx].id : "",
          appId,
          section,
          scope,
          data,
          originalData,
          updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        setTotalCount((c) => c + 1);
        return [...prev, entry];
      });

      // Persist to server (fire and forget)
      fetch(`/api/changes/${appId}/${section}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, data, originalData }),
      }).catch(() => {});
    },
    [],
  );

  const discardField = useCallback(
    (appId: string, section: string, scope: string, locale: string | null, field: string) => {
      setChanges((prev) => {
        const idx = prev.findIndex((c) => c.section === section && c.scope === scope);
        if (idx < 0) return prev;
        const entry = prev[idx];
        const newData = { ...entry.data };
        const newOriginal = { ...entry.originalData };

        if (locale) {
          // Remove a locale field
          const locales = { ...(newData.locales as Record<string, Record<string, unknown>> ?? {}) };
          const origLocales = { ...(newOriginal.locales as Record<string, Record<string, unknown>> ?? {}) };
          if (locales[locale]) {
            const fields = { ...locales[locale] };
            delete fields[field];
            if (Object.keys(fields).length === 0) delete locales[locale]; else locales[locale] = fields;
          }
          if (origLocales[locale]) {
            const fields = { ...origLocales[locale] };
            delete fields[field];
            if (Object.keys(fields).length === 0) delete origLocales[locale]; else origLocales[locale] = fields;
          }
          if (Object.keys(locales).length === 0) delete newData.locales; else newData.locales = locales;
          if (Object.keys(origLocales).length === 0) delete newOriginal.locales; else newOriginal.locales = origLocales;
        } else {
          // Remove a top-level field
          delete newData[field];
          delete newOriginal[field];
        }

        // If no changes left, remove the entire section
        const hasLocales = newData.locales && Object.keys(newData.locales as Record<string, unknown>).length > 0;
        const skipKeys = new Set(["locales", "localeIds", "phasedReleaseId"]);
        const hasAttrs = Object.keys(newData).some((k) => !skipKeys.has(k));
        if (!hasLocales && !hasAttrs) {
          const next = prev.filter((_, i) => i !== idx);
          setTotalCount((c) => Math.max(0, c - 1));
          fetch(`/api/changes/${appId}/${section}?scope=${encodeURIComponent(scope)}`, { method: "DELETE" }).catch(() => {});
          return next;
        }

        const next = [...prev];
        next[idx] = { ...entry, data: newData, originalData: newOriginal };
        // Persist updated entry
        fetch(`/api/changes/${appId}/${section}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, data: newData, originalData: newOriginal }),
        }).catch(() => {});
        return next;
      });
    },
    [],
  );

  const discardSection = useCallback(
    (appId: string, section: string, scope: string) => {
      setChanges((prev) => {
        const next = prev.filter((c) => !(c.section === section && c.scope === scope));
        if (next.length < prev.length) setTotalCount((c) => Math.max(0, c - 1));
        return next;
      });
      fetch(`/api/changes/${appId}/${section}?scope=${encodeURIComponent(scope)}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    [],
  );

  const discardAll = useCallback(
    (appId: string) => {
      const count = changes.length;
      setChanges([]);
      setTotalCount((c) => Math.max(0, c - count));
      fetch(`/api/changes/${appId}`, { method: "DELETE" }).catch(() => {});
    },
    [changes.length],
  );

  const publishAll = useCallback(
    async (appId: string): Promise<boolean> => {
      const res = await fetch("/api/changes/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const result = await res.json();
      // Refresh to get updated state (successful sections cleared, failed remain)
      await refresh(appId);
      return result.ok;
    },
    [refresh],
  );

  return (
    <ChangeBufferContext.Provider
      value={{
        bufferEnabled,
        changes,
        totalCount,
        getSection,
        hasChanges,
        saveSection,
        discardField,
        discardSection,
        discardAll,
        publishAll,
        refresh,
      }}
    >
      {children}
    </ChangeBufferContext.Provider>
  );
}

/**
 * Hook for a specific page section. Provides buffered data and auto-save.
 */
export function useSectionBuffer(appId: string, section: string, scope: string) {
  const { bufferEnabled, getSection, saveSection, discardSection, refresh } = useChangeBuffer();
  const loadedRef = useRef(false);

  // Load buffer on mount
  useEffect(() => {
    if (!loadedRef.current && appId) {
      loadedRef.current = true;
      refresh(appId);
    }
  }, [appId, refresh]);

  const buffered = getSection(section, scope);

  const save = useCallback(
    (data: Record<string, unknown>, originalData: Record<string, unknown>) => {
      if (!appId || !scope) return;
      saveSection(appId, section, scope, data, originalData);
    },
    [appId, section, scope, saveSection],
  );

  const discard = useCallback(() => {
    if (!appId || !scope) return;
    discardSection(appId, section, scope);
  }, [appId, section, scope, discardSection]);

  return {
    bufferEnabled,
    bufferedData: buffered?.data ?? null,
    originalData: buffered?.originalData ?? null,
    hasChanges: !!buffered,
    save,
    discard,
  };
}
