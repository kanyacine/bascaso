# Codebase structure

**Analysis Date:** 2026-03-17

## Directory layout

```
itsyconnect-macos/
├── src/                          # Main application source
│   ├── app/                      # Next.js App Router (pages, API routes, layout)
│   │   ├── api/                  # API routes (65+ endpoints)
│   │   │   ├── ai/               # AI translation and provider endpoints
│   │   │   ├── apps/             # App listing, selection, analytics, versions, TestFlight
│   │   │   ├── settings/         # Credentials, AI settings, license, MCP config
│   │   │   ├── setup/            # Initial setup and connection testing
│   │   │   ├── health/           # Setup state check endpoint
│   │   │   ├── sync/             # Refresh status tracking
│   │   │   ├── nominations/      # Feature nomination endpoints
│   │   │   ├── mcp/              # MCP event handler
│   │   │   └── license/          # License validation and StoreKit
│   │   ├── dashboard/            # Main dashboard and sub-pages (apps, analytics, etc.)
│   │   ├── settings/             # Settings pages (AI, license, teams, about)
│   │   ├── setup/                # Initial setup flow
│   │   ├── layout.tsx            # Root layout with ThemeProvider, Toaster
│   │   ├── page.tsx              # Root page (redirects to /dashboard)
│   │   ├── globals.css           # Global styles, theme vars, custom components
│   │   └── not-found.tsx         # 404 page
│   ├── components/               # React components
│   │   ├── ui/                   # shadcn/ui wrapped components (30+)
│   │   ├── layout/               # Layout containers (sidebar, header, breadcrumb, footer)
│   │   ├── *.tsx                 # Dialogs, forms, cards (add-locale, ai-compare, etc.)
│   ├── db/                       # Database layer (Drizzle ORM + SQLite)
│   │   ├── index.ts              # Database client singleton with lazy init
│   │   ├── schema.ts             # Table definitions (credentials, cache, settings, etc.)
│   │   └── migrate.ts            # Migration runner
│   ├── lib/                      # Utilities and business logic
│   │   ├── asc/                  # Apple Store Connect API client (20+ files)
│   │   │   ├── client.ts         # JWT auth, HTTP client, error handling
│   │   │   ├── apps.ts           # List/fetch apps
│   │   │   ├── versions.ts       # App versions CRUD
│   │   │   ├── testflight/       # TestFlight build operations
│   │   │   ├── analytics.ts      # Analytics data fetching
│   │   │   ├── localization-mutations.ts # Locale update logic
│   │   │   ├── errors.ts         # ASC error parsing
│   │   │   └── [other API operations]
│   │   ├── ai/                   # AI provider abstraction
│   │   │   ├── provider-factory.ts # Create provider instances
│   │   │   ├── prompts.ts        # Prompt templates
│   │   │   ├── structured-output.ts # AI output parsing
│   │   │   └── [provider configs]
│   │   ├── hooks/                # Custom React hooks
│   │   ├── sync/                 # Sync operation tracking
│   │   ├── *-context.tsx         # React contexts (apps, analytics, preferences, etc.)
│   │   ├── cache.ts              # TTL-based caching system
│   │   ├── api-helpers.ts        # Request/response utilities, syncLocalizations()
│   │   ├── api-fetch.ts          # Client-side fetch wrapper
│   │   ├── encryption.ts         # AES-256-GCM encryption/decryption
│   │   ├── format.ts             # Number/date formatting
│   │   ├── utils.ts              # General utilities
│   │   ├── [other utils]         # License, version, env, analytics-range, etc.
│   ├── mcp/                      # Model Context Protocol server
│   │   ├── index.ts              # Server startup/shutdown
│   │   ├── server.ts             # MCP server setup
│   │   ├── resolve.ts            # Tool resolution and execution
│   │   └── tools/                # Individual tool implementations
│   ├── hooks/                    # Shared hooks (currently minimal)
│   └── proxy.ts                  # Next.js proxy for request interception
├── drizzle/                      # Database migrations
├── data/                         # Demo data
├── docs/                         # Project documentation
│   ├── UI.md                     # UI conventions (typography, components, forms)
│   ├── BACKEND.md                # Backend architecture and patterns
│   └── DB.md                     # Database and migration guide
├── electron/                     # Electron main process
│   ├── main.ts                   # Main process entry
│   ├── preload.ts                # IPC bridges
│   └── tsconfig.json             # Electron TypeScript config
├── scripts/                      # Build and utility scripts
├── .planning/                    # GSD planning documents
├── forge.config.ts               # Electron Forge config
├── next.config.ts                # Next.js config
├── tailwind.config.ts            # Tailwind CSS config
├── tsconfig.json                 # Root TypeScript config
├── package.json                  # Dependencies and scripts
└── docker-compose.yml            # Dev database setup (if needed)
```

