"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

/** Shape of GET /api/settings/ai/apple-fm-status. Declared here rather than
 *  imported from `@/lib/ai/apple-fm` – that module reads a Node state file and
 *  must never end up in the client bundle. */
export interface AppleFmStatus {
  available: boolean;
  reason: string | null;
  languages?: string[];
}

interface AppleFmOptionProps {
  /** Unique per page: the pages that render this both have their own radio group. */
  id: string;
  /** Null while the status request is still in flight – no badge until then. */
  status: AppleFmStatus | null;
  disabled?: boolean;
  onClick?: () => void;
  /** Extra controls shown under the hint, e.g. the unsupported-language switch. */
  children?: ReactNode;
}

/** The "Apple built-in model" radio entry: label, live availability badge and
 *  hint. Shared by the AI settings page and the onboarding wizard. */
export function AppleFmOption({
  id,
  status,
  disabled,
  onClick,
  children,
}: AppleFmOptionProps) {
  const t = useTranslations();

  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem
        value="apple-fm"
        id={id}
        className="mt-0.5"
        disabled={disabled}
        onClick={onClick}
      />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-sm font-normal">
            {t("settings.ai.local.appleFm")}
          </Label>
          {status && (
            <Badge
              variant="outline"
              className={
                status.available
                  ? "border-green-500/50 text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              }
            >
              {status.available
                ? t("settings.ai.local.status.available")
                : t(`settings.ai.local.status.${status.reason}` as MessageKey)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.ai.local.appleFmHint")}
        </p>
        {children}
      </div>
    </div>
  );
}
