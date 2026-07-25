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
  // "local" | "byok" – one row max per tier; the local row's provider column
  // doubles as the engine id ("local-openai" | "apple-fm").
  tier: text("tier").notNull().default("byok"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Session du compte bascaso cloud (tier managé). Une seule ligne ;
// encrypted_session = JSON { accessToken, refreshToken, expiresAt } chiffré AES-GCM.
export const managedAccount = sqliteTable("managed_account", {
  id: text("id").primaryKey().$defaultFn(ulid),
  email: text("email").notNull(),
  encryptedSession: text("encrypted_session").notNull(),
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
    details: text("details"), // JSON DifficultyBreakdown (sub-scores, tiers…)
    competitors: text("competitors"), // JSON CompetitorSnapshot[] (top results, trimmed)
  },
  (t) => [primaryKey({ columns: [t.keyword, t.country] })],
);

// Append-only score observations, one per fresh compute – powers the
// trend deltas (current vs previous snapshot) on the research tab.
export const keywordScoreHistory = sqliteTable(
  "keyword_score_history",
  {
    keyword: text("keyword").notNull(),
    country: text("country").notNull(),
    popularity: integer("popularity"),
    difficulty: integer("difficulty").notNull(),
    opportunity: integer("opportunity").notNull(),
    resultIds: text("result_ids"), // JSON ids so any app's rank history derives
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.keyword, t.country, t.fetchedAt] })],
);

// --- Workflow runs (agentic pipelines – one row per run, result persisted) ---

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey().$defaultFn(ulid),
  kind: text("kind").notNull(), // "keyword-research" (only kind for now)
  appId: text("app_id").notNull(),
  country: text("country").notNull(), // ISO 3166-1 alpha-2, lowercase
  locale: text("locale").notNull(), // ASC locale, e.g. "fr-FR"
  status: text("status").notNull(), // "running" | "succeeded" | "failed" | "cancelled"
  step: text("step"), // last reported WorkflowStepId
  progress: text("progress"), // JSON WorkflowProgress
  result: text("result"), // JSON KeywordResearchResult (may be partial on failure)
  error: text("error"), // error code, e.g. "workflow_step_failed:score"
  // Nullable: rows written before this column existed have none. Persisted so
  // a failed run can be retried under the SAME managed action – replaying an
  // actionId is free within the backend's per-action window, a fresh one on
  // every retry would bill twice for one gesture.
  actionId: text("action_id"),
  // When `action_id` was first minted, carried over unchanged by every retry
  // that reuses it. NOT the same as `created_at`, which is this row's own
  // start: a retry chain would otherwise reset the clock on every hop and the
  // UI would keep promising a free replay past the backend's real window.
  // Nullable: rows written before this column existed fall back to created_at.
  actionStartedAt: text("action_started_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

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
