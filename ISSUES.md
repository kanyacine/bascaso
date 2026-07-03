# Known issues

Codebase audit, 2026-07-03. Ranked by how much each is worth fixing.

## Worth fixing

### 1. Coverage gate is failing
`npx vitest run --coverage` errors: `src/lib` is at ~96% against its 100% thresholds. The gap is `src/lib/i18n` – `use-analytics-labels.ts`, `use-asc-labels.ts`, `use-review-field-labels.ts`, `resolve-server-locale.ts` at 0%, `locale-context.tsx` at 7%, `resolve-locale.ts` at 62%, `locale-cookies.ts` at 64%. The gate has been red since the i18n work landed.

### 2. src/mcp untested and invisible to the coverage gate
`src/mcp/tools/update-app.ts` (232 lines), `translate.ts` (253), `manage-locales.ts` (198), `get-app.ts` (146) have zero tests, and `src/mcp` is not in `vitest.config.ts` `coverage.include` (only `src/lib` and `src/app/api` are). This code writes to App Store Connect and is reachable in production via the MCP settings route. Also untested: `startMcpServer`/`stopMcpServer`/`isMcpRunning` in `src/mcp/index.ts`. Fix: add `src/mcp` to coverage include, then write the tests.

### 3. Zod validation missing on ~18 mutation routes
docs/BACKEND.md mandates Zod on every route input, but many handlers do an unchecked `await request.json() as {...}` cast:
- `src/app/api/changes/publish/route.ts:7`
- `src/app/api/app-preferences/review-mode/route.ts:9`
- `src/app/api/apps/[appId]/attributes/route.ts:22`
- `src/app/api/apps/[appId]/info/[appInfoId]/categories/route.ts:22`
- `src/lib/api-helpers.ts:167` (`syncLocalizations`, shared by several PUT routes – fixing this one covers multiple routes)
- ~14 more routes in `src/app/api/**` (changes/[appId]/[section], info/localizations, testflight feedback/groups, versions submit/release/review, screenshots reorder/sets, …)

Related: `src/app/api/screenshot-download/route.ts:34` reflects the unvalidated `name` query param into the `Content-Disposition` header.

### 4. CSP includes 'unsafe-eval'
`next.config.ts:22` ships `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, but docs/BACKEND.md specifies no `unsafe-eval`. Either it is needed (then document why) or drop it.

### 5. ~40 raw label headings instead of .section-title
docs/UI.md mandates `<h3 className="section-title">` for form headings; these use `<label className="text-sm text-muted-foreground">` instead:
- `src/app/dashboard/apps/[appId]/testflight/info/page.tsx` – 428, 455, 464, 474, 516, 524, 532, 540, 552, 584, 593
- `src/app/dashboard/apps/[appId]/details/page.tsx` – 688, 708, 733, 747, 822, 846, 920, 935
- `src/app/setup/page.tsx` – 344, 383, 396, 460, 517, 543, 562
- `src/app/dashboard/apps/[appId]/review/page.tsx` – 319, 329, 351, 359, 367, 376
- `src/components/layout/add-account-dialog.tsx` – 179, 192, 204, 258
- `src/components/local-server-fields.tsx` – 81, 106
- `src/app/dashboard/apps/[appId]/store-listing/_components/locale-fields.tsx` – 267, 280

Also: `review-changes/page.tsx:348` hand-styled `<h2>` instead of `.section-title`; `dashboard/page.tsx:372` uses `py-16` padding as a centering hack instead of the `flex-1` chain.

### 6. Dead developer scratch files committed to git
Unreferenced by anything: `scripts/debug-analytics.ts`, `debug-crash-data.ts`, `debug-impressions.ts`, `debug-instances.ts`, `debug-perf-crashes.ts`, `explore-analytics.ts`, `explore-app-data.ts`, `explore-review-summaries.ts`, `explore-testflight.ts`, `delete-snapshot.ts`, and `.itsypad-preview.html` in the repo root. Delete them.

### 7. Copy-pasted any typing in locale/AI dialogs
- `src/components/remove-locale-dialog.tsx:65,68,211` and `add-locale-dialog.tsx:272-308,523` parse localizations as `(l: any)` with eslint-disables; the proper type exists in `src/lib/asc/localizations.ts`.
- `localeData: Record<string, Record<string, any>>` duplicated in `bulk-ai-dialog.tsx:31`, `bulk-all-ai-dialog.tsx:34`, `magic-wand-button.tsx:63`, `src/lib/hooks/use-bulk-ai.ts:29`. Type it once, import it.
- The locale-array filtering block (`.some((l) => l.attributes.locale === locale)`) is duplicated between `remove-locale-dialog.tsx` and `add-locale-dialog.tsx` – extract a helper.

### 8. 16 API routes hand-roll error handling
53 of 69 route files use `errorJson`/`parseBody` from `src/lib/api-helpers.ts`; the other 16 re-implement `request.json().catch(() => null)` + inline `NextResponse.json({ error }, ...)` (e.g. `refresh/route.ts:27-34`, `nominations/route.ts:79-81`). Route them through the helpers.

## Minor

- Stale-`t` closures: `useEffect`/`useCallback` missing the translation function `t` in deps at `src/components/layout/store-listing/page.tsx:707`, `src/components/ai-compare-dialog.tsx:102`, `src/components/layout/insights-panel.tsx:279` – strings may not update on live language switch. Four more exhaustive-deps warnings at `keywords-context.tsx:274`, `screenshots/page.tsx:87`, `testflight/[buildId]/page.tsx:111`, `app-sidebar.tsx:180`.
- Lint script does not enforce warnings: `"lint": "eslint"` with no `--max-warnings 0`, so the 11 current warnings pass silently.
- DB safety net incomplete: `src/db/index.ts:40-46` omits `analytics_backfill` and `feedback_completed` from the `CREATE TABLE IF NOT EXISTS` block that docs/DB.md says covers every table.
- docs/BACKEND.md schema section is stale: it documents six per-resource cache tables but the code uses one generic `cache_entries` table. The code is fine; update the doc.
- `src/app/api/translate/google/route.ts` has zero tests despite real validation/error logic.
- `src/components/layout/header-version-picker.tsx:839` – unused destructured `label`.
- `src/components/locale-picker.tsx:56` – `sectionLabels` recreated every render, defeating the `useMemo` at line 89.

## Verified clean

Versioning consistency (version.ts / package.json / forge.config.ts / CHANGELOG), i18n key parity across all five locales (1103 keys each), no middleware.ts, no hardcoded /dashboard in Electron, secrets never reach the client, SQL fully parameterized, migrations complete, Electron hardening (contextIsolation, no nodeIntegration, navigation restricted), `tsc --noEmit` clean, no lucide imports outside `src/components/ui/`, no em dashes or Title Case in UI strings, no font overrides, no TODO/FIXME comments.
