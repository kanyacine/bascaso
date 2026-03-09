"use client";

import { useAnalytics } from "@/lib/analytics-context";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { ReportInitiatedBanner } from "@/components/report-initiated-banner";

export function AnalyticsStateGuard({ children }: { children: React.ReactNode }) {
  const { data, loading, error, pending, reportInitiated, initiatedAt } = useAnalytics();

  if (loading && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (reportInitiated && !data) {
    return <ReportInitiatedBanner initiatedAt={initiatedAt} />;
  }

  if (pending && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Fetching analytics data – this may take a moment on first load
        </p>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  if (!data) return null;

  return <>{children}</>;
}
