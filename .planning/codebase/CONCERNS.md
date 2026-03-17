# Codebase concerns

**Analysis date:** 2026-03-17

## Tech debt

**Overly permissive error handling in client-side JSON parsing:**
- Issue: Multiple client components silence JSON parse errors with `.catch(() => ({}))`, returning empty objects instead of properly handling parse failures
- Files: `src/app/setup/page.tsx`, `src/app/settings/ai/page.tsx`, `src/app/dashboard/apps/[appId]/testflight/groups/[groupId]/page.tsx`, `src/app/dashboard/apps/[appId]/testflight/feedback/page.tsx`, `src/app/dashboard/apps/[appId]/testflight/info/page.tsx`
- Impact: Undetected API response corruption or malformed data silently converted to empty state; users see blank fields instead of error messages
- Fix approach: Create a helper for safe JSON parsing that logs failures and distinguishes between "no data" and "bad data". Propagate errors to toast notifications or error boundaries

**Untyped localizations in component filters:**
- Issue: Multiple components use `(l: any)` type assertions when filtering localization objects
- Files: `src/components/add-locale-dialog.tsx` (10+ occurrences), `src/components/remove-locale-dialog.tsx` (3 occurrences)
- Impact: Type safety lost; refactoring localization structure will not be caught by TypeScript
- Fix approach: Create `AscLocalization` type alias (from SDK types) and use throughout locale management components

**Unsafe number parsing in analytics aggregation:**
- Issue: Analytics code uses `parseInt()` and `parseFloat()` with fallback `|| 0` but doesn't validate field existence before parsing
- Files: `src/lib/asc/analytics-aggregation.ts` (8+ occurrences)
- Impact: Silent loss of precision; CSV row structure changes will go unnoticed
- Fix approach: Validate row structure with Zod schema before aggregation; use `Number()` for type safety

**Generic Record<string, unknown> patterns over typed objects:**
- Issue: 56 uses of `Record<string, unknown>` throughout codebase; often seen with type assertions (`as Record<string, unknown>`)
- Files: Widespread across API helpers and utilities
- Impact: Type information lost; IDE autocomplete unavailable; refactoring errors invisible
- Fix approach: Create specific interfaces for each API response shape; use discriminated unions for polymorphic data

**Overly large page components limiting maintainability:**
- Issue: Several page components exceed 800 lines, mixing state management, API calls, and UI rendering
- Files: `src/app/dashboard/apps/[appId]/nominations/[nominationId]/page.tsx` (872 lines), `src/components/add-locale-dialog.tsx` (866 lines), `src/app/dashboard/apps/[appId]/details/page.tsx` (863 lines), `src/app/dashboard/apps/[appId]/testflight/groups/[groupId]/page.tsx` (812 lines)
- Impact: Difficult to refactor, test, or reason about data flow; high cognitive load per file
- Fix approach: Extract logic into custom hooks (e.g. `useLocaleForm`, `useNominationSubmit`); move state management to context; create composed subcomponents for sections

## Fragile areas

**Database migration safeguard is reactive, not preventive:**
- Files: `src/db/index.ts` (lines 40–47)
- Why fragile: The safeguard block runs `ALTER TABLE` statements after Drizzle's migrator, catching silent migration failures. However, it's a band-aid – the real issue is missing migration snapshots in prior releases. If a snapshot is missing from the journal, Drizzle will skip the migration entirely
- Safe modification: Before adding new migrations, verify the entire migration chain locally by deleting the database and starting fresh. Update `DB.md` to include a pre-commit test step
- Test coverage: No automated test for migration consistency; manual verification only
- Risk: A bad migration commit could break the app for users on old database versions

