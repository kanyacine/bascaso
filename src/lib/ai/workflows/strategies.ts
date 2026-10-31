// Single source of truth for keyword-research strategies. To add a strategy,
// add ONE entry to STRATEGIES – everything else is derived or type-checked:
//   • ResearchStrategy is `keyof typeof STRATEGIES` (the union updates itself),
//   • RESEARCH_STRATEGIES drives the route's zod enum and the dialog Select,
//   • weights must cover every ClassificationLabel (Record completeness),
//   • labelKey must be a real i18n key (MessageKey) present in all 5 locales,
//   • chipClass keeps the history-chip tint next to the rest of the config.
// This module is a leaf: it imports only types, so it is safe in the client
// bundle (the dialog value-imports it) and pulls in no server code.

import type { ClassificationLabel } from "@/lib/aso/scoring";
import type { MessageKey } from "@/lib/i18n/messages";

export interface StrategyConfig {
  /** Multiplier on a candidate's opportunity per respectASO classification,
   *  applied at the rank sort, the field packing and the top-compose pick. */
  weights: Record<ClassificationLabel, number>;
  /** One orientation line injected into the seeds prompt ("" = none) –
   *  reweighting alone cannot surface phrases the generation never produced. */
  seedHint: string;
  /** i18n key for the human-facing label. */
  labelKey: MessageKey;
  /** Tailwind tint for the history chip. */
  chipClass: string;
}

// Multipliers per respectASO classification. Remapped on 2026-10-31 onto the
// five download-based classes of respectaso 798335f (the 2026-07-24 set had
// seven, including Hidden Gem and Avoid, which no longer exist). Niche leans on
// Good Target / Supporting – the keywords THIS app can reach – rather than on
// raw volume. Low Volume stays penalised, never excluded (a thin pool still
// fills the field).
export const STRATEGIES = {
  balanced: {
    weights: { "Sweet Spot": 1.3, "Good Target": 1.1, "Supporting": 1.0, "Worth Climbing": 0.6, "Low Volume": 0.4 },
    seedHint: "",
    labelKey: "aso.research.strategies.balanced",
    chipClass: "bg-muted text-muted-foreground",
  },
  broad: {
    weights: { "Sweet Spot": 1.5, "Good Target": 1.2, "Supporting": 0.8, "Worth Climbing": 0.7, "Low Volume": 0.2 },
    seedHint: "Favour broad, high-traffic category terms with wide appeal.",
    labelKey: "aso.research.strategies.broad",
    chipClass: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  niche: {
    weights: { "Sweet Spot": 1.2, "Good Target": 1.3, "Supporting": 1.1, "Worth Climbing": 0.4, "Low Volume": 0.7 },
    seedHint: "Favour specific long-tail phrases a smaller, focused audience would search.",
    labelKey: "aso.research.strategies.niche",
    chipClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
} satisfies Record<string, StrategyConfig>;

export type ResearchStrategy = keyof typeof STRATEGIES;

/** Ordered strategy keys – drives the route enum and the dialog Select. */
export const RESEARCH_STRATEGIES = Object.keys(STRATEGIES) as ResearchStrategy[];

export const DEFAULT_STRATEGY: ResearchStrategy = "balanced";
