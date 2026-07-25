"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CaretRight, CheckCircle, Eye, EyeSlash } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { LocalServerFields } from "@/components/local-server-fields";
import { AiRoutingSection, type RoutingState } from "@/components/settings/ai-routing-section";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  isLocalOpenAIProvider,
} from "@/lib/ai/local-provider";

const LOCAL_PROVIDER_ID = "local-openai";
/** Kept as local literals (not imported from `@/lib/ai/apple-fm`) – that module
 *  reads a Node state file and must never end up in the client bundle. */
const APPLE_FM_PROVIDER_ID = "apple-fm";
const APPLE_FM_MODEL_ID = "apple-fm";

type LocalEngine = "apple-fm" | "local-server";

interface AppleFmStatus {
  available: boolean;
  reason: string | null;
  languages?: string[];
}

/** Cloud providers only – the local server is configured in its own section. */
const BYOK_PROVIDERS = AI_PROVIDERS.filter((p) => !isLocalOpenAIProvider(p.id));
const DEFAULT_BYOK_PROVIDER = BYOK_PROVIDERS[0];

// Prix indicatifs non définitifs – doivent refléter les prices Stripe du backend.
const MANAGED_PACKS = [
  { sku: "pack_10", credits: 10, price: "10 €" },
  { sku: "pack_50", credits: 50, price: "45 €" },
  { sku: "pack_100", credits: 100, price: "80 €" },
] as const;

type ManagedAuthResult =
  | { ok: true; confirmationRequired?: boolean }
  // `code`/`message` viennent du corps du 401 (voir route.ts) : le vrai code
  // GoTrue et son message, pour que l'appelant affiche autre chose que
  // "vérifiez identifiants" quand ce n'est pas le problème (voir
  // managedAuthErrorMessage).
  | { ok: false; reason: "auth"; code?: string; message?: string }
  | { ok: false; reason: "network" };

/** `res.json().catch(...)` ne rattrape pas un `res.json` absent (le throw est
 *  synchrone, avant la promesse) – utilisé par les tests qui ne mockent que
 *  `ok`/`status`. Ce wrapper couvre les deux cas : méthode absente et corps
 *  non-JSON. */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Isolé du composant pour être testable sans rendu React : distingue un échec
 * d'authentification (401 – identifiants) d'un échec réseau (fetch qui lève),
 * pour que l'appelant puisse afficher le bon message dans chaque cas. Un
 * signup accepté mais en attente de confirmation email est un succès HTTP
 * (200) qui porte `confirmationRequired: true` dans le corps – ni un échec
 * ni une connexion effective.
 */
export async function authenticateManaged(
  mode: "login" | "signup",
  email: string,
  password: string,
): Promise<ManagedAuthResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, email, password }),
    });
    if (!res.ok) {
      // La confirmation email active en prod rend "déjà inscrit" et "quota
      // d'emails dépassé" probables – ni l'un ni l'autre n'est un problème
      // d'identifiants (voir managedAuthErrorMessage côté appelant).
      const data = await safeJson(res);
      return { ok: false, reason: "auth", code: data.code as string | undefined, message: data.error as string | undefined };
    }
    const data = await safeJson(res);
    return data.confirmationRequired ? { ok: true, confirmationRequired: true } : { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Message affiché sous le formulaire managé pour un échec "auth" (401). Les
 * deux cas connus – compte déjà inscrit, quota d'emails Supabase dépassé –
 * ont chacun une action différente et un message dédié. Le grant OAuth2 du
 * login (mauvais mot de passe) ne porte pas de `code` : c'est le seul cas où
 * le message générique "vérifiez vos identifiants" reste correct. Pour tout
 * autre code (renvoyé par le serveur mais non mappé ici), on affiche son
 * message plutôt que d'accuser un mot de passe qui n'est peut-être pas en
 * cause – jamais le générique par défaut pour un code qu'on ne reconnaît pas.
 */
export function managedAuthErrorMessage(
  code: string | undefined,
  message: string | undefined,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case "user_already_exists":
      return t("settings.ai.managedAuthUserExists");
    case "over_email_send_rate_limit":
      return t("settings.ai.managedAuthRateLimited");
    case undefined:
      return t("settings.ai.managedAuthFailed");
    default:
      return message || t("settings.ai.managedAuthFailed");
  }
}

type ManagedVerifyResult = { ok: true } | { ok: false; reason: "auth" | "network" };

