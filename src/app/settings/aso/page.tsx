"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DOWNLOADS_ALL_STOREFRONTS_KEY } from "@/lib/aso/downloads";
import { usePersistedBool } from "@/lib/hooks/use-persisted-range";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function AsoPage() {
  const t = useTranslations();
  const [allStorefronts, setAllStorefronts] = usePersistedBool(
    DOWNLOADS_ALL_STOREFRONTS_KEY,
    false,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.aso.downloads")}</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="downloads-all-storefronts"
            checked={allStorefronts}
            onCheckedChange={setAllStorefronts}
          />
          <Label htmlFor="downloads-all-storefronts" className="text-sm">
            {t("settings.aso.downloadsAllStorefronts")}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.aso.downloadsAllStorefrontsHint")}
        </p>
      </section>
    </div>
  );
}
