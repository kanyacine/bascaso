"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppStoreLogoIcon,
  CheckCircle,
  IdentificationBadge,
  Info,
  Lock,
  MagicWand,
  Package,
  UserCircle,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocalServerFields } from "@/components/local-server-fields";
import { ManagedAuthForm } from "@/components/managed-auth-form";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { ApiKeyInput } from "@/components/api-key-input";
import { AppleFmOption, type AppleFmStatus } from "@/components/apple-fm-option";
import { AppleFmLanguageOptions } from "@/components/apple-fm-language-options";
import { clearNavigation } from "@/lib/nav-state";
import { isLocalOpenAIProvider } from "@/lib/ai/local-provider";
import { useTranslations } from "@/lib/i18n/locale-context";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

const WIZARD_STEPS = 4;

// Step 4 – AI. The "apple-fm" id is kept as a local literal (not imported from
// `@/lib/ai/apple-fm`) – that module reads a Node state file and must never end
// up in the client bundle.
type LocalEngine = "apple-fm" | "local-server";
const BYOK_PROVIDERS = AI_PROVIDERS.filter((p) => !isLocalOpenAIProvider(p.id));
const DEFAULT_BYOK_PROVIDER = BYOK_PROVIDERS[0];

export default function SetupPage() {
  const router = useRouter();
  const t = useTranslations();
  const [ready, setReady] = useState(false);
  // step 0 = welcome, steps 1–3 = wizard
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [enteringDemo, setEnteringDemo] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setup) {
          router.replace("/dashboard?entry=1");
        } else {
          setReady(true);
          (window as { electron?: { ready: () => void } }).electron?.ready();
        }
      })
      .catch(() => {
        setReady(true);
        (window as { electron?: { ready: () => void } }).electron?.ready();
      });
  }, [router]);

  // Step 1 – Team name
  const [teamName, setTeamName] = useState(() => t("nav.myTeam"));

  // Step 2 – ASC credentials
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keyIdFromFile, setKeyIdFromFile] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  // Step 3 – local model
  const [localEngine, setLocalEngine] = useState<LocalEngine | "">("");
  const [localBaseUrl, setLocalBaseUrl] = useState("");
  const [localModelId, setLocalModelId] = useState("");
  const [localApiKey, setLocalApiKey] = useState("");
  const [appleFmStatus, setAppleFmStatus] = useState<AppleFmStatus | null>(null);
  // Stored in app preferences, not in the setup payload: the switch writes
  // through immediately, exactly as it does in Settings > AI.
  const [allowUnsupportedLanguages, setAllowUnsupportedLanguages] = useState(false);

  // Step 3 – Bascaso account
  const { account } = useManagedAccount();

  // Step 4 – AI
  const [cloudTab, setCloudTab] = useState<"account" | "byok">("account");
  const [byokProviderId, setByokProviderId] = useState(DEFAULT_BYOK_PROVIDER.id);
  const [byokModelId, setByokModelId] = useState(DEFAULT_BYOK_PROVIDER.models[0].id);
  const [byokApiKey, setByokApiKey] = useState("");

  const byokProvider = useMemo(
    () => BYOK_PROVIDERS.find((p) => p.id === byokProviderId) ?? DEFAULT_BYOK_PROVIDER,
    [byokProviderId],
  );

  function handleByokProviderChange(id: string) {
    setByokProviderId(id);
    const p = BYOK_PROVIDERS.find((p) => p.id === id) ?? DEFAULT_BYOK_PROVIDER;
    setByokModelId(p.models[0].id);
    setByokApiKey("");
  }

  // Read on arrival rather than at mount: the built-in model's sidecar boots
  // alongside the app, so a status fetched from the welcome screen can still say
  // "not found" by the time this step renders – leaving the option disabled with
  // no way back. Nothing here is needed before the AI step anyway.
  useEffect(() => {
    if (step !== 4) return;
    fetch("/api/settings/ai/apple-fm-status")
      .then((res) => res.json())
      .then(setAppleFmStatus)
      .catch(() => setAppleFmStatus({ available: false, reason: "sidecar_unreachable" }));
    // Can already carry a value if setup restarts mid-flight.
    fetch("/api/settings/ai")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.routing) setAllowUnsupportedLanguages(data.routing.allowUnsupportedLanguages);
      })
      .catch(() => {});
  }, [step]);

  function resetConnectionTest() {
    setTestStatus("idle");
    setTestError("");
  }

  async function testConnection(
    testIssuerId: string,
    testKeyId: string,
    testPrivateKey: string,
  ) {
    setTestStatus("testing");
    setTestError("");

    try {
      const res = await fetch("/api/setup/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: testIssuerId,
          keyId: testKeyId,
          privateKey: testPrivateKey,
        }),
      });

      if (res.ok) {
        setTestStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        setTestStatus("error");
        setTestError(data.error || t("common.connectionFailed"));
      }
    } catch {
      setTestStatus("error");
      setTestError(t("common.networkError"));
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setKeyError("");
    resetConnectionTest();
    setPrivateKey("");
    setKeyId("");
    setKeyIdFromFile(false);

    file.text().then((text) => {
      const trimmed = text.trim();

      // Validate PEM structure
      if (
        !trimmed.startsWith("-----BEGIN PRIVATE KEY-----") ||
        !trimmed.endsWith("-----END PRIVATE KEY-----")
      ) {
        setKeyError(t("common.invalidKeyFile"));
        return;
      }

      setPrivateKey(trimmed);

      // Extract key ID from filename (AuthKey_XXXXXXXXXX.p8)
      const match = file.name.match(/AuthKey_([A-Z0-9]+)\.p8/);
      if (match) {
        setKeyId(match[1]);
        setKeyIdFromFile(true);
      }

      const resolvedKeyId = match ? match[1] : keyId.trim();
      if (issuerId.trim() && resolvedKeyId) {
        testConnection(issuerId.trim(), resolvedKeyId, trimmed);
      }

    });
  }

  function canAdvance(): boolean {
    if (step === 0) return true;
    if (step === 1) return teamName.trim().length > 0;
    if (step === 2) {
      return (
        issuerId.trim().length > 0 &&
        keyId.trim().length > 0 &&
        privateKey.trim().length > 0 &&
        testStatus === "ok"
      );
    }
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {};

      // Include ASC credentials
      if (issuerId.trim() && keyId.trim() && privateKey.trim()) {
        body.name = teamName.trim() || t("nav.myTeam");
        body.issuerId = issuerId.trim();
        body.keyId = keyId.trim();
        body.privateKey = privateKey;
      }

      // Include AI settings if provided
      if (localEngine === "apple-fm") {
        body.local = { provider: "apple-fm" };
      } else if (localEngine === "local-server" && localModelId.trim()) {
        const local: Record<string, string> = {
          provider: "local-openai",
          modelId: localModelId.trim(),
        };
        if (localBaseUrl.trim()) local.baseUrl = localBaseUrl.trim();
        if (localApiKey.trim()) local.apiKey = localApiKey.trim();
        body.local = local;
      }
      if (byokApiKey.trim()) {
        body.byok = {
          provider: byokProviderId,
          modelId: byokModelId,
          apiKey: byokApiKey.trim(),
        };
      }

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "apple_fm_unavailable") {
          toast.error(t("errors.appleFmUnavailable"));
        } else {
          toast.error(data.error || t("setup.setupFailed"));
        }
        setSubmitting(false);
        return;
      }

      toast.success(t("setup.setupComplete"));
      clearNavigation();
      router.push("/dashboard?entry=1");
      router.refresh();
    } catch {
      toast.error(t("common.networkError"));
      setSubmitting(false);
    }
  }

  async function handleEnterDemo() {
    setEnteringDemo(true);
    try {
      const res = await fetch("/api/setup/demo", { method: "POST" });
      if (!res.ok) {
        toast.error(t("setup.demoFailed"));
        setEnteringDemo(false);
        return;
      }
      clearNavigation();
      router.push("/dashboard?entry=1");
      router.refresh();
    } catch {
      toast.error(t("common.networkError"));
      setEnteringDemo(false);
    }
  }

  function handleNext() {
    if (step < WIZARD_STEPS) {
      // The AI step opens on whichever cloud option the user can actually use:
      // the managed tab once signed in, BYOK otherwise.
      if (step === 3) setCloudTab(account ? "account" : "byok");
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  if (!ready) return null;

  const isWelcome = step === 0;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
      <div className="drag fixed inset-x-0 top-0 h-16" />
      <div className="no-drag fixed top-4 right-4">
        <ThemeToggle />
      </div>
      {/* Three fixed bands: header, scrolling body, footer. The header carries
          the step's identity, so nothing that appears or disappears below is
          allowed to move it – the body absorbs every growth instead. The height
          cap keeps the wizard a centred card on a tall display rather than a
          column of whitespace. */}
      <div className="flex h-full max-h-[46rem] w-full max-w-md flex-col">
        <div className="shrink-0 space-y-8 pt-16 pb-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              {step === 0 && <Package size={32} weight="fill" />}
              {step === 1 && <IdentificationBadge size={32} weight="fill" />}
              {step === 2 && <AppStoreLogoIcon size={32} weight="fill" />}
              {step === 3 && <UserCircle size={32} weight="fill" />}
              {step === 4 && <MagicWand size={32} weight="fill" />}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {step === 0 && t("setup.title.welcome")}
              {step === 1 && t("setup.title.account")}
              {step === 2 && t("setup.title.asc")}
              {step === 3 && t("setup.title.cloud")}
              {step === 4 && t("setup.title.ai")}
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              {step === 0 && t("setup.subtitle.welcome")}
              {step === 1 && t("setup.subtitle.account")}
              {step === 2 && t("setup.subtitle.asc")}
              {step === 3 && t("setup.subtitle.cloud")}
              {step === 4 && t("setup.subtitle.ai")}
            </p>
          </div>

          {/* Step indicator (only for wizard steps 1–3) */}
          {!isWelcome && (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: WIZARD_STEPS }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i + 1 === step
                      ? "w-8 bg-primary"
                      : i + 1 < step
                        ? "w-4 bg-primary/40"
                        : "w-4 bg-muted"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scrolling body – the horizontal padding gives focus rings room the
            scroll container would otherwise clip. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 -mx-1">
          <div className="flex min-h-full flex-col justify-center gap-8 py-1">
            {/* Welcome */}
            {step === 0 && (
              <div className="space-y-4">
                <ul className="flex flex-col items-start gap-3 text-sm text-muted-foreground w-fit mx-auto">
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                    {t("setup.features.manage")}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                    {t("setup.features.testflight")}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                    {t("setup.features.ai")}
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock size={16} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
                    {t("setup.features.privacy")}
                  </li>
                </ul>
              </div>
            )}

            {/* Step 1 – Team name */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{t("setup.teamName")}</label>
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canAdvance()) handleNext();
                    }}
                    placeholder={t("nav.myTeam")}
                    className="text-sm"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("setup.teamNameHint")}
                  </p>
                </div>
              </div>
            )}

            {/* Step 2 – ASC credentials */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {t("setup.ascHintPrefix")}{" "}
                      <a
                        href="https://appstoreconnect.apple.com/access/integrations/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {t("setup.ascHintLink")}
                      </a>
                      {" "}{t("setup.ascHintSuffix")}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{t("setup.issuerId")}</label>
                  <Input
                    value={issuerId}
                    onChange={(e) => {
                      setIssuerId(e.target.value);
                      resetConnectionTest();
                    }}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="font-mono text-sm"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    {t("setup.privateKey")}
                  </label>
                  <Input
                    type="file"
                    accept=".p8"
                    onChange={handleFileUpload}
                    className="text-sm"
                  />
                  {keyError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle size={14} weight="fill" />
                      {keyError}
                    </p>
                  )}
                  {privateKey && !keyError && keyIdFromFile && (
                    <>
                      {testStatus === "testing" && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Spinner className="size-3.5" />
                          {t("common.testingConnection")}
                        </p>
                      )}
                      {testStatus === "ok" && (
                        <p className="flex items-center gap-1.5 text-xs text-green-600">
                          <CheckCircle size={14} weight="fill" />
                          {t("common.connectedKeyId")}{" "}
                          <span className="font-mono">{keyId}</span>
                        </p>
                      )}
                      {testStatus === "error" && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive">
                          <XCircle size={14} weight="fill" />
                          {testError || t("common.connectionFailedCheck")}
                        </p>
                      )}
                      {testStatus === "error" &&
                        keyId.trim() &&
                        issuerId.trim() && (
                          <button
                            type="button"
                            className="text-xs text-primary underline-offset-4 hover:underline"
                            onClick={() =>
                              testConnection(
                                issuerId.trim(),
                                keyId.trim(),
                                privateKey,
                              )
                            }
                          >
                            {t("common.testAgain")}
                          </button>
                        )}
                    </>
                  )}
                  {privateKey && !keyError && !keyIdFromFile && (
                    <p className="text-xs text-muted-foreground">
                      {t("common.keyLoadedEnterId")}
                    </p>
                  )}
                </div>
                {/* Show key ID input only if not extracted from filename */}
                {privateKey && !keyIdFromFile && !keyError && (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">{t("setup.keyId")}</label>
                    <Input
                      value={keyId}
                      onChange={(e) => {
                        setKeyId(e.target.value);
                        resetConnectionTest();
                      }}
                      placeholder="XXXXXXXXXX"
                      className="font-mono text-sm"
                    />
                    {testStatus === "testing" && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Spinner className="size-3.5" />
                        {t("common.testingConnection")}
                      </p>
                    )}
                    {testStatus === "ok" && (
                      <p className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle size={14} weight="fill" />
                        {t("common.connectedKeyId")}{" "}
                        <span className="font-mono">{keyId}</span>
                      </p>
                    )}
                    {testStatus === "error" && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <XCircle size={14} weight="fill" />
                        {testError || t("common.connectionFailedCheck")}
                      </p>
                    )}
                    {(testStatus === "idle" || testStatus === "error") &&
                      keyId.trim() &&
                      issuerId.trim() && (
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                          onClick={() =>
                            testConnection(
                              issuerId.trim(),
                              keyId.trim(),
                              privateKey,
                            )
                          }
                        >
                          {testStatus === "error"
                            ? t("common.testAgain")
                            : t("settings.teams.testConnection")}
                        </button>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3 – Bascaso account */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{t("setup.cloudPitch")}</p>
                  <p className="text-xs text-muted-foreground">{t("setup.cloudOptionalNote")}</p>
                </div>
                {account ? (
                  <ManagedAccountCard />
                ) : (
                  <ManagedAuthForm fill onAuthenticated={() => invalidateManagedAccount()} />
                )}
              </div>
            )}

            {/* Step 4 – AI */}
            {step === 4 && (
              <div className="space-y-6">
                {/* Local model */}
                <section className="space-y-3">
                  <h3 className="section-title">{t("setup.localTitle")}</h3>
                  <RadioGroup
                    value={localEngine}
                    onValueChange={(v) => setLocalEngine(v as LocalEngine)}
                  >
                    {/* Clicking the already-selected engine deselects it: radix does not
                        fire onValueChange for the checked item, and on a fresh click the
                        closure still holds the pre-change value, so the two handlers
                        never fight. */}
                    <AppleFmOption
                      id="setup-engine-apple-fm"
                      status={appleFmStatus}
                      disabled={!appleFmStatus?.available}
                      onClick={() => {
                        if (localEngine === "apple-fm") setLocalEngine("");
                      }}
                    >
                      {localEngine === "apple-fm" && appleFmStatus?.available && (
                        <AppleFmLanguageOptions
                          codes={appleFmStatus.languages}
                          allowUnsupported={allowUnsupportedLanguages}
                          onAllowUnsupportedChange={setAllowUnsupportedLanguages}
                        />
                      )}
                    </AppleFmOption>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="local-server"
                        id="setup-engine-server"
                        onClick={() => {
                          if (localEngine === "local-server") setLocalEngine("");
                        }}
                      />
                      <Label htmlFor="setup-engine-server" className="text-sm font-normal">
                        {t("settings.ai.local.server")}
                      </Label>
                    </div>
                  </RadioGroup>
                  {localEngine === "local-server" && (
                    <>
                      <LocalServerFields
                        baseUrl={localBaseUrl}
                        onBaseUrlChange={setLocalBaseUrl}
                        modelId={localModelId}
                        onModelIdChange={setLocalModelId}
                        apiKey={localApiKey}
                        compact
                      />
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          {t("setup.apiKey")}{" "}
                          <span className="text-xs text-muted-foreground/60">{t("common.optional")}</span>
                        </label>
                        <ApiKeyInput
                          value={localApiKey}
                          onChange={setLocalApiKey}
                          placeholder={t("setup.apiKeyPlaceholderLocal")}
                        />
                      </div>
                    </>
                  )}
                </section>

                {/* Cloud */}
                <section className="space-y-3">
                  <h3 className="section-title">{t("setup.cloudTitle")}</h3>
                  <Tabs value={cloudTab} onValueChange={(v) => setCloudTab(v as "account" | "byok")}>
                    <TabsList className="w-full">
                      <TabsTrigger value="account" className="flex-1">
                        {t("setup.tabAccount")}
                      </TabsTrigger>
                      <TabsTrigger value="byok" className="flex-1">
                        {t("setup.tabByok")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="account" className="pt-2">
                      {/* No sign-out anywhere in onboarding: leaving the account is not
                          something to do while still setting the app up. */}
                      {account ? (
                        <ManagedAccountCard />
                      ) : (
                        <ManagedAuthForm fill onAuthenticated={() => invalidateManagedAccount()} />
                      )}
                    </TabsContent>
                    <TabsContent value="byok" className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("setup.provider")}</label>
                        <Select value={byokProviderId} onValueChange={handleByokProviderChange}>
                          <SelectTrigger className="w-full text-sm">
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
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("setup.model")}</label>
                        <Select value={byokModelId} onValueChange={setByokModelId}>
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {byokProvider.models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                <span className="ml-2 font-mono text-xs text-muted-foreground">
                                  {m.id}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          {t("setup.apiKey")}{" "}
                          <span className="text-xs text-muted-foreground/60">{t("common.optional")}</span>
                        </label>
                        <ApiKeyInput
                          value={byokApiKey}
                          onChange={setByokApiKey}
                          placeholder={t("setup.apiKeyPlaceholder")}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </section>
              </div>
            )}

          </div>
        </div>

        <div className="shrink-0 space-y-4 pt-6 pb-8">
          {/* Navigation */}
          <div className={`flex items-center gap-2 ${isWelcome ? "justify-center" : "justify-end"}`}>
            {step > 1 && (
              <Button
                variant="ghost"
                onClick={() => setStep(step - 1)}
                disabled={submitting}
              >
                {t("common.back")}
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || submitting}
            >
              {submitting ? (
                <>
                  <Spinner />
                  {t("setup.settingUp")}
                </>
              ) : step === WIZARD_STEPS ? (
                t("common.finish")
              ) : step === 0 ? (
                t("setup.getStarted")
              ) : (
                t("common.continue")
              )}
            </Button>
          </div>

          {isWelcome && (
            <div className="flex justify-center">
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={enteringDemo}
                onClick={handleEnterDemo}
              >
                {enteringDemo ? t("common.loading") : t("setup.exploreSampleData")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
