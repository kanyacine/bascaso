import { expect, test } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, ".tmp", "shot.png");
const EDITOR_URL = "/dashboard/apps/demo-app-weatherly/screenshots/editor";

test.describe.configure({ mode: "serial" });

test("demo setup", async ({ request }) => {
  const res = await request.post("/api/setup/demo");
  expect(res.status()).toBe(200); // fresh DB – 403 would mean a stale e2e/.tmp
});

test("create – edit – export – persist", async ({ page }) => {
  await page.goto(EDITOR_URL);

  // Import a screenshot through the strip's hidden multi-file input
  await page.locator('input[type="file"][multiple]').setInputFiles(FIXTURE);
  await expect(page.locator("canvas").first()).toBeVisible();

  // Edit the headline (the text tab is the third icon-only trigger)
  await page.getByRole("tab", { name: "Text" }).click();
  const headline = page.getByPlaceholder("Headline").first();
  await headline.fill("Hello E2E");

  // Autosave settles (800ms debounce) – the save state label flips to "Saved". The status role
  // picks the live label out of the hidden ones that reserve its width.
  // Filtered: the status role also matches dnd-kit's live region, which stays empty.
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 5_000 });

  // Export as zip: the destination defaults to ASC, which demo mode has no editable version for,
  // so the dialog falls back to the zip.
  await page.getByRole("button", { name: "Export", exact: true }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  // Demo mode has no ASC to probe, so the doc starts on the default working formats.
  expect(download.suggestedFilename()).toBe("screenshots_en-US_APP_IPHONE_65.zip");

  // Persistence – reload and the headline is still there
  await page.reload();
  await page.getByRole("tab", { name: "Text" }).click();
  await expect(page.getByPlaceholder("Headline").first()).toHaveValue("Hello E2E");
});
