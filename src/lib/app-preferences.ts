import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AI_GROUP_DEFAULT_TIER, type AIGroupId, type AITier } from "@/lib/ai/tasks";
import { hasManagedAccount } from "@/lib/managed/account";

const REVIEW_BEFORE_SAVING_KEY = "review_before_saving";
const ROUTING_FALLBACK_KEY = "ai_routing_fallback";
const APPLE_FM_ALLOW_UNSUPPORTED_LANGUAGES_KEY = "ai_apple_fm_allow_unsupported_languages";

/** Distinct guidance buckets – translation tone vs review-reply voice are unrelated. */
export type GuidanceScope = "translation" | "reviews";

function guidanceKey(scope: GuidanceScope): string {
  return `ai_guidance_${scope}`;
}

/** Read the saved AI guidance for a scope (standing instructions appended to its prompts). */
export function getAIGuidance(scope: GuidanceScope): string {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, guidanceKey(scope)))
      .get();
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export function setAIGuidance(scope: GuidanceScope, guidance: string): void {
  const key = guidanceKey(scope);
  db.insert(appPreferences)
    .values({ key, value: guidance })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: guidance },
    })
    .run();
}

export function getReviewBeforeSaving(): boolean {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, REVIEW_BEFORE_SAVING_KEY))
      .get();
    return row?.value === "true";
  } catch {
    return false;
  }
}

export function setReviewBeforeSaving(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: REVIEW_BEFORE_SAVING_KEY, value: String(enabled) })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: String(enabled) },
    })
    .run();
}

// Key namespace leaves room for finer scopes later (ai_routing_task_*, ai_routing_locale_*).
function routingKey(group: AIGroupId): string {
  return `ai_routing_group_${group}`;
}

function readPreference(key: string): string | null {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, key))
      .get();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** The default a group falls back to when no explicit preference is stored.
 *
 *  A linked cloud account moves every unset group to `managed`. Without this,
 *  no shipped default ever pointed at the paid tier: a customer could create an
 *  account, buy credits, and have nothing use them until they flipped all four
 *  toggles by hand. It also fixes "Restore defaults", which cleared the explicit
 *  preferences and so silently undid a managed setup – it now lands here.
 *
 *  Explicit preferences still win, and signing out restores the shipped
 *  defaults, so a local/BYOK-only user sees no change. */
export function getRoutingDefaultTier(group: AIGroupId): AITier {
  return hasManagedAccount() ? "managed" : AI_GROUP_DEFAULT_TIER[group];
}

/** Resolved tier for a group – explicit preference, else the effective default. */
export function getRoutingTier(group: AIGroupId): AITier {
  const value = readPreference(routingKey(group));
  return value === "local" || value === "byok" || value === "managed"
    ? value
    : getRoutingDefaultTier(group);
}

export function isRoutingTierExplicit(group: AIGroupId): boolean {
  const value = readPreference(routingKey(group));
  return value === "local" || value === "byok" || value === "managed";
}

/** Store an explicit tier, or null to restore the shipped default. */
export function setRoutingTier(group: AIGroupId, tier: AITier | null): void {
  if (tier === null) {
    db.delete(appPreferences).where(eq(appPreferences.key, routingKey(group))).run();
    return;
  }
  db.insert(appPreferences)
    .values({ key: routingKey(group), value: tier })
    .onConflictDoUpdate({ target: appPreferences.key, set: { value: tier } })
    .run();
}

export function getRoutingFallbackEnabled(): boolean {
  return readPreference(ROUTING_FALLBACK_KEY) === "true";
}

export function setRoutingFallbackEnabled(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: ROUTING_FALLBACK_KEY, value: String(enabled) })
    .onConflictDoUpdate({ target: appPreferences.key, set: { value: String(enabled) } })
    .run();
}

/** When true, the built-in Apple model is allowed to generate in languages it
 *  doesn't officially support (quality may be lower). Default false. */
export function getAppleFmAllowUnsupportedLanguages(): boolean {
  return readPreference(APPLE_FM_ALLOW_UNSUPPORTED_LANGUAGES_KEY) === "true";
}

export function setAppleFmAllowUnsupportedLanguages(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: APPLE_FM_ALLOW_UNSUPPORTED_LANGUAGES_KEY, value: String(enabled) })
    .onConflictDoUpdate({ target: appPreferences.key, set: { value: String(enabled) } })
    .run();
}
