"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearNavigation } from "@/lib/nav-state";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    clearNavigation();
    router.replace("/dashboard");
  }, [router]);

  return null;
}
