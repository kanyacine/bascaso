"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CaretUpDown,
  Check,
  GearSix,
  GithubLogo,
  Plus,
} from "@phosphor-icons/react";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useLicense } from "@/lib/license-context";
import { FREE_LIMITS } from "@/lib/license-shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const { isPro } = useLicense();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [switching, setSwitching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

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
  const displayName = isDemo ? "Sample data" : (active?.name || "My team");

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
                <span className="truncate font-medium text-sm">
                  {displayName}
                </span>
                <CaretUpDown className="ml-auto" size={16} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              {!isDemo && accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  disabled={switching}
                  onClick={() => {
                    if (account.isActive) return;
                    handleSwitch(account.id);
                  }}
                >
                  {account.isActive ? (
                    <Check size={16} weight="bold" />
                  ) : (
                    <span className="w-4" />
                  )}
                  {account.name || "My team"}
                </DropdownMenuItem>
              ))}
              {!isDemo && (
                <>
                  <DropdownMenuSeparator />
                  {!isPro && accounts.length >= FREE_LIMITS.teams ? (
                    <DropdownMenuItem disabled>
                      <Plus size={16} />
                      Add team (upgrade to Pro)
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                      <Plus size={16} />
                      Add team…
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  guardNavigation(() => router.push("/settings"))
                }
              >
                <GearSix size={16} />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    "https://github.com/nickustinov/itsyconnect-macos/issues/new",
                    "_blank",
                  )
                }
              >
                <GithubLogo size={16} />
                Report an issue
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
