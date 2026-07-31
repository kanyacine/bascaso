"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordRules } from "@/components/password-rules";
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  allRulesPass,
  managedAuthErrorMessage,
  passwordRules,
  requestManagedPasswordReset,
  resetManagedPassword,
  runWithBusyFlag,
} from "@/lib/managed/client";

interface ManagedPasswordResetProps {
  /** Prefilled from whatever was already typed in the sign-in field. */
  initialEmail: string;
  /** Signed in with the new password – the parent refreshes the account. */
  onReset: () => void;
  onCancel: () => void;
  className?: string;
  buttonClassName?: string;
}

/** Password reset, in the app rather than in a browser: the email carries a six-digit
 *  code, not a link, because a link would have to land on a website this desktop app
 *  does not have. Two steps in one component – the second only appears once the first
 *  has been sent, so there is never a code field with nothing to type in it. */
export function ManagedPasswordReset({
  initialEmail,
  onReset,
  onCancel,
  className,
  buttonClassName,
}: ManagedPasswordResetProps) {
  const t = useTranslations();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      const result = await requestManagedPasswordReset(email.trim());
      if (!result.ok) {
        if (result.reason === "auth") setError(managedAuthErrorMessage(result.code, result.message, t));
        else toast.error(t("common.networkError"));
        return;
      }
      setSent(true);
    });
  }

  async function handleReset() {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      const result = await resetManagedPassword(email.trim(), code.trim(), password);
      if (!result.ok) {
        if (result.reason === "auth") setError(managedAuthErrorMessage(result.code, result.message, t));
        else toast.error(t("common.networkError"));
        return;
      }
      toast.success(t("settings.account.resetDone"));
      onReset();
    });
  }

  const ready = allRulesPass(passwordRules(password, confirm)) && code.trim().length >= 6;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <p className="text-sm text-muted-foreground">
        {sent ? t("settings.account.resetSentHint", { email: email.trim() }) : t("settings.account.resetHint")}
      </p>
      {!sent && (
        <Input
          type="email"
          placeholder={t("settings.account.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      {sent && (
        <>
          <Input
            type="text"
            placeholder={t("settings.account.confirmCode")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            type="password"
            placeholder={t("settings.account.newPassword")}
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
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          className={buttonClassName}
          disabled={busy || (sent ? !ready : !email.trim())}
          onClick={() => void (sent ? handleReset() : handleSend())}
        >
          {sent ? t("settings.account.resetSubmit") : t("settings.account.resetSend")}
        </Button>
        <Button variant="outline" className={buttonClassName} disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
      {sent && (
        // The email can fail to arrive – rate limits, typos, spam folders. Without a
        // way back to step one the only escape is closing the window.
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("settings.account.resetResend")}
        </button>
      )}
    </div>
  );
}
