"use client";

import { useState } from "react";
import { CheckCircle, Circle, Bell, Timer } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useBuildAction } from "@/lib/build-action-context";
import { ActionFooter } from "@/components/layout/action-footer";

function BetaSubmitChecklist({ hasWhatsNew, hasExternalGroup }: { hasWhatsNew: boolean; hasExternalGroup: boolean }) {
  const items = [
    { label: "What's new", done: hasWhatsNew },
    { label: "External group", done: hasExternalGroup },
  ];

  return (
    <div className="flex items-center gap-3.5">
      {items.map((item) => (
        <span
          key={item.label}
          className={`flex items-center gap-1.5 text-xs ${item.done ? "text-muted-foreground" : "text-muted-foreground/60"}`}
        >
          {item.done
            ? <CheckCircle size={14} weight="fill" className="text-green-500/70" />
            : <Circle size={14} />}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function BuildActionFooter() {
  const { state, refresh, save, clear } = useBuildAction();
  const [loading, setLoading] = useState<string | null>(null);
  const [expireOpen, setExpireOpen] = useState(false);

  if (!state) return null;

  const { appId, buildId, status, hasWhatsNew, hasExternalGroup } = state;
  const base = `/api/apps/${appId}/testflight/builds/${buildId}`;

  async function act(action: string, successMsg: string) {
    setLoading(action);
    try {
      await apiFetch(`${base}/${action}`, { method: "POST" });
      toast.success(successMsg);
      clear();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed: ${action}`);
    } finally {
      setLoading(null);
    }
  }

  if (status === "Ready to submit") {
    return (
      <ActionFooter left={<BetaSubmitChecklist hasWhatsNew={hasWhatsNew} hasExternalGroup={hasExternalGroup} />}>
        <div className="flex items-center gap-2">
          <ExpireButton
            open={expireOpen}
            onOpenChange={setExpireOpen}
            loading={loading === "expire"}
            onConfirm={() => act("expire", "Build expired")}
          />
          <Button
            disabled={!hasWhatsNew || !hasExternalGroup || loading !== null}
            onClick={async () => {
              setLoading("submit-for-review");
              try {
                await save();
                await apiFetch(`${base}/submit-for-review`, { method: "POST" });
                toast.success("Submitted for beta review");
                clear();
                refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to submit");
              } finally {
                setLoading(null);
              }
            }}
          >
            {loading === "submit-for-review" && <Spinner className="mr-1.5" />}
            Submit for review
          </Button>
        </div>
      </ActionFooter>
    );
  }

  if (status === "Missing compliance") {
    return (
      <ActionFooter>
        <Button
          disabled={loading !== null}
          onClick={() => act("export-compliance", "Export compliance declared")}
        >
          {loading === "export-compliance" && <Spinner className="mr-1.5" />}
          Declare no encryption
        </Button>
      </ActionFooter>
    );
  }

  if (status === "Testing" || status === "Ready to test") {
    return (
      <ActionFooter>
        <div className="flex items-center gap-2">
          <ExpireButton
            open={expireOpen}
            onOpenChange={setExpireOpen}
            loading={loading === "expire"}
            onConfirm={() => act("expire", "Build expired")}
          />
          <Button
            variant="outline"
            disabled={loading !== null}
            onClick={async () => {
              setLoading("notify-testers");
              try {
                const res = await apiFetch<{ autoNotified?: boolean }>(`${base}/notify-testers`, { method: "POST" });
                toast.success(res.autoNotified ? "Testers already auto-notified" : "Testers notified");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to notify testers");
              } finally {
                setLoading(null);
              }
            }}
          >
            {loading === "notify-testers"
              ? <Spinner className="mr-1.5" />
              : <Bell size={14} className="mr-1.5" />}
            Notify testers
          </Button>
        </div>
      </ActionFooter>
    );
  }

  if (status === "In beta review") {
    return (
      <ActionFooter>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Timer size={14} />
          Waiting for Apple review
        </span>
      </ActionFooter>
    );
  }

  return null;
}

function ExpireButton({
  open,
  onOpenChange,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="ghost"
        disabled={loading}
        onClick={() => onOpenChange(true)}
      >
        {loading && <Spinner className="mr-1.5" />}
        Expire build
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Expire this build?</AlertDialogTitle>
          <AlertDialogDescription>
            This is irreversible. Internal and external testers will no longer be able to install this build.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Expire build
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

