"use client";

import Image from "next/image";
import { GithubLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { APP_VERSION, BUILD_NUMBER } from "@/lib/version";
import { BRAND_ISSUES_URL, BRAND_NAME, BRAND_SITE_URL, PRIVACY_URL, TERMS_URL } from "@/lib/brand";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function AboutPage() {
  const t = useTranslations();

  return (
    <div className="max-w-2xl space-y-6">
      <Image
        src="/icon.png"
        alt={BRAND_NAME}
        width={64}
        height={64}
        className="rounded-xl"
      />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{BRAND_NAME}</h2>
        <a
          href={BRAND_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:underline underline-offset-4"
        >
          {BRAND_SITE_URL}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t("settings.about.version")}</span>
          <p className="font-mono text-xs mt-0.5">{APP_VERSION}</p>
        </div>
        <div>
          <span className="text-muted-foreground">{t("settings.about.build")}</span>
          <p className="font-mono text-xs mt-0.5">{BUILD_NUMBER}</p>
        </div>
      </div>

      <Button variant="outline" size="sm" asChild>
        <a
          href={BRAND_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GithubLogo size={16} />
          {t("settings.about.reportIssue")}
        </a>
      </Button>

      {/* Reachable from the app, not only from the repository: a paying customer must be
          able to read what they agreed to without leaving the product, or knowing a
          repository exists. */}
      <div className="flex gap-4 text-sm">
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline underline-offset-4"
        >
          {t("settings.about.privacy")}
        </a>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline underline-offset-4"
        >
          {t("settings.about.terms")}
        </a>
      </div>

      <section className="space-y-1">
        <h3 className="section-title">{t("settings.about.credits")}</h3>
        <p className="text-xs text-muted-foreground">
          <a
            href="https://github.com/YUZU-Hub/appscreen"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline underline-offset-4"
          >
            {t("settings.about.creditsAppscreen")}
          </a>
        </p>
        <p className="text-xs text-muted-foreground">{t("settings.about.creditsModels")}</p>
      </section>
    </div>
  );
}
