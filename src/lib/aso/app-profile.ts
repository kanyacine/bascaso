// The tracked app's own App Store profile per storefront (ratings, average,
// first release, name) – the input the opportunity score needs to say where
// THIS app would land for a keyword (scoring.reachableRank). Read from the
// public iTunes Lookup API like RespectASO does, cached 24 h per storefront.
// Any failure scores the app as brand new (`known: false`), never blocks a
// keyword score.

import { cacheGet, cacheSet } from "@/lib/cache";
import { lookupApp } from "./itunes";
import { profileFromResult, type AppProfile } from "./strength";

export const APP_PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 15 * 60 * 1000;

const cacheKey = (appleId: number, country: string) => `aso:app-profile:${country}:${appleId}`;

const inFlight = new Map<string, Promise<AppProfile>>();

/** The app's profile in a storefront. An app the storefront does not list
 *  reads as a new app there (no ratings); a lookup failure as unknown. */
export async function getAppProfile(appleId: number, rawCountry: string): Promise<AppProfile> {
  const country = rawCountry.trim().toLowerCase();
  const key = cacheKey(appleId, country);
  const cached = cacheGet<AppProfile>(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const result = await lookupApp(appleId, country);
      const profile: AppProfile = result ? profileFromResult(result) : {};
      cacheSet(key, profile, APP_PROFILE_TTL_MS);
      return profile;
    } catch {
      const unknown: AppProfile = { known: false };
      cacheSet(key, unknown, FAILURE_TTL_MS);
      return unknown;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
