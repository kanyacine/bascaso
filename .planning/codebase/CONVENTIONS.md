# Coding conventions

**Analysis date:** 2026-03-17

## Naming patterns

**Files:**
- Kebab-case for all files and directories (`api-helpers.ts`, `test-db.ts`, `user-profile.tsx`)
- Route files: `route.ts` for Next.js API endpoints
- Page files: `page.tsx` for Next.js app router pages
- Component files: descriptive kebab-case (`add-tester-dialog.tsx`, `device-category-tabs.tsx`)
- Test files: match source module name with `.test.ts` suffix (`api-helpers.test.ts`, `format.test.ts`)
- Utility files: descriptive names like `format.ts`, `cache.ts`, `encryption.ts`

**Functions and variables:**
- camelCase for all function and variable names (`errorJson`, `parseBody`, `createTestDb`, `formatDateShort`)
- Handler functions: `handle[Action]` pattern (`handlePickApp`, `handleRefresh`)
- Fetch functions: `fetch[Resource]` pattern (`fetchAnalytics`, `fetchVersions`)
- Getter/setter: `get[Resource]`, `set[Resource]`, `cache[Operation]` (`cacheGet`, `cacheSet`, `cacheInvalidate`)

**Types and interfaces:**
- PascalCase for all types, interfaces, and enums
- Use `type` keyword for type aliases: `type App = { ... }`
- Use `interface` for object shapes: `interface AppAnalytics { ... }`
- Prefix optional types with capital letters: `type ChartConfig = { ... }`

**Constants:**
- UPPERCASE_WITH_UNDERSCORES for file-level constants (`VALID_KEY`, `MAX_LOG_SIZE`, `ALGORITHM`)
- Local constants in functions: camelCase (`mockLogDir`, `testDb`)

## Code style

**Formatting:**
- Configured: ESLint 9 + Next.js core rules
- Line length: No hard limit enforced (uses natural breaks)
- Indentation: 2 spaces (inherited from Node.js default)
- Trailing commas: enabled in multi-line structures
- Semicolons: required at end of statements

**Linting:**
- ESLint config: `eslint.config.mjs` (flat config format)
- Rules: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Special rule: `@next/next/no-img-element: off` (Electron app, not Next.js image optimization)
- Ignored paths: `.next/`, `out/`, `build/`, `electron/`, `scripts/`, `coverage/`, `next-env.d.ts`

**TypeScript:**
- Target: ES2017 with strict mode enabled
- Module resolution: `bundler`
- JSX: `react-jsx` (React 19 automatic runtime)
- Path aliases: `@/*` → `./src/*`

## Import organization

**Order:**
1. Node.js built-in modules (`import fs from "node:fs"`)
2. External packages (`import { z } from "zod"`, `import { describe, it } from "vitest"`)
3. Next.js modules (`import { NextResponse } from "next/server"`)
4. Absolute imports using `@` alias (`import { errorJson } from "@/lib/api-helpers"`)
5. Type imports when needed: `import type { App } from "@/lib/apps-context"`

**Path aliases:**
- `@/` resolves to `./src/`
- Use consistently: `@/lib/`, `@/app/`, `@/components/`, `@/db/`

**Imports in tests:**
- Always import from `@/` paths (module mapping via vitest)
- Import test utilities from `../helpers/`
- Use destructuring for multiple imports from the same module

## Error handling

**Pattern:** Explicit error type checks with `instanceof`
```typescript
try {
  await operation();
} catch (err) {
  if (err instanceof AscApiError) {
    // Handle API errors
  } else if (err instanceof Error) {
    // Handle standard errors
  } else {
    // Handle unknown errors
  }
}
```

**Fallbacks:** Always provide sensible fallbacks for unknown errors
```typescript
const message = err instanceof Error ? err.message : "Unknown error";
const syncErr = {
  operation: "update",
  locale,
  message: err instanceof Error ? err.message : "failed",
};
```

