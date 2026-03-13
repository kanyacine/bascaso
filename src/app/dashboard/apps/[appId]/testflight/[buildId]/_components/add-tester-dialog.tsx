"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CircleNotch, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFTester } from "@/lib/asc/testflight";

export function AddTesterDialog({
  open,
  onOpenChange,
  appId,
  buildId,
  existingTesterIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  buildId: string;
  existingTesterIds: string[];
  onAdded: (tester: TFTester) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [appTesters, setAppTesters] = useState<TFTester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New tester fields
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const existingSet = useMemo(() => new Set(existingTesterIds), [existingTesterIds]);

  // Fetch app-level testers when dialog opens in "existing" mode
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setMode("existing");

    setLoadingTesters(true);
    fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers?scope=app`)
      .then((res) => res.ok ? res.json() : { testers: [] })
      .then((data) => setAppTesters(data.testers ?? []))
      .catch(() => setAppTesters([]))
      .finally(() => setLoadingTesters(false));
  }, [open, appId, buildId]);

  const filteredTesters = useMemo(() => {
    const available = appTesters.filter((t) => !existingSet.has(t.id));
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter(
      (t) =>
        t.firstName.toLowerCase().includes(q) ||
        t.lastName.toLowerCase().includes(q) ||
        (t.email?.toLowerCase().includes(q) ?? false),
    );
  }, [appTesters, existingSet, search]);

  async function addExisting(testerId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tester");
      }
      const tester = appTesters.find((t) => t.id === testerId);
      if (tester) {
        onAdded({ ...tester, state: "INVITED" });
      }
      toast.success("Tester added and invited");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tester");
    } finally {
      setSubmitting(false);
    }
  }

  async function addNew() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tester");
      }
      const data = await res.json();
      onAdded({
        id: data.testerId,
        firstName: firstName.trim() || "Anonymous",
        lastName: lastName.trim(),
        email: email.trim(),
        inviteType: "EMAIL",
        state: "INVITED",
        sessions: 0,
        crashes: 0,
        feedbackCount: 0,
      });
      toast.success("Tester invited to build");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tester");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add tester</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
          >
            Pick existing
          </Button>
          <Button
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("new")}
          >
            Add new
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search testers…"
                className="pl-8"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {loadingTesters ? (
                <div className="flex items-center justify-center py-8">
                  <CircleNotch size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredTesters.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search ? "No matching testers" : "No available testers"}
                </p>
              ) : (
                filteredTesters.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addExisting(t.id)}
                    disabled={submitting}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {t.firstName} {t.lastName}
                      </p>
                      {t.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.email}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tester@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">First name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Last name</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={addNew}
                disabled={submitting || !email.trim()}
              >
                {submitting && <CircleNotch size={14} className="mr-1.5 animate-spin" />}
                Add tester
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
