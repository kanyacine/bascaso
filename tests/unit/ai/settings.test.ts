import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "decrypted-api-key"),
}));

import { getTierSettings } from "@/lib/ai/settings";
import { aiSettings } from "@/db/schema";

describe("getTierSettings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when no row of that tier exists", async () => {
    const result = await getTierSettings("local");
    expect(result).toBeNull();
  });

  it("does not return a byok row when reading the local tier", async () => {
    testDb.insert(aiSettings).values({
      id: "ai-byok",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      encryptedApiKey: "encrypted",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      tier: "byok",
      updatedAt: new Date().toISOString(),
    }).run();

    const result = await getTierSettings("local");
    expect(result).toBeNull();
  });

  it("does not return a local row when reading the byok tier", async () => {
    testDb.insert(aiSettings).values({
      id: "ai-local",
      provider: "local-openai",
      modelId: "llama-3",
      encryptedApiKey: "encrypted",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      tier: "local",
      updatedAt: new Date().toISOString(),
    }).run();

    const result = await getTierSettings("byok");
    expect(result).toBeNull();
  });

  it("returns decrypted settings for the matching tier", async () => {
    testDb.insert(aiSettings).values({
      id: "ai-local",
      provider: "local-openai",
      modelId: "llama-3",
      encryptedApiKey: "encrypted",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      tier: "local",
      updatedAt: new Date().toISOString(),
    }).run();

    const result = await getTierSettings("local");
    expect(result).toEqual({
      provider: "local-openai",
      modelId: "llama-3",
      baseUrl: null,
      apiKey: "decrypted-api-key",
    });
  });
});
