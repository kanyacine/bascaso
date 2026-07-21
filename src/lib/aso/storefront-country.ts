// App Store storefront (ISO 3166-1 alpha-3, as used by STOREFRONTS) →
// iTunes Search API country code (ISO alpha-2, lowercase). Completeness
// against STOREFRONTS is enforced by tests.

export const STOREFRONT_COUNTRY_CODES: Record<string, string> = {
  AFG: "af", ALB: "al", DZA: "dz", AGO: "ao", AIA: "ai", ATG: "ag",
  ARG: "ar", ARM: "am", AUS: "au", AUT: "at", AZE: "az", BHS: "bs",
  BHR: "bh", BRB: "bb", BLR: "by", BEL: "be", BLZ: "bz", BEN: "bj",
  BMU: "bm", BTN: "bt", BOL: "bo", BIH: "ba", BWA: "bw", BRA: "br",
  VGB: "vg", BRN: "bn", BGR: "bg", BFA: "bf", KHM: "kh", CMR: "cm",
  CAN: "ca", CPV: "cv", CYM: "ky", TCD: "td", CHL: "cl", CHN: "cn",
  COL: "co", COD: "cd", COG: "cg", CRI: "cr", CIV: "ci", HRV: "hr",
  CYP: "cy", CZE: "cz", DNK: "dk", DMA: "dm", DOM: "do", ECU: "ec",
  EGY: "eg", SLV: "sv", EST: "ee", SWZ: "sz", FJI: "fj", FIN: "fi",
  FRA: "fr", GAB: "ga", GMB: "gm", GEO: "ge", DEU: "de", GHA: "gh",
  GRC: "gr", GRD: "gd", GTM: "gt", GNB: "gw", GUY: "gy", HND: "hn",
  HKG: "hk", HUN: "hu", ISL: "is", IND: "in", IDN: "id", IRQ: "iq",
  IRL: "ie", ISR: "il", ITA: "it", JAM: "jm", JPN: "jp", JOR: "jo",
  KAZ: "kz", KEN: "ke", XKS: "xk", KWT: "kw", KGZ: "kg", LAO: "la",
  LVA: "lv", LBN: "lb", LBR: "lr", LBY: "ly", LTU: "lt", LUX: "lu",
  MAC: "mo", MDG: "mg", MWI: "mw", MYS: "my", MDV: "mv", MLI: "ml",
  MLT: "mt", MRT: "mr", MUS: "mu", MEX: "mx", FSM: "fm", MDA: "md",
  MNG: "mn", MNE: "me", MSR: "ms", MAR: "ma", MOZ: "mz", MMR: "mm",
  NAM: "na", NRU: "nr", NPL: "np", NLD: "nl", NZL: "nz", NIC: "ni",
  NER: "ne", NGA: "ng", MKD: "mk", NOR: "no", OMN: "om", PAK: "pk",
  PLW: "pw", PAN: "pa", PNG: "pg", PRY: "py", PER: "pe", PHL: "ph",
  POL: "pl", PRT: "pt", QAT: "qa", KOR: "kr", ROU: "ro", RUS: "ru",
  RWA: "rw", STP: "st", SAU: "sa", SEN: "sn", SRB: "rs", SYC: "sc",
  SLE: "sl", SGP: "sg", SVK: "sk", SVN: "si", SLB: "sb", ZAF: "za",
  ESP: "es", LKA: "lk", KNA: "kn", LCA: "lc", VCT: "vc", SUR: "sr",
  SWE: "se", CHE: "ch", TWN: "tw", TJK: "tj", TZA: "tz", THA: "th",
  TON: "to", TTO: "tt", TUN: "tn", TUR: "tr", TKM: "tm", TCA: "tc",
  UGA: "ug", UKR: "ua", ARE: "ae", GBR: "gb", USA: "us", URY: "uy",
  UZB: "uz", VUT: "vu", VEN: "ve", VNM: "vn", YEM: "ye", ZMB: "zm",
  ZWE: "zw",
};

/** iTunes country code for a storefront, or null when unknown. */
export function storefrontCountryCode(storefront: string): string | null {
  return STOREFRONT_COUNTRY_CODES[storefront] ?? null;
}
