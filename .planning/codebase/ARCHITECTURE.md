# Architecture

**Analysis Date:** 2026-03-17

## Pattern overview

**Overall:** Next.js 16 full-stack server-rendered app with Electron desktop wrapper. Client-server separation via Next.js API routes, with local SQLite database for configuration and caching. Proxy-based routing handles setup flow and app initialization.

**Key characteristics:**
- Full-stack TypeScript (React 19 + Next.js 16 backend)
- Server-side Apple ID credential handling with encryption
- ASC API client abstraction with JWT-based authentication and rate limiting
- Local-first architecture with SQLite for state and cache
- Electron desktop app with MCP server support
- Client context system for state management (apps, analytics, preferences)

## Layers

**Presentation Layer (Client):**
- Purpose: React components, pages, and UI interactions
- Location: `src/app/dashboard/`, `src/app/settings/`, `src/components/`
- Contains: Page routes, form components, dialogs, layout containers, shadcn/ui wrappers
- Depends on: Hooks, contexts, API client (`/api/api-fetch.ts`)
- Used by: End users via Electron or web browser

**API Route Layer (Server):**
- Purpose: HTTP endpoints for client requests following Next.js App Router pattern
- Location: `src/app/api/` (65+ route handlers)
- Contains: Route handlers for apps, versions, analytics, screenshots, AI features, settings, credentials, MCP events
- Depends on: Database, ASC client, encryption, caching, helpers
- Used by: Client pages and third-party MCP requests

**Service/Business Logic Layer:**
- Purpose: Reusable domain logic separated from request handling
- Location: `src/lib/asc/` (ASC API operations), `src/lib/ai/` (AI providers)
- Contains: `listApps()`, `analytics` queries, TestFlight operations, version mutations, localization sync
- Depends on: Database, encryption, HTTP client
- Used by: API routes, contexts, utilities

**Credential & Encryption Layer:**
- Purpose: Secure storage and retrieval of API credentials
- Location: `src/lib/encryption.ts`, `src/lib/asc/client.ts`
- Contains: Encrypted credential storage, JWT generation, token caching
- Depends on: Database, crypto primitives
- Used by: All ASC API calls

**Database Layer:**
- Purpose: Local SQLite persistence for credentials, cache, settings, license, analytics tracking
- Location: `src/db/` (Drizzle ORM + better-sqlite3)
- Contains: Schema tables, migrations, query builder
- Depends on: None (lowest layer)
- Used by: Services, cache manager, credential manager

**Caching Layer:**
- Purpose: In-database TTL-based cache for ASC API responses
- Location: `src/lib/cache.ts`
- Contains: `cacheGet()`, `cacheSet()`, `cacheInvalidate()` with prefix matching
- Depends on: Database
- Used by: Service layer for avoiding ASC API rate limits

**Routing/Entry Point Layer:**
- Purpose: Request interception, setup detection, routing decisions
- Location: `src/proxy.ts`
- Contains: Proxy matcher config, setup state check, redirect logic
- Depends on: Health check API (`/api/health`)
- Used by: Next.js request pipeline

**Context Management (Client State):**
- Purpose: Client-side state sharing across components
- Location: `src/lib/*-context.tsx`
- Contains: Apps context, analytics context, preferences, form dirty state, navigation state
- Depends on: Fetch API, local storage
- Used by: Client pages and components

**MCP Integration Layer:**
- Purpose: Model Context Protocol server for tool-based integrations
- Location: `src/mcp/`
- Contains: Server initialization, tool resolution, event handlers, tool implementations
- Depends on: Service layer (ASC operations)
- Used by: External MCP clients (Claude, other AI tools)

## Data flow

**Initial app launch (Electron):**

1. Electron loads `/` (hardcoded, never `/dashboard`)
2. Proxy checks `/api/health` to determine setup state
3. If not set up → redirect to `/setup`
4. If set up → redirect to `/dashboard?entry=1`
5. Dashboard checks `entry=1` param, restores last URL or shows app picker (free tier)
6. Page loads apps via `/api/apps`, analytics via `/api/apps/{appId}/analytics`

**Localization mutation flow (versions, app info, TestFlight info):**

1. Client submits PUT request with `{ locales: {...}, originalLocaleIds: {...} }`
2. API route calls `syncLocalizations()` helper in `src/lib/api-helpers.ts`
3. Helper processes mutations sequentially (not parallel) to avoid ASC rate limits
4. For each locale: update existing → create new → delete removed
5. Returns 207 (multi-status) with errors + created IDs
6. Client merges created IDs into local state, shows error toasts

**Analytics data refresh:**

1. Client calls `/api/apps/{appId}/analytics/refresh` (POST)
2. Backend initiates async analytics report generation
3. Returns `{ pending: true }` immediately
4. Client polls `/api/apps/{appId}/analytics` every 3s for completion
5. Once data ready, returns `{ pending: false, data: {...} }`
6. Client updates chart and KPI cards

