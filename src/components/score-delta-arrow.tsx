"use client";

import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScoreDelta } from "@/lib/aso/research";
import { TONE_TEXT } from "@/lib/aso/score-display";
import { formatDate } from "@/lib/format";
import { useTranslations } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

/** Tiny trend arrow: direction = numeric change, colour = good/bad news. */
export function DeltaArrow({
  delta,
  previousValue,
  fetchedAt,
}: {
  delta: ScoreDelta | null;
  previousValue: number | null | undefined;
  fetchedAt: number | undefined;
}) {
  const t = useTranslations();
  if (!delta || previousValue == null || fetchedAt == null) return null;
  const Arrow = delta.direction === "up" ? ArrowUp : ArrowDown;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Arrow
          weight="bold"
          className={cn(
            "ml-0.5 inline size-2.5",
            delta.improved ? TONE_TEXT.green : TONE_TEXT.red,
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        {t("keywords.researchDeltaTooltip", {
          value: previousValue,
          date: formatDate(new Date(fetchedAt).toISOString()),
        })}
      </TooltipContent>
    </Tooltip>
  );
}
