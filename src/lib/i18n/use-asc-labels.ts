"use client";

import { useMemo } from "react";
import { PLATFORM_LABELS, stateLabel as fallbackStateLabel } from "@/lib/asc/version-types";
import { CATEGORIES } from "@/lib/asc/categories";
import type { DeviceCategory } from "@/lib/asc/display-types";
import { useLocale } from "./locale-context";
import { getByPath } from "./messages";
import type { MessageKey } from "./messages";

const DEVICE_CATEGORY_KEYS: Record<DeviceCategory, MessageKey> = {
  iPhone: "deviceCategories.iPhone",
  iPad: "deviceCategories.iPad",
  "Apple Watch": "deviceCategories.appleWatch",
  iMessage: "deviceCategories.iMessage",
  Mac: "deviceCategories.mac",
  "Apple TV": "deviceCategories.appleTv",
  "Apple Vision Pro": "deviceCategories.appleVisionPro",
};

/** Translated App Store Connect platform and version state labels. */
export function useAscLabels() {
  const { messages } = useLocale();

  return useMemo(
    () => ({
      platformLabel(platform: string): string {
        const key = `asc.platforms.${platform}`;
        return getByPath(messages, key) ?? PLATFORM_LABELS[platform] ?? platform;
      },
      versionStateLabel(state: string): string {
        const key = `asc.states.${state}`;
        return getByPath(messages, key) ?? fallbackStateLabel(state);
      },
      deviceCategoryLabel(category: DeviceCategory): string {
        const key = DEVICE_CATEGORY_KEYS[category];
        return getByPath(messages, key) ?? category;
      },
      categoryLabel(id: string): string {
        const key = `asc.categories.${id}`;
        return getByPath(messages, key) ?? CATEGORIES[id] ?? id;
      },
    }),
    [messages],
  );
}
