"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useErrorReport } from "@/lib/error-report-context";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { resolveVersion } from "@/lib/asc/version-types";
import { FIELD_LIMITS } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";
import { EmptyState } from "@/components/empty-state";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";

export default function AppReviewPage() {
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading, updateVersion } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );

  const reviewDetail = selectedVersion?.reviewDetail?.attributes;
  const versionId = selectedVersion?.id ?? "";

  const { setDirty, registerSave, registerDiscard, setValidationErrors } = useFormDirty();
  const { showAscError } = useErrorReport();
  const [notes, setNotes] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [demoName, setDemoName] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Populate form when version changes (compare by ID, not object reference)
  const [syncedVersionId, setSyncedVersionId] = useState("");
  if (versionId && versionId !== syncedVersionId) {
    setSyncedVersionId(versionId);
    setNotes(reviewDetail?.notes ?? "");
    setSignInRequired(reviewDetail?.demoAccountRequired ?? false);
    setDemoName(reviewDetail?.demoAccountName ?? "");
    setDemoPassword(reviewDetail?.demoAccountPassword ?? "");
    setFirstName(reviewDetail?.contactFirstName ?? "");
    setLastName(reviewDetail?.contactLastName ?? "");
    setPhone(reviewDetail?.contactPhone ?? "");
    setEmail(reviewDetail?.contactEmail ?? "");
    setDirty(false);
  }

  // Validate field limits
  useEffect(() => {
    const limit = FIELD_LIMITS.reviewNotes;
    if (notes.length > limit) {
      setValidationErrors([`Review notes exceeds ${limit} character limit`]);
    } else {
      setValidationErrors([]);
    }
  }, [notes, setValidationErrors]);

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      const res = await fetch(
        `/api/apps/${appId}/versions/${selectedVersion?.id}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewDetailId: selectedVersion?.reviewDetail?.id ?? null,
            attributes: {
              notes,
              demoAccountRequired: signInRequired,
              demoAccountName: demoName,
              demoAccountPassword: demoPassword,
              contactFirstName: firstName,
              contactLastName: lastName,
              contactPhone: phone,
              contactEmail: email,
            },
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        if (data.ascErrors?.length) {
          showAscError({
            message: data.error ?? "Save failed",
            ascErrors: data.ascErrors,
            ascMethod: data.ascMethod,
            ascPath: data.ascPath,
          });
        } else {
          toast.error(data.error ?? "Save failed");
        }
        return;
      }

      toast.success("Review info saved");

      // Update cached version so navigating away and back shows saved values
      if (selectedVersion) {
        updateVersion(selectedVersion.id, (v) => ({
          ...v,
          reviewDetail: {
            id: v.reviewDetail?.id ?? "",
            attributes: {
              notes,
              demoAccountRequired: signInRequired,
              demoAccountName: demoName,
              demoAccountPassword: demoPassword,
              contactFirstName: firstName,
              contactLastName: lastName,
              contactPhone: phone,
              contactEmail: email,
            },
          },
        }));
      }
      setDirty(false);
    });
  }, [
    appId, selectedVersion, notes, signInRequired, demoName, demoPassword,
    firstName, lastName, phone, email, registerSave, setDirty, updateVersion, showAscError,
  ]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
      setNotes(reviewDetail?.notes ?? "");
      setSignInRequired(reviewDetail?.demoAccountRequired ?? false);
      setDemoName(reviewDetail?.demoAccountName ?? "");
      setDemoPassword(reviewDetail?.demoAccountPassword ?? "");
      setFirstName(reviewDetail?.contactFirstName ?? "");
      setLastName(reviewDetail?.contactLastName ?? "");
      setPhone(reviewDetail?.contactPhone ?? "");
      setEmail(reviewDetail?.contactEmail ?? "");
    });
  }, [reviewDetail, registerDiscard]);

  if (!app) {
    return <EmptyState title="App not found" />;
  }

  if (versionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={tabRef} className="space-y-6">
      {/* Review notes */}
      <section className="space-y-2">
        <h3 className="section-title">Notes for App Review</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              placeholder="Provide any additional information the App Review team might need..."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount value={notes} limit={FIELD_LIMITS.reviewNotes} />
          </div>
        </Card>
      </section>

      {/* Demo account */}
      <section className="space-y-4">
        <h3 className="section-title">Demo account</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="sign-in-required"
            checked={signInRequired}
            onCheckedChange={(v) => { setSignInRequired(v); setDirty(true); }}
          />
          <Label htmlFor="sign-in-required" className="text-sm">
            Sign-in required
          </Label>
        </div>
        {signInRequired && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Username</label>
              <Input
                dir="ltr"
                placeholder="demo@example.com"
                className="text-sm"
                value={demoName}
                onChange={(e) => { setDemoName(e.target.value); setDirty(true); }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Password</label>
              <Input
                dir="ltr"
                type="password"
                placeholder="Password"
                className="text-sm"
                value={demoPassword}
                onChange={(e) => { setDemoPassword(e.target.value); setDirty(true); }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Contact information */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">Contact details</h3>
        <p className="text-sm text-muted-foreground">
          How the App Review team can reach you if they have questions.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">First name</label>
            <Input
              className="text-sm"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Last name</label>
            <Input
              className="text-sm"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Phone</label>
            <Input
              dir="ltr"
              className="text-sm"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Email</label>
            <Input
              dir="ltr"
              type="email"
              className="text-sm"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
