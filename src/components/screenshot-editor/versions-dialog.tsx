"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise, CopySimple, DownloadSimple, MagnifyingGlass, TrashSimple, UploadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

interface VersionRow { id: string; name: string; createdAt: string }
type Confirm = { kind: "restore" | "delete"; version: VersionRow } | null;

export function VersionsDialog({ open, onOpenChange, appId, doc, dispatch }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  appId: string; doc: ScreenshotDoc; dispatch: (a: EditorAction) => void;
}) {
  const t = useTranslations();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const base = `/api/apps/${appId}/screenshot-doc/versions`;

  const refresh = useCallback(async () => {
    const res = await fetch(base);
    if (res.ok) setVersions((await res.json()).versions);
  }, [base]);

  useEffect(() => {
    if (open) {
      setQuery("");
      void refresh();
    }
  }, [open, refresh]);

  // The API already returns them newest-first (createdAt desc, rowid desc), so filtering keeps it.
  const needle = query.trim().toLowerCase();
  const filtered = needle ? versions.filter((v) => v.name.toLowerCase().includes(needle)) : versions;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewName("");
      toast.success(t("screenshotEditor.versionSaved"));
      await refresh();
    } catch {
      toast.error(t("screenshotEditor.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: VersionRow) => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${version.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "restore" }),
      });
      if (!res.ok) throw new Error();
      const { doc: restored } = await res.json();
      dispatch({ type: "replace-doc", doc: restored });
      toast.success(t("screenshotEditor.versionRestored"));
      onOpenChange(false);
    } catch {
      toast.error(t("screenshotEditor.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (version: VersionRow) => {
    const res = await fetch(`${base}/${version.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "duplicate", name: `${version.name} (2)` }),
    });
    if (res.ok) await refresh();
  };

  const remove = async (version: VersionRow) => {
    const res = await fetch(`${base}/${version.id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `screenshot-doc-${appId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ScreenshotDoc;
      if (!Array.isArray(parsed.screenshots) || !Array.isArray(parsed.projectLanguages)) throw new Error();
      dispatch({ type: "replace-doc", doc: parsed }); // autosave persists it
      onOpenChange(false);
    } catch {
      toast.error(t("screenshotEditor.importFailed"));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("screenshotEditor.versions")}</DialogTitle>
            <DialogDescription>{t("screenshotEditor.versionsHint")}</DialogDescription>
          </DialogHeader>

          {versions.length > 0 ? (
            <div className="relative">
              <MagnifyingGlass size={14}
                               className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} className="pl-8" placeholder={t("screenshotEditor.searchVersions")}
                     onChange={(e) => setQuery(e.target.value)} />
            </div>
          ) : null}

          {/* Exactly three rows, then it scrolls: 3 × h-14 plus the two 4px gaps of space-y-1. */}
          <section className="max-h-44 space-y-1 overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("screenshotEditor.noVersions")}</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("screenshotEditor.noVersionsFound")}</p>
            ) : filtered.map((v) => (
              <div key={v.id} className="flex h-14 items-center justify-between gap-2 rounded-md border px-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                          aria-label={t("screenshotEditor.restoreVersion")}
                          onClick={() => setConfirm({ kind: "restore", version: v })}>
                    <ArrowCounterClockwise size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                          aria-label={t("screenshotEditor.duplicateVersion")} onClick={() => duplicate(v)}>
                    <CopySimple size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                          aria-label={t("screenshotEditor.delete")}
                          onClick={() => setConfirm({ kind: "delete", version: v })}>
                    <TrashSimple size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Input value={newName} placeholder={t("screenshotEditor.versionName")}
                     onChange={(e) => setNewName(e.target.value)} />
              <Button size="sm" disabled={busy || newName.trim().length === 0} onClick={save}>
                {t("screenshotEditor.saveVersion")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => importInput.current?.click()}>
                <DownloadSimple size={14} className="mr-1" />{t("screenshotEditor.importJson")}
              </Button>
              <Button size="sm" variant="outline" onClick={exportJson}>
                <UploadSimple size={14} className="mr-1" />{t("screenshotEditor.exportJson")}
              </Button>
              <input ref={importInput} type="file" accept="application/json,.json" hidden
                     onChange={(e) => importJson(e.target.files)} />
            </div>
          </section>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "restore"
                ? t("screenshotEditor.restoreConfirmTitle")
                : t("screenshotEditor.deleteVersionConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "restore"
                ? t("screenshotEditor.restoreConfirmBody", { name: confirm.version.name })
                : t("screenshotEditor.deleteVersionConfirmBody", { name: confirm?.version.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const c = confirm;
              setConfirm(null);
              if (!c) return;
              void (c.kind === "restore" ? restore(c.version) : remove(c.version));
            }}>
              {confirm?.kind === "restore" ? t("screenshotEditor.restoreVersion") : t("screenshotEditor.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
