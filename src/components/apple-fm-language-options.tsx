"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CaretRight } from "@phosphor-icons/react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocale, useTranslations } from "@/lib/i18n/locale-context";

interface AppleFmLanguageOptionsProps {
  /** Language codes the sidecar reports. Nothing renders without them. */
  codes: string[] | undefined;
  allowUnsupported: boolean;
  /** Called with the new value once the server has stored it. */
  onAllowUnsupportedChange: (enabled: boolean) => void;
}

/** The built-in model's language controls: the unsupported-language switch and
 *  the list it applies to. Saves on toggle, like every other setting in the app,
 *  so the wizard and the settings page behave the same. */
export function AppleFmLanguageOptions({
  codes,
  allowUnsupported,
  onAllowUnsupportedChange,
}: AppleFmLanguageOptionsProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const [showLanguages, setShowLanguages] = useState(false);

  // Human-readable, locale-sorted names for the codes the model reports.
  const languages = useMemo<string[] | null>(() => {
    if (!codes || codes.length === 0) return null;
    let display: Intl.DisplayNames | null = null;
    try {
      display = new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      display = null;
    }
    return codes
      .map((c) => display?.of(c) ?? c)
      .sort((a, b) => a.localeCompare(b, locale));
  }, [codes, locale]);

  if (!languages) return null;

  return (
    <div className="space-y-1 pt-2 max-w-md">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="apple-fm-allow-unsupported" className="text-xs font-medium">
            {t("settings.ai.local.allowUnsupported")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.ai.local.allowUnsupportedHint")}
          </p>
        </div>
        <Switch
          id="apple-fm-allow-unsupported"
          checked={allowUnsupported}
          onCheckedChange={async (checked) => {
            const res = await fetch("/api/settings/ai/routing", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ allowUnsupportedLanguages: checked }),
            });
            if (res.ok) onAllowUnsupportedChange(checked);
            else toast.error(t("common.saveFailed"));
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowLanguages((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={showLanguages}
      >
        <CaretRight
          className={showLanguages ? "rotate-90 transition-transform" : "transition-transform"}
        />
        {t("settings.ai.local.languagesShow")}
      </button>
      {showLanguages && (
        <p className="text-xs text-muted-foreground">{languages.join(", ")}</p>
      )}
    </div>
  );
}