## Directory purposes

**`src/app/`:**
- Purpose: Next.js App Router directory – contains all pages and API routes
- Contains: Page routes, API handlers, layouts, static assets
- Key files: `page.tsx`, `layout.tsx`, `globals.css`, `proxy.ts`

**`src/app/api/`:**
- Purpose: RESTful API endpoints organized by domain
- Contains: 65+ route handlers for apps, versions, analytics, settings, MCP
- Pattern: Nested directory structure mirrors API path structure
- Key routes: `/apps`, `/apps/{appId}/versions`, `/api/health`, `/api/setup`

**`src/app/dashboard/` and `src/app/settings/`:**
- Purpose: User-facing pages and UI flows
- Contains: Page routes with dynamic segments, layout for each section
- Key pages: `dashboard/page.tsx` (main), `dashboard/apps/[appId]/page.tsx` (app detail)
- Includes: Settings for AI, license, teams, and about

**`src/components/`:**
- Purpose: Reusable React components
- `ui/`: shadcn/ui wrapped primitives (Button, Dialog, Card, Input, etc.)
- Layout: Top-level layout containers (sidebar, header, footer, breadcrumb)
- Feature: Feature-specific dialogs and forms (AddLocaleDialog, BulkAiDialog, etc.)

**`src/lib/asc/`:**
- Purpose: Apple Store Connect API client abstraction
- Contains: HTTP client, JWT generation, error parsing, CRUD operations for all ASC resources
- Key files:
  - `client.ts`: Core `ascFetch()` with auth and retry logic
  - `apps.ts`, `versions.ts`, `testflight/`: Domain-specific operations
  - `analytics.ts`: Analytics data aggregation and formatting
  - `localization-mutations.ts`: Batch locale update logic

**`src/lib/ai/`:**
- Purpose: AI provider integration (Anthropic, OpenAI, Google, Mistral, xAI)
- Contains: Provider factory, prompt templates, structured output parsing
- Key files:
  - `provider-factory.ts`: Create provider instances from settings
  - `prompts.ts`: Pre-written prompts for screenshot translation, description generation
  - `structured-output.ts`: Parse AI responses into typed objects

**`src/db/`:**
- Purpose: Database layer with Drizzle ORM and SQLite
- Contains: Schema definitions, initialization logic, migration runner
- Key files:
  - `schema.ts`: Tables for credentials, cache, license, settings, preferences
  - `index.ts`: Singleton database client with proxy-based lazy init
  - `migrate.ts`: Runs migrations from `drizzle/` folder on startup

**`src/mcp/`:**
- Purpose: Model Context Protocol server for external tool integrations
- Contains: Server initialization, tool definitions, event handlers
- Runs on: Separate HTTP port, listens for MCP requests from Claude/other tools
- Key files:
  - `tools/`: Individual tool implementations
  - `resolve.ts`: Tool execution logic

**`src/proxy.ts`:**
- Purpose: Next.js request interceptor (replaces middleware.ts)
- Responsibilities: Setup state detection, routing decisions, public path handling
- Key logic: Checks `/api/health`, redirects to `/setup` if needed, else `/dashboard`

**`drizzle/`:**
- Purpose: Database migration files (auto-generated by drizzle-kit)
- Contains: SQL migration statements for schema changes
- Workflow: `npm run db:generate` creates new migration, `npm run db:migrate` applies

**`electron/`:**
- Purpose: Electron main process and IPC setup
- Responsible for: Window creation, file access, version management
- Loads: Vite dev server or built Next.js app

## Key file locations

**Entry points:**
- `src/app/layout.tsx`: Root HTML structure, providers (ThemeProvider, Toaster)
- `src/app/page.tsx`: `/` route – redirects to `/dashboard`
- `src/app/dashboard/page.tsx`: Main dashboard – KPI cards, app grid, analytics chart
- `src/proxy.ts`: Request routing and setup detection

**Configuration:**
- `src/app/globals.css`: Global styles, theme variables, custom component classes
- `next.config.ts`: Next.js build config
- `tailwind.config.ts`: Tailwind customization (color tokens from globals.css)
- `tsconfig.json`: Path aliases (`@/*` → `src/`), TypeScript strict mode

