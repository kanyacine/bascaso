"use client";

import { Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DOWNLOADS_ALL_STOREFRONTS_KEY } from "@/lib/aso/downloads";
import {
  clearPersistedPrefix,
  usePersistedBool,
} from "@/lib/hooks/use-persisted-range";
import { useTranslations } from "@/lib/i18n/locale-context";

const RESEARCH_SCRATCHPAD_PREFIX = "aso-research-";

export default function AsoPage() {
  const t = useTranslations();
  const [allStorefronts, setAllStorefronts] = usePersistedBool(
    DOWNLOADS_ALL_STOREFRONTS_KEY,
    false,
  );

  async function deleteReports() {
    try {
      const res = await fetch("/api/settings/aso?target=reports", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(t("settings.aso.deleted"));
    } catch {
      toast.error(t("common.networkError"));
    }
  }

  async function deleteSearchHistory() {
    try {
      const res = await fetch("/api/settings/aso?target=scores", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      clearPersistedPrefix(RESEARCH_SCRATCHPAD_PREFIX);
      toast.success(t("settings.aso.deleted"));
    } catch {
      toast.error(t("common.networkError"));
    }
  }

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

      <section className="space-y-3">
        <h3 className="section-title">{t("settings.aso.dataTitle")}</h3>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.aso.deleteSearchDesc")}
          </p>
          <DestructiveAction
            label={t("settings.aso.deleteSearch")}
            title={t("settings.aso.deleteSearchTitle")}
            description={t("settings.aso.deleteSearchConfirm")}
            onConfirm={deleteSearchHistory}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.aso.deleteReportsDesc")}
          </p>
          <DestructiveAction
            label={t("settings.aso.deleteReports")}
            title={t("settings.aso.deleteReportsTitle")}
            description={t("settings.aso.deleteReportsConfirm")}
            onConfirm={deleteReports}
          />
        </div>
      </section>
    </div>
  );
}

function DestructiveAction({
  label,
  title,
  description,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Trash size={14} />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("common.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
