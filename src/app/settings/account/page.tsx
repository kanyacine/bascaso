"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import {
  authenticateManaged,
  formatPrice,
  isManagedSubscriptionActive,
  managedAuthErrorMessage,
  runWithBusyFlag,
  verifyManagedSignup,
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

export default function AccountSettingsPage() {
  const t = useTranslations();
  const { locale } = useLocale();

  const [info, setInfo] = useState<{ email: string; balance: number; subscribed: boolean } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Message affiché sous le formulaire (déjà localisé) plutôt qu'un simple
  // booléen – le message dépend du code d'erreur serveur, voir managedAuthErrorMessage.
  const [error, setError] = useState<string | null>(null);
  // Un signup accepté mais en attente de confirmation email bascule sur un
  // 3e état de la carte : ni le formulaire de connexion, ni "connecté". Le
  // modèle d'email en place n'a qu'un lien de confirmation (pas de code – le
  // SMTP personnalisé qui portera {{ .Token }} arrive plus tard) : le chemin
  // principal est donc "confirmez puis reconnectez-vous", et le code reste
  // une alternative repliée, prête pour quand le modèle changera.
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState(false);

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

  // Le catalogue vit côté Stripe : une panne le laisse simplement absent, et les
  // boutons d'achat s'affichent alors sans prix plutôt que d'en inventer un.
  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/managed/catalog");
      if (!mountedRef.current || !res.ok) return;
      setCatalog((await res.json()) as Catalog);
    } catch {
      // Idem : pas de prix affiché, pas d'erreur remontée.
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

  async function handleAuth(mode: "login" | "signup") {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      const result = await authenticateManaged(mode, email, password);
      if (!result.ok) {
        // 401 : message inline dédié au code serveur (compte déjà inscrit,
        // quota d'emails dépassé, ou identifiants invalides – voir
        // managedAuthErrorMessage). Échec réseau : toast générique, sinon
        // l'utilisateur cherche une faute de frappe qui n'existe pas.
        if (result.reason === "auth") setError(managedAuthErrorMessage(result.code, result.message, t));
        else toast.error(t("common.networkError"));
        return;
      }
      if (result.confirmationRequired) {
        // On garde email/mot de passe en état : c'est ce qui permet au bouton
        // "Je me suis confirmé" de retenter signIn sans les redemander.
        setPendingConfirmation(true);
        return;
      }
      signedOutRef.current = false;
      setPendingConfirmation(false);
      setShowCodeInput(false);
      setPassword("");
      setCode("");
      invalidateAIStatus();
      void refresh();
    });
  }

  async function handleVerify() {
    setVerifyError(false);
    await runWithBusyFlag(setVerifyBusy, async () => {
      const result = await verifyManagedSignup(email, code.trim());
      if (!result.ok) {
        if (result.reason === "auth") setVerifyError(true);
        else toast.error(t("common.networkError"));
        return;
      }
      signedOutRef.current = false;
      setPendingConfirmation(false);
      setShowCodeInput(false);
      setPassword("");
      setCode("");
      invalidateAIStatus();
      void refresh();
    });
  }

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
    setPendingConfirmation(false);
    setShowCodeInput(false);
    setCode("");
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
          pendingConfirmation ? (
            <div className="max-w-[320px] space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("settings.account.confirmHint", { email })}
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button disabled={busy} onClick={() => void handleAuth("login")}>
                {t("settings.account.confirmSignIn")}
              </Button>

              <div>
                <button
                  type="button"
                  onClick={() => setShowCodeInput((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={showCodeInput}
                >
                  <CaretRight
                    className={showCodeInput ? "rotate-90 transition-transform" : "transition-transform"}
                  />
                  {t("settings.account.confirmCodeToggle")}
                </button>
                {showCodeInput && (
                  <div className="space-y-2 pt-2">
                    <Input
                      type="text"
                      placeholder={t("settings.account.confirmCode")}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    {verifyError && (
                      <p className="text-sm text-destructive">{t("settings.account.confirmFailed")}</p>
                    )}
                    <Button
                      variant="outline"
                      disabled={verifyBusy || !code.trim()}
                      onClick={() => void handleVerify()}
                    >
                      {t("settings.account.confirmSubmit")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-[320px] space-y-2">
              <Input
                type="email"
                placeholder={t("settings.account.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder={t("settings.account.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void handleAuth("login")}>
                  {t("settings.account.signIn")}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void handleAuth("signup")}>
                  {t("settings.account.signUp")}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{t("settings.account.signedInAs", { email: info.email })}</p>
            <p className="text-sm font-medium">
              {info.subscribed
                ? t("settings.account.unlimited")
                : t("settings.account.balance", { count: info.balance })}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
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