**Response builders:** Use helper functions to construct consistent error responses
- `errorJson(err, status?, fallback?)` for API responses
- Include structured error details (category, ascErrors, method, path) for ASC API errors
- Return HTTP status codes: 400 for validation, 404 for not found, 409 for conflicts, 502 for service errors

## Logging

**Framework:** `console.log()`, `console.warn()`, `console.error()` (logged to file in Electron)

**Patterns:**
- Use format strings for structured logging: `console.log("[function] key=%s value=%d", key, value)`
- Always include a function/context prefix in brackets: `[syncLocalizations]`, `[cacheGet]`
- Log at operation start: `console.log("[syncLocalizations] parentId=%s locales=%s", ...)`
- Log at operation end: `console.log("[syncLocalizations] all ops done, errors=%d", ...)`
- Log on errors: `console.log("[syncLocalizations] returning 207 with errors:", JSON.stringify(errors))`

**Levels:**
- `console.log()`: informational, operation flow, important state changes
- `console.warn()`: recoverable issues, degraded mode, warnings
- `console.error()`: failure conditions, exceptions

## Comments

**When to comment:**
- Block comments for complex algorithms: `/** Sync localizations: update existing, create new, delete removed. */`
- Inline comments for non-obvious logic: `// entry=1 means proxy redirected here on app launch – restore last URL`
- Doc comments for public functions: start with verb, explain intent and behavior
- Avoid obvious comments: skip commenting what the code clearly states

**JSDoc/TSDoc:**
- Use for public API functions, always include parameter and return documentation
- Format: `/** [Verb] [what it does]. [How it works]. */`
- Example: `/** Format a date string as "27 Jan" (day + short month, no year). */`
- For typed parameters: `/** Parse a JSON request body and validate it against a Zod schema. Returns either the parsed data or an error Response (400). */`

## Function design

**Size:** Keep functions focused and under 50 lines where practical. Longer functions acceptable for complex workflows (e.g., `syncLocalizations` is 90 lines but cohesive).

**Parameters:**
- Use object destructuring for multiple related parameters: `function syncLocalizations(request: Request, parentId: string, mutations: SyncLocalizationsMutations)`
- Prefer interfaces over many parameters: `interface SyncLocalizationsMutations { update: ...; create: ...; }`
- Default parameters for optional values: `formatDuration(seconds: number, compact = false)`

**Return values:**
- Explicitly type returns: `Promise<NextResponse>`, `Record<string, AppAnalytics>`
- Return union types for multiple outcomes: `Promise<T | Response>` (data or error response)
- Use discriminated unions for complex results: `{ ok: true; createdIds: Record<string, string> } | { ok: false; errors: SyncError[] }`

**Async/await:**
- Always use `async/await` instead of `.then().catch()` in function bodies
- Use `.catch(...)` for non-critical failures: `fetch(...).catch(() => null)`
- Handle errors explicitly in async contexts: wrap in try/catch or check response status

## Module design

**Exports:**
- Use named exports for all functions and types (avoid default exports)
- Export types alongside implementation: `export function foo()`, `export type Foo = { ... }`
- Group related exports by semantic meaning: all cache functions together, all formatters together

**Barrel files:**
- Use `index.ts` files to re-export from subdirectories: `export * from "./utils"`
- Common pattern in `src/lib/asc/` subdirectories for test file organization

**File organization:**
- One module per file (one clear responsibility)
- Related utilities in the same directory: `src/lib/asc/` for all App Store Connect functions
- Tests co-located near source: `tests/unit/` mirrors `src/lib/` structure

## Tailwind CSS and styling

**Framework:** Tailwind v4 with custom CSS layer components

**Pattern:** Use reusable `.section-title` and other component classes in `globals.css`
```css
@layer components {
  .section-title {
    @apply text-sm font-bold tracking-tight;
  }
}
```

**Usage:** Apply these classes instead of inline utility combinations
```tsx
<h2 className="section-title">Settings</h2>
```

**Icons:** `@phosphor-icons/react` only (never lucide-react)

---

*Convention analysis: 2026-03-17*