**Unref timer on background sync worker doesn't guarantee cleanup:**
- Files: `src/lib/sync/worker.ts` (lines 65–67)
- Why fragile: `schedule.timer.unref()` is called to allow the process to exit if only background timers are running, but it's optional (guarded with `if (schedule.timer.unref)`). In environments where `unref` is not supported or timers are handled differently, cleanup may be incomplete
- Safe modification: Always verify `clearInterval()` is called in `stopSyncWorker()` before process shutdown (e.g. via electron's `will-quit` event)
- Test coverage: No test for timer cleanup on process exit
- Risk: Memory leaks if sync worker is stopped and restarted multiple times

**In-flight request deduplication relies on Promise identity:**
- Files: `src/lib/sync/worker.ts` (lines 18–41)
- Why fragile: The `inFlight` map stores Promises by schedule name. If a job fails and is retried before the Promise settles, the old promise is still awaited. If the retry happens after removal, two concurrent requests could execute
- Safe modification: Use a semaphore or flag per schedule (`isRunning` boolean) instead of Promise identity. Mark job complete only when resolved or rejected
- Test coverage: No test for concurrent sync behavior
- Risk: Duplicate API requests during network flakiness or rapid sync triggers

**localStorage used for non-persisted state without hydration guards:**
- Files: `src/lib/nav-state.ts`, `src/lib/insights-panel-context.tsx`, `src/lib/analytics-range.ts`
- Why fragile: localStorage is read synchronously during render in some cases. If localStorage is unavailable (e.g. private browsing) or slow, hydration mismatches occur
- Safe modification: Wrap all localStorage access in try-catch; always provide sensible defaults; only read during useEffect
- Test coverage: No test for localStorage unavailability
- Risk: SSR hydration errors if localStorage is not available in test or deployment environment

**Empty catch blocks suppress error context:**
- Issue: 20+ empty `catch` blocks throughout codebase (no logging, just silent failure)
- Files: `src/app/settings/license/page.tsx`, `src/app/settings/ai/page.tsx`, `src/app/setup/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/apps/[appId]/testflight/feedback/page.tsx`
- Impact: Bugs hidden; hard to diagnose why features aren't working
- Fix approach: Log errors with context (file, operation, timestamp); always emit a toast or store error in error boundary

## Security considerations

**Session storage for locale selection is not encrypted:**
- Files: `src/lib/hooks/use-locale-management.ts`
- Risk: Locale preference is stored in sessionStorage (client-side). In a multi-user desktop app, a new user could inherit the previous user's locale selection if session is not fully cleared
- Current mitigation: Session clears on browser/Electron close; demo mode resets state
- Recommendations: Use IndexedDB with automatic expiry keys; clear all storage on setup/logout; audit all storage keys for sensitive data

**Empty credentials check in ASC client doesn't specify error type:**
- Files: `src/lib/asc/client.ts` (lines 49–55)
- Risk: Throws generic "No active ASC credentials configured" error even when credentials exist but are in demo mode. Could be misleading to users
- Current mitigation: Demo mode check is explicit (line 53–55)
- Recommendations: Return typed error with `{ reason: "no_credentials" | "demo_mode" }` to distinguish for UI feedback

**Type assertions in error parsing bypass safety:**
- Files: `src/lib/asc/errors.ts` (lines 33–57)
- Risk: Uses `as Record<string, unknown>` and `as string` without validation; malformed ASC error responses could corrupt error display
- Current mitigation: Catches JSON parse errors gracefully (line 62)
- Recommendations: Validate error response shape with Zod before casting

## Performance bottlenecks

**Three-tier cache system for analytics has stale-data window:**
- Problem: In-memory cache (map) is populated from SQLite on first access, then reused. If SQLite cache is stale (past TTL), in-memory cache is not invalidated
- Files: `src/lib/asc/analytics-reports.ts` (lines 31–42)
- Cause: No coordinated cache expiry between in-memory and SQLite tiers
- Improvement path: Move to single source of truth (SQLite with TTL check); clear in-memory cache when database entry is refreshed

**Synchronous report ID normalization in search loop:**
- Problem: `normalizeReportName()` is called on every analytics request; involves regex on every iteration
- Files: `src/lib/asc/analytics-reports.ts` (lines 27–29)
- Cause: No memoization of report name -> ID mapping
- Improvement path: Pre-compute and cache normalized names at discovery time

**Locale filtering with JSON.stringify for equality checks:**
- Problem: `JSON.stringify()` called repeatedly in component render to compare arrays
- Files: `src/app/dashboard/apps/[appId]/nominations/[nominationId]/page.tsx` (lines 83–87)
- Cause: Fallback to string comparison instead of deep equality check
- Improvement path: Use `useCallback` and `useMemo` to memoize array comparisons; import `isEqual` from lodash-es for structural comparison

**Background sync creates new database connections per query:**
- Problem: Sync worker calls `listApps()`, `buildAnalyticsData()`, etc., each making fresh database queries
- Files: `src/lib/sync/jobs.ts` (lines 27–47)
- Cause: No connection pooling for in-process SQLite; each call acquires a lock
- Improvement path: Batch sync operations per app in a single transaction; reduce number of distinct queries

## Missing critical features

**No error reporting mechanism for background sync failures:**
- Problem: If sync fails (e.g. ASC API outage), user has no visibility. Errors logged to console only
- Blocks: Users don't know if their data is stale
- Priority: High – consider periodic "last successful sync" indicator on dashboard

**No timeout handling for long-running ASC API requests:**
- Problem: `ascFetch()` has retry logic but no overall timeout; a slow response could hang indefinitely
- Blocks: Users forced to restart app if request stalls
- Priority: High – add max timeout (e.g. 30s) before abandoning request

**Analytics data requests don't decompose by date range:**
- Problem: Fetching a year of analytics downloads all segments, no pagination
- Blocks: Large apps with heavy download history may timeout
- Priority: Medium – implement cursor-based pagination for analytics segments

## Test coverage gaps

**No unit tests for database migrations:**
- What's not tested: Fresh database creation; migration from old schema to new; safeguard fallback
- Files: `src/db/index.ts`, `drizzle/` migrations
- Risk: Breaking schema changes go undetected until user upgrades
- Priority: High – add test that creates a fresh SQLite database and verifies all tables exist

**No integration tests for ASC API error handling:**
- What's not tested: Retry behavior on 429/5xx; JSON parse failures; malformed error responses
- Files: `src/lib/asc/client.ts`, `src/lib/asc/errors.ts`
- Risk: Error handling code paths are untested; failures could cascade
- Priority: High – mock ASC responses with MSW; test each error category

**No tests for localStorage availability:**
- What's not tested: Behavior when localStorage is disabled; hydration with missing keys
- Files: `src/lib/nav-state.ts`, `src/lib/analytics-range.ts`
- Risk: SSR hydration errors in certain environments
- Priority: Medium – add test that disables localStorage and verifies fallback behavior

**No E2E test for multi-credential switching:**
- What's not tested: Switching active ASC credential; token reset behavior
- Files: `src/lib/asc/client.ts`, `src/app/settings/` pages
- Risk: Credential switching could fail silently
- Priority: Medium – add E2E test for add/remove/select credential workflows

**No tests for locale management across add/remove flows:**
- What's not tested: Add locale for one version then remove; locales not propagating between versions
- Files: `src/components/add-locale-dialog.tsx`, `src/components/remove-locale-dialog.tsx`
- Risk: Locale state inconsistency
- Priority: Medium – test full add/remove/select/translate workflow end-to-end

## Scaling limits

**In-memory cache unbounded for large apps:**
- Current capacity: Map stores report IDs and request IDs by app; grows with number of apps
- Limit: ~10k apps before memory pressure becomes visible (assumes 100 report requests per app)
- Scaling path: Use LRU cache with size limit; or flush in-memory cache hourly and reload from SQLite

**Console logging has no log rotation or level control:**
- Current capacity: 111 console.log statements throughout codebase; Electron logs accumulate indefinitely
- Limit: Logs grow unbounded; filesystem fills over weeks of usage
- Scaling path: Use structured logging library (pino, winston); implement log rotation and levels (warn, error only in production)

**SQLite WAL files not cleaned up in app lifecycle:**
- Current capacity: WAL mode creates `-wal` and `-shm` files on first write
- Limit: Files not explicitly deleted on app shutdown; accumulate over multiple sessions
- Scaling path: Run `PRAGMA wal_checkpoint(TRUNCATE)` on app shutdown; verify WAL file cleanup

## Dependencies at risk

**No version constraints on critical transitive dependencies:**
- Issue: `better-sqlite3` pinned but its binary dependencies (node-gyp, Python) not locked
- Impact: Build failures in CI if native module compile environment changes
- Migration plan: Use `pnpm` with lockfile enforcement; pin Node version in CI; test build in Docker

**Electron version pinned at 27.x, behind current release (30+):**
- Issue: Three major versions behind; security patches may not be backported
- Impact: Vulnerabilities in chromium or Node.js embedded in Electron 27
- Migration plan: Schedule migration to Electron 30 LTS; test signing and notarization flow first

---

*Concerns audit: 2026-03-17*
