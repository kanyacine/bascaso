"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ManagedAuthForm } from "@/components/managed-auth-form";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import {
  formatPrice,
  isManagedSubscriptionActive,
} from "@/lib/managed/client";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";

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

/** Catalogue vide, posé quand la requête elle-même n'aboutit pas.
 *  `null` veut dire « pas encore demandé » : laisser cet état après un échec
 *  affichait une section d'achat entièrement muette – ni bouton, ni message, ni
 *  moyen de savoir que quelque chose avait raté. Le vide est un résultat, pas
 *  une absence de résultat, et il porte le même message que le catalogue vide
 *  que renvoie le backend quand Stripe est en panne de son côté. */
const EMPTY_CATALOG: Catalog = { packs: [], subscription: null };

export default function AccountSettingsPage() {
  const t = useTranslations();
  const { locale } = useLocale();

  const [info, setInfo] = useState<{ email: string; balance: number; subscribed: boolean } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  // Un seul poller de solde actif à la fois (double achat), coupé si la page est quittée.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Un tick de poll déjà en vol au moment d'un clic "déconnexion" ne doit pas
  // repeupler info après coup – distinct de mountedRef (démontage).
  const signedOutRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/managed/me");
      if (!mountedRef.current || signedOutRef.current) return;
      if (!res.ok) {
        setInfo(null);
        return;
      }
      const data = await res.json();
      if (!mountedRef.current || signedOutRef.current) return;
      setInfo({
        email: data.email,
        balance: data.balance,
        subscribed: isManagedSubscriptionActive(data.subscription),
      });
    } catch {
      // Cloud injoignable (réseau, panne) – on garde le dernier état connu sans planter.
    }
  }, []);

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
    void refresh();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [refresh]);

  // Le catalogue n'a de sens qu'une fois connecté : l'endpoint exige un JWT.
  useEffect(() => {
    if (info && !catalog) void refreshCatalog();
  }, [info, catalog, refreshCatalog]);

  async function handleSignOut() {
    // Empêche un tick de poll déjà en vol de repeupler info après coup.
    signedOutRef.current = true;
    // Un poller de solde en cours n'a plus de sens une fois déconnecté.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await fetch("/api/managed/auth", { method: "DELETE" });
    } catch {
      // Ignoré – l'état local est réinitialisé dans tous les cas ; un rechargement
      // reflétera l'état réel du serveur si la requête n'a pas abouti.
    }
    setInfo(null);
    setCatalog(null);
    invalidateAIStatus();
  }

  // Un échec de checkout/portal n'est pas forcément réseau : le cas le plus courant est une
  // session expirée pendant que l'onglet Réglages restait ouvert. Afficher « erreur réseau »
  // enverrait l'utilisateur vérifier son wifi au lieu de se reconnecter – on repasse donc la
  // carte au formulaire de connexion, qui est à la fois le diagnostic et l'action à faire.
  function reportFailure(status: number) {
    if (status === 401) {
      setInfo(null);
      return;
    }
    toast.error(t("common.unknownError"));
  }

  async function handleCheckout(sku: string) {
    try {
      const res = await fetch("/api/managed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) {
        reportFailure(res.status);
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank"); // Electron route _blank vers le navigateur (setWindowOpenHandler)

      // Un second achat avant la fin du premier remplace le poller en cours au
      // lieu d'en cumuler un deuxième.
      if (pollRef.current) clearInterval(pollRef.current);
      let ticks = 0; // polling du solde ~1 min après ouverture du checkout
      pollRef.current = setInterval(() => {
        void refresh();
        if (++ticks >= 6 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
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
        reportFailure(res.status);
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  return (
    <div className="max-w-2xl space-y-8 pb-16">
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.account.section")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.account.hint")}</p>

        {info === null ? (
          <ManagedAuthForm
            onAuthenticated={() => {
              signedOutRef.current = false;
              void refresh();
            }}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{t("settings.account.signedInAs", { email: info.email })}</p>
            <p className="text-sm font-medium">
              {info.subscribed
                ? t("settings.account.unlimited")
                : t("settings.account.balance", { count: info.balance })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void refresh();
                  // Seul moyen de réessayer un catalogue en échec : l'effet ne
                  // se redéclenche pas tant que `info` ne change pas.
                  void refreshCatalog();
                }}
              >
                {t("settings.account.refresh")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                {t("settings.account.signOut")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {info !== null && (
        <>
          <section className="space-y-3">
            <h3 className="section-title">{t("settings.account.creditsSection")}</h3>
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
            <div className="flex flex-wrap gap-2">
              {info.subscribed ? (
                <Button variant="outline" onClick={() => void handlePortal()}>
                  {t("settings.account.manageSubscription")}
                </Button>
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}
