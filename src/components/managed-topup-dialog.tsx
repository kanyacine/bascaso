"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useManagedTopUp } from "@/lib/hooks/use-managed-topup";

/** Mounted once in the root layout; opened via openManagedTopUp() from the
 *  credits-exhausted toast action. The chrome-less DialogContent lets the card
 *  be the dialog – its gradient hairline replaces the dialog border. */
export function ManagedTopUpDialog() {
  const t = useTranslations();
  const { open, setOpen } = useManagedTopUp();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("settings.account.creditsSection")}</DialogTitle>
        </DialogHeader>
        <ManagedAccountCard />
      </DialogContent>
    </Dialog>
  );
}
