// Exercises the ACTUAL data statements shipped in
// drizzle/0013_pretty_trish_tilby.sql (the tier-classification UPDATE and the
// app_preferences freeze INSERT) against a real on-disk better-sqlite3 file
// built to the pre-0013 shape. This is intentionally NOT the hand-DDL mirror
// in tests/helpers/test-db.ts -- that helper never runs real migration SQL,
// so it can't catch a regression in these two statements.
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIGRATION_SQL_PATH = path.join(
  process.cwd(),
  "drizzle",
  "0013_pretty_trish_tilby.sql",
);

function readMigrationStatements(): string[] {
  const raw = fs.readFileSync(MIGRATION_SQL_PATH, "utf8");
  return raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pre-0013 on-disk schema: ai_settings WITHOUT `tier`, plus app_preferences. */
function buildPre0013Db(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    CREATE TABLE ai_settings (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      base_url TEXT,
      encrypted_api_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE app_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return sqlite;
}

function insertAiSettingsRow(
  sqlite: Database.Database,
  row: { id: string; provider: string; updatedAt: string },
) {
  sqlite
    .prepare(
      `INSERT INTO ai_settings
         (id, provider, model_id, encrypted_api_key, iv, auth_tag, encrypted_dek, updated_at)
       VALUES (?, ?, 'model', 'enc', 'iv', 'tag', 'dek', ?)`,
    )
    .run(row.id, row.provider, row.updatedAt);
}

function applyMigrationDataStatements(sqlite: Database.Database) {
  for (const statement of readMigrationStatements()) {
    sqlite.exec(statement);
  }
}

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `ai-settings-migration-${randomUUID()}.db`);
}

const ROUTING_GROUPS = ["insights", "metadata", "redaction"] as const;

function expectedRoutingPrefs(value: "local" | "byok") {
  return ROUTING_GROUPS.map((name) => ({
    key: `ai_routing_group_${name}`,
    value,
  }));
}

describe("ai_settings tier migration data statements (0013)", () => {
  const dbPaths: string[] = [];

  afterEach(() => {
    for (const dbPath of dbPaths.splice(0)) {
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
      }
    }
  });

  it("classifies an existing local-openai row as tier=local and freezes routing groups to local", () => {
    const dbPath = tmpDbPath();
    dbPaths.push(dbPath);
    const sqlite = buildPre0013Db(dbPath);
    insertAiSettingsRow(sqlite, {
      id: "row-local",
      provider: "local-openai",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    applyMigrationDataStatements(sqlite);

    const row = sqlite
      .prepare("SELECT tier FROM ai_settings WHERE id = ?")
      .get("row-local") as { tier: string };
    expect(row.tier).toBe("local");

    const prefs = sqlite
      .prepare("SELECT key, value FROM app_preferences ORDER BY key")
      .all();
    expect(prefs).toEqual(expectedRoutingPrefs("local"));

    sqlite.close();
  });

  it("classifies an existing BYOK row (e.g. anthropic) as tier=byok and freezes routing groups to byok", () => {
    const dbPath = tmpDbPath();
    dbPaths.push(dbPath);
    const sqlite = buildPre0013Db(dbPath);
    insertAiSettingsRow(sqlite, {
      id: "row-byok",
      provider: "anthropic",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    applyMigrationDataStatements(sqlite);

    const row = sqlite
      .prepare("SELECT tier FROM ai_settings WHERE id = ?")
      .get("row-byok") as { tier: string };
    expect(row.tier).toBe("byok");

    const prefs = sqlite
      .prepare("SELECT key, value FROM app_preferences ORDER BY key")
      .all();
    expect(prefs).toEqual(expectedRoutingPrefs("byok"));

    sqlite.close();
  });

  it("freezes routing groups to the MOST RECENT settings row's classification, not just any row", () => {
    const dbPath = tmpDbPath();
    dbPaths.push(dbPath);
    const sqlite = buildPre0013Db(dbPath);
    // Older row is BYOK, but the most recently updated row is the local
    // engine -- the freeze must follow updated_at DESC, so groups end up
    // "local" even though a byok row exists too.
    insertAiSettingsRow(sqlite, {
      id: "row-older-byok",
      provider: "anthropic",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    insertAiSettingsRow(sqlite, {
      id: "row-newer-local",
      provider: "local-openai",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    applyMigrationDataStatements(sqlite);

    const rows = sqlite
      .prepare("SELECT id, tier FROM ai_settings ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: "row-newer-local", tier: "local" },
      { id: "row-older-byok", tier: "byok" },
    ]);

    const prefs = sqlite
      .prepare("SELECT key, value FROM app_preferences ORDER BY key")
      .all();
    expect(prefs).toEqual(expectedRoutingPrefs("local"));

    sqlite.close();
  });

  it("creates no app_preferences rows on a database with no ai_settings row (WHERE EXISTS guard)", () => {
    const dbPath = tmpDbPath();
    dbPaths.push(dbPath);
    const sqlite = buildPre0013Db(dbPath);

    applyMigrationDataStatements(sqlite);

    const cols = sqlite.prepare("PRAGMA table_info(ai_settings)").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name)).toContain("tier");

    const prefs = sqlite.prepare("SELECT * FROM app_preferences").all();
    expect(prefs).toEqual([]);

    sqlite.close();
  });
});
