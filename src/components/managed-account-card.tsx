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
import { formatDate } from "@/lib/format";
import { formatPrice } from "@/lib/managed/client";
import {
  bestValueSku,
  EMPTY_CATALOG,
  perCreditAmount,
  type Catalog,
  type PurchaseSnapshot,
  type Subscription,
} from "@/lib/managed/catalog";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";
import { startPurchasePoll } from "@/lib/managed/purchase-poll";
import { usePurchasePending } from "@/lib/hooks/use-purchase-pending";

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
  // Which checkout is being opened. Creating the Stripe session is a round trip of
  // about a second, during which the old card did nothing at all – so the click read
  // as ignored and got repeated.
  const [openingSku, setOpeningSku] = useState<string | null>(null);
  // Whether a purchase is waiting to land. Module state, not this component's: see
  // purchase-poll.ts – the payment usually completes after this card is gone.
  const pending = usePurchasePending();
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
    };
  }, []);

  if (!account) return null;

  async function handleCheckout(sku: string, snapshot: PurchaseSnapshot) {
    if (openingSku) return; // one checkout at a time – a double click opened two tabs
    setOpeningSku(sku);
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
      startPurchasePoll(snapshot, t);
    } catch {
      toast.error(t("common.networkError"));
    } finally {
      if (mountedRef.current) setOpeningSku(null);
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

  const snapshot: PurchaseSnapshot = {
    balance: account.balance,
    subscribed: account.subscribed,
    endsAt: account.endsAt,
  };
  const best = bestValueSku(catalog?.packs ?? []);
  // Every checkout button disables while one is in flight – but only the clicked one
  // reports it. Keyed on the blanket flag, buying a credit pack flipped the unrelated
  // subscribe CTA to a spinner and "Opening the payment page…".
  const opening = openingSku !== null;
  // Read outside subscribeLabel: a function body does not keep the non-null narrowing
  // the early return above gives `account`.
  const endsAt = account.endsAt;
  const subscriptions = catalog?.subscriptions ?? [];
  // Read once: the card renders packs and subscriptions as two independent halves, so
  // deactivating every row on one side must not take the other side down with it.
  const hasPacks = (catalog?.packs.length ?? 0) > 0;
  const hasSubscriptions = subscriptions.length > 0;
  // The offer a resubscribe goes back to. First row wins: the table orders
  // subscriptions by sort_order, so the primary offer is a data decision.
  const primarySubscription: Subscription | undefined = subscriptions[0];

  /** "/month" – "/year" suffix from the Stripe interval. An interval the locale
   *  files do not know renders as the bare price rather than a broken key. */
  function intervalSuffix(interval: string): string {
    if (interval === "month") return t("settings.account.intervalMonth");
    if (interval === "year") return t("settings.account.intervalYear");
    return "";
  }

  /** Label of one subscribe CTA, including its own in-flight and resubscribe states.
   *  Scoped to the button's sku: on the blanket `opening` a single click relabelled
   *  every subscribe button in the list at once. */
  function subscribeLabel(subscription: Subscription): string {
    if (openingSku === subscription.sku) return t("settings.account.openingCheckout");
    if (endsAt) return t("settings.account.resubscribe");
    return t("settings.account.subscribeWithPrice", {
      price: formatPrice(subscription.amount, subscription.currency, locale),
      interval: intervalSuffix(subscription.interval),
    });
  }

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
              <p className="text-xs text-muted-foreground">
                {account.endsAt
                  ? t("settings.account.endsOn", { date: formatDate(account.endsAt) })
                  : t("settings.account.unlimited")}
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-3xl leading-none font-semibold tabular-nums">{account.balance}</p>
              <p className="text-xs text-muted-foreground">{t("settings.account.creditsUnit")}</p>
            </>
          )}
        </div>
      </div>

      {account.subscribed && account.endsAt ? (
        // Still honoured to the day it ends – so the card leads with getting the
        // renewal back, and keeps the portal as the secondary action.
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">{t("settings.account.renewalCancelled")}</p>
          {/* No offer in the catalog, no CTA: with every subscription row inactive there is
              nothing to resubscribe to, and a permanently disabled button reads as a bug. */}
          {primarySubscription && (
            <Button
              className="account-cta"
              disabled={opening}
              onClick={() => void handleCheckout(primarySubscription.sku, snapshot)}
            >
              {openingSku === primarySubscription.sku && <Spinner className="size-4" />}
              {subscribeLabel(primarySubscription)}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void handlePortal()}>
            {t("settings.account.manageSubscription")}
          </Button>
        </div>
      ) : account.subscribed ? (
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
        <div className="account-pack-grid mt-4">
          {/* flex-1: the row is flex now, and a skeleton carries no width of its own. */}
          <Skeleton className="h-20 flex-1" />
          <Skeleton className="h-20 flex-1" />
          <Skeleton className="h-20 flex-1" />
        </div>
      ) : !hasPacks && !hasSubscriptions ? (
        // Both halves empty: the catalog is unreachable or every row is inactive – the
        // only case that deserves a message, since there is nothing left to buy.
        <p className="mt-4 text-sm text-muted-foreground">{t("settings.account.catalogUnavailable")}</p>
      ) : (
        <>
          {/* Each half is data-driven and stands alone: packs only, subscriptions only, or
              both. The divider belongs to neither – it only exists between the two. */}
          {hasPacks && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">{t("settings.account.creditsHint")}</p>
              <div className="account-pack-grid mt-3">
                {catalog.packs.map((pack) => (
                  <Button
                    key={pack.sku}
                    variant="outline"
                    className="account-pack h-auto flex-col gap-1 py-3"
                    disabled={opening}
                    onClick={() => void handleCheckout(pack.sku, snapshot)}
                  >
                    {openingSku === pack.sku ? (
                      <Spinner className="size-5" />
                    ) : (
                      <span className="font-mono text-xl font-semibold tabular-nums">{pack.credits}</span>
                    )}
                    <span className="text-sm font-medium">{formatPrice(pack.amount, pack.currency, locale)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("settings.account.perCredit", {
                        price: formatPrice(perCreditAmount(pack), pack.currency, locale),
                      })}
                    </span>
                    {pack.sku === best && <Badge className="account-best">{t("settings.account.bestValue")}</Badge>}
                    {pack.discountPercent != null && (
                      <Badge className="account-discount">
                        {t("settings.account.discountBadge", { percent: pack.discountPercent })}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}
          {hasPacks && hasSubscriptions && (
            <div className="my-3 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">{t("settings.account.orDivider")}</span>
              <Separator className="flex-1" />
            </div>
          )}
          {hasSubscriptions && (
            <>
              {/* Without packs above, the divider that used to space this block is gone too. */}
              <div className={hasPacks ? "space-y-2" : "mt-4 space-y-2"}>
                {subscriptions.map((subscription) => (
                  <Button
                    key={subscription.sku}
                    className="account-cta"
                    disabled={opening}
                    onClick={() => void handleCheckout(subscription.sku, snapshot)}
                  >
                    {openingSku === subscription.sku && <Spinner className="size-4" />}
                    {subscribeLabel(subscription)}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("settings.account.subscriptionHint")}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
