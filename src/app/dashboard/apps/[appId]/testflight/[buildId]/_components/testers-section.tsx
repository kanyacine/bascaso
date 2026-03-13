"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CircleNotch, UserPlus, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFTester } from "@/lib/asc/testflight";
import { AddTesterDialog } from "./add-tester-dialog";

export function TestersSection({
  appId,
  buildId,
  testers,
  onRemoved,
  onTesterAdded,
}: {
  appId: string;
  buildId: string;
  testers: TFTester[];
  onRemoved: () => void;
  onTesterAdded: (tester: TFTester) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function removeTester(testerId: string) {
    setRemoving(testerId);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove tester");
      }
      toast.success("Tester removed from build");
      onRemoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove tester");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Individual testers</h3>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus size={14} className="mr-1.5" />
          Add tester
        </Button>
      </div>
      {testers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No individual testers on this build.
        </div>
      ) : (
        <div className="space-y-1">
          {testers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.firstName} {t.lastName}
                  </p>
                  {t.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {t.email}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  t.state === "INSTALLED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : t.state === "ACCEPTED"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {t.state === "INSTALLED" ? "Installed" :
                   t.state === "ACCEPTED" ? "Accepted" :
                   t.state === "NOT_INVITED" ? "Not invited" :
                   t.state === "INVITED" ? "Invited" :
                   t.state?.toLowerCase().replace(/_/g, " ") ?? "Unknown"}
                </span>
                <div className="hidden items-center gap-4 text-xs text-muted-foreground tabular-nums sm:flex">
                  <span>{t.sessions} sessions</span>
                  <span>{t.crashes} crashes</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeTester(t.id)}
                disabled={removing === t.id}
              >
                {removing === t.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddTesterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appId={appId}
        buildId={buildId}
        existingTesterIds={testers.map((t) => t.id)}
        onAdded={onTesterAdded}
      />
    </section>
  );
}
