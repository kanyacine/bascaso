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

  // Autosave settles (800ms debounce) – the save state label flips to "Saved"
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5_000 });

  // Export as zip (destination defaults to zip; ASC is disabled in demo without an editable version)
  await page.getByRole("button", { name: "Export", exact: true }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("screenshots_en-US_APP_IPHONE_67.zip");

  // Persistence – reload and the headline is still there
  await page.reload();
  await page.getByRole("tab", { name: "Text" }).click();
  await expect(page.getByPlaceholder("Headline").first()).toHaveValue("Hello E2E");
});
