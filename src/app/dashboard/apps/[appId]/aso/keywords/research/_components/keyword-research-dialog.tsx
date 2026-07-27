"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Circle,
  CircleNotch,
  Copy,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  KeywordTagInput,
  splitKeywords,
} from "@/components/keyword-tag-input";
import { KeywordDistributionBars } from "@/components/keyword-distribution-bars";
import { KeywordDetailDialog } from "@/components/keyword-detail-dialog";
import { useKeywordScores } from "@/lib/hooks/use-keyword-scores";
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
import { storefrontLocales } from "@/lib/asc/storefronts";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";
import { aiErrorMessage, MANAGED_WORKFLOW_ERROR_CODES } from "@/lib/ai/ai-error";
import { cn } from "@/lib/utils";
import { StorefrontPicker } from "../../_components/storefront-picker";

// Type-only imports – erased at compile time so no server module (db, itunes,
// provider-factory) is dragged into this client bundle.
import type { WorkflowStepId } from "@/lib/ai/workflows/keyword-research";
// Value import – strategies.ts is a leaf (types only), so no server code
// reaches this client bundle.
import {
  DEFAULT_STRATEGY,
  RESEARCH_STRATEGIES,
  STRATEGIES,
  type ResearchStrategy,
} from "@/lib/ai/workflows/strategies";
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
  "relevance",
  "score",
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

// Mirrors the backend's per-action replay window – kept as a local literal
// (not imported from keyword-research.ts) so this "use client" file never
// pulls in that module's server-only dependencies (db, itunes,
// provider-factory), same reasoning as the STEP_LABEL/WorkflowStepId
// type-only imports above.
const MANAGED_ACTION_WINDOW_MS = 90 * 60 * 1000;
// Mirrors MAX_RUN_DURATION_MS in keyword-research.ts – a retry's own worst
// case is bounded by the same wall-clock budget the original run was.
const WORKFLOW_MAX_DURATION_MS = 60 * 60 * 1000;
/**
 * A retry only reuses the original run's actionId (free replay) if there is
 * enough of the 90-minute window left that the retry's OWN worst-case
 * duration – up to WORKFLOW_MAX_DURATION_MS, the same wall-clock budget
 * that bounds any run – cannot push its eventual compose call past the
 * window. So the safe threshold is the window minus that worst case (30
 * min), not the raw 90: a run that already burned close to its own budget
 * before failing is exactly the case that must NOT be offered a free retry,
 * because retrying it can also take up to another hour. A fast failure
 * (the common case) leaves the action recent, comfortably inside 30 min, so
 * it stays free.
 *
 * The argument is `actionStartedAt` – when the actionId was MINTED – never a
 * run's own `createdAt`. The two only agree on the first hop: each retry
 * writes a fresh row while reusing the same action, so measuring from
 * `createdAt` restarted the backend's clock at every hop, and a chain of two
 * or more retries kept promising a free replay well past the real 90-minute
 * window – the replay then failing with `action_exhausted`.
 */
const SAFE_RETRY_WINDOW_MS = MANAGED_ACTION_WINDOW_MS - WORKFLOW_MAX_DURATION_MS;

export function canRetryForFree(actionStartedAt: string): boolean {
  return Date.now() - new Date(actionStartedAt).getTime() < SAFE_RETRY_WINDOW_MS;
}

interface KeywordResearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  appAppleId?: number;
  storefront: string;
  onStorefrontChange: (iso: string) => void;
  getTitle: (locale: string) => string | null;
  getSubtitle: (locale: string) => string | null;
  getDescription: (locale: string) => string;
  getKeywords: (locale: string) => string;
  onAddKeywords: (keywords: string[]) => void;
  readOnly: boolean;
  onApplyKeywords: (locale: string, keywords: string) => void;
}

