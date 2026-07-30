"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Coins, Infinity as InfinityIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import { formatPrice } from "@/lib/managed/client";
import {
  bestValueSku,
  EMPTY_CATALOG,
  perCreditAmount,
  purchaseLanded,
  type Catalog,
  type PurchaseSnapshot,
} from "@/lib/managed/catalog";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

/** The one place the account is bought from: balance or subscription state on top,
 *  pack tiles and the subscribe CTA inline below – no intermediate dialog. Rendered
 *  on the AI settings page, the account page, both onboarding steps and inside the
 *  global top-up dialog. Renders nothing while signed out: every surface gates on
 *  the account (auth form instead), this is just the render-race guard. */
export function ManagedAccountCard() {
  const t = useTranslations();
  const { locale } = useLocale();
  const { account } = useManagedAccount();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [pending, setPending] = useState<PurchaseSnapshot | null>(null);

  // One balance poller at a time (double purchase), stopped on unmount.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Fetched on mount: unlike the old dialog (mounted closed on signed-out pages),
  // the card only exists for signed-in users, so the JWT the endpoint needs is there.
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/managed/catalog");
        if (!mountedRef.current) return;
        setCatalog(res.ok ? ((await res.json()) as Catalog) : EMPTY_CATALOG);
      } catch {
        if (mountedRef.current) setCatalog(EMPTY_CATALOG);
      }
    })();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // The post-purchase feedback the dialog never had: the poller refreshes the
  // account, and the moment the purchase shows up the pending banner turns into
  // a success toast.
  useEffect(() => {
    if (!pending || !account || !purchaseLanded(pending, account)) return;
    setPending(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    toast.success(t("settings.account.purchaseLanded"));
  }, [pending, account, t]);

  if (!account) return null;

  async function handleCheckout(sku: string, snapshot: PurchaseSnapshot) {
    try {
      const res = await fetch("/api/managed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) {
        // Most often an expired session. Invalidating surfaces the signed-out
        // state on whichever page renders the card (they all fall back to auth).
        if (res.status === 401) invalidateManagedAccount();
        toast.error(t("common.unknownError"));
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank"); // Electron routes _blank to the browser (setWindowOpenHandler)

      setPending(snapshot);
      // A second purchase before the first finishes replaces the running poller
      // rather than stacking another one.
      if (pollRef.current) clearInterval(pollRef.current);
      let ticks = 0; // poll the balance for ~1 min after checkout opens
      pollRef.current = setInterval(() => {
        invalidateManagedAccount();
        if (++ticks >= 6 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          // Poller gave up – back to idle without claiming success or failure.
          setPending(null);
        }
      }, 10_000);
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  async function handlePortal() {
    try {
      const res = await fetch("/api/managed/portal", { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) invalidateManagedAccount();
        else toast.error(t("common.unknownError"));
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  const snapshot: PurchaseSnapshot = { balance: account.balance, subscribed: account.subscribed };
  const best = bestValueSku(catalog?.packs ?? []);

  return (
    <div className="account-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="account-card-chip">
            <Coins size={20} weight="fill" />
          </span>
          <div>
            <p className="text-sm leading-tight font-medium">{t("settings.account.section")}</p>
            <p className="text-xs text-muted-foreground">{account.email}</p>
          </div>
        </div>
        <div className="text-right">
          {account.subscribed ? (
            <>
              <InfinityIcon size={28} weight="bold" className="ml-auto" />
              <p className="text-xs text-muted-foreground">{t("settings.account.unlimited")}</p>
            </>
          ) : (
            <>
              <p className="font-mono text-3xl leading-none font-semibold tabular-nums">{account.balance}</p>
              <p className="text-xs text-muted-foreground">{t("settings.account.creditsUnit")}</p>
            </>
          )}
        </div>
      </div>

      {account.subscribed ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("settings.account.subscriptionManagedHint")}</p>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void handlePortal()}>
            {t("settings.account.manageSubscription")}
          </Button>
        </div>
      ) : pending ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-3">
          <Spinner className="size-4 shrink-0" />
          <p className="text-sm text-muted-foreground">{t("settings.account.pendingCheckout")}</p>
        </div>
      ) : catalog === null ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : catalog.packs.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("settings.account.catalogUnavailable")}</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">{t("settings.account.creditsHint")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {catalog.packs.map((pack) => (
              <Button
                key={pack.sku}
                variant="outline"
                className="account-pack h-auto flex-col gap-1 py-3"
                onClick={() => void handleCheckout(pack.sku, snapshot)}
              >
                <span className="font-mono text-xl font-semibold tabular-nums">{pack.credits}</span>
                <span className="text-sm font-medium">{formatPrice(pack.amount, pack.currency, locale)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t("settings.account.perCredit", {
                    price: formatPrice(perCreditAmount(pack), pack.currency, locale),
                  })}
                </span>
                {pack.sku === best && <Badge className="account-best">{t("settings.account.bestValue")}</Badge>}
              </Button>
            ))}
          </div>
          <div className="my-3 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t("settings.account.orDivider")}</span>
            <Separator className="flex-1" />
          </div>
          <Button
            className="account-cta"
            disabled={!catalog.subscription}
            onClick={() => catalog.subscription && void handleCheckout(catalog.subscription.sku, snapshot)}
          >
            {catalog.subscription
              ? t("settings.account.subscribeWithPrice", {
                  price: formatPrice(catalog.subscription.amount, catalog.subscription.currency, locale),
                })
              : t("settings.account.subscribe")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t("settings.account.subscriptionHint")}</p>
        </>
      )}
    </div>
  );
}
