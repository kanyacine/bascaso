# Testing patterns

**Analysis date:** 2026-03-17

## Test framework

**Runner:**
- Vitest 4.0.18
- Config: `vitest.config.ts`
- Environment: Node.js (not browser, even for Next.js app code)
- Global test utilities enabled (`globals: true` allows `describe`, `it`, `expect` without imports)

**Assertion library:**
- Built-in: `vitest` assertions (`.toBe()`, `.toEqual()`, `.toHaveLength()`, `.toContain()`, etc.)

**Run commands:**
```bash
npm test              # Run all tests (vitest run)
npm run test:watch   # Watch mode (vitest)
npm run test:coverage # Coverage report with v8 provider
```

**Coverage configuration:**
- Provider: v8
- Include paths: `src/lib/**/*.ts` and `src/app/api/**/*.ts`
- Exclude: `src/lib/utils.ts`, `src/lib/hooks/**`
- Thresholds for `src/lib/**/*.ts`:
  - Lines: 100%
  - Functions: 100%
  - Branches: 99%
  - Statements: 100%

## Test file organization

**Location:**
- Separate from source: `tests/unit/` and `tests/e2e/` directories
- Mirrors source structure: `tests/unit/lib/` for `src/lib/` tests, `tests/unit/app/api/` for API routes
- Test data helpers: `tests/helpers/`

**Naming:**
- Match source filename with `.test.ts` suffix: `format.ts` → `format.test.ts`, `api-helpers.ts` → `api-helpers.test.ts`
- Subdirectory nesting: `tests/unit/asc/` for `src/lib/asc/` modules

**Structure:**
```
tests/
├── unit/
│   ├── api-helpers.test.ts
│   ├── cache.test.ts
│   ├── asc/
│   │   ├── client.test.ts
│   │   ├── testflight/
│   │   │   ├── builds.test.ts
│   │   │   ├── testers.test.ts
│   ├── ai/
│   │   ├── provider-factory.test.ts
│   │   ├── settings.test.ts
├── helpers/
│   └── test-db.ts
└── e2e/
```

## Test structure

**Suite organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("api-helpers", () => {
  describe("errorJson", () => {
    it("extracts message from Error instances", async () => {
      const res = errorJson(new Error("something broke"));
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.error).toBe("something broke");
    });
  });

  describe("parseBody", () => {
    it("returns parsed data for valid input", async () => {
      // ...
    });
  });
});
```

**Patterns:**
- Top-level `describe()` block for module/file
- Nested `describe()` blocks for functions within the module
- Each function gets its own `describe()` block
- One responsibility per `it()` test (single assertion focus when possible)

**Async testing:**
```typescript
it("returns parsed data for valid input", async () => {
  const result = await parseBody(makeRequest({ name: "Alice" }), schema);
  expect(result).toEqual({ name: "Alice" });
});
```
- Mark `it()` callback as `async` when testing async code
- Use `await` to wait for promises
- Test helpers return promises: `parseBody()` returns `Promise<T | Response>`

**Setup and teardown:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    fs.mkdirSync(mockLogDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(mockLogDir, { recursive: true, force: true });
  });

  it("initializes logger", () => {
    // test body
  });
});
```
- Use `beforeEach()` to set up test fixtures before each test
- Use `afterEach()` to clean up (remove files, clear database, reset mocks)
- Keep setup/teardown scoped to what's needed

## Mocking

**Framework:** `vi` from vitest

**Module mocking:**
```typescript
import { describe, it, expect, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { cacheGet, cacheSet } from "@/lib/cache";

describe("cache", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });
});
```
- Mock must occur before imports of modules that depend on the mocked module
- Use `vi.mock()` for static module replacement
- Return a getter for dynamic test instances: `get db() { return testDb; }`

**Function mocking:**
```typescript
const mutations: SyncLocalizationsMutations = {
  update: vi.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>()
    .mockResolvedValue(undefined),
  create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>()
    .mockResolvedValue("new-id"),
  delete: vi.fn<(id: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  invalidateCache: vi.fn(),
};
```
- Use `vi.fn()` to create mock functions
- Use `vi.fn<T>()` to type the mock with generics
- Chain `.mockResolvedValue()` for async functions returning data
- Chain `.mockRejectedValue()` for functions that should throw
- Use `.toHaveBeenCalledWith()` to assert calls

**Mock verification:**
```typescript
expect(mutations.update).toHaveBeenCalledWith("loc-1", { title: "Hello" });
expect(mutations.create).not.toHaveBeenCalled();
expect(mutations.invalidateCache).toHaveBeenCalled();
```

**Environment variable mocking:**
```typescript
const original = { ...process.env };
delete process.env.ENCRYPTION_MASTER_KEY;
Object.assign(process.env, { ENCRYPTION_MASTER_KEY: VALID_KEY });
try {
  return await import("@/lib/env");
} finally {
  process.env = original;
}
```
- Save original env before modification
- Restore after use in try/finally block
- Use `vi.resetModules()` to reimport modules with new env vars

