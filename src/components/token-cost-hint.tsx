"use client";

import { Coins } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAIRouting, fetchRouting } from "@/lib/hooks/use-ai-routing";
import { useManagedAccount, fetchManagedAccount } from "@/lib/hooks/use-managed-account";
import type { RoutingState } from "@/components/settings/ai-routing-section";
import type { AIGroupId } from "@/lib/ai/tasks";

/** A click on this group's AI entry point debits one credit: the group routes to the
 *  managed tier and the account is pay-per-use. Local and BYOK cost nothing here, and
 *  a subscriber is not debited, so a cost hint in either case would be a lie. */
export function chargesToken(
  routing: RoutingState | null,
  account: { subscribed: boolean } | null,
  group: AIGroupId,
): boolean {
  return routing?.groups?.[group]?.tier === "managed" && !account?.subscribed;
}

/** Same predicate, awaited – for code paths that must know the answer BEFORE firing
 *  an AI call (e.g. the insights auto-generate gate). Awaiting the shared fetches
 *  avoids the render-race where routing is still loading, reads as "free", and a
 *  credit is silently spent. */
export async function willChargeToken(group: AIGroupId): Promise<boolean> {
  const [routing, account] = await Promise.all([fetchRouting(), fetchManagedAccount()]);
  return chargesToken(routing, account, group);
}

const VARIANT_CLASSES = {
  /** Standalone blue pill – menus, banners, panel footers. */
  chip: "gap-1 bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400",
  /** Embedded in a <Button> – blue tint, text colour inherited so it reads on any variant. */
  button: "gap-1 bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold",
  /** Icon + "1" – for tiny inline text buttons (translate, retry). */
  mini: "gap-0.5 bg-blue-500/15 px-1.5 py-px text-[10px] font-medium text-blue-600 dark:text-blue-400",
} as const;

const ICON_SIZES = { chip: 11, button: 10, mini: 9 } as const;

/** "1 credit" marker on an AI entry point. Renders nothing unless the click will
 *  actually debit (see chargesToken). Always placed ON the control that fires the
 *  debit – inside the button, trailing the menu item – never floating nearby. */
export function TokenCostHint({
  group,
  variant = "chip",
  className,
}: {
  group: AIGroupId;
  variant?: keyof typeof VARIANT_CLASSES;
  className?: string;
}) {
  const t = useTranslations();
  const { routing } = useAIRouting();
  const { account } = useManagedAccount();
  if (!chargesToken(routing, account, group)) return null;
  const label = t("ai.costOneCredit");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full tabular-nums",
        VARIANT_CLASSES[variant],
        className,
      )}
      title={label}
    >
      <Coins size={ICON_SIZES[variant]} weight="fill" className="size-[1em] shrink-0" />
      {variant === "mini" ? "1" : label}
    </span>
  );
}
