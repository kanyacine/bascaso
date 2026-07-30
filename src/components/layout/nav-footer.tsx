"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CaretUpDown,
  Check,
  GearSix,
  GithubLogo,
  Plus,
  SignIn,
  UserCircle,
} from "@phosphor-icons/react";
import { useFormDirty } from "@/lib/form-dirty-context";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AddAccountDialog } from "./add-account-dialog";
import { useTranslations } from "@/lib/i18n/locale-context";
import { BRAND_ISSUES_URL } from "@/lib/brand";
import { accountDisplayName } from "@/lib/managed/client";
import { useManagedAccount } from "@/lib/hooks/use-managed-account";

interface Account {
  id: string;
  name: string | null;
  issuerId: string;
  keyId: string;
  isActive: boolean;
  createdAt: string;
}

export function NavFooter() {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { guardNavigation } = useFormDirty();
  const t = useTranslations();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [switching, setSwitching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const { account } = useManagedAccount();

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/settings/credentials");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.credentials);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setIsDemo(d.demo === true))
      .catch(() => {});
  }, [fetchAccounts]);

  const active = accounts.find((a) => a.isActive);
  const displayName = isDemo ? t("nav.sampleData") : (active?.name || t("nav.myTeam"));
  // Same badge on the button and in the menu header – one expression, so the two can
  // never disagree about what the account is entitled to.
  const balanceBadge = account && (
    // shrink-0: the row it sits in truncates, and without this the badge is what
    // gives way – "55 jetons" rendered as a clipped "55 jeto".
    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
      {account.subscribed ? t("nav.subscribed") : t("nav.credits", { count: account.balance })}
    </Badge>
  );

  async function doSwitch(id: string) {
    setSwitching(true);
    try {
      const res = await fetch(`/api/settings/credentials/${id}/activate`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchAccounts();
        router.push("/dashboard?entry=1");
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  function handleSwitch(id: string) {
    if (switching) return;
    guardNavigation(() => doSwitch(id));
  }

  async function handleAccountAdded() {
    setDialogOpen(false);
    await fetchAccounts();
    guardNavigation(() => {
      router.push("/dashboard?entry=1");
      router.refresh();
    });
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                {/* Two lines when a cloud account is linked: the team above, the
                    account below. One line otherwise – an empty second row would
                    just make the button taller for nothing. */}
                <div className="grid flex-1 leading-tight">
                  <span className="truncate font-medium text-sm">{displayName}</span>
                  {!isDemo && account && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{accountDisplayName(account)}</span>
                      {balanceBadge}
                    </span>
                  )}
                </div>
                <CaretUpDown className="ml-auto" size={16} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              {/* Cloud account first, above the Apple teams: it is what the second
                  line of the button refers to, and the one thing this menu did not
                  expose anywhere. Hidden in demo mode, which has no account at all. */}
              {!isDemo && (account ? (
                <>
                  <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                    <span className="truncate text-sm font-medium">{accountDisplayName(account)}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{account.email}</span>
                      {balanceBadge}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => guardNavigation(() => router.push("/settings/account"))}>
                    <UserCircle size={16} />
                    {t("nav.manageAccount")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => guardNavigation(() => router.push("/settings/account"))}>
                    <SignIn size={16} />
                    {t("nav.signIn")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ))}
              {!isDemo && accounts.map((appleTeam) => (
                <DropdownMenuItem
                  key={appleTeam.id}
                  disabled={switching}
                  onClick={() => {
                    if (appleTeam.isActive) return;
                    handleSwitch(appleTeam.id);
                  }}
                >
                  {appleTeam.isActive ? (
                    <Check size={16} weight="bold" />
                  ) : (
                    <span className="w-4" />
                  )}
                  {appleTeam.name || t("nav.myTeam")}
                </DropdownMenuItem>
              ))}
              {!isDemo && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                    <Plus size={16} />
                    {t("nav.addTeam")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  guardNavigation(() => router.push("/settings"))
                }
              >
                <GearSix size={16} />
                {t("nav.settings")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    BRAND_ISSUES_URL,
                    "_blank",
                  )
                }
              >
                <GithubLogo size={16} />
                {t("nav.reportIssue")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleAccountAdded}
      />
    </>
  );
}
