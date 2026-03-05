"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDemo(d.demo === true))
      .catch(() => {});
  }, []);

  if (!demo) return null;

  async function exitDemo() {
    await fetch("/api/setup/demo", { method: "DELETE" });
    router.push("/setup");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 border-b bg-primary/10 px-4 py-2 text-sm">
      <Info size={16} className="shrink-0 text-primary" />
      <span className="flex-1">
        You&apos;re viewing sample data.
        Connect your App Store Connect account to see real data.
      </span>
      <Button variant="outline" size="sm" onClick={exitDemo}>
        Exit demo
      </Button>
    </div>
  );
}
