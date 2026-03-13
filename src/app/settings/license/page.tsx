"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CheckCircle, ArrowSquareOut } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { useLicense } from "@/lib/license-context";
import { CHECKOUT_URL, IS_MAS } from "@/lib/license-shared";
import { toast } from "sonner";

function MasFreePage() {
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    window.electron?.store?.getProduct().then((product) => {
      if (product) setPrice(product.price);
    });

    return window.electron?.store?.onError((message) => {
      setPurchasing(false);
      setRestoring(false);
      toast.error(message);
    });
  }, []);

  async function handlePurchase() {
    setPurchasing(true);
    await window.electron?.store?.purchase();
  }

  async function handleRestore() {
    setRestoring(true);
    await window.electron?.store?.restore();
    // Restore triggers transactions-updated which calls license-updated IPC.
    // Give it a moment, then reset the button.
    setTimeout(() => setRestoring(false), 3000);
  }

  return (
    <div className="max-w-md space-y-4">
      <Button onClick={handlePurchase} disabled={purchasing}>
        {purchasing ? <Spinner className="size-4" /> : `Buy Pro${price ? ` – ${price}` : ""}`}
      </Button>

      <p className="text-sm text-muted-foreground">
        One-time purchase – unlimited apps and teams.
      </p>

      <button
        type="button"
        onClick={handleRestore}
        disabled={restoring}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground/80"
      >
        {restoring ? "Restoring…" : "Restore purchases"}
      </button>
    </div>
  );
}

function MasProPage() {
  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Pro</h2>
          <CheckCircle size={24} weight="fill" className="text-green-600" />
        </div>
        <p className="text-sm text-muted-foreground">
          Unlimited apps and teams
        </p>
      </div>
    </div>
  );
}

function DirectFreePage() {
  const { refresh } = useLicense();
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    if (!key.trim()) return;
    setActivating(true);
    setError(null);

    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Activation failed");
        return;
      }

      toast.success("Pro license activated");
      setKey("");
      await refresh();
    } catch {
      setError("Could not reach the activation server");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="max-w-md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError(null);
            }}
            placeholder="Paste your license key"
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleActivate();
            }}
          />
          <Button onClick={handleActivate} disabled={activating || !key.trim()}>
            {activating ? <Spinner className="size-4" /> : "Activate"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <p className="text-sm text-muted-foreground">
          Don&apos;t have a key?{" "}
          <button
            type="button"
            onClick={() => window.open(CHECKOUT_URL, "_blank")}
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-foreground/80"
          >
            Get Pro
            <ArrowSquareOut size={14} />
          </button>
        </p>
      </div>
    </div>
  );
}

function DirectProPage() {
  const { email, refresh } = useLicense();
  const [deactivating, setDeactivating] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/license")
      .then((r) => r.json())
      .then((d) => setMaskedKey(d.maskedKey ?? null))
      .catch(() => {});
  }, []);

  async function handleDeactivate() {
    setDeactivating(true);

    try {
      await fetch("/api/license", { method: "DELETE" });
      toast.success("License deactivated");
      setMaskedKey(null);
      await refresh();
    } catch {
      toast.error("Could not deactivate license");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Pro</h2>
          <CheckCircle size={24} weight="fill" className="text-green-600" />
        </div>
        <p className="text-sm text-muted-foreground">
          Unlimited apps and teams
        </p>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">Licensed to</span>
          <p className="font-medium">{email}</p>
        </div>
        <div>
          <span className="text-muted-foreground">License key</span>
          <p className="font-mono text-xs">{maskedKey}</p>
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={deactivating}>
            {deactivating ? "Deactivating…" : "Deactivate"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate license?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your Pro license from this device. You can
              reactivate it later with the same key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function LicensePage() {
  const { isPro, loading } = useLicense();

  if (loading) return null;

  if (IS_MAS) {
    return isPro ? <MasProPage /> : <MasFreePage />;
  }

  return isPro ? <DirectProPage /> : <DirectFreePage />;
}
