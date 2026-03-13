import type { NominationType } from "@/lib/asc/nominations";

// ── Constants ────────────────────────────────────────────────────────

export const LIMITS = {
  name: 60,
  description: 1000,
  notes: 500,
};

export const DEVICE_FAMILIES = [
  { value: "IPHONE", label: "iOS (iPhone)" },
  { value: "IPAD", label: "iOS (iPad)" },
  { value: "APPLE_WATCH", label: "watchOS" },
  { value: "MAC", label: "macOS" },
  { value: "APPLE_TV", label: "tvOS" },
  { value: "APPLE_VISION", label: "visionOS" },
];

// ── Sorted locales ───────────────────────────────────────────────────

import { LOCALE_NAMES, localeName } from "@/lib/asc/locale-names";

export const SORTED_LOCALES = Object.keys(LOCALE_NAMES).sort((a, b) =>
  localeName(a).localeCompare(localeName(b)),
);

// ── Form data ────────────────────────────────────────────────────────

export interface NominationFormData {
  name: string;
  description: string;
  notes: string;
  type: NominationType;
  publishStartDate: Date | undefined;
  deviceFamilies: string[];
  locales: string[];
  hasInAppEvents: boolean;
  launchInSelectMarketsFirst: boolean;
  preOrderEnabled: boolean;
  supplementalMaterialsUris: string[];
  relatedAppIds: string[];
}

export function makeEmptyForm(appId: string, primaryLocale: string): NominationFormData {
  return {
    name: "",
    description: "",
    notes: "",
    type: "APP_ENHANCEMENTS",
    publishStartDate: undefined,
    deviceFamilies: [],
    locales: primaryLocale ? [primaryLocale] : [],
    hasInAppEvents: false,
    launchInSelectMarketsFirst: false,
    preOrderEnabled: false,
    supplementalMaterialsUris: [],
    relatedAppIds: [appId],
  };
}