**Core logic:**
- `src/lib/asc/client.ts`: ASC API HTTP client with JWT auth and retry
- `src/lib/cache.ts`: TTL-based caching for ASC responses
- `src/lib/encryption.ts`: AES-256-GCM encryption for stored credentials
- `src/db/schema.ts`: SQLite table definitions

**Testing:**
- Test files: Not yet present (structure ready, no test files exist)
- Test config: `vitest.config.ts` configured but no test suite written
- Coverage: `npm run test:coverage` ready but no tests to run

## Naming conventions

**Files:**
- React components: PascalCase (e.g., `AddLocaleDialog.tsx`, `AppIcon.tsx`)
- Utilities and services: camelCase (e.g., `cache.ts`, `api-helpers.ts`)
- API routes: `route.ts` or `route.tsx` (Next.js convention)
- Directories: kebab-case for multi-word (e.g., `app-switcher`, `form-dirty-context`)

**Functions:**
- Hook functions: `use*` prefix (e.g., `useApps()`, `usePersistedRange()`)
- API functions: Verb-noun pattern (e.g., `listApps()`, `fetchAnalytics()`)
- Helper functions: Descriptive camelCase (e.g., `parseAscError()`, `sanitiseError()`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`, `FREE_LIMITS`)
- Regular variables: camelCase
- Component props: camelCase
- Database columns: snake_case (in schema), camelCase (in TypeScript types)

**Types:**
- Interfaces/types: PascalCase (e.g., `AscError`, `AppAnalytics`, `SyncError`)
- Generic types: PascalCase (e.g., `T`, or `AppType`)
- Enum-like objects: UPPER_SNAKE_CASE keys (e.g., `STATE_DOT_COLORS`)

## Where to add new code

**New feature (e.g., new app module):**
- UI pages: `src/app/dashboard/apps/[appId]/{feature}/`
- API endpoints: `src/app/api/apps/[appId]/{feature}/route.ts`
- Business logic: `src/lib/asc/{feature}.ts` for ASC operations
- Components: `src/components/{feature}-*.tsx` or `src/components/{feature}/`
- Tests: Co-locate in same directory with `.test.ts` suffix (when implemented)

**New component/module:**
- Reusable component: `src/components/{name}.tsx` (or `src/components/{name}/index.tsx` if folder)
- shadcn/ui wrapper: `src/components/ui/{name}.tsx`
- Layout component: `src/components/layout/{name}.tsx`
- Feature page: `src/app/{route}/page.tsx`

**Utilities and helpers:**
- General utils: `src/lib/utils.ts` or new file `src/lib/{domain}.ts`
- API helpers: `src/lib/api-helpers.ts` (shared request/response logic)
- Custom hooks: `src/lib/hooks/use{Name}.ts` or `src/hooks/`
- Context: `src/lib/{name}-context.tsx` (if client-side state sharing needed)
- ASC domain logic: `src/lib/asc/{domain}.ts`

**Database:**
- New table: Add to `src/db/schema.ts`
- New migration: Run `npm run db:generate`, auto-creates in `drizzle/`
- Safeguard SQL: Add to `src/db/index.ts` if backfilling needed

**Styles:**
- Global/reusable classes: `src/app/globals.css` in `@layer components`
- Component-specific: Tailwind utility classes inline (per project style preference)
- Do NOT create new CSS files (use globals.css only)

## Special directories

**`src/app/api/apps/[appId]/`:**
- Purpose: App-specific API operations
- Generated: No (manually created)
- Committed: Yes
- Pattern: Nested routes for versions, analytics, testflight, etc. follow domain-driven structure

**`drizzle/`:**
- Purpose: Database migration snapshots and SQL statements
- Generated: Yes (by `npm run db:generate`)
- Committed: Yes (migrations are version controlled)
- Workflow: Never edit by hand; use drizzle-kit CLI

**`.next/`:**
- Purpose: Next.js build artifacts
- Generated: Yes (during `next build`)
- Committed: No (in .gitignore)
- Contents: Compiled JS, HTML, server-side assets

**`.planning/codebase/`:**
- Purpose: GSD orchestrator planning documents
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**`data/`:**
- Purpose: Demo data fixtures for mock ASC API responses
- Generated: No
- Committed: Yes
- Used by: Demo mode when no real credentials

---

*Structure analysis: 2026-03-17*
