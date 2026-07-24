"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Circle, CircleNotch, Copy } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CharCount } from "@/components/char-count";
import { FIELD_LIMITS, localeName } from "@/lib/asc/locale-names";
import { storefrontCountryCode } from "@/lib/aso/storefront-country";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { StorefrontPicker } from "../../_components/storefront-picker";

// Type-only imports – erased at compile time so no server module (db, itunes,
// provider-factory) is dragged into this client bundle.
import type {
  KeywordResearchResult,
  WorkflowStepId,
} from "@/lib/ai/workflows/keyword-research";
import type { WorkflowRunView } from "@/lib/ai/workflows/run-manager";

/** SSE payload shape (mirrors WorkflowEvent from the events module). */
interface WorkflowEventLite {
  runId: string;
  status: WorkflowRunView["status"];
  step?: WorkflowStepId;
  progress?: { step: WorkflowStepId; done: number; total: number };
}

const STEP_ORDER: readonly WorkflowStepId[] = [
  "context",
  "seeds",
  "expand",
  "score",
  "relevance",
  "rank",
  "compose",
  "report",
];

const STEP_LABEL: Record<WorkflowStepId, MessageKey> = {
  context: "aso.research.steps.context",
  seeds: "aso.research.steps.seeds",
  expand: "aso.research.steps.expand",
  score: "aso.research.steps.score",
  relevance: "aso.research.steps.relevance",
  rank: "aso.research.steps.rank",
  compose: "aso.research.steps.compose",
  report: "aso.research.steps.report",
};

interface KeywordResearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  appAppleId?: number;
  storefront: string;
  onStorefrontChange: (iso: string) => void;
  locales: string[];
  defaultLocale: string;
  getTitle: (locale: string) => string | null;
  getSubtitle: (locale: string) => string | null;
  getDescription: (locale: string) => string;
  getKeywords: (locale: string) => string;
  onAddKeywords: (keywords: string[]) => void;
}

