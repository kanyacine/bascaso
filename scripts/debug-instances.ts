/**
 * Debug analytics instances – list all report requests and their instance date ranges.
 * Run: npx tsx scripts/debug-instances.ts
 */

import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const KEY_PATH = requireEnv("ASC_KEY_PATH");
const KEY_ID = requireEnv("ASC_KEY_ID");
const ISSUER_ID = requireEnv("ASC_ISSUER_ID");
const APP_ID = requireEnv("ASC_APP_ID");
const BASE = "https://api.appstoreconnect.apple.com";

async function makeToken(): Promise<string> {
  const keyPem = fs.readFileSync(KEY_PATH, "utf-8");
  const key = await jose.importPKCS8(keyPem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: KEY_ID, typ: "JWT" })
    .setIssuer(ISSUER_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60)
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

async function ascApi(path: string, token: string) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  HTTP ${res.status}: ${text.slice(0, 300)}`);
    return null;
  }
  return res.json();
}

async function main() {
  const token = await makeToken();

  // 1. List all report requests
  console.log(`\n=== Report requests for app ${APP_ID} ===\n`);
  const requests = await ascApi(`/v1/apps/${APP_ID}/analyticsReportRequests`, token);
  if (!requests?.data?.length) {
    console.log("No report requests found");
    return;
  }

  for (const req of requests.data) {
    const a = req.attributes;
    console.log(`  ${req.id} | type=${a.accessType} | stopped=${a.stoppedDueToInactivity ?? "N/A"}`);
  }

  // 2. For each request, check App Downloads Standard instances
  console.log(`\n=== Instance date ranges (App Downloads Standard, DAILY) ===\n`);

  for (const req of requests.data) {
    const { accessType } = req.attributes;
    console.log(`--- ${accessType} (${req.id}) ---`);

    const reports = await ascApi(
      `/v1/analyticsReportRequests/${req.id}/reports?filter[category]=COMMERCE`,
      token
    );
    if (!reports?.data?.length) {
      console.log("  No COMMERCE reports\n");
      continue;
    }

    const dlReport = reports.data.find(
      (r: any) => r.attributes.name === "App Downloads Standard"
    );
    if (!dlReport) {
      console.log("  No App Downloads Standard report\n");
      continue;
    }

    // Paginate all instances
    const allInstances: any[] = [];
    let url: string | null = `/v1/analyticsReports/${dlReport.id}/instances?filter[granularity]=DAILY&limit=200`;
    while (url) {
      const resp = await ascApi(url, token);
      if (!resp?.data) break;
      allInstances.push(...resp.data);
      url = resp.links?.next ?? null;
    }

    if (allInstances.length === 0) {
      console.log("  No instances\n");
      continue;
    }

    const dates = allInstances.map((i: any) => i.attributes.processingDate).sort();
    console.log(`  Total instances: ${allInstances.length}`);
    console.log(`  Earliest: ${dates[0]}`);
    console.log(`  Latest:   ${dates[dates.length - 1]}`);
    console.log(`  All dates: ${dates.join(", ")}\n`);
  }

  console.log("=== DONE ===");
}

main().catch(console.error);
