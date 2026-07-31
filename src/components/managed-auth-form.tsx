"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  authenticateManaged,
  managedAuthErrorMessage,
  runWithBusyFlag,
  verifyManagedSignup,
} from "@/lib/managed/client";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { invalidateAIRouting } from "@/lib/hooks/use-ai-routing";

interface ManagedAuthFormProps {
  /** Called after a successful sign-in, sign-up or code verification. */
  onAuthenticated: () => void;
  /** Span the container instead of the default narrow column, and let the
   *  buttons share that width – the wizard renders this inside a tab panel,
   *  where a 320px island under a full-width tab list looks unfinished. */
  fill?: boolean;
}

/** Email/password form for the Bascaso cloud account, covering the two
 *  signed-out states: the plain form, and "waiting for email confirmation"
 *  (link-first, with a collapsed code input as the fallback – the current
 *  email template only carries a link). Shared by the account settings page
 *  and the onboarding wizard; the parent decides what to render once
 *  authenticated. */
export function ManagedAuthForm({ onAuthenticated, fill }: ManagedAuthFormProps) {
  const t = useTranslations();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Localized message keyed on the server error code, not a boolean – see
  // managedAuthErrorMessage.
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState(false);

  const width = fill ? "w-full" : "max-w-[320px]";
  // w-full, not flex-1: the confirmation branch stacks its buttons in a block
  // container where flex-1 is inert. In the sign-in/sign-up flex row the two
  // buttons shrink from an equal basis, so they still split the width evenly.
  const button = fill ? "w-full" : undefined;

  async function handleAuth(mode: "login" | "signup") {
    setError(null);
    // Checked here rather than by disabling the button: the field is only required for
    // one of the two buttons, and a permanently greyed-out "Sign in" would be worse.
    if (mode === "signup" && !username.trim()) {
      setError(t("settings.account.usernameRequired"));
      return;
    }
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
      invalidateAIStatus();
      invalidateAIRouting();
      onAuthenticated();
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
      invalidateAIStatus();
      invalidateAIRouting();
      onAuthenticated();
    });
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

  return (
    <div className={`${width} space-y-2`}>
      {/* Only signing up needs it; the sign-in path ignores the field entirely. */}
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className={button} disabled={busy} onClick={() => void handleAuth("login")}>
          {t("settings.account.signIn")}
        </Button>
        <Button
          variant="outline"
          className={button}
          disabled={busy}
          onClick={() => void handleAuth("signup")}
        >
          {t("settings.account.signUp")}
        </Button>
      </div>
    </div>
  );
}
