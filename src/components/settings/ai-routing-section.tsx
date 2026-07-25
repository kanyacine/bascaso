"use client";

import { toast } from "sonner";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";
import { AI_ROUTED_GROUPS, type AIGroupId, type AITier } from "@/lib/ai/tasks";

export interface RoutingState {
  // keyed by the entries of AI_ROUTED_GROUPS
  groups: Partial<Record<AIGroupId, { tier: AITier; explicit: boolean }>>;
  fallback: boolean;
  /** Whether the built-in Apple model may generate in unsupported languages. */
  allowUnsupportedLanguages: boolean;
}

interface Props {
  routing: RoutingState;
  onChanged: () => void; // parent refetches GET /api/settings/ai
}

async function putRouting(body: unknown): Promise<boolean> {
  const res = await fetch("/api/settings/ai/routing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export function AiRoutingSection({ routing, onChanged }: Props) {
  const t = useTranslations();

  async function setTier(group: AIGroupId, tier: AITier | null) {
    if (await putRouting({ group, tier })) onChanged();
    else toast.error(t("common.saveFailed"));
  }

  async function resetAll() {
    if (await putRouting({ reset: true })) onChanged();
    else toast.error(t("common.saveFailed"));
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="section-title">{t("settings.ai.routing.title")}</h3>
        <Button variant="ghost" size="sm" onClick={resetAll}>
          <ArrowCounterClockwise size={16} />
          {t("settings.ai.routing.resetDefault")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.ai.routing.hint")}</p>
      <div className="divide-y">
        {AI_ROUTED_GROUPS.map((group) => {
          const state = routing.groups[group];
          if (!state) return null;
          return (
            <div key={group} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-sm font-medium">
                  {t(`settings.ai.routing.groups.${group}` as MessageKey)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`settings.ai.routing.groupHints.${group}` as MessageKey)}
                </div>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={state.tier}
                onValueChange={(v) => v && setTier(group, v as AITier)}
              >
                <ToggleGroupItem value="local">{t("settings.ai.routing.local")}</ToggleGroupItem>
                <ToggleGroupItem value="byok">{t("settings.ai.routing.byok")}</ToggleGroupItem>
                <ToggleGroupItem value="managed">{t("settings.ai.routing.managed")}</ToggleGroupItem>
              </ToggleGroup>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4 pt-2">
        <div>
          <div className="text-sm font-medium">{t("settings.ai.routing.fallback")}</div>
          <div className="text-xs text-muted-foreground">{t("settings.ai.routing.fallbackHint")}</div>
        </div>
        <Switch
          checked={routing.fallback}
          onCheckedChange={async (checked) => {
            if (await putRouting({ fallback: checked })) onChanged();
            else toast.error(t("common.saveFailed"));
          }}
        />
      </div>
    </section>
  );
}
