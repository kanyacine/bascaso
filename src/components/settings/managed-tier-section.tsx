"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useManagedAccount } from "@/lib/hooks/use-managed-account";

/** The managed tier on the AI settings page. The account card carries the
 *  purchase surface inline – the app's one promotional element. */
export function ManagedTierSection() {
  const t = useTranslations();
  const { account } = useManagedAccount();

  return (
    <section className="space-y-3">
      <h3 className="section-title">{t("settings.ai.managedSection")}</h3>
      {account ? (
        <ManagedAccountCard />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("settings.ai.managedSignedOutHint")}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/account">{t("settings.ai.managedGoToAccount")}</Link>
          </Button>
        </>
      )}
    </section>
  );
}
