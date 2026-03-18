"use client";

import { type ReactNode, useEffect } from "react";
import { useParams } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import { useReviewChanges } from "@/lib/review-changes-context";
import { EmptyState } from "@/components/empty-state";
import { localeName } from "@/lib/asc/locale-names";

const SECTION_LABELS: Record<string, string> = {
  "store-listing": "Store listing",
  details: "App details",
  keywords: "Keywords",
  review: "App review",
};

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  keywords: "Keywords",
  whatsNew: "What's new",
  promotionalText: "Promotional text",
  supportUrl: "Support URL",
  marketingUrl: "Marketing URL",
  name: "Name",
  subtitle: "Subtitle",
  privacyPolicyUrl: "Privacy policy URL",
  privacyChoicesUrl: "Privacy choices URL",
  copyright: "Copyright",
  releaseType: "Release type",
  scheduledDate: "Scheduled date",
  phasedRelease: "Phased release",
  buildId: "Build",
  contentRights: "Content rights",
  primaryCategoryId: "Primary category",
  secondaryCategoryId: "Secondary category",
  notifUrl: "Notification URL",
  notifSandboxUrl: "Sandbox notification URL",
  notes: "Review notes",
  demoAccountRequired: "Sign-in required",
  demoAccountName: "Demo account name",
  demoAccountPassword: "Demo account password",
  contactFirstName: "First name",
  contactLastName: "Last name",
  contactPhone: "Phone",
  contactEmail: "Email",
};

import type { ReviewViewMode as ViewMode } from "@/lib/review-changes-context";

// --- Word-level diff ---

interface DiffSegment {
  text: string;
  type: "equal" | "added" | "removed";
}

function diffWords(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = m, j = n;
  const stack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: "equal" });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: "added" });
      j--;
    } else {
      stack.push({ text: oldWords[i - 1], type: "removed" });
      i--;
    }
  }

  stack.reverse();

  for (const seg of stack) {
    const last = segments[segments.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

function UnifiedDiff({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "equal") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed") {
          return (
            <span key={i} className="bg-red-500/15 text-red-700 dark:text-red-400 line-through decoration-red-400/50">
              {seg.text}
            </span>
          );
        }
        return (
          <span key={i} className="bg-green-500/15 text-green-700 dark:text-green-400">
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

// --- Diff field ---

function DiffField({ label, oldValue, newValue, mode, onDiscard }: {
  label: string;
  oldValue: string;
  newValue: string;
  mode: ViewMode;
  onDiscard: () => void;
}) {
  if (oldValue === newValue) return null;

  let content: ReactNode;

  if (mode === "before") {
    content = oldValue
      ? <span>{oldValue}</span>
      : <span className="italic text-muted-foreground">Empty</span>;
  } else if (mode === "after") {
    content = newValue
      ? <span>{newValue}</span>
      : <span className="italic text-muted-foreground">Empty</span>;
  } else {
    if (!oldValue && newValue) {
      content = <span className="bg-green-500/15 text-green-700 dark:text-green-400">{newValue}</span>;
    } else if (oldValue && !newValue) {
      content = (
        <span className="bg-red-500/15 text-red-700 dark:text-red-400 line-through decoration-red-400/50">
          {oldValue}
        </span>
      );
    } else {
      const segments = diffWords(oldValue, newValue);
      content = <UnifiedDiff segments={segments} />;
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={onDiscard}
          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
        >
          Discard
        </button>
      </div>
      <div className="rounded-md border px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30">
        {content}
      </div>
    </div>
  );
}

// --- Section diff ---

function SectionDiff({
  appId,
  section,
  scope,
  data,
  originalData,
  mode,
  localeFilter,
  onDiscard,
}: {
  appId: string;
  section: string;
  scope: string;
  data: Record<string, unknown>;
  originalData: Record<string, unknown>;
  mode: ViewMode;
  localeFilter: string;
  onDiscard: () => void;
}) {
  const { discardField } = useChangeBuffer();
  const label = SECTION_LABELS[section] ?? section;

  // Collect locale-level diffs
  const localeDiffs: { locale: string; field: string; oldVal: string; newVal: string }[] = [];
  const dataLocales = (data.locales ?? {}) as Record<string, Record<string, string>>;
  const origLocales = (originalData.locales ?? {}) as Record<string, Record<string, string>>;

  for (const [locale, fields] of Object.entries(dataLocales)) {
    if (localeFilter !== "all" && locale !== localeFilter) continue;
    const origFields = origLocales[locale] ?? {};
    for (const [key, val] of Object.entries(fields)) {
      const origVal = origFields[key] ?? "";
      if (val !== origVal) {
        localeDiffs.push({ locale, field: key, oldVal: origVal, newVal: val });
      }
    }
  }

  // Collect non-locale diffs (always shown regardless of locale filter)
  const attrDiffs: { key: string; oldVal: string; newVal: string }[] = [];
  const skipKeys = new Set(["locales", "localeIds", "phasedReleaseId", "_reviewDetailId"]);
  for (const [key, val] of Object.entries(data)) {
    if (skipKeys.has(key)) continue;
    const origVal = originalData[key];
    const valStr = val == null ? "" : String(val);
    const origStr = origVal == null ? "" : String(origVal);
    if (valStr !== origStr) {
      attrDiffs.push({ key, oldVal: origStr, newVal: valStr });
    }
  }

  const totalDiffs = localeDiffs.length + attrDiffs.length;
  if (totalDiffs === 0) return null;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold">{label}</h3>
            <Badge variant="secondary" className="text-[11px]">
              {totalDiffs} change{totalDiffs !== 1 ? "s" : ""}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDiscard}>
            <Trash size={14} className="mr-1.5" />
            Discard section
          </Button>
        </div>

        <div className="space-y-4">
          {localeDiffs.map((d) => (
            <DiffField
              key={`${d.locale}:${d.field}`}
              label={`${localeName(d.locale)} – ${FIELD_LABELS[d.field] ?? d.field}`}
              oldValue={d.oldVal}
              newValue={d.newVal}
              mode={mode}
              onDiscard={() => discardField(appId, section, scope, d.locale, d.field)}
            />
          ))}
          {attrDiffs.map((d) => (
            <DiffField
              key={d.key}
              label={FIELD_LABELS[d.key] ?? d.key}
              oldValue={d.oldVal}
              newValue={d.newVal}
              mode={mode}
              onDiscard={() => discardField(appId, section, scope, null, d.key)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Page ---

export default function ReviewChangesPage() {
  const { appId } = useParams<{ appId: string }>();
  const { changes, discardSection } = useChangeBuffer();
  const { mode, localeFilter, sectionFilter, setSectionFilter } = useReviewChanges();

  const allAppChanges = changes.filter((c) => c.appId === appId);

  // Reset stale section filter
  useEffect(() => {
    if (sectionFilter !== "all" && !allAppChanges.some((c) => c.section === sectionFilter)) {
      setSectionFilter("all");
    }
  }, [sectionFilter, allAppChanges, setSectionFilter]);

  const appChanges = sectionFilter === "all"
    ? allAppChanges
    : allAppChanges.filter((c) => c.section === sectionFilter);

  if (appChanges.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="No pending changes to push to App Store Connect."
      />
    );
  }

  return (
    <div className="space-y-6">
      {appChanges.map((change) => (
        <SectionDiff
          key={`${change.section}:${change.scope}`}
          appId={appId}
          section={change.section}
          scope={change.scope}
          data={change.data}
          originalData={change.originalData}
          mode={mode}
          localeFilter={localeFilter}
          onDiscard={() => discardSection(appId, change.section, change.scope)}
        />
      ))}
    </div>
  );
}
