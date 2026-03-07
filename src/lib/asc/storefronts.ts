/**
 * App Store storefront-to-locale mapping.
 *
 * Each storefront has a default locale and zero or more additional locales
 * whose keywords Apple also indexes for that territory.
 *
 * Source: https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/
 */

export interface Storefront {
  name: string;
  defaultLocale: string;
  additionalLocales: string[];
}

/** ISO 3166-1 alpha-3 → storefront definition. */
export const STOREFRONTS: Record<string, Storefront> = {
  AFG: { name: "Afghanistan", defaultLocale: "en-GB", additionalLocales: [] },
  ALB: { name: "Albania", defaultLocale: "en-GB", additionalLocales: [] },
  DZA: { name: "Algeria", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  AGO: { name: "Angola", defaultLocale: "en-GB", additionalLocales: [] },
  AIA: { name: "Anguilla", defaultLocale: "en-GB", additionalLocales: [] },
  ATG: { name: "Antigua and Barbuda", defaultLocale: "en-GB", additionalLocales: [] },
  ARG: { name: "Argentina", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  ARM: { name: "Armenia", defaultLocale: "en-GB", additionalLocales: [] },
  AUS: { name: "Australia", defaultLocale: "en-AU", additionalLocales: ["en-GB"] },
  AUT: { name: "Austria", defaultLocale: "de-DE", additionalLocales: ["en-GB"] },
  AZE: { name: "Azerbaijan", defaultLocale: "en-GB", additionalLocales: [] },
  BHS: { name: "Bahamas", defaultLocale: "en-GB", additionalLocales: [] },
  BHR: { name: "Bahrain", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  BRB: { name: "Barbados", defaultLocale: "en-GB", additionalLocales: [] },
  BLR: { name: "Belarus", defaultLocale: "en-GB", additionalLocales: [] },
  BEL: { name: "Belgium", defaultLocale: "en-GB", additionalLocales: ["nl-NL", "fr-FR"] },
  BLZ: { name: "Belize", defaultLocale: "en-GB", additionalLocales: ["es-MX"] },
  BEN: { name: "Benin", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  BMU: { name: "Bermuda", defaultLocale: "en-GB", additionalLocales: [] },
  BTN: { name: "Bhutan", defaultLocale: "en-GB", additionalLocales: [] },
  BOL: { name: "Bolivia", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  BIH: { name: "Bosnia and Herzegovina", defaultLocale: "en-GB", additionalLocales: ["hr"] },
  BWA: { name: "Botswana", defaultLocale: "en-GB", additionalLocales: [] },
  BRA: { name: "Brazil", defaultLocale: "pt-BR", additionalLocales: ["en-GB"] },
  VGB: { name: "British Virgin Islands", defaultLocale: "en-GB", additionalLocales: [] },
  BRN: { name: "Brunei", defaultLocale: "en-GB", additionalLocales: [] },
  BGR: { name: "Bulgaria", defaultLocale: "en-GB", additionalLocales: [] },
  BFA: { name: "Burkina Faso", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  KHM: { name: "Cambodia", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  CMR: { name: "Cameroon", defaultLocale: "fr-FR", additionalLocales: ["en-GB"] },
  CAN: { name: "Canada", defaultLocale: "en-CA", additionalLocales: ["fr-CA"] },
  CPV: { name: "Cape Verde", defaultLocale: "en-GB", additionalLocales: [] },
  CYM: { name: "Cayman Islands", defaultLocale: "en-GB", additionalLocales: [] },
  TCD: { name: "Chad", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  CHL: { name: "Chile", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  CHN: { name: "China mainland", defaultLocale: "zh-Hans", additionalLocales: ["en-GB"] },
  COL: { name: "Colombia", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  COD: { name: "Congo (DRC)", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  COG: { name: "Congo (Republic)", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  CRI: { name: "Costa Rica", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  CIV: { name: "Cote d'Ivoire", defaultLocale: "fr-FR", additionalLocales: ["en-GB"] },
  HRV: { name: "Croatia", defaultLocale: "en-GB", additionalLocales: ["hr"] },
  CYP: { name: "Cyprus", defaultLocale: "en-GB", additionalLocales: ["el", "tr"] },
  CZE: { name: "Czech Republic", defaultLocale: "en-GB", additionalLocales: ["cs"] },
  DNK: { name: "Denmark", defaultLocale: "en-GB", additionalLocales: ["da"] },
  DMA: { name: "Dominica", defaultLocale: "en-GB", additionalLocales: [] },
  DOM: { name: "Dominican Republic", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  ECU: { name: "Ecuador", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  EGY: { name: "Egypt", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  SLV: { name: "El Salvador", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  EST: { name: "Estonia", defaultLocale: "en-GB", additionalLocales: [] },
  SWZ: { name: "Eswatini", defaultLocale: "en-GB", additionalLocales: [] },
  FJI: { name: "Fiji", defaultLocale: "en-GB", additionalLocales: [] },
  FIN: { name: "Finland", defaultLocale: "en-GB", additionalLocales: ["fi"] },
  FRA: { name: "France", defaultLocale: "fr-FR", additionalLocales: ["en-GB"] },
  GAB: { name: "Gabon", defaultLocale: "fr-FR", additionalLocales: ["en-GB"] },
  GMB: { name: "Gambia", defaultLocale: "en-GB", additionalLocales: [] },
  GEO: { name: "Georgia", defaultLocale: "en-GB", additionalLocales: [] },
  DEU: { name: "Germany", defaultLocale: "de-DE", additionalLocales: ["en-GB"] },
  GHA: { name: "Ghana", defaultLocale: "en-GB", additionalLocales: [] },
  GRC: { name: "Greece", defaultLocale: "en-GB", additionalLocales: ["el"] },
  GRD: { name: "Grenada", defaultLocale: "en-GB", additionalLocales: [] },
  GTM: { name: "Guatemala", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  GNB: { name: "Guinea-Bissau", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  GUY: { name: "Guyana", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  HND: { name: "Honduras", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  HKG: { name: "Hong Kong", defaultLocale: "zh-Hant", additionalLocales: ["en-GB"] },
  HUN: { name: "Hungary", defaultLocale: "en-GB", additionalLocales: ["hu"] },
  ISL: { name: "Iceland", defaultLocale: "en-GB", additionalLocales: [] },
  IND: { name: "India", defaultLocale: "en-GB", additionalLocales: ["hi"] },
  IDN: { name: "Indonesia", defaultLocale: "en-GB", additionalLocales: ["id"] },
  IRQ: { name: "Iraq", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  IRL: { name: "Ireland", defaultLocale: "en-GB", additionalLocales: [] },
  ISR: { name: "Israel", defaultLocale: "en-GB", additionalLocales: ["he"] },
  ITA: { name: "Italy", defaultLocale: "it", additionalLocales: ["en-GB"] },
  JAM: { name: "Jamaica", defaultLocale: "en-GB", additionalLocales: [] },
  JPN: { name: "Japan", defaultLocale: "ja", additionalLocales: ["en-US"] },
  JOR: { name: "Jordan", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  KAZ: { name: "Kazakhstan", defaultLocale: "en-GB", additionalLocales: [] },
  KEN: { name: "Kenya", defaultLocale: "en-GB", additionalLocales: [] },
  XKS: { name: "Kosovo", defaultLocale: "en-GB", additionalLocales: [] },
  KWT: { name: "Kuwait", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  KGZ: { name: "Kyrgyzstan", defaultLocale: "en-GB", additionalLocales: [] },
  LAO: { name: "Laos", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  LVA: { name: "Latvia", defaultLocale: "en-GB", additionalLocales: [] },
  LBN: { name: "Lebanon", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  LBR: { name: "Liberia", defaultLocale: "en-GB", additionalLocales: [] },
  LBY: { name: "Libya", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  LTU: { name: "Lithuania", defaultLocale: "en-GB", additionalLocales: [] },
  LUX: { name: "Luxembourg", defaultLocale: "en-GB", additionalLocales: ["fr-FR", "de-DE"] },
  MAC: { name: "Macau", defaultLocale: "zh-Hant", additionalLocales: ["en-GB"] },
  MDG: { name: "Madagascar", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  MWI: { name: "Malawi", defaultLocale: "en-GB", additionalLocales: [] },
  MYS: { name: "Malaysia", defaultLocale: "en-GB", additionalLocales: ["ms"] },
  MDV: { name: "Maldives", defaultLocale: "en-GB", additionalLocales: [] },
  MLI: { name: "Mali", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  MLT: { name: "Malta", defaultLocale: "en-GB", additionalLocales: [] },
  MRT: { name: "Mauritania", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  MUS: { name: "Mauritius", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  MEX: { name: "Mexico", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  FSM: { name: "Micronesia", defaultLocale: "en-GB", additionalLocales: [] },
  MDA: { name: "Moldova", defaultLocale: "en-GB", additionalLocales: [] },
  MNG: { name: "Mongolia", defaultLocale: "en-GB", additionalLocales: [] },
  MNE: { name: "Montenegro", defaultLocale: "en-GB", additionalLocales: ["hr"] },
  MSR: { name: "Montserrat", defaultLocale: "en-GB", additionalLocales: [] },
  MAR: { name: "Morocco", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  MOZ: { name: "Mozambique", defaultLocale: "en-GB", additionalLocales: [] },
  MMR: { name: "Myanmar", defaultLocale: "en-GB", additionalLocales: [] },
  NAM: { name: "Namibia", defaultLocale: "en-GB", additionalLocales: [] },
  NRU: { name: "Nauru", defaultLocale: "en-GB", additionalLocales: [] },
  NPL: { name: "Nepal", defaultLocale: "en-GB", additionalLocales: [] },
  NLD: { name: "Netherlands", defaultLocale: "nl-NL", additionalLocales: ["en-GB"] },
  NZL: { name: "New Zealand", defaultLocale: "en-AU", additionalLocales: ["en-GB"] },
  NIC: { name: "Nicaragua", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  NER: { name: "Niger", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  NGA: { name: "Nigeria", defaultLocale: "en-GB", additionalLocales: [] },
  MKD: { name: "North Macedonia", defaultLocale: "en-GB", additionalLocales: [] },
  NOR: { name: "Norway", defaultLocale: "en-GB", additionalLocales: ["no"] },
  OMN: { name: "Oman", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  PAK: { name: "Pakistan", defaultLocale: "en-GB", additionalLocales: [] },
  PLW: { name: "Palau", defaultLocale: "en-GB", additionalLocales: [] },
  PAN: { name: "Panama", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  PNG: { name: "Papua New Guinea", defaultLocale: "en-GB", additionalLocales: [] },
  PRY: { name: "Paraguay", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  PER: { name: "Peru", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  PHL: { name: "Philippines", defaultLocale: "en-GB", additionalLocales: [] },
  POL: { name: "Poland", defaultLocale: "en-GB", additionalLocales: ["pl"] },
  PRT: { name: "Portugal", defaultLocale: "pt-PT", additionalLocales: ["en-GB"] },
  QAT: { name: "Qatar", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  KOR: { name: "Republic of Korea", defaultLocale: "ko", additionalLocales: ["en-GB"] },
  ROU: { name: "Romania", defaultLocale: "en-GB", additionalLocales: ["ro"] },
  RUS: { name: "Russia", defaultLocale: "ru", additionalLocales: ["en-GB", "uk"] },
  RWA: { name: "Rwanda", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  STP: { name: "Sao Tome and Principe", defaultLocale: "en-GB", additionalLocales: [] },
  SAU: { name: "Saudi Arabia", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  SEN: { name: "Senegal", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  SRB: { name: "Serbia", defaultLocale: "en-GB", additionalLocales: ["hr"] },
  SYC: { name: "Seychelles", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  SLE: { name: "Sierra Leone", defaultLocale: "en-GB", additionalLocales: [] },
  SGP: { name: "Singapore", defaultLocale: "en-GB", additionalLocales: ["zh-Hans"] },
  SVK: { name: "Slovakia", defaultLocale: "en-GB", additionalLocales: ["sk"] },
  SVN: { name: "Slovenia", defaultLocale: "en-GB", additionalLocales: [] },
  SLB: { name: "Solomon Islands", defaultLocale: "en-GB", additionalLocales: [] },
  ZAF: { name: "South Africa", defaultLocale: "en-GB", additionalLocales: [] },
  ESP: { name: "Spain", defaultLocale: "es-ES", additionalLocales: ["ca", "en-GB"] },
  LKA: { name: "Sri Lanka", defaultLocale: "en-GB", additionalLocales: [] },
  KNA: { name: "St. Kitts and Nevis", defaultLocale: "en-GB", additionalLocales: [] },
  LCA: { name: "St. Lucia", defaultLocale: "en-GB", additionalLocales: [] },
  VCT: { name: "St. Vincent and the Grenadines", defaultLocale: "en-GB", additionalLocales: [] },
  SUR: { name: "Suriname", defaultLocale: "en-GB", additionalLocales: ["nl-NL"] },
  SWE: { name: "Sweden", defaultLocale: "sv", additionalLocales: ["en-GB"] },
  CHE: { name: "Switzerland", defaultLocale: "de-DE", additionalLocales: ["en-GB", "fr-FR", "it"] },
  TWN: { name: "Taiwan", defaultLocale: "zh-Hant", additionalLocales: ["en-GB"] },
  TJK: { name: "Tajikistan", defaultLocale: "en-GB", additionalLocales: [] },
  TZA: { name: "Tanzania", defaultLocale: "en-GB", additionalLocales: [] },
  THA: { name: "Thailand", defaultLocale: "en-GB", additionalLocales: ["th"] },
  TON: { name: "Tonga", defaultLocale: "en-GB", additionalLocales: [] },
  TTO: { name: "Trinidad and Tobago", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  TUN: { name: "Tunisia", defaultLocale: "en-GB", additionalLocales: ["ar-SA", "fr-FR"] },
  TUR: { name: "Turkiye", defaultLocale: "en-GB", additionalLocales: ["tr"] },
  TKM: { name: "Turkmenistan", defaultLocale: "en-GB", additionalLocales: [] },
  TCA: { name: "Turks and Caicos Islands", defaultLocale: "en-GB", additionalLocales: [] },
  UGA: { name: "Uganda", defaultLocale: "en-GB", additionalLocales: [] },
  UKR: { name: "Ukraine", defaultLocale: "en-GB", additionalLocales: ["ru", "uk"] },
  ARE: { name: "United Arab Emirates", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  GBR: { name: "United Kingdom", defaultLocale: "en-GB", additionalLocales: [] },
  USA: { name: "United States", defaultLocale: "en-US", additionalLocales: ["ar-SA", "zh-Hans", "zh-Hant", "fr-FR", "ko", "pt-BR", "ru", "es-MX", "vi"] },
  URY: { name: "Uruguay", defaultLocale: "en-GB", additionalLocales: ["es-MX"] },
  UZB: { name: "Uzbekistan", defaultLocale: "en-GB", additionalLocales: [] },
  VUT: { name: "Vanuatu", defaultLocale: "en-GB", additionalLocales: ["fr-FR"] },
  VEN: { name: "Venezuela", defaultLocale: "es-MX", additionalLocales: ["en-GB"] },
  VNM: { name: "Vietnam", defaultLocale: "en-GB", additionalLocales: ["vi"] },
  YEM: { name: "Yemen", defaultLocale: "en-GB", additionalLocales: ["ar-SA"] },
  ZMB: { name: "Zambia", defaultLocale: "en-GB", additionalLocales: [] },
  ZWE: { name: "Zimbabwe", defaultLocale: "en-GB", additionalLocales: [] },
};

/** All locales indexed by a storefront (default + additional). */
export function storefrontLocales(iso: string): string[] {
  const sf = STOREFRONTS[iso];
  if (!sf) return [];
  return [sf.defaultLocale, ...sf.additionalLocales];
}

/**
 * Exchangeable locale groups – Apple uses a fallback from the same group
 * when a specific locale isn't available. E.g. en-US can substitute for en-CA.
 * Source: https://appfollow.io/app-store-keywords-localizations
 */
const EXCHANGEABLE_GROUPS: string[][] = [
  ["en-US", "en-GB", "en-AU", "en-CA"],
  ["pt-PT", "pt-BR"],
  ["fr-FR", "fr-CA"],
  ["es-ES", "es-MX"],
  ["zh-Hans", "zh-Hant"],
];

const exchangeMap = new Map<string, string[]>();
for (const group of EXCHANGEABLE_GROUPS) {
  for (const locale of group) {
    exchangeMap.set(locale, group.filter((l) => l !== locale));
  }
}

/**
 * Given a required locale and the set of locales the user actually has,
 * return the locale that will be used (the original if present, or a fallback).
 * Returns null if no fallback exists.
 */
export function resolveExchangeableLocale(
  required: string,
  availableLocales: Set<string>,
): string | null {
  if (availableLocales.has(required)) return required;
  const alternatives = exchangeMap.get(required);
  if (!alternatives) return null;
  return alternatives.find((alt) => availableLocales.has(alt)) ?? null;
}

/** Total keyword character budget for a storefront (100 per indexed locale). */
export function storefrontKeywordBudget(iso: string): number {
  return storefrontLocales(iso).length * 100;
}

/**
 * Find storefronts where a given locale is indexed (default or additional).
 */
export function storefrontsByLocale(locale: string): string[] {
  return Object.entries(STOREFRONTS)
    .filter(([, sf]) => sf.defaultLocale === locale || sf.additionalLocales.includes(locale))
    .map(([iso]) => iso);
}

/** Popular storefronts shown first in pickers. */
export const POPULAR_STOREFRONTS = [
  "USA", "GBR", "CAN", "AUS", "DEU", "FRA", "JPN", "KOR",
  "CHN", "BRA", "ESP", "ITA", "NLD", "MEX", "IND", "RUS",
];
