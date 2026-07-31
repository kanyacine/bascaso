"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { ManagedAuthForm } from "@/components/managed-auth-form";
import { PasswordRules } from "@/components/password-rules";
import { useTranslations } from "@/lib/i18n/locale-context";
import {
  accountDisplayName,
  allRulesPass,
  managedAuthErrorMessage,
  passwordRules,
  runWithBusyFlag,
} from "@/lib/managed/client";
import { stopPurchasePoll } from "@/lib/managed/purchase-poll";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { invalidateAIRouting } from "@/lib/hooks/use-ai-routing";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

/** Administrative view of the cloud account: who you are, what the account is worth,
 *  and – the part that has to exist for the privacy policy to be true – how to leave.
 *  Buying credits, subscribing and the billing portal all live in the shared
 *  ManagedAccountCard, rendered here and on every other surface where a user
 *  discovers they need them. */
export default function AccountSettingsPage() {
  const t = useTranslations();
  const { account } = useManagedAccount();

  const [username, setUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  // Seeded from the account, not held independently: a rename made elsewhere (or a
  // sign-out into a different account) has to be reflected here.
  useEffect(() => {
    setUsername(account?.username ?? "");
  }, [account?.username]);

  async function handleSignOut() {
    // Stopped before the request: the poll refetches the account every five seconds
    // and would otherwise keep asking about a session that no longer exists – and
    // announce "payment received" against a balance read for nobody.
    stopPurchasePoll();
    try {
      const res = await fetch("/api/managed/auth", { method: "DELETE" });
      const body = res.ok ? await res.json().catch(() => null) : null;
      // The local session is gone whatever happened; what can still fail is revoking
      // the refresh token server-side, and a user who signed out believing the
      // credential was dead deserves to be told it may not be.
      if (!res.ok || body?.revoked === false) toast.warning(t("settings.account.signOutNotRevoked"));
    } catch {
      toast.warning(t("settings.account.signOutNotRevoked"));
    }
    invalidateManagedAccount();
    invalidateAIStatus();
    // Signing out moves every unset group back off the managed tier
    // (getRoutingDefaultTier), so the cost badges must stop claiming a credit for
    // actions that now run free.
    invalidateAIRouting();
  }

  async function handleSaveUsername() {
    setSavingUsername(true);
    try {
      const res = await fetch("/api/managed/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "username", username: username.trim() }),
      });
      if (!res.ok) {
        toast.error(t("common.unknownError"));
        return;
      }
      invalidateManagedAccount();
      toast.success(t("settings.account.usernameSaved"));
    } catch {
      toast.error(t("common.networkError"));
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleDelete() {
    stopPurchasePoll();
    try {
      const res = await fetch("/api/managed/me", { method: "DELETE" });
      if (!res.ok) {
        // Nothing was deleted – the account and any subscription are still live, and
        // saying so beats leaving a signed-out screen over an account that still bills.
        // cancel_failed is the expensive one: Stripe still holds a live subscription,
        // so the user is told to stop it in the portal rather than to just try again.
        const code = await res.json().then((b) => b?.error).catch(() => undefined);
        toast.error(
          code === "cancel_failed"
            ? t("settings.account.deleteCancelFailed")
            : t("settings.account.deleteFailed"),
        );
        return;
      }
      toast.success(t("settings.account.deleteDone"));
      invalidateManagedAccount();
      invalidateAIStatus();
      invalidateAIRouting();
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  return (
    <div className="max-w-2xl space-y-8 pb-16">
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.account.section")}</h3>
        {/* The pitch only applies to someone who has no account: it used to tell
            signed-in users to sign in. */}
        {account === null && <p className="text-sm text-muted-foreground">{t("settings.account.hint")}</p>}

        {account === null ? (
          <ManagedAuthForm onAuthenticated={() => invalidateManagedAccount()} />
        ) : (
          <div className="space-y-4">
            <ManagedAccountCard />
            <div className="max-w-[320px] space-y-2">
              <label className="text-sm text-muted-foreground">{t("settings.account.username")}</label>
              <div className="flex gap-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={accountDisplayName(account)}
                />
                <Button
                  variant="outline"
                  disabled={savingUsername || !username.trim() || username.trim() === (account.username ?? "")}
                  onClick={() => void handleSaveUsername()}
                >
                  {savingUsername ? <Spinner className="size-4" /> : t("settings.account.usernameSave")}
                </Button>
              </div>
            </div>

            <Separator />
            <ChangeEmail currentEmail={account.email} />
            <ChangePassword />

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => invalidateManagedAccount()}>
                {t("settings.account.refresh")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                {t("settings.account.signOut")}
              </Button>
            </div>

            <Separator />
            {/* Promised by PRIVACY.md ("deleting your account deletes everything
                attached to it") long before anything implemented it. */}
            <div className="space-y-2">
              <h3 className="section-title">{t("settings.account.deleteSection")}</h3>
              <p className="text-sm text-muted-foreground">{t("settings.account.deleteHint")}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    {t("settings.account.deleteAction")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.account.deleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.account.deleteConfirm", { email: account.email })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
                      {t("settings.account.deleteAction")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      try {
        const res = await fetch("/api/managed/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "email", email: email.trim() }),
        });
        if (!res.ok) {
          // The route relays GoTrue's code, so "this address is already taken" reads
          // as itself rather than as a generic failure.
          const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          setError(managedAuthErrorMessage(body.code, body.error, t));
          return;
        }
        // Nothing changes yet: GoTrue mails both addresses and waits for both to
        // confirm, so promising "email updated" here would be a lie until then.
        toast.success(t("settings.account.emailPending"));
        setEmail("");
      } catch {
        toast.error(t("common.networkError"));
      }
    });
  }

  return (
    <div className="max-w-[320px] space-y-2">
      <label className="text-sm text-muted-foreground">{t("settings.account.emailChange")}</label>
      <p className="text-xs text-muted-foreground">
        {t("settings.account.emailChangeHint", { email: currentEmail })}
      </p>
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("settings.account.emailNew")}
        />
        <Button
          variant="outline"
          disabled={busy || !email.trim() || email.trim() === currentEmail}
          onClick={() => void handleSave()}
        >
          {busy ? <Spinner className="size-4" /> : t("settings.account.usernameSave")}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ChangePassword() {
  const t = useTranslations();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    await runWithBusyFlag(setBusy, async () => {
      try {
        const res = await fetch("/api/managed/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "password", currentPassword: current, password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          // invalid_credentials here means the CURRENT password, not the account –
          // the generic "check your email and password" would send the user looking
          // in the wrong place.
          setError(
            body.code === "invalid_credentials"
              ? t("settings.account.currentPasswordWrong")
              : managedAuthErrorMessage(body.code, body.error, t),
          );
          return;
        }
        toast.success(t("settings.account.passwordSaved"));
        setCurrent("");
        setPassword("");
        setConfirm("");
      } catch {
        toast.error(t("common.networkError"));
      }
    });
  }

  const ready = current.length > 0 && allRulesPass(passwordRules(password, confirm));

  return (
    <div className="max-w-[320px] space-y-2">
      <label className="text-sm text-muted-foreground">{t("settings.account.passwordChange")}</label>
      <Input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder={t("settings.account.currentPassword")}
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("settings.account.newPassword")}
      />
      <Input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={t("settings.account.confirmPassword")}
      />
      <PasswordRules password={password} confirm={confirm} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="outline" disabled={busy || !ready} onClick={() => void handleSave()}>
        {busy ? <Spinner className="size-4" /> : t("settings.account.passwordSave")}
      </Button>
    </div>
  );
}
