import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE asc_credentials (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      issuer_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE ai_settings (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      base_url TEXT,
      encrypted_api_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'byok',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE cache_entries (
      resource TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL
    );

    CREATE TABLE feedback_completed (
      feedback_id TEXT PRIMARY KEY NOT NULL,
      app_id TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE app_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE keyword_scores (
      keyword TEXT NOT NULL,
      country TEXT NOT NULL,
      popularity INTEGER,
      difficulty INTEGER NOT NULL,
      opportunity INTEGER NOT NULL,
      classification TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      result_ids TEXT,
      details TEXT,
      competitors TEXT,
      PRIMARY KEY (keyword, country)
    );

    CREATE TABLE keyword_score_history (
      keyword TEXT NOT NULL,
      country TEXT NOT NULL,
      popularity INTEGER,
      difficulty INTEGER NOT NULL,
      opportunity INTEGER NOT NULL,
      result_ids TEXT,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (keyword, country, fetched_at)
    );

    CREATE TABLE pending_changes (
      id TEXT PRIMARY KEY NOT NULL,
      app_id TEXT NOT NULL,
      section TEXT NOT NULL,
      scope TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      original_value TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      app_id TEXT NOT NULL,
      country TEXT NOT NULL,
      locale TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT,
      progress TEXT,
      result TEXT,
      error TEXT,
      action_id TEXT,
      action_started_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE managed_account (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      encrypted_session TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE screenshot_docs (
      id TEXT PRIMARY KEY NOT NULL,
      app_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT,
      languages TEXT NOT NULL,
      output_device TEXT NOT NULL,
      doc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX screenshot_docs_current_unique ON screenshot_docs (app_id) WHERE kind = 'current';
  `);
  return drizzle(sqlite, { schema });
}

/** Seed a linked cloud account. The routing default and the managed-tier guards
 *  only ask whether the row exists, so the ciphertext columns can hold anything –
 *  nothing here ever decrypts them. */
export function seedManagedAccount(db: ReturnType<typeof createTestDb>): void {
  db.insert(schema.managedAccount)
    .values({
      email: "customer@example.test",
      encryptedSession: "ciphertext",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
    })
    .run();
}
