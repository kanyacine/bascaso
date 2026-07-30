"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CaretRight, CheckCircle } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { LocalServerFields } from "@/components/local-server-fields";
import { ApiKeyInput } from "@/components/api-key-input";
import { AppleFmOption, type AppleFmStatus } from "@/components/apple-fm-option";
import { AiRoutingSection, type RoutingState } from "@/components/settings/ai-routing-section";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";
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

/** Cloud providers only – the local server is configured in its own section. */
const BYOK_PROVIDERS = AI_PROVIDERS.filter((p) => !isLocalOpenAIProvider(p.id));
const DEFAULT_BYOK_PROVIDER = BYOK_PROVIDERS[0];


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
  managedAvailable: false,
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
  const [byokExists, setByokExists] = useState(false);
  const [byokStoredProvider, setByokStoredProvider] = useState("");
  const [byokStoredModel, setByokStoredModel] = useState("");
  const [savingByok, setSavingByok] = useState(false);
  const [removingByok, setRemovingByok] = useState(false);

  // Routing
  const [routing, setRouting] = useState<RoutingState>(EMPTY_ROUTING);

  const [loading, setLoading] = useState(true);

  // Gemini key for screenshot translation
  const [geminiKeyAvailable, setGeminiKeyAvailable] = useState(false);
  const [geminiKeyFromMain, setGeminiKeyFromMain] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
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
          <AppleFmOption id="local-engine-apple-fm" status={appleFmStatus}>
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
          </AppleFmOption>

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
              <ApiKeyInput
                value={localApiKey}
                onChange={setLocalApiKey}
                placeholder={t("settings.ai.apiKeyPlaceholderLocal")}
              />
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
              <ApiKeyInput
                value={byokApiKey}
                onChange={setByokApiKey}
                placeholder={t("settings.ai.apiKeyPlaceholder")}
              />
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
      {/* Le compte cloud, le solde, les achats et l'abonnement vivaient ici, coincés
          entre la config BYOK et le routage : un client ne trouvait pas où gérer son
          abonnement. Ils ont leur propre onglet ; il ne reste que le renvoi. */}
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.ai.managedSection")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.ai.managedMovedHint")}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/account">{t("settings.ai.managedGoToAccount")}</Link>
        </Button>
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
          <ApiKeyInput
            value={geminiKey}
            onChange={setGeminiKey}
            placeholder={t("settings.ai.geminiKeyPlaceholder")}
            onEnter={handleSaveGeminiKey}
            className="max-w-md"
          >
            <Button
              onClick={handleSaveGeminiKey}
              disabled={savingGeminiKey || !geminiKey.trim()}
            >
              {savingGeminiKey ? <Spinner className="size-4" /> : t("settings.ai.save")}
            </Button>
          </ApiKeyInput>
        )}
      </section>
    </div>
  );
}
