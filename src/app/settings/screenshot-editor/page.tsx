"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function ScreenshotEditorSettingsPage() {
  const t = useTranslations();
  const [googleFonts, setGoogleFonts] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/screenshot-editor")
      .then((res) => (res.ok ? res.json() : { googleFonts: false }))
      .then((data: { googleFonts?: boolean }) => setGoogleFonts(Boolean(data.googleFonts)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (enabled: boolean) => {
    setGoogleFonts(enabled);
    await fetch("/api/settings/screenshot-editor", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ googleFonts: enabled }),
    });
  };

  // The tab is one switch: a blank pane reads as "nothing here" rather than "still loading".
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="section-title">{t("settings.screenshotEditor.fonts")}</h3>
        <div className="flex items-center gap-3">
          <Switch id="google-fonts" checked={googleFonts} onCheckedChange={toggle} />
          <Label htmlFor="google-fonts" className="text-sm">
            {t("settings.screenshotEditor.googleFonts")}
          </Label>
        </div>
        <p className="max-w-xl text-xs text-muted-foreground">
          {t("settings.screenshotEditor.googleFontsHint")}
        </p>
      </section>
    </div>
  );
}
