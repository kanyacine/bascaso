import { describe, expect, it, beforeEach, vi } from "vitest";
import { createTestDb, seedManagedAccount } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getRoutingDefaultTier,
  getRoutingTier,
  setRoutingTier,
  isRoutingTierExplicit,
  getRoutingFallbackEnabled,
  setRoutingFallbackEnabled,
  getAppleFmAllowUnsupportedLanguages,
  setAppleFmAllowUnsupportedLanguages,
} from "@/lib/app-preferences";

describe("routing preferences", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("falls back to shipped defaults when no preference is stored", () => {
    expect(getRoutingTier("redaction")).toBe("local");
    expect(getRoutingTier("metadata")).toBe("byok");
    expect(isRoutingTierExplicit("redaction")).toBe(false);
  });

  // The paid tier was nothing's default: a customer could create an account, buy
  // tokens, and have nothing consume them until they had switched all four groups over
  // by hand.
  it("moves every unset group to managed once a cloud account is linked", () => {
    seedManagedAccount(testDb);
    expect(getRoutingTier("redaction")).toBe("managed");
    expect(getRoutingTier("metadata")).toBe("managed");
    expect(getRoutingTier("insights")).toBe("managed");
    expect(getRoutingTier("workflows")).toBe("managed");
    expect(isRoutingTierExplicit("metadata")).toBe(false);
  });

  it("keeps an explicit tier over the managed default", () => {
    seedManagedAccount(testDb);
    setRoutingTier("metadata", "byok");
    expect(getRoutingTier("metadata")).toBe("byok");
  });

  it("returns to the shipped defaults with no cloud account", () => {
    expect(getRoutingDefaultTier("redaction")).toBe("local");
    expect(getRoutingDefaultTier("metadata")).toBe("byok");
  });

  it("stores and clears explicit tiers", () => {
    setRoutingTier("redaction", "byok");
    expect(getRoutingTier("redaction")).toBe("byok");
    expect(isRoutingTierExplicit("redaction")).toBe(true);
    setRoutingTier("redaction", null); // restore default
    expect(getRoutingTier("redaction")).toBe("local");
  });

  it("persists and reads the managed tier", () => {
    seedManagedAccount(testDb);
    setRoutingTier("metadata", "managed");
    expect(getRoutingTier("metadata")).toBe("managed");
  });

  // Signing out used to leave an explicitly-managed group routing to managed:
  // the first AI action threw ai_tier_not_configured, behind a greyed-out toggle.
  it("treats an explicit managed tier as unset while signed out", () => {
    setRoutingTier("metadata", "managed");
    expect(getRoutingTier("metadata")).toBe("byok"); // shipped default
    expect(getRoutingTier("redaction")).toBe("local");
  });

  it("keeps the managed preference across a sign-out and back in", () => {
    setRoutingTier("redaction", "managed");
    expect(getRoutingTier("redaction")).toBe("local");
    expect(isRoutingTierExplicit("redaction")).toBe(true); // preference survives
    seedManagedAccount(testDb);
    expect(getRoutingTier("redaction")).toBe("managed");
  });

  it("fallback toggle defaults to off", () => {
    expect(getRoutingFallbackEnabled()).toBe(false);
    setRoutingFallbackEnabled(true);
    expect(getRoutingFallbackEnabled()).toBe(true);
  });

  it("allow-unsupported-languages toggle defaults to off and persists", () => {
    expect(getAppleFmAllowUnsupportedLanguages()).toBe(false);
    setAppleFmAllowUnsupportedLanguages(true);
    expect(getAppleFmAllowUnsupportedLanguages()).toBe(true);
    setAppleFmAllowUnsupportedLanguages(false);
    expect(getAppleFmAllowUnsupportedLanguages()).toBe(false);
  });
});
