# Backend conventions

This document defines the backend architecture, security model, and data strategy for Itsyconnect. All server-side code must follow these conventions.

## Architecture

Single-process Next.js application. SQLite database via `better-sqlite3` + Drizzle ORM. No external services required.

```
Next.js process
├── /app/api/*        → Route handlers (REST)
├── /lib/asc/*        → App Store Connect SDK wrapper
├── /lib/ai/*         → Vercel AI SDK integration
├── /lib/db/*         → Drizzle schema, queries, migrations
├── /lib/sync/*       → Background data sync worker
└── /data/itsyconnect.db → SQLite database
```

## Database

**SQLite with WAL mode.** Pragmas set at connection time:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

SQLite is the right choice for this workload – a local-only desktop app with one user. Reads are fast (served from memory after first access), writes are infrequent (config changes, cache refreshes). Single file means trivial backups.

### Schema

All tables use Drizzle ORM. Timestamps are ISO 8601 strings. IDs are ULIDs (sortable).

**Core tables:**

| Table | Purpose |
|---|---|
| `ascCredentials` | id, issuerId, keyId, encryptedPrivateKey, isActive, createdAt |
| `aiSettings` | id, provider, modelId, encryptedApiKey, updatedAt |

**Cache tables** (one per ASC resource type):

| Table | Purpose | TTL |
|---|---|---|
| `cacheApps` | App list + metadata | 1h |
| `cacheVersions` | App Store versions per app | 15min |
| `cacheBuilds` | TestFlight builds per app | 5min |
| `cacheReviews` | Customer reviews per app | 15min |
| `cacheAnalytics` | Analytics snapshots | 1h |
| `cacheSales` | Sales/financial data | 1h |
| `keyword_scores` | ASO keyword scores (iTunes Search, not ASC) | 24h |
| `keyword_score_history` | Append-only score observations for trend deltas | – |

Every cache table has `fetchedAt` (timestamp of last sync) and `data` (JSON blob). Queries check `fetchedAt` against TTL to determine staleness.

The keyword score cache deviates from the blob pattern on purpose: rows are
keyed on `(keyword, country)` with typed columns, shared across apps and
users. A stale row is served immediately and refreshed in the background
(stale-while-revalidate); only a true cold miss computes synchronously,
because scoring is user-initiated per keyword (each pastille shows its own
spinner) rather than a page-load dependency.

## Data fetching strategy

**Cache-first with background revalidation.** Never block page loads on ASC API calls.

1. **Page loads always serve from cache** – instant render, no spinners
2. **Background sync** runs on a timer per resource type (see TTLs above)
3. **Manual refresh button** forces immediate fetch for that resource
4. **Staleness indicator** – "updated X min ago" so users know data freshness
5. **Write-through** – when a user saves metadata, write to ASC then update cache immediately

Background sync runs in-process via `setInterval`. No Redis, no BullMQ, no cron. If the process restarts, it does a fresh sync on startup.

Sync worker deduplicates: if a fetch for a resource is already in-flight, new requests wait for the existing one rather than making duplicate API calls.

## Security

### Input validation

- **Zod schemas** for every API route input. Validate before any processing.
- Parse, don't validate – use Zod's `.parse()` to get typed output.
- File uploads: validate type, size (max 10 MB for .p8 files), content structure.
- All database queries use Drizzle ORM parameterised queries – no raw SQL string concatenation.
- Sanitise user-visible strings (names, descriptions) – trim whitespace, normalise unicode.

### Encryption at rest

- ASC private keys and AI API keys encrypted with **AES-256-GCM envelope encryption**.
- Master key from `ENCRYPTION_MASTER_KEY` env var (32 bytes, hex-encoded).
- Unique data encryption key (DEK) per secret. DEK encrypted by master key.
- Decryption happens server-side only, on-demand, never cached in memory longer than needed.

### HTTP security headers

Set via `next.config.ts`:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`

### Environment variables

Validated at startup with Zod. App refuses to start if required vars are missing or malformed.

| Variable | Required | Purpose |
|---|---|---|
| `ENCRYPTION_MASTER_KEY` | Yes | 32-byte hex key for envelope encryption |
| `PORT` | No | Server port (default 3000) |

## API conventions

- All routes under `/app/api/`.
- JSON request/response. Content-Type validation on mutations.
- Consistent error format: `{ error: string, details?: unknown }`.
- HTTP status codes: 200 (ok), 201 (created), 400 (bad input), 404 (not found), 500 (server error).
- Every route handler: validate input (Zod) → business logic → response.
- No business logic in route handlers – delegate to service functions in `/lib/`.

## Testing

- **Vitest** for unit and integration tests.
- **Playwright** for E2E (critical user flows).
- **MSW** (Mock Service Worker) for mocking ASC API responses in tests.
- Test database uses in-memory SQLite (`:memory:`).
- 100% coverage target for business logic. UI components tested via E2E.
- Every API route has at least: happy path, validation error tests.

## ASC API wrapper

Thin wrapper around `appstore-connect-sdk`:

- Auto-generates JWT from encrypted credentials (decrypt on demand, 15 min token lifetime).
- Request queue with rate limiting (token bucket).
- Automatic retry with exponential backoff (max 3 retries).
- Response caching (write to SQLite cache tables).
- Typed responses using the SDK's generated types.

## AI integration

Uses **Vercel AI SDK** with provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.):

- Provider and model configurable in settings (stored in `aiSettings` table).
- API key encrypted at rest, decrypted on-demand for requests.
- All AI features are optional – hidden from UI if no API key is configured.
- Streaming responses for copywriting/translation.
- Structured output with Zod schemas for translations (ensures correct locale keys, field lengths).
- Token usage tracked and displayed to users.
