"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ManagedAccountCard } from "@/components/managed-account-card";
import { ManagedAuthForm } from "@/components/managed-auth-form";
import { useTranslations } from "@/lib/i18n/locale-context";
import { accountDisplayName } from "@/lib/managed/client";
import { invalidateAIStatus } from "@/lib/hooks/use-ai-status";
import { invalidateAIRouting } from "@/lib/hooks/use-ai-routing";
import { invalidateManagedAccount, useManagedAccount } from "@/lib/hooks/use-managed-account";

/** Administrative view of the cloud account: who you are, and what the account is
 *  worth. Buying credits, subscribing and the billing portal all live in the shared
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
    try {
      await fetch("/api/managed/auth", { method: "DELETE" });
    } catch {
      // Ignored – local state resets either way; a reload will reflect the real
      // server state if the request did not land.
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

  return (
    <div className="max-w-2xl space-y-8 pb-16">
      <section className="space-y-4">
        <h3 className="section-title">{t("settings.account.section")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.account.hint")}</p>

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
    </div>
  );
}
