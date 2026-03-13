import type { AscCustomerReview } from "@/lib/asc/reviews";

// ── Territory helpers ──────────────────────────────────────────────

/** Map ISO 3166-1 alpha-3 → alpha-2 for common territories (Intl.DisplayNames uses alpha-2). */
export const ALPHA3_TO_ALPHA2: Record<string, string> = {
  USA: "US", GBR: "GB", FRA: "FR", DEU: "DE", JPN: "JP", ESP: "ES",
  ITA: "IT", BRA: "BR", CHN: "CN", KOR: "KR", RUS: "RU", CAN: "CA",
  AUS: "AU", NLD: "NL", MEX: "MX", IND: "IN", SGP: "SG", SWE: "SE",
  NOR: "NO", DNK: "DK", FIN: "FI", CHE: "CH", AUT: "AT", BEL: "BE",
  PRT: "PT", POL: "PL", TUR: "TR", ARE: "AE", SAU: "SA", THA: "TH",
  IDN: "ID", MYS: "MY", PHL: "PH", VNM: "VN", TWN: "TW", HKG: "HK",
  NZL: "NZ", ZAF: "ZA", ARG: "AR", CHL: "CL", COL: "CO", PER: "PE",
  ISR: "IL", EGY: "EG", NGA: "NG", KEN: "KE", UKR: "UA", ROU: "RO",
  CZE: "CZ", HUN: "HU", GRC: "GR", IRL: "IE", LUX: "LU", HRV: "HR",
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function territoryName(alpha3: string): string {
  const alpha2 = ALPHA3_TO_ALPHA2[alpha3];
  if (alpha2) {
    try {
      return regionNames.of(alpha2) ?? alpha3;
    } catch {
      return alpha3;
    }
  }
  return alpha3;
}

/** Territories where English is not the primary language. */
export const NON_ENGLISH_TERRITORIES = new Set([
  "FRA", "DEU", "JPN", "ESP", "ITA", "BRA", "CHN", "KOR", "RUS",
  "MEX", "NLD", "SWE", "NOR", "DNK", "FIN", "AUT", "PRT", "POL",
  "TUR", "ARE", "SAU", "THA", "IDN", "MYS", "VNM", "TWN", "HKG",
  "ARG", "CHL", "COL", "PER", "EGY", "UKR", "ROU", "CZE", "HUN",
  "GRC", "HRV", "CHE", "BEL", "LUX",
]);

/** Map territory alpha-3 to a rough locale for translation source language. */
export function territoryToLocale(alpha3: string): string {
  const map: Record<string, string> = {
    FRA: "fr-FR", DEU: "de-DE", JPN: "ja-JP", ESP: "es-ES", ITA: "it-IT",
    BRA: "pt-BR", CHN: "zh-CN", KOR: "ko-KR", RUS: "ru-RU", MEX: "es-MX",
    NLD: "nl-NL", SWE: "sv-SE", NOR: "nb-NO", DNK: "da-DK", FIN: "fi-FI",
    AUT: "de-AT", PRT: "pt-PT", POL: "pl-PL", TUR: "tr-TR", ARE: "ar-AE",
    SAU: "ar-SA", THA: "th-TH", IDN: "id-ID", VNM: "vi-VN", TWN: "zh-TW",
    HKG: "zh-HK", ARG: "es-AR", CHL: "es-CL", COL: "es-CO", PER: "es-PE",
    EGY: "ar-EG", UKR: "uk-UA", ROU: "ro-RO", CZE: "cs-CZ", HUN: "hu-HU",
    GRC: "el-GR", HRV: "hr-HR", CHE: "de-CH", BEL: "fr-BE", LUX: "fr-LU",
    MYS: "ms-MY",
  };
  return map[alpha3] ?? "en-US";
}

// ── Normalised review type ─────────────────────────────────────────

export interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  territory: string;
  createdDate: string;
  response?: {
    id: string;
    responseBody: string;
    lastModifiedDate: string;
    state: "PENDING_PUBLISH" | "PUBLISHED";
  };
}

export function normaliseAscReview(r: AscCustomerReview): Review {
  return {
    id: r.id,
    rating: r.attributes.rating,
    title: r.attributes.title,
    body: r.attributes.body,
    reviewerNickname: r.attributes.reviewerNickname,
    territory: r.attributes.territory,
    createdDate: r.attributes.createdDate,
    response: r.response
      ? {
          id: r.response.id,
          responseBody: r.response.attributes.responseBody,
          lastModifiedDate: r.response.attributes.lastModifiedDate,
          state: r.response.attributes.state,
        }
      : undefined,
  };
}
