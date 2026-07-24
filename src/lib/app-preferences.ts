import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AI_GROUP_DEFAULT_TIER, type AIGroupId, type AITier } from "@/lib/ai/tasks";

const REVIEW_BEFORE_SAVING_KEY = "review_before_saving";
const ROUTING_FALLBACK_KEY = "ai_routing_fallback";

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

/** Resolved tier for a group – explicit preference, else the shipped default. */
export function getRoutingTier(group: AIGroupId): AITier {
  const value = readPreference(routingKey(group));
  return value === "local" || value === "byok" ? value : AI_GROUP_DEFAULT_TIER[group];
}

export function isRoutingTierExplicit(group: AIGroupId): boolean {
  const value = readPreference(routingKey(group));
  return value === "local" || value === "byok";
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