export function KeywordResearchDialog({
  open,
  onOpenChange,
  appId,
  appName,
  appAppleId,
  storefront,
  onStorefrontChange,
  locales,
  defaultLocale,
  getTitle,
  getSubtitle,
  getDescription,
  getKeywords,
  onAddKeywords,
}: KeywordResearchDialogProps) {
  const t = useTranslations();
  const [targetLocale, setTargetLocale] = useState(defaultLocale);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<WorkflowRunView | null>(null);
  const [launching, setLaunching] = useState(false);

  const status = run?.status;
  const terminal =
    status === "succeeded" || status === "failed" || status === "cancelled";
  const phase: "form" | "progress" | "results" =
    runId == null ? "form" : terminal ? "results" : "progress";

  /** Fetch the app's latest run and adopt it when it matches `id`. */
  const fetchRun = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/apps/${appId}/aso/keyword-research`);
        const data = await res.json();
        const latest: WorkflowRunView | null = data.run ?? null;
        if (latest && latest.id === id) setRun(latest);
      } catch {
        // Ignore – the SSE stream is the primary channel.
      }
    },
    [appId],
  );

  // Reset to a clean form whenever the dialog closes.
  useEffect(() => {
    if (open) return;
    setRunId(null);
    setRun(null);
    setLaunching(false);
    setTargetLocale(defaultLocale);
  }, [open, defaultLocale]);

  // On open, resume an already-running run (catch-up GET). Terminal or absent
  // runs leave us on the form to start fresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/apps/${appId}/aso/keyword-research`);
        const data = await res.json();
        const latest: WorkflowRunView | null = data.run ?? null;
        if (cancelled) return;
        if (latest && latest.status === "running") {
          setRun(latest);
          setRunId(latest.id);
        }
      } catch {
        // Ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, appId]);

  // Live progress: subscribe to the SSE stream while a run is in flight, plus a
  // catch-up GET in case events fired before the subscription attached. The
  // EventSource attaches synchronously (before the GET resolves), so no terminal
  // event can slip through the gap. Closed on terminal status and on unmount.
  useEffect(() => {
    if (!open || runId == null || terminal) return;
    const es = new EventSource("/api/workflows/events");
    es.onmessage = (e) => {
      let evt: WorkflowEventLite;
      try {
        evt = JSON.parse(e.data) as WorkflowEventLite;
      } catch {
        return;
      }
      if (evt.runId !== runId) return;
      if (evt.status === "running") {
        setRun((prev) =>
          prev
            ? {
                ...prev,
                status: "running",
                step: evt.step ?? prev.step,
                progress: evt.progress ?? prev.progress,
              }
            : prev,
        );
      } else {
        // Terminal – pull the full run (SSE carries no result payload).
        void fetchRun(runId);
        es.close();
      }
    };
    void fetchRun(runId);
    return () => es.close();
  }, [open, runId, terminal, fetchRun]);

  async function launch() {
    const country = storefrontCountryCode(storefront);
    if (!country) {
      toast.error(t("keywords.selectStorefront"));
      return;
    }
    setLaunching(true);
    try {
      const res = await fetch(`/api/apps/${appId}/aso/keyword-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          locale: targetLocale,
          appName,
          appAppleId: appAppleId ?? null,
          title: getTitle(targetLocale) ?? undefined,
          subtitle: getSubtitle(targetLocale) ?? undefined,
          description: getDescription(targetLocale) || undefined,
          currentKeywords: getKeywords(targetLocale) || undefined,
        }),
      });
      if (res.status === 409) {
        toast.info(t("aso.research.alreadyRunning"));
        // A run already exists for this app – adopt it and follow its progress.
        const getRes = await fetch(`/api/apps/${appId}/aso/keyword-research`);
        const data = await getRes.json();
        const latest: WorkflowRunView | null = data.run ?? null;
        if (latest) {
          setRun(latest);
          setRunId(latest.id);
        }
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.runId) {
        toast.error(t("common.unknownError"));
        return;
      }
      const id: string = data.runId;
      const nowIso = new Date().toISOString();
      setRun({
        id,
        kind: "keyword-research",
        appId,
        country,
        locale: targetLocale,
        status: "running",
        step: null,
        progress: null,
        result: null,
        error: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      setRunId(id);
    } catch {
      toast.error(t("common.networkError"));
    } finally {
      setLaunching(false);
    }
  }

  async function cancel() {
    if (!runId) return;
    try {
      await fetch(
        `/api/apps/${appId}/aso/keyword-research?runId=${encodeURIComponent(runId)}`,
        { method: "DELETE" },
      );
    } catch {
      // Ignore – return to the form regardless.
    }
    setRunId(null);
    setRun(null);
  }

  function addAll(result: KeywordResearchResult) {
    onAddKeywords(result.candidates.map((c) => c.keyword));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] !grid grid-rows-[auto_1fr] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("aso.research.autoTitle")}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="pr-3">
            {phase === "form" && (
              <FormView
                storefront={storefront}
                onStorefrontChange={onStorefrontChange}
                locales={locales}
                targetLocale={targetLocale}
                onTargetLocaleChange={setTargetLocale}
                launching={launching}
                onLaunch={launch}
                onCancel={() => onOpenChange(false)}
              />
            )}
            {phase === "progress" && (
              <ProgressView run={run} onCancel={cancel} />
            )}
            {phase === "results" && run && (
              <ResultsView run={run} onAddAll={addAll} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FormView({
  storefront,
  onStorefrontChange,
  locales,
  targetLocale,
  onTargetLocaleChange,
  launching,
  onLaunch,
  onCancel,
}: {
  storefront: string;
  onStorefrontChange: (iso: string) => void;
  locales: string[];
  targetLocale: string;
  onTargetLocaleChange: (locale: string) => void;
  launching: boolean;
  onLaunch: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="section-title">{t("keywords.selectStorefront")}</h3>
        <StorefrontPicker value={storefront} onChange={onStorefrontChange} />
      </section>

      <section className="space-y-2">
        <h3 className="section-title">{t("appDetails.baseLanguage")}</h3>
        <Select value={targetLocale} onValueChange={onTargetLocaleChange}>
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {localeName(locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onLaunch} disabled={launching}>
          {launching && <CircleNotch className="size-4 animate-spin" />}
          {t("aso.research.autoButton")}
        </Button>
      </div>
    </div>
  );
}

function ProgressView({
  run,
  onCancel,
}: {
  run: WorkflowRunView | null;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const activeStep = run?.step ?? null;
  const activeIndex = activeStep ? STEP_ORDER.indexOf(activeStep) : 0;

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {STEP_ORDER.map((step, i) => {
          const state =
            i < activeIndex ? "done" : i === activeIndex ? "current" : "pending";
          const showCount =
            state === "current" &&
            (step === "score" || step === "relevance") &&
            run?.progress != null &&
            run.progress.step === step &&
            run.progress.total > 0;

          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              {state === "done" ? (
                <Check className="size-4 shrink-0 text-green-600" weight="bold" />
              ) : state === "current" ? (
                <CircleNotch className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  state === "pending" && "text-muted-foreground",
                  state === "current" && "font-medium",
                )}
              >
                {t(STEP_LABEL[step])}
              </span>
              {showCount && run?.progress && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {run.progress.done}/{run.progress.total}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end pt-2">
        <Button variant="outline" onClick={onCancel}>
          {t("aso.research.cancel")}
        </Button>
      </div>
    </div>
  );
}

function ResultsView({
  run,
  onAddAll,
}: {
  run: WorkflowRunView;
  onAddAll: (result: KeywordResearchResult) => void;
}) {
  const t = useTranslations();
  const result = run.result;
  const failed = run.status === "failed";

  return (
    <div className="space-y-6">
      {failed && (
        <div className="error-banner">
          {t("aso.research.failedAt", {
            step: run.step ? t(STEP_LABEL[run.step]) : "",
          })}
        </div>
      )}

      {!result ? (
        <p className="text-sm text-muted-foreground">{t("common.unknownError")}</p>
      ) : (
        <>
          {result.candidates.length > 0 && (
            <Button onClick={() => onAddAll(result)}>
              {t("aso.research.addAll", { count: result.candidates.length })}
            </Button>
          )}

          {result.proposal && (
            <section className="space-y-3">
              <h3 className="section-title">{t("aso.research.proposal")}</h3>
              <Card className="gap-0 py-0">
                <CardContent className="space-y-4 py-4">
                  <ProposalField
                    label={t("appDetails.name")}
                    value={result.proposal.title}
                    limit={FIELD_LIMITS.name}
                  />
                  <ProposalField
                    label={t("appDetails.subtitle")}
                    value={result.proposal.subtitle}
                    limit={FIELD_LIMITS.subtitle}
                  />
                  <ProposalField
                    label={t("storeListing.fields.keywords")}
                    value={result.proposal.keywords}
                    limit={FIELD_LIMITS.keywords}
                  />
                  {result.proposal.summary && (
                    <p className="text-sm text-muted-foreground">
                      {result.proposal.summary}
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProposalField({
  label,
  value,
  limit,
}: {
  label: string;
  value: string;
  limit: number;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{label}</h4>
        <CharCount value={value} limit={limit} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={value}
          className="min-w-0 flex-1 font-mono text-sm"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={t("common.copy")}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success(t("keywords.researchCopied"));
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}