## Fixtures and factories

**Test data:**
Database fixtures use in-memory SQLite with helper factory:
```typescript
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

beforeEach(() => {
  testDb = createTestDb();
});

it("inserts and queries a credential", () => {
  const id = ulid();
  const now = new Date().toISOString();

  testDb.insert(schema.ascCredentials).values({
    id,
    issuerId: "69a6de7e-6b7b-47e3-e053-5b8c7c11a4d1",
    keyId: "2X9R4HXF34",
    encryptedPrivateKey: "encrypted-data",
    iv: "random-iv",
    authTag: "tag",
    encryptedDek: "encrypted-dek",
    createdAt: now,
  }).run();

  const rows = testDb.select().from(schema.ascCredentials).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id, issuerId: "..." });
});
```

**Request fixtures:**
```typescript
function makeRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("returns parsed data for valid input", async () => {
  const result = await parseBody(
    makeRequest({ name: "Alice", age: 30 }),
    schema
  );
  expect(result).toEqual({ name: "Alice", age: 30 });
});
```

**Helper functions:**
Create helper factories to reduce boilerplate:
```typescript
function makeMutations(overrides?: Partial<SyncLocalizationsMutations>): SyncLocalizationsMutations {
  return {
    update: vi.fn<...>().mockResolvedValue(undefined),
    create: vi.fn<...>().mockResolvedValue("new-id"),
    delete: vi.fn<...>().mockResolvedValue(undefined),
    invalidateCache: vi.fn(),
    ...overrides,
  };
}

it("handles mixed operations", async () => {
  const mutations = makeMutations({
    create: vi.fn<...>().mockResolvedValue("custom-id"),
  });
  // use mutations
});
```

**Location:**
- Reusable helpers: `tests/helpers/test-db.ts`
- Test-local helpers: defined within `.test.ts` file if only used there
- Use factories to allow test-specific overrides

## Coverage

**Requirements:** 100% line and function coverage for `src/lib/**/*.ts`, 99% branch coverage

**View coverage:**
```bash
npm run test:coverage
```
Output goes to `coverage/` directory (not committed).

**Thresholds:**
- Enforced only for `src/lib/**/*.ts` files (strict testing requirement for core utilities)
- API routes (`src/app/api/**/*.ts`) included but lower thresholds
- Hooks (`src/lib/hooks/**`) and utilities (`src/lib/utils.ts`) excluded

## Test types

**Unit tests:**
- Scope: Single function or small module in isolation
- Location: `tests/unit/`
- Use mocks for external dependencies (database, network, file system)
- Test normal path, error cases, and edge cases
- Example: `tests/unit/format.test.ts` tests formatting utilities in isolation
- Example: `tests/unit/api-helpers.test.ts` tests request parsing and error handling with mocked ASC client

**Integration tests:**
- Scope: Multiple modules working together with real database
- Location: `tests/unit/` but may use `createTestDb()` for real in-memory SQLite
- Example: `tests/unit/db.test.ts` tests database schema and queries directly
- Example: `tests/unit/cache.test.ts` mocks the actual db module but tests cache layer reading/writing

**E2E tests:**
- Not yet implemented (`tests/e2e/` exists but no tests)
- Would test complete user workflows in real environment

## Common patterns

**Error testing:**
```typescript
it("returns 400 Response for invalid JSON", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    body: "not json",
  });
  const result = await parseBody(req, schema);
  expect(result).toBeInstanceOf(Response);
  const body = await (result as Response).json();
  expect(body.error).toBe("Invalid JSON body");
});
```
- Use `toBeInstanceOf()` to check response vs data
- Cast result and extract response body to verify details
- Test both error status and error message

**Partial failure testing:**
```typescript
it("returns 207 with errors on partial failure", async () => {
  const mutations = makeMutations({
    update: vi.fn<...>().mockRejectedValue(new Error("API down")),
  });
  const req = makePutRequest({
    locales: { "en-US": { title: "Fail" } },
    originalLocaleIds: { "en-US": "loc-1" },
  });
  const res = await syncLocalizations(req, "p1", mutations);
  const body = await res.json();

  expect(res.status).toBe(207);
  expect(body.ok).toBe(false);
  expect(body.errors).toEqual([
    { operation: "update", locale: "en-US", message: "API down" },
  ]);
  expect(mutations.invalidateCache).toHaveBeenCalled();
});
```
- Test that operations complete despite partial failures
- Verify error details are collected
- Check cache invalidation still happens on partial failure

**Type assertions:**
```typescript
const mutations = makeMutations({
  create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>()
    .mockResolvedValue("created-42"),
});
```
- Always type mock functions with generic parameters
- Use exact signature types for accuracy
- Helps catch test setup errors early

---

*Testing analysis: 2026-03-17*
