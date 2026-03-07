"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFormDirty } from "@/lib/form-dirty-context";
import { KeywordsProvider } from "./_components/keywords-context";

const TABS = [
  { label: "My locales", segment: "" },
  { label: "Storefronts", segment: "/storefront" },
];

export default function KeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appId } = useParams<{ appId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty, guardNavigation } = useFormDirty();
  const base = `/dashboard/apps/${appId}/aso/keywords`;

  return (
    <KeywordsProvider>
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center border-b">
          <nav className="-mb-px flex">
            {TABS.map((tab) => {
              const href = `${base}${tab.segment}`;
              const active =
                tab.segment === ""
                  ? pathname === base
                  : pathname.startsWith(`${base}${tab.segment}`);
              return (
                <Link
                  key={tab.segment}
                  href={href}
                  onNavigate={(e) => {
                    if (!isDirty) return;
                    e.preventDefault();
                    guardNavigation(() => router.push(href));
                  }}
                  className={cn(
                    "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </KeywordsProvider>
  );
}
