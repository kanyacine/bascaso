"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "./messages";

const FIELD_KEYS: Record<string, MessageKey> = {
  description: "storeListing.fields.description",
  keywords: "storeListing.fields.keywords",
  whatsNew: "storeListing.fields.whatsNew",
  promotionalText: "storeListing.fields.promotionalText",
  supportUrl: "storeListing.fields.supportUrl",
  marketingUrl: "storeListing.fields.marketingUrl",
  name: "appDetails.name",
  subtitle: "appDetails.subtitle",
  privacyPolicyUrl: "appDetails.privacyPolicyUrl",
  privacyChoicesUrl: "appDetails.privacyChoicesUrl",
  copyright: "storeListing.copyright",
  releaseType: "reviewChanges.fields.releaseType",
  scheduledDate: "reviewChanges.fields.scheduledDate",
  phasedRelease: "storeListing.release.phasedRollout",
  buildId: "reviewChanges.fields.buildId",
  contentRights: "appDetails.contentRights",
  primaryCategoryId: "reviewChanges.fields.primaryCategoryId",
  secondaryCategoryId: "reviewChanges.fields.secondaryCategoryId",
  notifUrl: "reviewChanges.fields.notifUrl",
  notifSandboxUrl: "reviewChanges.fields.notifSandboxUrl",
  notes: "reviewChanges.fields.notes",
  demoAccountRequired: "appReview.signInRequired",
  demoAccountName: "reviewChanges.fields.demoAccountName",
  demoAccountPassword: "reviewChanges.fields.demoAccountPassword",
  contactFirstName: "appReview.firstName",
  contactLastName: "appReview.lastName",
  contactPhone: "appReview.phone",
  contactEmail: "appReview.email",
};

export function useReviewFieldLabel() {
  const t = useTranslations();

  return useCallback(
    (field: string) => {
      const key = FIELD_KEYS[field];
      return key ? t(key) : field;
    },
    [t],
  );
}

export function useReviewSectionLabels() {
  const t = useTranslations();

  return useMemo(
    () =>
      ({
        "store-listing": t("nav.items.storeListing"),
        details: t("nav.items.appDetails"),
        keywords: t("nav.items.keywords"),
        review: t("nav.items.appReview"),
      }) as const,
    [t],
  );
}
