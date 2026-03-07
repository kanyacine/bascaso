import { Lock } from "@phosphor-icons/react";

const REVIEW_STATES = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW"]);

export function ReadOnlyBanner({
  state,
  liveMessage,
}: {
  state: string;
  liveMessage?: string;
}) {
  let message: string;
  if (REVIEW_STATES.has(state)) {
    message = "This version is in review – changes are locked until the review completes.";
  } else if (state === "PENDING_DEVELOPER_RELEASE") {
    message = "This version is approved and pending release – metadata is locked.";
  } else {
    message = liveMessage ?? "This version is live – metadata is locked.";
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Lock size={16} className="shrink-0" />
      {message}
    </div>
  );
}
