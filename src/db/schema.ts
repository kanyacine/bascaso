import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { ulid } from "@/lib/ulid";

// --- ASC credentials ---

export const ascCredentials = sqliteTable("asc_credentials", {
  id: text("id").primaryKey().$defaultFn(ulid),
  name: text("name"),
  issuerId: text("issuer_id").notNull(),
  keyId: text("key_id").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  encryptedDek: text("encrypted_dek").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- AI settings ---

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey().$defaultFn(ulid),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  baseUrl: text("base_url"),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  encryptedDek: text("encrypted_dek").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- Cache ---

export const cacheEntries = sqliteTable("cache_entries", {
  resource: text("resource").primaryKey(),
  data: text("data").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
  ttlMs: integer("ttl_ms").notNull(),
});

// --- Analytics backfill tracking ---

export const analyticsBackfill = sqliteTable("analytics_backfill", {
  appId: text("app_id").primaryKey(),
  completedAt: text("completed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- App preferences (key-value) ---

export const appPreferences = sqliteTable("app_preferences", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// --- Feedback completed tracking ---

export const feedbackCompleted = sqliteTable("feedback_completed", {
  feedbackId: text("feedback_id").primaryKey(),
  appId: text("app_id").notNull(),
  completedAt: text("completed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- App markers (timeline events shown on charts) ---

export const appMarkers = sqliteTable("app_markers", {
  id: text("id").primaryKey().$defaultFn(ulid),
  appId: text("app_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  label: text("label").notNull(),
  color: text("color"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- ASO keyword scores (one row per keyword × country, refreshed daily) ---

export const keywordScores = sqliteTable(
  "keyword_scores",
  {
    keyword: text("keyword").notNull(),
    country: text("country").notNull(), // ISO 3166-1 alpha-2, lowercase
    popularity: integer("popularity"), // null when iTunes returned no data
    difficulty: integer("difficulty").notNull(),
    opportunity: integer("opportunity").notNull(),
    classification: text("classification").notNull(),
    fetchedAt: integer("fetched_at").notNull(), // epoch ms, like cache_entries
    resultIds: text("result_ids"), // JSON array of ranked iTunes track ids
  },
  (t) => [primaryKey({ columns: [t.keyword, t.country] })],
);

// --- Pending changes (local change buffer) ---

export const pendingChanges = sqliteTable("pending_changes", {
  id: text("id").primaryKey().$defaultFn(ulid),
  appId: text("app_id").notNull(),
  section: text("section").notNull(),
  scope: text("scope").notNull(),
  field: text("field").notNull(),
  value: text("value").notNull(),
  originalValue: text("original_value"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
