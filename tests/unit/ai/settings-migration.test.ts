import { describe, expect, it } from "vitest";
import { createTestDb } from "../../helpers/test-db";
import { aiSettings } from "@/db/schema";

describe("ai_settings tier migration", () => {
  it("fresh database has the tier column with byok default", () => {
    const db = createTestDb();
    const cols = db.$client.prepare("PRAGMA table_info(ai_settings)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("tier");
  });

  it("defaults tier to byok when omitted on insert", () => {
    const db = createTestDb();
    db.insert(aiSettings)
      .values({
        id: "ai-1",
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
        encryptedApiKey: "encrypted",
        iv: "iv",
        authTag: "tag",
        encryptedDek: "dek",
        updatedAt: new Date().toISOString(),
      })
      .run();

    const [row] = db.select().from(aiSettings).all();
    expect(row.tier).toBe("byok");
  });
});
