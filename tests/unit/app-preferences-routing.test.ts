import { describe, expect, it, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
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

  it("stores and clears explicit tiers", () => {
    setRoutingTier("redaction", "byok");
    expect(getRoutingTier("redaction")).toBe("byok");
    expect(isRoutingTierExplicit("redaction")).toBe(true);
    setRoutingTier("redaction", null); // restore default
    expect(getRoutingTier("redaction")).toBe("local");
  });

  it("persists and reads the managed tier", () => {
    setRoutingTier("metadata", "managed");
    expect(getRoutingTier("metadata")).toBe("managed");
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
