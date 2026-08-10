import { defineConfig } from "@playwright/test";
import path from "node:path";

// Scratch DB per run (wiped by global-setup); the key only needs to be valid 64-char hex.
const E2E_ENV = {
  DATABASE_PATH: path.join(__dirname, "e2e", ".tmp", "e2e.db"),
  ENCRYPTION_MASTER_KEY: "e2e0".repeat(16),
};

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3123",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev --port 3123",
    url: "http://127.0.0.1:3123/api/health",
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
