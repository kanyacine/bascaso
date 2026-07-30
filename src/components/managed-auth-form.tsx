"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordRules } from "@/components/password-rules";
import { ManagedPasswordReset } from "@/components/managed-password-reset";
import { PRIVACY_URL, TERMS_URL } from "@/lib/brand";
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  allRulesPass,
  authenticateManaged,
  managedAuthErrorMessage,
  passwordRules,
  runWithBusyFlag,
  verifyManagedSignup,
} from "@/lib/managed/client";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { invalidateAIRouting } from "@/lib/hooks/use-ai-routing";

type AuthTab = "signin" | "signup";

interface ManagedAuthFormProps {
  /** Called after a successful sign-in, sign-up or code verification. */
  onAuthenticated: () => void;
  /** Span the container instead of the default narrow column, and let the
   *  buttons share that width – the wizard renders this inside a tab panel,
   *  where a 320px island under a full-width tab list looks unfinished. */
  fill?: boolean;
  /** Which tab opens first. Onboarding opens on "signup": someone still setting the
   *  app up has, by definition, not got an account yet. Everywhere else opens on
   *  "signin", where a returning user starts. */
  defaultTab?: AuthTab;
}

/** Email/password form for the Bascaso cloud account. Two explicit tabs – sign in and
 *  create an account – because the single pair of buttons it replaces asked the user
 *  to guess which of them applied, and validated for both at once. Also covers the two
 *  detours out of the form: "waiting for email confirmation" (link-first, with a
 *  collapsed code input as the fallback – the current email template only carries a
 *  link) and the password reset. Shared by the account settings page and the onboarding
 *  wizard; the parent decides what to render once authenticated. */
export function ManagedAuthForm({ onAuthenticated, fill, defaultTab = "signin" }: ManagedAuthFormProps) {
  const t = useTranslations();
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // Localized message keyed on the server error code, not a boolean – see
  // managedAuthErrorMessage.
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState(false);

  const width = fill ? "w-full" : "max-w-[320px]";
  // w-full, not flex-1: the confirmation branch stacks its buttons in a block
  // container where flex-1 is inert. In the sign-in/sign-up flex row the two
  // buttons shrink from an equal basis, so they still split the width evenly.
  const button = fill ? "w-full" : undefined;

  function authenticated() {
    invalidateAIStatus();
    invalidateAIRouting();
    onAuthenticated();
  }

  async function handleAuth(mode: "login" | "signup") {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      const result = await authenticateManaged(
        mode, email, password, mode === "signup" ? username.trim() : undefined,
      );
      if (!result.ok) {
        if (result.reason === "auth") {
          setError(managedAuthErrorMessage(result.code, result.message, t));
        } else {
          toast.error(t("common.networkError"));
        }
        return;
      }
      if (result.confirmationRequired) {
        // Keep email/password in state: the "I've confirmed" button retries
        // sign-in without asking for them again.
        setPendingConfirmation(true);
        return;
      }
      authenticated();
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
      authenticated();
    });
  }

  if (resetting) {
    return (
      <ManagedPasswordReset
        initialEmail={email}
        className={width}
        buttonClassName={button}
        onReset={() => {
          setResetting(false);
          authenticated();
        }}
        onCancel={() => setResetting(false)}
      />
    );
  }

  if (pendingConfirmation) {
    return (
      <div className={`${width} space-y-3`}>
        <p className="text-sm text-muted-foreground">
          {t("settings.account.confirmHint", { email })}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className={button} disabled={busy} onClick={() => void handleAuth("login")}>
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
                className={button}
                disabled={verifyBusy || !code.trim()}
                onClick={() => void handleVerify()}
              >
                {t("settings.account.confirmSubmit")}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const signUpReady =
    username.trim().length > 0 && email.trim().length > 0 && allRulesPass(passwordRules(password, confirm));

  return (
    <Tabs
      value={tab}
      // The error belongs to the tab that produced it: "this address is already
      // registered" makes no sense once the user has switched to signing in.
      onValueChange={(v) => {
        setTab(v as AuthTab);
        setError(null);
      }}
      className={width}
    >
      <TabsList className="w-full">
        <TabsTrigger value="signin" className="flex-1">
          {t("settings.account.signIn")}
        </TabsTrigger>
        <TabsTrigger value="signup" className="flex-1">
          {t("settings.account.signUp")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="signin" className="space-y-2 pt-2">
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
        <Button
          className={fill ? "w-full" : undefined}
          disabled={busy || !email.trim() || !password}
          onClick={() => void handleAuth("login")}
        >
          {t("settings.account.signIn")}
        </Button>
        <button
          type="button"
          onClick={() => setResetting(true)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
        >
          {t("settings.account.forgotPassword")}
        </button>
      </TabsContent>

      <TabsContent value="signup" className="space-y-2 pt-2">
        <Input
          type="text"
          placeholder={t("settings.account.username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
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
        <Input
          type="password"
          placeholder={t("settings.account.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <PasswordRules password={password} confirm={confirm} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className={fill ? "w-full" : undefined}
          disabled={busy || !signUpReady}
          onClick={() => void handleAuth("signup")}
        >
          {t("settings.account.signUp")}
        </Button>
        {/* Consent is stated where it is given, under the button that gives it – and
            links to what is being accepted, which is otherwise only reachable from the
            About page. */}
        <p className="text-xs text-muted-foreground">
          {t("settings.account.consent")}{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("settings.about.terms")}
          </a>
          {" · "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("settings.about.privacy")}
          </a>
        </p>
      </TabsContent>
    </Tabs>
  );
}
