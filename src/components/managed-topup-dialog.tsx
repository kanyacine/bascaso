"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useManagedTopUp } from "@/lib/hooks/use-managed-topup";

/** Mounted once in the root layout; opened via openManagedTopUp() from the
 *  credits-exhausted toast action. The chrome-less DialogContent lets the card
 *  be the dialog – its gradient hairline replaces the dialog border.
 *
 *  No close button: the card is p-4 and the default one is top-4 right-4, so the
 *  X landed on the balance figure. Escape and clicking the overlay still close it. */
export function ManagedTopUpDialog() {
  const t = useTranslations();
  const { open, setOpen } = useManagedTopUp();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none sm:max-w-md"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("settings.account.creditsSection")}</DialogTitle>
        </DialogHeader>
        <ManagedAccountCard />
      </DialogContent>
    </Dialog>
  );
}
