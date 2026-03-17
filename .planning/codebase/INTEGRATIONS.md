# External integrations

**Analysis date:** 2026-03-17

## APIs & External services

**Apple App Store Connect (ASC):**
- Service: App Store Connect API (RESTful JSON-RPC hybrid)
- What it's used for: Core functionality – fetching/updating app metadata, TestFlight builds, versions, reviews, analytics, screenshots, app localizations
- Base URL: `https://api.appstoreconnect.apple.com`
- SDK/Client: Custom JWT-based client in `src/lib/asc/client.ts`
- Auth: JWT signed with private key (Ed25519) from App Store Connect API key
  - Credential storage: Encrypted in SQLite table `asc_credentials` with AES-256-GCM
  - Env var: `ENCRYPTION_MASTER_KEY` (master key for all credential encryption)
- Rate limiting: Token-based acquisition via `src/lib/asc/rate-limit.ts`
- Features implemented:
  - App listing & selection: `src/lib/asc/apps.ts`
  - Analytics reports: `src/lib/asc/analytics.ts`, `src/lib/asc/analytics-reports.ts`
  - TestFlight builds & testers: `src/lib/asc/testflight/builds.ts`, `src/lib/asc/testflight/testers.ts`
  - Version submission & review: `src/lib/asc/version-mutations.ts`
  - Screenshots upload/reorder: `src/lib/asc/screenshot-mutations.ts`
  - App category selection: `src/lib/asc/categories.ts`
  - Localizations: `src/lib/asc/localizations.ts`

**LemonSqueezy (License management):**
- Service: License activation & deactivation API
- What it's used for: Pro license validation via license key exchange
- Base URL: `https://api.lemonsqueezy.com/v1/licenses`
- Endpoints:
  - `POST /activate` – Validate license key and create instance
  - `POST /deactivate` – Revoke license activation
- Implementation: `src/app/api/license/route.ts`
- Response format: JSON with `activated`, `error`, `license_key`, `instance`, `meta.customer_email`
- Credentials: None (public API, key-based validation on server-side only)
- Checkout URL: `https://store.itsyapps.com/checkout/buy/24eefb3e-182a-4766-981e-cfe0f6753291` (`src/lib/license-shared.ts`)

**Apple StoreKit 2 (macOS App Store payments):**
- Service: In-app purchase framework (MAS builds only)
- What it's used for: Pro license activation in Mac App Store version
- Implementation: `src/app/api/license/storekit/route.ts`
- Auth: Native StoreKit 2 transaction validation in Electron main process
- Database: License stored in `licenseActivations` table with encrypted key "storekit"

## Data storage

**Databases:**
- SQLite (embedded)
  - Location: `~/Library/Application Support/Itsyconnect/itsyconnect.db` (macOS default, overrideable via `DATABASE_PATH`)
  - Client: Better-sqlite3 (sync, native module)
  - ORM: Drizzle ORM
  - Schema: `src/db/schema.ts`
  - Tables:
    - `asc_credentials` – ASC API keys (encrypted)
    - `ai_settings` – AI provider config (encrypted)
    - `cache_entries` – API response cache with TTL
    - `license_activations` – Pro license state (encrypted)
    - `analytics_backfill` – Sync completion tracking
    - `app_preferences` – Key-value app settings
    - `feedback_completed` – User feedback progress tracking

**File storage:**
- Screenshots: Uploaded to App Store Connect via ASC API (not stored locally)
- App data: Local SQLite database only
- No cloud storage integration

**Caching:**
- Strategy: In-database TTL-based cache (`src/lib/cache.ts`)
- Table: `cache_entries` (resource, data, fetchedAt, ttlMs)
- Usage: ASC responses cached to reduce API load and rate limit pressure

## Authentication & identity

**Auth provider:**
- Custom: App Store Connect credentials (API key pair)
- No OAuth, no session tokens
- Per-credential basis (multi-credential support planned)