**State management:**

- **Apps list:** `useApps()` context fetches from `/api/apps`, cached in React state
- **Preferences:** Key-value store in SQLite via `/api/app-preferences`
- **Form dirty state:** `useFormDirty()` context for unsaved changes
- **Analytics range:** `usePersistedRange()` hook saves date range to localStorage
- **Navigation:** `getLastUrl()` / `setLastUrl()` persists last visited page

## Key abstractions

**AscApiError:**
- Purpose: Typed error container for structured ASC API failures
- Location: `src/lib/asc/client.ts`
- Pattern: Extends Error, wraps `ascError` property with category, statusCode, entries
- Used to: Handle ASC errors distinctly from network/validation errors

**ascFetch():**
- Purpose: HTTP client for ASC API with JWT auth, retry logic, rate limiting
- Location: `src/lib/asc/client.ts`
- Pattern: Wraps `fetch()`, adds Authorization header, retries on 429/5xx (not POST), exponential backoff
- Used by: All service layer functions

**Cache system:**
- Purpose: Avoid ASC rate limits with TTL-based caching
- Location: `src/lib/cache.ts`
- Pattern: Simple get/set/invalidate with `resource` string key and `ttlMs` TTL
- Used by: Analytics, apps listing, version info, TestFlight data

**syncLocalizations():**
- Purpose: Generic mutation handler for locale CRUD across different entities
- Location: `src/lib/api-helpers.ts`
- Pattern: Accepts mutations object with update/create/delete functions, processes sequentially, returns multi-status
- Used by: Version, app info, TestFlight localization handlers

**Context system:**
- Purpose: Client-side state lifting and sharing
- Examples: `useApps()`, `useAnalytics()` (in contexts), `usePersistedRange()`
- Pattern: Provider component with context hook, fetches data on mount, re-fetches on refresh
- Used by: Pages to avoid prop drilling, multiple pages may subscribe to same context

**Database Proxy:**
- Purpose: Lazy initialization of SQLite + Drizzle, singleton pattern
- Location: `src/db/index.ts`
- Pattern: Exports `db` and `sqlite` as Proxies that call `init()` on first property access
- Used by: All database operations (avoids circular dependencies in dev mode)

## Entry points

**Root page `/`:**
- Location: `src/app/page.tsx`
- Triggers: Electron app load
- Responsibilities: Redirects to `/dashboard` (proxy handles setup routing)

**Health check `/api/health`:**
- Location: `src/app/api/health/route.ts`
- Triggers: Proxy on every `/` request
- Responsibilities: Returns `{ status: "ok", setup: boolean, demo: boolean }`

**Dashboard `/dashboard`:**
- Location: `src/app/dashboard/page.tsx`
- Triggers: Direct navigation, app entry point after setup
- Responsibilities: Fetches all apps, analytics data, version info; renders KPI cards and proceeds chart; handles app picker for free tier

**Proxy routing `src/proxy.ts`:**
- Location: `src/proxy.ts`
- Triggers: All requests matching matcher pattern
- Responsibilities: Checks setup state, redirects to `/setup` or `/dashboard`, allows `/api/*` and `/_next/*` through

## Error handling

**Strategy:** Structured error responses with contextual information for client error display

**Patterns:**
- `errorJson()` helper transforms caught errors into HTTP responses with optional ASC error details
- `AscApiError` wraps ASC responses with parsed error category, status code, error entries
- Network errors caught in `ascFetch()` return network error type
- Validation errors in `parseBody()` return 400 with Zod issue details
- Multi-status 207 responses in `syncLocalizations()` for partial success scenarios
- All API errors logged to console with method/path/status/preview for debugging

**Error metadata preserved:**
- `method`, `path` added to errors for debugging
- `ascErrors` array (structured error entries from ASC)
- `ascMethod`, `ascPath` for reproducing ASC errors
- `category` field (e.g., "api", "network", "validation")

## Cross-cutting concerns

**Logging:** Console methods (`console.log()`, `console.warn()`, `console.error()`) with structured logging prefixes (e.g., `[ASC]`, `[syncLocalizations]`, `[mcp]`)

**Validation:** Zod schemas in request bodies, validated in `parseBody()` helper before processing

**Authentication:** Session-based for Electron (no client-side credentials), JWT issued server-side from stored ASC credentials, rate limiting via token acquisition

**Rate limiting:** `acquireToken()` in `src/lib/asc/rate-limit.ts` implements token-bucket style limiting, sequential mutation processing avoids parallel ASC calls

**Encryption:** AES-256-GCM used for credential storage, `encrypt()`/`decrypt()` in `src/lib/encryption.ts`, DEK stored encrypted with app key

---

*Architecture analysis: 2026-03-17*
