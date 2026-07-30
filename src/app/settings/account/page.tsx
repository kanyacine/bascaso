"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ManagedAuthForm } from "@/components/managed-auth-form";
import { useTranslations } from "@/lib/i18n/locale-context";
import { accountDisplayName } from "@/lib/managed/client";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

/** Administrative view of the cloud account: who you are, and how the subscription is
 *  billed. Buying credits and subscribing deliberately live in ManagedPurchaseDialog
 *  instead – opened from the AI settings page and the wizard, where a user actually
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
    try {
      await fetch("/api/managed/auth", { method: "DELETE" });
    } catch {
      // Ignored – local state resets either way; a reload will reflect the real
      // server state if the request did not land.
    }
    invalidateManagedAccount();
    invalidateAIStatus();
  }

  async function handleSaveUsername() {
    setSavingUsername(true);
    try {
      const res = await fetch("/api/managed/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
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

  async function handlePortal() {
    try {
      const res = await fetch("/api/managed/portal", { method: "POST" });
      if (!res.ok) {
        // Most often an expired session while the Settings tab stayed open: hand the
        // card back to the sign-in form, which is both the diagnosis and the fix.
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

  return (
    <div className="max-w-2xl space-y-8 pb-16">
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.account.section")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.account.hint")}</p>

        {account === null ? (
          <ManagedAuthForm onAuthenticated={() => invalidateManagedAccount()} />
        ) : (
          <div className="space-y-4">
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
            <p className="text-sm">{t("settings.account.signedInAs", { email: account.email })}</p>
            <p className="text-sm font-medium">
              {account.subscribed
                ? t("settings.account.unlimited")
                : t("settings.account.balance", { count: account.balance })}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => invalidateManagedAccount()}>
                {t("settings.account.refresh")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                {t("settings.account.signOut")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {account?.subscribed && (
        <section className="space-y-3">
          <h3 className="section-title">{t("settings.account.subscriptionSection")}</h3>
          <p className="text-sm text-muted-foreground">{t("settings.account.subscriptionManagedHint")}</p>
          <Button variant="outline" onClick={() => void handlePortal()}>
            {t("settings.account.manageSubscription")}
          </Button>
        </section>
      )}
    </div>
  );
}