/**
 * Chemin secondaire de la confirmation par email : vérifie un code reçu par
 * l'utilisateur (quand le modèle d'email en contient un, plutôt qu'un simple
 * lien de confirmation). Même distinction auth/réseau qu'authenticateManaged.
 */
export async function verifyManagedSignup(email: string, code: string): Promise<ManagedVerifyResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify", email, code }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "auth" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Remet `setBusy(false)` quel que soit le chemin de sortie de `fn` – succès,
 * retour anticipé ou exception. Corrige une régression où un `return` précoce
 * dans le bloc `!res.ok` contournait la remise à zéro du flag "busy" et
 * bloquait définitivement les boutons du formulaire après un échec.
 */
export async function runWithBusyFlag(setBusy: (busy: boolean) => void, fn: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await fn();
  } finally {
    setBusy(false);
  }
}

interface ManagedSubscription {
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * Miroir exact de la condition de `debit_action` côté backend : un
 * abonnement ne dispense de débit que s'il est actif/en essai ET pas expiré
 * (`currentPeriodEnd` null = pas d'échéance connue → traité comme valide,
 * sinon comparé à "maintenant"). Une divergence ici ferait afficher
 * "Abonnement illimité" sur la carte alors qu'un abonnement zombie fait
 * débiter des jetons à chaque appel IA.
 */
export function isManagedSubscriptionActive(
  subscription: ManagedSubscription | null | undefined,
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (subscription.currentPeriodEnd == null) return true;
  return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
}

interface TierSettings {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  hasApiKey: boolean;
}

const EMPTY_ROUTING: RoutingState = {
  groups: {},
  fallback: false,
  allowUnsupportedLanguages: false,
};

export default function AISettingsPage() {
  const t = useTranslations();
  const { locale } = useLocale();

  // Local tier – "" means no engine selected: the tier is unusable until the
  // user explicitly picks one of the two options again.
  const [localEngine, setLocalEngine] = useState<LocalEngine | "">("");
  const [localBaseUrl, setLocalBaseUrl] = useState("");
  const [localModelId, setLocalModelId] = useState("");
  const [localApiKey, setLocalApiKey] = useState("");
  const [showLocalKey, setShowLocalKey] = useState(false);
  const [localExists, setLocalExists] = useState(false);
  const [localStoredModel, setLocalStoredModel] = useState("");
  const [localStoredBaseUrl, setLocalStoredBaseUrl] = useState("");
  const [savingLocal, setSavingLocal] = useState(false);
  const [removingLocal, setRemovingLocal] = useState(false);
  const [savingAppleFm, setSavingAppleFm] = useState(false);
  const [appleFmStatus, setAppleFmStatus] = useState<AppleFmStatus | null>(null);
  const [showLanguages, setShowLanguages] = useState(false);
  // Human-readable, locale-sorted names for the languages the built-in model
  // reports (via the sidecar). Null when unavailable or none reported.
  const appleFmLanguages = useMemo<string[] | null>(() => {
    if (!appleFmStatus?.available) return null;
    const codes = appleFmStatus.languages;
    if (!codes || codes.length === 0) return null;
    let display: Intl.DisplayNames | null = null;
    try {
      display = new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      display = null;
    }
    return codes
      .map((c: string) => display?.of(c) ?? c)
      .sort((a: string, b: string) => a.localeCompare(b, locale));
  }, [appleFmStatus, locale]);

  // BYOK tier
  const [byokProviderId, setByokProviderId] = useState(DEFAULT_BYOK_PROVIDER.id);
  const [byokModelId, setByokModelId] = useState(DEFAULT_BYOK_PROVIDER.models[0].id);
  const [byokApiKey, setByokApiKey] = useState("");
  const [showByokKey, setShowByokKey] = useState(false);
  const [byokExists, setByokExists] = useState(false);
  const [byokStoredProvider, setByokStoredProvider] = useState("");
  const [byokStoredModel, setByokStoredModel] = useState("");
  const [savingByok, setSavingByok] = useState(false);
  const [removingByok, setRemovingByok] = useState(false);

  // IA managée (bascaso cloud)
  const [managedInfo, setManagedInfo] = useState<{ email: string; balance: number; subscribed: boolean } | null>(null);
  const [managedEmail, setManagedEmail] = useState("");
  const [managedPassword, setManagedPassword] = useState("");
  const [managedBusy, setManagedBusy] = useState(false);
  // Message affiché sous le formulaire (déjà localisé) plutôt qu'un simple
  // booléen – le message dépend du code d'erreur serveur, voir managedAuthErrorMessage.
  const [managedError, setManagedError] = useState<string | null>(null);
  // Un signup accepté mais en attente de confirmation email bascule sur un
  // 3e état de la carte : ni le formulaire de connexion, ni "connecté". Le
  // modèle d'email en place n'a qu'un lien de confirmation (pas de code – le
  // SMTP personnalisé qui portera {{ .Token }} arrive plus tard) : le chemin
  // principal est donc "confirmez puis reconnectez-vous", et le code reste
  // une alternative repliée, prête pour quand le modèle changera.
  const [managedPendingConfirmation, setManagedPendingConfirmation] = useState(false);
  const [managedShowCodeInput, setManagedShowCodeInput] = useState(false);
  const [managedCode, setManagedCode] = useState("");
  const [managedVerifyBusy, setManagedVerifyBusy] = useState(false);
  const [managedVerifyError, setManagedVerifyError] = useState(false);
  // Un seul poller de solde actif à la fois (double achat), coupé si la page est quittée.
  const managedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const managedMountedRef = useRef(true);
  // Un tick de poll déjà en vol au moment d'un clic "déconnexion" ne doit pas
  // repeupler managedInfo après coup – distinct de managedMountedRef (démontage).
  const managedSignedOutRef = useRef(false);

  const refreshManaged = useCallback(async () => {
    try {
      const res = await fetch("/api/managed/me");
      if (!managedMountedRef.current || managedSignedOutRef.current) return;
      if (!res.ok) {
        setManagedInfo(null);
        return;
      }
      const data = await res.json();
      if (!managedMountedRef.current || managedSignedOutRef.current) return;
      setManagedInfo({
        email: data.email,
        balance: data.balance,
        subscribed: isManagedSubscriptionActive(data.subscription),
      });
    } catch {
      // Cloud injoignable (réseau, panne) – on garde le dernier état connu sans planter.
    }
  }, []);

  useEffect(() => {
    managedMountedRef.current = true;
    void refreshManaged();
    return () => {
      managedMountedRef.current = false;
      if (managedPollRef.current) {
        clearInterval(managedPollRef.current);
        managedPollRef.current = null;
      }
    };
  }, [refreshManaged]);

  // Routing
  const [routing, setRouting] = useState<RoutingState>(EMPTY_ROUTING);

  const [loading, setLoading] = useState(true);

  // Gemini key for screenshot translation
  const [geminiKeyAvailable, setGeminiKeyAvailable] = useState(false);
  const [geminiKeyFromMain, setGeminiKeyFromMain] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [removingGeminiKey, setRemovingGeminiKey] = useState(false);

  const byokProvider = useMemo(
    () => BYOK_PROVIDERS.find((p) => p.id === byokProviderId) ?? DEFAULT_BYOK_PROVIDER,
    [byokProviderId],
  );

  const effectiveLocalBaseUrl = localBaseUrl.trim() || DEFAULT_LOCAL_OPENAI_BASE_URL;

  const hydrateTiers = useCallback((data: { local: TierSettings | null; byok: TierSettings | null }) => {
    if (data.local) {
      const storedBaseUrl = data.local.baseUrl || DEFAULT_LOCAL_OPENAI_BASE_URL;
      setLocalExists(true);
      setLocalModelId(data.local.modelId);
      setLocalBaseUrl(data.local.baseUrl ?? "");
      setLocalStoredModel(data.local.modelId);
      setLocalStoredBaseUrl(storedBaseUrl);
      setLocalEngine(data.local.provider === APPLE_FM_PROVIDER_ID ? "apple-fm" : "local-server");
    } else {
      setLocalExists(false);
      setLocalModelId("");
      setLocalBaseUrl("");
      setLocalStoredModel("");
      setLocalStoredBaseUrl("");
      // No local row – neither engine is selected; the tier stays unusable
      // until the user explicitly picks one.
      setLocalEngine("");
    }

    if (data.byok) {
      setByokExists(true);
      setByokProviderId(data.byok.provider);
      setByokModelId(data.byok.modelId);
      setByokStoredProvider(data.byok.provider);
      setByokStoredModel(data.byok.modelId);
    } else {
      setByokExists(false);
      setByokProviderId(DEFAULT_BYOK_PROVIDER.id);
      setByokModelId(DEFAULT_BYOK_PROVIDER.models[0].id);
      setByokStoredProvider("");
      setByokStoredModel("");
    }
  }, []);

  const refetchRouting = useCallback(async () => {
    const res = await fetch("/api/settings/ai");
    if (!res.ok) return;
    const data = await res.json();
    if (data.routing) setRouting(data.routing as RoutingState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      const res = await fetch("/api/settings/ai");
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        if (cancelled) return;
        hydrateTiers(data);
        if (data.routing) setRouting(data.routing as RoutingState);
      }
      setLoading(false);
    }

    async function fetchGeminiKeyStatus() {
      try {
        const res = await fetch("/api/settings/gemini-key");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setGeminiKeyAvailable(data.available);
          setGeminiKeyFromMain(data.fromMainProvider);
        }
      } catch { /* ignore */ }
    }

    async function fetchAppleFmStatus() {
      try {
        const res = await fetch("/api/settings/ai/apple-fm-status");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setAppleFmStatus({
            available: Boolean(data.available),
            reason: data.reason ?? null,
            languages: Array.isArray(data.languages) ? data.languages : undefined,
          });
        }
      } catch { /* ignore */ }
    }

