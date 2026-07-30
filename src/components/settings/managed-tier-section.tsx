"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagedPurchaseDialog } from "@/components/managed-purchase-dialog";
import { useTranslations } from "@/lib/i18n/locale-context";
import { accountDisplayName } from "@/lib/managed/client";
import { useManagedAccount } from "@/lib/hooks/use-managed-account";

/** The managed tier's card on the AI settings page: account state plus the two
 *  purchase entry points. Same visual weight as the local and BYOK sections –
 *  deliberately no promotional emphasis. */
export function ManagedTierSection() {
  const t = useTranslations();
  const { account } = useManagedAccount();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  return (
    <section className="space-y-3">
      <h3 className="section-title">{t("settings.ai.managedSection")}</h3>
      {account ? (
        <>
          <p className="flex items-center gap-2 text-sm">
            {accountDisplayName(account)}
            <Badge variant="secondary">
              {account.subscribed ? t("nav.subscribed") : t("nav.credits", { count: account.balance })}
            </Badge>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPurchaseOpen(true)}>
              {t("settings.ai.managedBuyCredits")}
            </Button>
            {!account.subscribed && (
              <Button variant="outline" size="sm" onClick={() => setPurchaseOpen(true)}>
                {t("settings.account.subscribe")}
              </Button>
            )}
          </div>
          <ManagedPurchaseDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
        </>
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
