"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { localeName } from "@/lib/asc/locale-names";
import { useKeywords } from "./_components/keywords-context";
import { OverviewCard } from "./_components/overview-card";
import { LocaleCard } from "./_components/locale-card";

export default function KeywordsLocalesPage() {
  const {
    app, localeAnalysis, readOnly, loading, noVersions,
    handleKeywordsChange, getTitle, getSubtitle, getDescription,
  } = useKeywords();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (noVersions) {
    return (
      <EmptyState
        title="No versions"
        description="Create a version to start analysing keywords."
      />
    );
  }

  if (!localeAnalysis || localeAnalysis.localeData.length === 0) {
    return (
      <EmptyState
        title="No localizations"
        description="Add localizations in store listing to manage keywords."
      />
    );
  }

  return (
    <div className="space-y-6">
      <OverviewCard
        analysis={localeAnalysis}
        readOnly={readOnly}
        appName={app?.name}
        primaryLocale={app?.primaryLocale}
        getTitle={getTitle}
        getSubtitle={getSubtitle}
        getDescription={getDescription}
        onApplyFixes={(updates) => {
          for (const [locale, kw] of Object.entries(updates)) {
            handleKeywordsChange(locale, kw);
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          {localeAnalysis.localeData.length} locale{localeAnalysis.localeData.length > 1 ? "s" : ""} with keywords.
        </p>
      </OverviewCard>

      <section className="space-y-3">
        {localeAnalysis.localeData.map((ld) => (
          <LocaleCard
            key={ld.locale}
            data={ld}
            analysis={localeAnalysis}
            appName={app?.name}
            appTitle={getTitle(ld.locale)}
            appSubtitle={getSubtitle(ld.locale)}
            description={getDescription(ld.locale)}
            readOnly={readOnly}
            isPrimary={ld.resolvedLocale === app?.primaryLocale}
            onKeywordsChange={handleKeywordsChange}
          />
        ))}
      </section>

      {localeAnalysis.crossLocaleDuplicates.size > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">Cross-locale duplicates</h3>
          <Card className="gap-0 py-0">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                These keywords appear in multiple locales. If those locales are
                co-indexed in a storefront, repetition wastes budget &ndash; check the
                storefront view for details.
              </p>
              <div className="space-y-2">
                {[...localeAnalysis.crossLocaleDuplicates.entries()].map(
                  ([kw, locales]) => (
                    <div key={kw} className="flex items-center gap-2">
                      <Badge variant="secondary">{kw}</Badge>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {locales.map((l) => localeName(l)).join(", ")}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
