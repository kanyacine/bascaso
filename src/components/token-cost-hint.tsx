"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAIRouting } from "@/lib/hooks/use-ai-routing";
import { useManagedAccount } from "@/lib/hooks/use-managed-account";
import type { AIGroupId } from "@/lib/ai/tasks";

/** "1 credit" badge on an AI entry point – rendered only when this group's
 *  routing resolves to the managed tier and the account is pay-per-use. Local and
 *  BYOK cost the user nothing here, and a subscriber is not debited, so a badge in
 *  either case would be a lie about what the click costs. */
export function TokenCostHint({ group, className }: { group: AIGroupId; className?: string }) {
  const t = useTranslations();
  const { routing } = useAIRouting();
  const { account } = useManagedAccount();
  if (routing?.groups?.[group]?.tier !== "managed") return null;
  if (account?.subscribed) return null;
  return (
    <Badge variant="secondary" className={className}>
      {t("ai.costOneCredit")}
    </Badge>
  );
}