    fetchSettings();
    fetchGeminiKeyStatus();
    fetchAppleFmStatus();
    return () => { cancelled = true; };
  }, [hydrateTiers]);

  async function refreshAppleFmStatus() {
    try {
      const res = await fetch("/api/settings/ai/apple-fm-status");
      if (res.ok) {
        const data = await res.json();
        setAppleFmStatus({
          available: Boolean(data.available),
          reason: data.reason ?? null,
          languages: Array.isArray(data.languages) ? data.languages : undefined,
        });
      }
    } catch { /* ignore */ }
  }

  async function refreshGeminiKeyStatus() {
    try {
      const res = await fetch("/api/settings/gemini-key");
      if (res.ok) {
        const data = await res.json();
        setGeminiKeyAvailable(data.available);
        setGeminiKeyFromMain(data.fromMainProvider);
      }
    } catch { /* ignore */ }
  }

  // ── Local tier ────────────────────────────────────────────────────────────
  const localModelValid = localModelId.trim().length > 0;
  const localHasKeyInput = localApiKey.trim().length > 0;
  const localConfigChanged =
    localExists &&
    (localModelId.trim() !== localStoredModel || effectiveLocalBaseUrl !== localStoredBaseUrl);
  const canSaveLocal =
    localModelValid && (!localExists || localConfigChanged || localHasKeyInput);

  async function handleSaveLocal() {
    setSavingLocal(true);
    try {
      const body: Record<string, string> = {
        tier: "local",
        provider: LOCAL_PROVIDER_ID,
        modelId: localModelId.trim(),
        baseUrl: effectiveLocalBaseUrl,
      };
      if (localHasKeyInput) body.apiKey = localApiKey.trim();

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(t("settings.ai.saved"));
        setLocalExists(true);
        setLocalStoredModel(localModelId.trim());
        setLocalStoredBaseUrl(effectiveLocalBaseUrl);
        setLocalApiKey("");
        setShowLocalKey(false);
        invalidateAIStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("common.saveFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setSavingLocal(false);
  }

  async function handleRemoveLocal() {
    setRemovingLocal(true);
    try {
      const res = await fetch("/api/settings/ai?tier=local", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.ai.removed"));
        setLocalExists(false);
        setLocalModelId("");
        setLocalBaseUrl("");
        setLocalStoredModel("");
        setLocalStoredBaseUrl("");
        setLocalApiKey("");
        setShowLocalKey(false);
        // Deselect both engines – the tier stays unusable until an explicit
        // re-selection. The server side also restored the language default.
        setLocalEngine("");
        void refetchRouting();
        invalidateAIStatus();
      } else {
        toast.error(t("settings.ai.removeFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setRemovingLocal(false);
  }

  async function handleSaveAppleFm() {
    setSavingAppleFm(true);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "local",
          provider: APPLE_FM_PROVIDER_ID,
          modelId: APPLE_FM_MODEL_ID,
        }),
      });

      if (res.ok) {
        toast.success(t("settings.ai.saved"));
        setLocalExists(true);
        setLocalStoredModel(APPLE_FM_MODEL_ID);
        setLocalStoredBaseUrl("");
        invalidateAIStatus();
        refreshAppleFmStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === "apple_fm_unavailable") {
          toast.error(t("errors.appleFmUnavailable"));
        } else {
          toast.error(data.error || t("common.saveFailed"));
        }
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setSavingAppleFm(false);
  }

  // ── BYOK tier ─────────────────────────────────────────────────────────────
  function handleByokProviderChange(id: string) {
    setByokProviderId(id);
    const next = BYOK_PROVIDERS.find((p) => p.id === id) ?? DEFAULT_BYOK_PROVIDER;
    setByokModelId(next.models[0].id);
    setByokApiKey("");
    setShowByokKey(false);
  }

  const byokProviderChanged = byokExists && byokProviderId !== byokStoredProvider;
  const byokHasKeyInput = byokApiKey.trim().length > 0;
  const byokConfigChanged =
    byokExists && (byokProviderId !== byokStoredProvider || byokModelId !== byokStoredModel);
  const canSaveByok = byokProviderChanged
    ? byokHasKeyInput
    : byokExists
      ? byokConfigChanged || byokHasKeyInput
      : byokHasKeyInput;

  async function handleSaveByok() {
    setSavingByok(true);
    try {
      const body: Record<string, string> = {
        tier: "byok",
        provider: byokProviderId,
        modelId: byokModelId.trim(),
      };
      if (byokHasKeyInput) body.apiKey = byokApiKey.trim();

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(t("settings.ai.saved"));
        setByokExists(true);
        setByokStoredProvider(byokProviderId);
        setByokStoredModel(byokModelId.trim());
        setByokApiKey("");
        setShowByokKey(false);
        invalidateAIStatus();
        refreshGeminiKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("common.saveFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setSavingByok(false);
  }

  async function handleRemoveByok() {
    setRemovingByok(true);
    try {
      const res = await fetch("/api/settings/ai?tier=byok", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.ai.removed"));
        setByokExists(false);
        setByokProviderId(DEFAULT_BYOK_PROVIDER.id);
        setByokModelId(DEFAULT_BYOK_PROVIDER.models[0].id);
        setByokStoredProvider("");
        setByokStoredModel("");
        setByokApiKey("");
        setShowByokKey(false);
        invalidateAIStatus();
        refreshGeminiKeyStatus();
      } else {
        toast.error(t("settings.ai.removeFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setRemovingByok(false);
  }

  // ── IA managée ────────────────────────────────────────────────────────────
  async function handleManagedAuth(mode: "login" | "signup") {
    setManagedError(null);
    await runWithBusyFlag(setManagedBusy, async () => {
      const result = await authenticateManaged(mode, managedEmail, managedPassword);
      if (!result.ok) {
        // 401 : message inline dédié au code serveur (compte déjà inscrit,
        // quota d'emails dépassé, ou identifiants invalides – voir
        // managedAuthErrorMessage). Échec réseau : toast générique, sinon
        // l'utilisateur cherche une faute de frappe qui n'existe pas.
        if (result.reason === "auth") setManagedError(managedAuthErrorMessage(result.code, result.message, t));
        else toast.error(t("common.networkError"));
        return;
      }
      if (result.confirmationRequired) {
        // On garde email/mot de passe en état : c'est ce qui permet au bouton
        // "Je me suis confirmé" de retenter signIn sans les redemander.
        setManagedPendingConfirmation(true);
        return;
      }
      managedSignedOutRef.current = false;
      setManagedPendingConfirmation(false);
      setManagedShowCodeInput(false);
      setManagedPassword("");
      setManagedCode("");
      invalidateAIStatus();
      void refreshManaged();
    });
  }

  async function handleManagedVerify() {
    setManagedVerifyError(false);
    await runWithBusyFlag(setManagedVerifyBusy, async () => {
      const result = await verifyManagedSignup(managedEmail, managedCode.trim());
      if (!result.ok) {
        if (result.reason === "auth") setManagedVerifyError(true);
        else toast.error(t("common.networkError"));
        return;
      }
      managedSignedOutRef.current = false;
      setManagedPendingConfirmation(false);
      setManagedShowCodeInput(false);
      setManagedPassword("");
      setManagedCode("");
      invalidateAIStatus();
      void refreshManaged();
    });
  }

  async function handleManagedSignOut() {
    // Empêche un tick de poll déjà en vol de repeupler managedInfo après coup.
    managedSignedOutRef.current = true;
    // Un poller de solde en cours n'a plus de sens une fois déconnecté.
    if (managedPollRef.current) {
      clearInterval(managedPollRef.current);
      managedPollRef.current = null;
    }
    try {
      await fetch("/api/managed/auth", { method: "DELETE" });
    } catch {
      // Ignoré – l'état local est réinitialisé dans tous les cas ; un rechargement
      // reflétera l'état réel du serveur si la requête n'a pas abouti.
    }
    setManagedInfo(null);
    setManagedPendingConfirmation(false);
    setManagedShowCodeInput(false);
    setManagedCode("");
    invalidateAIStatus();
  }

  // Un échec de checkout/portal n'est pas forcément réseau : le cas le plus courant est une
  // session expirée pendant que l'onglet Réglages restait ouvert. Afficher « erreur réseau »
  // enverrait l'utilisateur vérifier son wifi au lieu de se reconnecter – on repasse donc la
  // carte au formulaire de connexion, qui est à la fois le diagnostic et l'action à faire.
  function reportManagedFailure(status: number) {
    if (status === 401) {
      setManagedInfo(null);
      return;
    }
    toast.error(t("common.unknownError"));
  }

  async function handleManagedCheckout(sku: string) {
    try {
      const res = await fetch("/api/managed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) {
        reportManagedFailure(res.status);
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank"); // Electron route _blank vers le navigateur (setWindowOpenHandler)

      // Un second achat avant la fin du premier remplace le poller en cours au
      // lieu d'en cumuler un deuxième.
      if (managedPollRef.current) clearInterval(managedPollRef.current);
      let ticks = 0; // polling du solde ~1 min après ouverture du checkout
      managedPollRef.current = setInterval(() => {
        void refreshManaged();
        if (++ticks >= 6 && managedPollRef.current) {
          clearInterval(managedPollRef.current);
          managedPollRef.current = null;
        }
      }, 10_000);
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  async function handleManagedPortal() {
    try {
      const res = await fetch("/api/managed/portal", { method: "POST" });
      if (!res.ok) {
        reportManagedFailure(res.status);
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  // ── Gemini key ────────────────────────────────────────────────────────────
  async function handleSaveGeminiKey() {
    if (!geminiKey.trim()) return;
    setSavingGeminiKey(true);
    try {
      const res = await fetch("/api/settings/gemini-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiKey.trim() }),
      });
      if (res.ok) {
        toast.success(t("settings.ai.geminiKeySaved"));
        setGeminiKey("");
        setShowGeminiKey(false);
        refreshGeminiKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("common.saveFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setSavingGeminiKey(false);
  }

  async function handleRemoveGeminiKey() {
    setRemovingGeminiKey(true);
    try {
      const res = await fetch("/api/settings/gemini-key", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.ai.geminiKeyRemoved"));
        refreshGeminiKeyStatus();
      } else {
        toast.error(t("settings.ai.removeFailed"));
      }
    } catch {
      toast.error(t("common.networkError"));
    }
    setRemovingGeminiKey(false);
  }

  if (loading) return null;

  return (
    <div className="space-y-8">
      {/* Local model */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="section-title">{t("settings.ai.localSection")}</h3>
        </div>

        <RadioGroup
          value={localEngine}
          onValueChange={(v) => setLocalEngine(v as LocalEngine)}
          className="max-w-md"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem value="apple-fm" id="local-engine-apple-fm" className="mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="local-engine-apple-fm" className="text-sm font-normal">
                  {t("settings.ai.local.appleFm")}
                </Label>
                {appleFmStatus && (
                  <Badge
                    variant="outline"
                    className={
                      appleFmStatus.available
                        ? "border-green-500/50 text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }
                  >
                    {appleFmStatus.available
                      ? t("settings.ai.local.status.available")
                      : t(`settings.ai.local.status.${appleFmStatus.reason}` as MessageKey)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.ai.local.appleFmHint")}
              </p>
              {localEngine === "apple-fm" && appleFmLanguages && (
                <div className="space-y-1 pt-2 max-w-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="apple-fm-allow-unsupported" className="text-xs font-medium">
                        {t("settings.ai.local.allowUnsupported")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.ai.local.allowUnsupportedHint")}
                      </p>
                    </div>
                    <Switch
                      id="apple-fm-allow-unsupported"
                      checked={routing.allowUnsupportedLanguages}
                      onCheckedChange={async (checked) => {
                        const res = await fetch("/api/settings/ai/routing", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ allowUnsupportedLanguages: checked }),
                        });
                        if (res.ok) refetchRouting();
                        else toast.error(t("common.saveFailed"));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLanguages((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={showLanguages}
                  >
                    <CaretRight
                      className={showLanguages ? "rotate-90 transition-transform" : "transition-transform"}
                    />
                    {t("settings.ai.local.languagesShow")}
                  </button>
                  {showLanguages && (
                    <p className="text-xs text-muted-foreground">
                      {appleFmLanguages.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <RadioGroupItem value="local-server" id="local-engine-server" />
            <Label htmlFor="local-engine-server" className="text-sm font-normal">
              {t("settings.ai.local.server")}
            </Label>
          </div>
        </RadioGroup>

        {localEngine === "apple-fm" && (
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveAppleFm} disabled={savingAppleFm}>
              {savingAppleFm ? (
                <><Spinner /> {t("settings.ai.saving")}</>
              ) : (
                t("settings.ai.save")
              )}
            </Button>
            {localExists && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleRemoveLocal}
                disabled={removingLocal}
              >
                {removingLocal ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
              </Button>
            )}
          </div>
        )}
        {localEngine === "local-server" && (
          <>
            <LocalServerFields
              baseUrl={localBaseUrl}
              onBaseUrlChange={setLocalBaseUrl}
              modelId={localModelId}
              onModelIdChange={setLocalModelId}
              apiKey={localApiKey}
            />

            <section className="space-y-2 max-w-md">
              <h3 className="section-title">{t("settings.ai.apiKey")}</h3>
              <div className="flex items-center gap-2">
                <Input
                  type={showLocalKey ? "text" : "password"}
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder={t("settings.ai.apiKeyPlaceholderLocal")}
                  className="font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowLocalKey(!showLocalKey)}
                >
                  {showLocalKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </section>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveLocal} disabled={savingLocal || !canSaveLocal}>
                {savingLocal ? (
                  <><Spinner /> {t("settings.ai.saving")}</>
                ) : (
                  t("settings.ai.save")
                )}
              </Button>
              {localExists && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={handleRemoveLocal}
                  disabled={removingLocal}
                >
                  {removingLocal ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      {/* Cloud provider – bring your own key */}
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.ai.byokSection")}</h3>

        <section className="space-y-2">
          <h3 className="section-title">{t("settings.ai.provider")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.ai.providerHint")}
          </p>
          <Select value={byokProviderId} onValueChange={handleByokProviderChange}>
            <SelectTrigger className="w-[280px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BYOK_PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <h3 className="section-title">{t("settings.ai.model")}</h3>
          <Select value={byokModelId} onValueChange={setByokModelId}>
            <SelectTrigger className="w-[320px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Stored models that are no longer in the picker stay selectable
                  so existing settings render (and keep working) until the user
                  switches to a current model. */}
              {byokModelId && !byokProvider.models.some((m) => m.id === byokModelId) && (
                <SelectItem value={byokModelId}>
                  <span className="font-mono text-xs">{byokModelId}</span>
                </SelectItem>
              )}
              {byokProvider.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                  <span className="ml-2 text-muted-foreground font-mono text-xs">
                    {m.id}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <h3 className="section-title">{t("settings.ai.apiKey")}</h3>
          {byokExists && !byokProviderChanged ? (
            <div className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-green-600" />
              <span className="text-sm">{t("settings.ai.configured")}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
                onClick={handleRemoveByok}
                disabled={removingByok}
              >
                {removingByok ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 max-w-md">
              {byokProviderChanged && (
                <p className="text-sm text-muted-foreground">
                  {t("settings.ai.switchProviderHint", { provider: byokProvider.name })}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  type={showByokKey ? "text" : "password"}
                  value={byokApiKey}
                  onChange={(e) => setByokApiKey(e.target.value)}
                  placeholder={t("settings.ai.apiKeyPlaceholder")}
                  className="font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowByokKey(!showByokKey)}
                >
                  {showByokKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
          )}
        </section>

        <Button onClick={handleSaveByok} disabled={savingByok || !canSaveByok}>
          {savingByok ? (
            <><Spinner /> {t("settings.ai.saving")}</>
          ) : (
            t("settings.ai.save")
          )}
        </Button>
      </section>

      {/* IA managée – compte cloud bascaso */}
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.ai.managedSection")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.ai.managedHint")}</p>
        {managedInfo === null ? (
          managedPendingConfirmation ? (
            <div className="max-w-[320px] space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.managedConfirmHint", { email: managedEmail })}
              </p>
              {managedError && (
                <p className="text-sm text-destructive">{managedError}</p>
              )}
              <Button disabled={managedBusy} onClick={() => void handleManagedAuth("login")}>
                {t("settings.ai.managedConfirmSignIn")}
              </Button>

              <div>
                <button
                  type="button"
                  onClick={() => setManagedShowCodeInput((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={managedShowCodeInput}
                >
                  <CaretRight
                    className={managedShowCodeInput ? "rotate-90 transition-transform" : "transition-transform"}
                  />
                  {t("settings.ai.managedConfirmCodeToggle")}
                </button>
                {managedShowCodeInput && (
                  <div className="space-y-2 pt-2">
                    <Input
                      type="text"
                      placeholder={t("settings.ai.managedConfirmCode")}
                      value={managedCode}
                      onChange={(e) => setManagedCode(e.target.value)}
                    />
                    {managedVerifyError && (
                      <p className="text-sm text-destructive">{t("settings.ai.managedConfirmFailed")}</p>
                    )}
                    <Button
                      variant="outline"
                      disabled={managedVerifyBusy || !managedCode.trim()}
                      onClick={() => void handleManagedVerify()}
                    >
                      {t("settings.ai.managedConfirmSubmit")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-[320px] space-y-2">
              <Input
                type="email"
                placeholder={t("settings.ai.managedEmail")}
                value={managedEmail}
                onChange={(e) => setManagedEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder={t("settings.ai.managedPassword")}
                value={managedPassword}
                onChange={(e) => setManagedPassword(e.target.value)}
              />
              {managedError && (
                <p className="text-sm text-destructive">{managedError}</p>
              )}
              <div className="flex gap-2">
                <Button disabled={managedBusy} onClick={() => void handleManagedAuth("login")}>
                  {t("settings.ai.managedSignIn")}
                </Button>
                <Button variant="outline" disabled={managedBusy} onClick={() => void handleManagedAuth("signup")}>
                  {t("settings.ai.managedSignUp")}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{t("settings.ai.managedSignedInAs", { email: managedInfo.email })}</p>
            <p className="text-sm font-medium">
              {managedInfo.subscribed
                ? t("settings.ai.managedUnlimited")
                : t("settings.ai.managedBalance", { count: managedInfo.balance })}
            </p>
            <div className="flex flex-wrap gap-2">
              {MANAGED_PACKS.map((p) => (
                <Button key={p.sku} variant="outline" onClick={() => void handleManagedCheckout(p.sku)}>
                  {t("settings.ai.managedBuyPack", { count: p.credits, price: p.price })}
                </Button>
              ))}
              {managedInfo.subscribed ? (
                <Button variant="outline" onClick={() => void handleManagedPortal()}>
                  {t("settings.ai.managedManage")}
                </Button>
              ) : (
                <Button onClick={() => void handleManagedCheckout("sub_monthly")}>
                  {t("settings.ai.managedSubscribe")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void refreshManaged()}>
                {t("settings.ai.managedRefresh")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleManagedSignOut()}>
                {t("settings.ai.managedSignOut")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Routing */}
      <AiRoutingSection routing={routing} onChanged={refetchRouting} />

      {/* Screenshot translation (Gemini) */}
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.ai.screenshotTranslation")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.screenshotHint")}
          {geminiKeyFromMain && t("settings.ai.screenshotHintFromMain")}
        </p>
        {geminiKeyAvailable ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-green-600" />
            <span className="text-sm">
              {geminiKeyFromMain ? t("settings.ai.usingGoogleKey") : t("settings.ai.configured")}
            </span>
            {!geminiKeyFromMain && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs h-auto py-0.5 px-1.5"
                onClick={handleRemoveGeminiKey}
                disabled={removingGeminiKey}
              >
                {removingGeminiKey ? <><Spinner className="size-3" /> {t("settings.ai.removing")}</> : t("common.remove")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 max-w-md">
            <Input
              type={showGeminiKey ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={t("settings.ai.geminiKeyPlaceholder")}
              className="font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveGeminiKey();
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
            >
              {showGeminiKey ? <EyeSlash size={16} /> : <Eye size={16} />}
            </Button>
            <Button
              onClick={handleSaveGeminiKey}
              disabled={savingGeminiKey || !geminiKey.trim()}
            >
              {savingGeminiKey ? <Spinner className="size-4" /> : t("settings.ai.save")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
