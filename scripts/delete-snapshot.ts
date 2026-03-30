/**
 * Delete the dead ONE_TIME_SNAPSHOT and let the app recreate it.
 * Run: npx tsx scripts/delete-snapshot.ts
 */

import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

async function main() {
  const keyPem = fs.readFileSync(process.env.ASC_KEY_PATH!, "utf-8");
  const key = await jose.importPKCS8(keyPem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.ASC_KEY_ID!, typ: "JWT" })
    .setIssuer(process.env.ASC_ISSUER_ID!)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60)
    .setAudience("appstoreconnect-v1")
    .sign(key);

  const snapshotId = "4e052083-8419-4780-a1fc-cbdcdb44ed05";
  console.log(`Deleting dead ONE_TIME_SNAPSHOT ${snapshotId}...`);

  const res = await fetch(
    `https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/${snapshotId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (text) console.log(`Response: ${text.slice(0, 300)}`);

  if (res.status === 204 || res.status === 200) {
    console.log("\nDone! The app will create a fresh snapshot on the next analytics refresh.");
    console.log("Apple takes 24-48 hours to populate the new snapshot with historical data.");
  }
}

main().catch(console.error);
