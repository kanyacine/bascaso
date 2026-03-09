import { ChartBar } from "@phosphor-icons/react";

interface ReportInitiatedBannerProps {
  initiatedAt: number | null;
}

function formatElapsed(initiatedAt: number | null): string {
  if (!initiatedAt) return "";
  const hours = Math.floor((Date.now() - initiatedAt) / (60 * 60 * 1000));
  if (hours < 1) return "Requested just now";
  if (hours === 1) return "Requested 1 hour ago";
  if (hours < 24) return `Requested ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Requested 1 day ago" : `Requested ${days} days ago`;
}

export function ReportInitiatedBanner({ initiatedAt }: ReportInitiatedBannerProps) {
  return (
    <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <ChartBar size={18} weight="duotone" className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Analytics reports are being generated</p>
          <p className="text-sm text-muted-foreground">
            App Store Connect is preparing your analytics data. This typically takes 24–48 hours
            for the first report. Data will appear here automatically once it's ready.
          </p>
          {initiatedAt && (
            <p className="text-xs text-muted-foreground/70">
              {formatElapsed(initiatedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