**Implementation:**
- Credentials stored encrypted in `asc_credentials` table
- Private key decrypted on-demand for JWT generation
- JWT signed with EdDSA (Ed25519 signing key from ASC API key)
- Token cached for 60 seconds to minimize key decryption

## Monitoring & observability

**Error tracking:**
- Not detected – errors handled inline with custom error parsing in `src/lib/asc/errors.ts`

**Logging:**
- Strategy: Console-based (standard Node.js/browser console)
- No centralized logging service

**Health checks:**
- `src/app/api/health/route.ts` – Checks if ASC credentials exist (determines setup vs. dashboard routing)

## CI/CD & deployment

**Hosting:**
- Self-hosted (Electron desktop app on macOS)
- Alternative: Next.js standalone server via `npm run electron:make:dmg` or `npm run electron:make:mas`

**CI Pipeline:**
- Not detected (GitHub repo present but no GitHub Actions, etc.)

**Build/Release:**
- Electron Forge: `@electron-forge/cli`, `@electron-forge/maker-dmg`, `@electron-forge/maker-pkg`, `@electron-forge/maker-zip`
- DMG packaging (direct distribution)
- PKG packaging (Mac App Store submission)
- Code signing & notarization: Apple Developer account required
- Universal binary (amd64 + arm64) via `@electron/universal`

## Environment configuration

**Required env vars:**
- `ENCRYPTION_MASTER_KEY` – 64-char hex string (AES-256-GCM master key)
- `DATABASE_PATH` – SQLite path (optional, has default)
- `PORT` – Server port (optional, defaults to 3000)
- AI provider keys (optional per provider):
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `XAI_API_KEY`
  - `MISTRAL_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `LOCAL_OPENAI_API_KEY`
- Build-time only:
  - `MAS=1` – Enable Mac App Store build mode
  - `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID` – Notarization credentials

**Secrets location:**
- Dev: `.env.local` (git-ignored)
- No production secrets file (app is self-hosted, user provides ASC credentials via UI)

## Webhooks & callbacks

**Incoming:**
- `POST /api/mcp/events` – Model Context Protocol event handler for Claude Desktop integration
- API routes are public (no auth required for local Electron app)

**Outgoing:**
- ASC API mutation endpoints (version release, screenshot upload, etc.) trigger state changes but not webhooks
- No external webhook notifications

## AI integrations

**LLM providers (via Vercel AI SDK):**
- **Anthropic** – Claude (Sonnet 4.6, Haiku 4.5, Opus 4.6)
- **OpenAI** – GPT-5.2, GPT-5, GPT-5 Mini (with reasoning effort control)
- **Google** – Gemini 3 Pro/Flash, Gemini 2.5 Pro/Flash (with thinking budget control)
- **xAI** – Grok 4.1, 4, 3
- **Mistral** – Large, Medium, Small
- **DeepSeek** – Chat, Reasoner
- **Local OpenAI-compatible** – Custom base URL for local/self-hosted models

**Use cases:**
- Translation: `src/app/api/ai/translate-and-upload-screenshot/route.ts`
- Content improvement: App descriptions, keywords, release notes
- Keywords generation & fixing
- Review reply drafting
- Structured output generation with repair: `src/lib/ai/structured-output.ts`
- Analytics & review insights with streaming

**Provider factory:** `src/lib/ai/provider-factory.ts` (instantiates provider SDK based on config)
**Settings storage:** AI provider + model + base URL encrypted in `ai_settings` table
**Config validation:** Checked at runtime via `/api/ai/check` endpoint

## Model Context Protocol (MCP)

**Server implementation:**
- Location: `src/mcp/server.ts` (McpServer with v1.27.1 SDK)
- Tools registered:
  - `get-app` – Fetch app metadata
  - `update-app` – Modify app details
  - `translate` – AI-powered text translation
  - `manage-locales` – Add/remove localizations
- Integration: Spawned by Claude Desktop (runs on configurable port, default 3100)
- Event handling: `src/app/api/mcp/events/route.ts`
- Event streaming: Server-sent events (SSE) for real-time feedback

---

*Integration audit: 2026-03-17*
