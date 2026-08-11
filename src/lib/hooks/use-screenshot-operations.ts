"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { apiFetch } from "@/lib/api-fetch";
import { displayTypeLabel, type AscScreenshotSet } from "@/lib/asc/display-types";

interface UseScreenshotOperationsOptions {
  apiBase: string;
  localizationId: string;
  refresh: () => Promise<void>;
  screenshotSets: AscScreenshotSet[];
  setScreenshotSets: React.Dispatch<React.SetStateAction<AscScreenshotSet[]>>;
  /** Every localization of the version – the cross-locale delete needs their ids. */
  localizations: { id: string }[];
  appId: string;
  versionId: string;
}

export function useScreenshotOperations({
  apiBase,
  localizationId,
  refresh,
  screenshotSets,
  setScreenshotSets,
  localizations,
  appId,
  versionId,
}: UseScreenshotOperationsOptions) {
  const [uploadingSetIds, setUploadingSetIds] = useState<Set<string>>(
    new Set(),
  );
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [creatingVariant, setCreatingVariant] = useState(false);

  const handleUpload = useCallback(
    async (setId: string, file: File) => {
      setUploadingSetIds((prev) => new Set(prev).add(setId));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("setId", setId);

        await apiFetch(apiBase, { method: "POST", body: formData });
        toast.success("Screenshot uploaded");
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to upload screenshot",
        );
      } finally {
        setUploadingSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    },
    [apiBase, refresh],
  );

  const handleDeleteScreenshot = useCallback(
    async (screenshotId: string) => {
      if (deletingIds.has(screenshotId)) return;
      setDeletingIds((prev) => new Set(prev).add(screenshotId));
      try {
        await apiFetch(`${apiBase}/${screenshotId}`, { method: "DELETE" });
        toast.success("Screenshot deleted");
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete screenshot",
        );
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(screenshotId);
          return next;
        });
      }
    },
    [apiBase, deletingIds, refresh],
  );

  const handleDragEnd = useCallback(
    async (setId: string, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const set = screenshotSets.find((s) => s.id === setId);
      if (!set) return;

      const ids = set.screenshots.map((s) => s.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newOrder = arrayMove(ids, oldIndex, newIndex);
      const reorderedScreenshots = arrayMove(set.screenshots, oldIndex, newIndex);

      // Optimistic update
      setScreenshotSets((prev) =>
        prev.map((s) =>
          s.id === setId ? { ...s, screenshots: reorderedScreenshots } : s,
        ),
      );

      try {
        await apiFetch(`${apiBase}/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId, screenshotIds: newOrder }),
        });
      } catch (err) {
        // Revert on failure
        setScreenshotSets((prev) =>
          prev.map((s) =>
            s.id === setId ? { ...s, screenshots: set.screenshots } : s,
          ),
        );
        toast.error(
          err instanceof Error ? err.message : "Failed to reorder screenshots",
        );
      }
    },
    [apiBase, screenshotSets, setScreenshotSets],
  );

  const handleAddVariant = useCallback(
    async (displayType: string) => {
      if (!localizationId) return;
      setCreatingVariant(true);
      try {
        await apiFetch(`${apiBase}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayType }),
        });
        toast.success(`Added ${displayTypeLabel(displayType)}`);
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create screenshot set",
        );
      } finally {
        setCreatingVariant(false);
      }
    },
    [apiBase, localizationId, refresh],
  );

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      try {
        await apiFetch(`${apiBase}/sets`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId }),
        });
        toast.success("Variant removed");
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to remove variant",
        );
      }
    },
    [apiBase, refresh],
  );

  /** Same variant, every localization of the version – screenshots inside it go with it. */
  const handleDeleteSetEverywhere = useCallback(
    async (displayType: string) => {
      try {
        const removed = await Promise.all(
          localizations.map(async (loc) => {
            const base = `/api/apps/${appId}/versions/${versionId}/localizations/${loc.id}/screenshots`;
            const { screenshotSets: sets } = await apiFetch<{ screenshotSets: AscScreenshotSet[] }>(base);
            const set = sets?.find((s) => s.attributes.screenshotDisplayType === displayType);
            if (!set) return false;
            await apiFetch(`${base}/sets`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ setId: set.id }),
            });
            return true;
          }),
        );
        const count = removed.filter(Boolean).length;
        toast.success(`Variant removed from ${count} language${count === 1 ? "" : "s"}`);
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to remove variant",
        );
        await refresh(); // a partial run leaves the page stale
      }
    },
    [appId, versionId, localizations, refresh],
  );

  return {
    uploadingSetIds,
    deletingIds,
    creatingVariant,
    handleUpload,
    handleDeleteScreenshot,
    handleDragEnd,
    handleAddVariant,
    handleDeleteSet,
    handleDeleteSetEverywhere,
  };
}
