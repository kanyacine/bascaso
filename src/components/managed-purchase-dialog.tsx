"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import { formatPrice } from "@/lib/managed/client";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

interface Pack {
  sku: string;
  credits: number;
  /** Minor units, as Stripe returns them – formatted here, never stored.
   *  Always present: the backend omits a pack whose price it cannot resolve
   *  rather than serving it without one. */
  amount: number;
  currency: string;
}

interface Catalog {
  packs: Pack[];
  subscription: { sku: string; amount: number; currency: string; interval: string } | null;
}

/** Empty catalog, set when the request itself does not land.
 *  `null` means "not asked yet": leaving that state after a failure rendered a
 *  completely mute purchase section – no button, no message, no way to know
 *  anything had gone wrong. Empty is a result, not the absence of one, and it
 *  carries the same message as the empty catalog the backend returns when Stripe
 *  is down on its side. */
const EMPTY_CATALOG: Catalog = { packs: [], subscription: null };

/** Buying credits and subscribing, in one dialog, opened from wherever the user hits
 *  the limit – the AI settings page and the onboarding wizard. Both were on the
 *  account settings page before, which is the one place a user is NOT when they run
 *  out of credits mid-gesture. */
export function ManagedPurchaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { account } = useManagedAccount();
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  // One balance poller at a time (double purchase), stopped on unmount.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/managed/catalog");
      if (!mountedRef.current) return;
      setCatalog(res.ok ? ((await res.json()) as Catalog) : EMPTY_CATALOG);
    } catch {
      if (mountedRef.current) setCatalog(EMPTY_CATALOG);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Fetched on first open, not on mount: the endpoint needs a JWT, and the dialog is
  // rendered (closed) on pages a signed-out user also visits.
  useEffect(() => {
    if (open && !catalog) void refreshCatalog();
  }, [open, catalog, refreshCatalog]);

  async function handleCheckout(sku: string) {
    try {
      const res = await fetch("/api/managed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) {
        // Most often an expired session. Unlike the account page, this dialog has
        // no sign-in form to fall back to, so it invalidates the shared account
        // instead – which surfaces the signed-out state on whichever page opened it.
        if (res.status === 401) invalidateManagedAccount();
        toast.error(t("common.unknownError"));
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank"); // Electron routes _blank to the browser (setWindowOpenHandler)

      // A second purchase before the first finishes replaces the running poller
      // rather than stacking another one.
      if (pollRef.current) clearInterval(pollRef.current);
      let ticks = 0; // poll the balance for ~1 min after checkout opens
      pollRef.current = setInterval(() => {
        invalidateManagedAccount();
        if (++ticks >= 6 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 10_000);
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.account.creditsSection")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("settings.account.creditsHint")}</p>
            {catalog !== null && catalog.packs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("settings.account.catalogUnavailable")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(catalog?.packs ?? []).map((pack) => (
                  <Button key={pack.sku} variant="outline" onClick={() => void handleCheckout(pack.sku)}>
                    {t("settings.account.buyPack", {
                      count: pack.credits,
                      price: formatPrice(pack.amount, pack.currency, locale),
                    })}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="section-title">{t("settings.account.subscriptionSection")}</h3>
            <p className="text-sm text-muted-foreground">{t("settings.account.subscriptionHint")}</p>
            {account?.subscribed ? (
              <p className="text-sm font-medium">{t("settings.account.unlimited")}</p>
            ) : (
              <Button
                disabled={!catalog?.subscription}
                onClick={() => void handleCheckout(catalog!.subscription!.sku)}
              >
                {catalog?.subscription
                  ? t("settings.account.subscribeWithPrice", {
                      price: formatPrice(
                        catalog.subscription.amount,
                        catalog.subscription.currency,
                        locale,
                      ),
                    })
                  : t("settings.account.subscribe")}
              </Button>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