export function KeywordResearchDialog({
  open,
  onOpenChange,
  appId,
  appName,
  appAppleId,
  storefront,
  onStorefrontChange,
  getTitle,
  getSubtitle,
  getDescription,
  getKeywords,
  onAddKeywords,
  readOnly,
  onApplyKeywords,
}: KeywordResearchDialogProps) {
  const t = useTranslations();
  const researchLocales = useMemo(() => storefrontLocales(storefront), [storefront]);
  const [targetLocale, setTargetLocale] = useState(researchLocales[0] ?? "en-US");
  const [strategy, setStrategy] = useState<ResearchStrategy>(DEFAULT_STRATEGY);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<WorkflowRunView | null>(null);
  const [launching, setLaunching] = useState(false);
  const [history, setHistory] = useState<WorkflowRunView[]>([]);
  const [viewingHistory, setViewingHistory] = useState(false);
  const country = storefrontCountryCode(storefront);

  const status = run?.status;
  const terminal =
    status === "succeeded" || status === "failed" || status === "cancelled";
  const phase: "form" | "progress" | "results" =
    runId == null ? "form" : terminal ? "results" : "progress";

  /** Adopt a terminal run from the history list – read-only (the SSE effect
   *  never subscribes when `terminal` is true). */
  function openHistory(entry: WorkflowRunView) {
    setRun(entry);
    setRunId(entry.id);
    setViewingHistory(true);
  }

  /** Back from a historized report to the form (with the history list). */
  function backToForm() {
    setRun(null);
    setRunId(null);
    setViewingHistory(false);
  }

  /** Delete one persisted report from the history list. */
  async function deleteHistory(entry: WorkflowRunView) {
    try {
      await fetch(
        `/api/apps/${appId}/aso/keyword-research?runId=${encodeURIComponent(entry.id)}&delete=1`,
        { method: "DELETE" },
      );
      setHistory((prev) => prev.filter((h) => h.id !== entry.id));
    } catch {
      toast.error(t("common.networkError"));
    }
  }

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
    setViewingHistory(false);
    setTargetLocale(researchLocales[0] ?? "en-US");
  }, [open, researchLocales]);

  // Keep the base language within the storefront's Apple-indexed set.
  useEffect(() => {
    if (!researchLocales.includes(targetLocale)) {
      setTargetLocale(researchLocales[0] ?? "en-US");
    }
  }, [researchLocales, targetLocale]);

  // Report history for the selected storefront + language. Refetched when
  // either changes; only shown on the form (before starting a run).
  useEffect(() => {
    if (!open || phase !== "form" || !country) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/apps/${appId}/aso/keyword-research?list=1&country=${encodeURIComponent(country)}&locale=${encodeURIComponent(targetLocale)}`,
        );
        const data = await res.json();
        if (!cancelled) setHistory(Array.isArray(data.runs) ? data.runs : []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, phase, appId, country, targetLocale]);

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

  // `retryActionId` reuses a previous (failed) run's action instead of
  // minting a fresh one – see startKeywordResearch. Replaying the same
  // actionId is free within the backend's window, so a retry never bills a
  // second credit for the same gesture.
  async function launch(retryActionId?: string) {
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
          strategy,
          ...(retryActionId ? { actionId: retryActionId } : {}),
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
        // The real (resolved server-side) actionId lands on the next
        // catch-up GET; irrelevant meanwhile since retry only reads it from
        // a terminal run.
        actionId: retryActionId ?? null,
        // A retry inherits the action's original mint time – NOT this row's
        // own start, which would restart the replay window (see run-manager's
        // mintedAt, which is the authoritative version of this same rule).
        actionStartedAt: (retryActionId && run?.actionStartedAt) || nowIso,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] !grid grid-rows-[auto_1fr] gap-0">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-2">
            {viewingHistory && phase === "results" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={t("common.back")}
                onClick={backToForm}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <DialogTitle>{t("aso.research.autoTitle")}</DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="pr-3">
            {phase === "form" && (
              <FormView
                storefront={storefront}
                onStorefrontChange={onStorefrontChange}
                locales={researchLocales}
                targetLocale={targetLocale}
                onTargetLocaleChange={setTargetLocale}
                strategy={strategy}
                onStrategyChange={setStrategy}
                history={history}
                onOpenHistory={openHistory}
                onDeleteHistory={deleteHistory}
                launching={launching}
                // Wrappé : `launch` prend un actionId optionnel en 1er
                // argument, et le passer nu à un onClick lui refilait
                // l'événement React – JSON.stringify du body explosait alors
                // sur la structure circulaire, capté par le catch générique
                // qui affichait « Erreur réseau » sans qu'aucun fetch parte.
                onLaunch={() => launch()}
                onCancel={() => onOpenChange(false)}
              />
            )}
            {phase === "progress" && (
              <ProgressView run={run} onCancel={cancel} />
            )}
            {phase === "results" && run && (
              <ResultsView
                run={run}
                appAppleId={appAppleId}
                readOnly={readOnly}
                onApplyKeywords={onApplyKeywords}
                onAddKeywords={onAddKeywords}
                onRetry={() =>
                  launch(
                    run.actionId && canRetryForFree(run.actionStartedAt)
                      ? run.actionId
                      : undefined,
                  )
                }
                retrying={launching}
              />
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
  strategy,
  onStrategyChange,
  history,
  onOpenHistory,
  onDeleteHistory,
  launching,
  onLaunch,
  onCancel,
}: {
  storefront: string;
  onStorefrontChange: (iso: string) => void;
  locales: string[];
  targetLocale: string;
  onTargetLocaleChange: (locale: string) => void;
  strategy: ResearchStrategy;
  onStrategyChange: (s: ResearchStrategy) => void;
  history: WorkflowRunView[];
  onOpenHistory: (run: WorkflowRunView) => void;
  onDeleteHistory: (run: WorkflowRunView) => void;
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

      <section className="space-y-2">
        <h3 className="section-title">{t("aso.research.strategy")}</h3>
        <Select
          value={strategy}
          onValueChange={(v) => onStrategyChange(v as ResearchStrategy)}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_STRATEGIES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(STRATEGIES[s].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h3 className="section-title">{t("aso.research.history")}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("appDetails.name")}</TableHead>
                <TableHead>{t("aso.research.strategy")}</TableHead>
                <TableHead>{t("aso.research.date")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => {
                const runStrategy = h.result?.strategy ?? "balanced";
                return (
                  <TableRow key={h.id}>
                    <TableCell className="p-0">
                      <button
                        type="button"
                        onClick={() => onOpenHistory(h)}
                        className="block w-full truncate px-3 py-2 text-left font-medium hover:underline"
                      >
                        {h.result?.proposal?.title ?? t("aso.research.autoTitle")}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge className={STRATEGIES[runStrategy].chipClass}>
                        {t(STRATEGIES[runStrategy].labelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        aria-label={t("common.remove")}
                        onClick={() => onDeleteHistory(h)}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

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
            (step === "expand" || step === "score" || step === "relevance") &&
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
  appAppleId,
  readOnly,
  onApplyKeywords,
  onAddKeywords,
  onRetry,
  retrying,
}: {
  run: WorkflowRunView;
  appAppleId?: number;
  readOnly: boolean;
  onApplyKeywords: (locale: string, keywords: string) => void;
  onAddKeywords: (keywords: string[]) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useTranslations();
  const result = run.result;
  const failed = run.status === "failed";
  const failureMessage =
    failed && run.error && MANAGED_WORKFLOW_ERROR_CODES.has(run.error) ? aiErrorMessage(run.error, t) : null;
  const hasProposal = result?.proposal != null;
  // Some keywords couldn't be scored (iTunes stayed throttled) – the
  // proposal below is real but built from less data than usual. Gated on
  // whether a proposal is actually being shown, not on overall run status:
  // a run that skipped keywords but still produced a proposal (e.g. it later
  // failed at "report", an unrelated step) carries the exact same caveat, and
  // the disclosure must not disappear just because something else broke.
  const skippedCount = result?.skippedKeywords?.length ?? 0;
  const degraded = hasProposal && skippedCount > 0;

  // Auto-dump every researched candidate into the research table so it
  // participates in the shared score cache. Fires once per distinct report
  // shown (fresh or history); mergeKeywords dedups on the parent side.
  const candidateCount = result?.candidates.length ?? 0;
  useEffect(() => {
    if (result && candidateCount > 0) {
      onAddKeywords(result.candidates.map((c) => c.keyword));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  return (
    <div className="space-y-6">
      {failed && (
        <div className="error-banner space-y-2">
          <p>
            {run.step
              ? t("aso.research.failedAt", { step: t(STEP_LABEL[run.step]) })
              : t("aso.research.failedGeneric")}
          </p>
          {failureMessage && <p>{failureMessage}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying && <CircleNotch className="size-4 animate-spin" />}
              {t("common.retry")}
            </Button>
            {run.actionId && (
              <span className="text-xs text-muted-foreground">
                {t(
                  canRetryForFree(run.actionStartedAt)
                    ? "aso.research.retryHint"
                    : "aso.research.retryUsesNewCredit",
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {degraded && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2">
          <Warning size={14} className="mt-0.5 shrink-0 text-amber-500" weight="fill" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t(
              skippedCount === 1 ? "aso.research.degraded" : "aso.research.degradedPlural",
              { count: skippedCount },
            )}
          </p>
        </div>
      )}

      {!result ? (
        <p className="text-sm text-muted-foreground">{t("common.unknownError")}</p>
      ) : (
        result.proposal && (
          <section className="space-y-3">
            <h3 className="section-title">{t("aso.research.proposal")}</h3>
            <Card className="gap-0 py-0">
              <CardContent className="space-y-4 py-4">
                <ProposalField
                  label={t("appDetails.name")}
                  value={result.proposal.title}
                  limit={FIELD_LIMITS.name}
                  canApply={false}
                  applyDisabledHint={t("aso.research.editedElsewhere")}
                />
                <ProposalField
                  label={t("appDetails.subtitle")}
                  value={result.proposal.subtitle}
                  limit={FIELD_LIMITS.subtitle}
                  canApply={false}
                  applyDisabledHint={t("aso.research.editedElsewhere")}
                />
                <ProposalKeywordField
                  label={t("storeListing.fields.keywords")}
                  value={result.proposal.keywords}
                  country={run.country}
                  appAppleId={appAppleId}
                  canApply={!readOnly}
                  onApply={() =>
                    onApplyKeywords(run.locale, result.proposal!.keywords)
                  }
                />
                {result.proposal.summary && (
                  <p className="text-sm text-muted-foreground">
                    {result.proposal.summary}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        )
      )}
    </div>
  );
}

function ApplyButton({
  canApply,
  hint,
  onApply,
}: {
  canApply: boolean;
  hint?: string;
  onApply?: () => void;
}) {
  const t = useTranslations();
  const btn = (
    <Button
      variant="outline"
      size="icon"
      aria-label={t("aso.research.apply")}
      disabled={!canApply}
      onClick={() => {
        onApply?.();
        toast.success(t("aso.research.applied"));
      }}
    >
      <Plus className="size-4" />
    </Button>
  );
  if (canApply || !hint) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{btn}</span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function ProposalField({
  label,
  value,
  limit,
  canApply,
  applyDisabledHint,
  onApply,
}: {
  label: string;
  value: string;
  limit: number;
  canApply: boolean;
  applyDisabledHint?: string;
  onApply?: () => void;
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
        <ApplyButton canApply={canApply} hint={applyDisabledHint} onApply={onApply} />
      </div>
    </div>
  );
}

function ProposalKeywordField({
  label,
  value,
  country,
  appAppleId,
  canApply,
  onApply,
}: {
  label: string;
  value: string;
  country: string;
  appAppleId?: number;
  canApply: boolean;
  onApply: () => void;
}) {
  const t = useTranslations();
  const words = splitKeywords(value);
  const getTagScore = useKeywordScores(words, country, appAppleId);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{label}</h4>
        <CharCount value={value} limit={FIELD_LIMITS.keywords} />
      </div>
      <div className="flex items-start gap-2">
        <Card className="min-w-0 flex-1 gap-0 py-0">
          <CardContent className="py-3">
            <KeywordTagInput
              value={value}
              onChange={() => {}}
              readOnly
              getTagScore={getTagScore}
              onTagClick={setDetailIndex}
            />
          </CardContent>
        </Card>
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
        <ApplyButton canApply={canApply} onApply={onApply} />
      </div>
      <KeywordDistributionBars words={words} getTagScore={getTagScore} />
      <KeywordDetailDialog
        words={words}
        openIndex={detailIndex}
        onOpenIndexChange={setDetailIndex}
        getTagScore={getTagScore}
        country={country}
      />
    </div>
  );
}
