/**
 * Explore all ASC app data needed for Bascaso dashboard pages.
 * Dumps JSON files to scripts/output/ for analysis.
 *
 * Run: npx tsx scripts/explore-app-data.ts
 */

import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const KEY_PATH = requireEnv("ASC_KEY_PATH");
const KEY_ID = requireEnv("ASC_KEY_ID");
const ISSUER_ID = requireEnv("ASC_ISSUER_ID");
const BASE = "https://api.appstoreconnect.apple.com";

const OUT_DIR = path.join(__dirname, "output");

// ─── Helpers ──────────────────────────────────────────────

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

let requestCount = 0;

async function get(token: string, path: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = `${BASE}${path}${qs}`;
  requestCount++;
  console.log(`  [${requestCount}] GET ${path}${qs}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  ✗ HTTP ${res.status}: ${text.slice(0, 300)}`);
    return null;
  }
  return res.json();
}

/** Paginate through all results for a given endpoint. */
async function getAll(token: string, path: string, params?: Record<string, string>) {
  const allData: any[] = [];
  const allIncluded: any[] = [];
  let url: string | null = `${BASE}${path}${params ? "?" + new URLSearchParams(params).toString() : ""}`;

  while (url) {
    requestCount++;
    console.log(`  [${requestCount}] GET ${url.replace(BASE, "")}`);
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  ✗ HTTP ${res.status}: ${text.slice(0, 300)}`);
      break;
    }
    const json: any = await res.json();
    if (json.data) allData.push(...(Array.isArray(json.data) ? json.data : [json.data]));
    if (json.included) allIncluded.push(...json.included);
    url = json.links?.next ?? null;
  }

  return { data: allData, included: allIncluded.length ? allIncluded : undefined };
}

function save(filename: string, data: any) {
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  const items = Array.isArray(data?.data) ? data.data.length : data?.data ? 1 : 0;
  const included = data?.included?.length ?? 0;
  console.log(`  → ${filename} (${items} items${included ? `, ${included} included` : ""})\n`);
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const token = await makeToken();
  console.log("Token generated ✓\n");

  // ═══════════════════════════════════════════════
  // 1. LIST ALL APPS
  // ═══════════════════════════════════════════════
  console.log("═══ APPS ═══");
  const apps = await get(token, "/v1/apps", {
    "fields[apps]": "name,bundleId,sku,primaryLocale,contentRightsDeclaration,isOrEverWasMadeForKids,subscriptionStatusUrl,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersion",
    "limit": "200",
  });
  save("apps.json", apps);

  if (!apps?.data?.length) {
    console.log("No apps found – exiting.");
    return;
  }

  // Pick the first app with most data (or first one)
  const appId = apps.data[0].id;
  const appName = apps.data[0].attributes.name;
  console.log(`\nUsing app: "${appName}" (${appId})\n`);

  // ═══════════════════════════════════════════════
  // 2. APP INFO (categories, age rating, etc.)
  // ═══════════════════════════════════════════════
  console.log("═══ APP INFOS ═══");
  const appInfos = await get(token, `/v1/apps/${appId}/appInfos`, {
    "include": "primaryCategory,secondaryCategory,primarySubcategoryOne,primarySubcategoryTwo,secondarySubcategoryOne,secondarySubcategoryTwo,ageRatingDeclaration",
    "fields[appInfos]": "appStoreState,appStoreAgeRating,brazilAgeRating,brazilAgeRatingV2,kidsAgeBand,state",
    "fields[appCategories]": "platforms,parent",
    // Let the API return all available age rating fields by not specifying fields[ageRatingDeclarations]
    "limit": "10",
  });
  save("app-infos.json", appInfos);

  // App info localizations
  if (appInfos?.data?.[0]) {
    const appInfoId = appInfos.data[0].id;
    console.log("═══ APP INFO LOCALIZATIONS ═══");
    const appInfoLocalizations = await get(token, `/v1/appInfos/${appInfoId}/appInfoLocalizations`, {
      "fields[appInfoLocalizations]": "locale,name,subtitle,privacyPolicyText,privacyPolicyUrl,privacyChoicesUrl",
    });
    save("app-info-localizations.json", appInfoLocalizations);
  }

  // ═══════════════════════════════════════════════
  // 3. APP STORE VERSIONS
  // ═══════════════════════════════════════════════
  console.log("═══ APP STORE VERSIONS ═══");
  const versions = await get(token, `/v1/apps/${appId}/appStoreVersions`, {
    "fields[appStoreVersions]": "versionString,appVersionState,appStoreState,platform,copyright,releaseType,earliestReleaseDate,downloadable,createdDate,reviewType",
    "include": "build,appStoreVersionSubmission,appStoreReviewDetail",
    "fields[builds]": "version,uploadedDate,processingState,minOsVersion,iconAssetToken",
    // appStoreVersionSubmissions has no public fields – just include it for the relationship
    "fields[appStoreReviewDetails]": "contactEmail,contactFirstName,contactLastName,contactPhone,demoAccountName,demoAccountPassword,demoAccountRequired,notes",
    "limit": "20",
  });
  save("versions.json", versions);

  // ═══════════════════════════════════════════════
  // 4. VERSION LOCALIZATIONS (for each version)
  // ═══════════════════════════════════════════════
  if (versions?.data?.length) {
    // Get localizations for the latest 3 versions
    for (const version of versions.data.slice(0, 3)) {
      const vId = version.id;
      const vStr = version.attributes.versionString;
      const platform = version.attributes.platform;
      console.log(`═══ LOCALIZATIONS: ${vStr} (${platform}) ═══`);

      const locs = await get(token, `/v1/appStoreVersions/${vId}/appStoreVersionLocalizations`, {
        "fields[appStoreVersionLocalizations]": "locale,description,keywords,marketingUrl,promotionalText,supportUrl,whatsNew",
      });
      save(`localizations-${vStr}-${platform}.json`, locs);

      // Screenshot sets for the first locale
      if (locs?.data?.[0]) {
        const locId = locs.data[0].id;
        const locale = locs.data[0].attributes.locale;
        console.log(`═══ SCREENSHOT SETS: ${vStr}/${locale} ═══`);

        const screenshotSets = await get(token, `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets`, {
          "include": "appScreenshots",
          "fields[appScreenshotSets]": "screenshotDisplayType",
          "fields[appScreenshots]": "fileSize,fileName,sourceFileChecksum,assetDeliveryState,assetToken",
        });
        save(`screenshot-sets-${vStr}-${locale}.json`, screenshotSets);
      }

      // App preview sets for the first locale
      if (locs?.data?.[0]) {
        const locId = locs.data[0].id;
        const locale = locs.data[0].attributes.locale;
        console.log(`═══ APP PREVIEW SETS: ${vStr}/${locale} ═══`);

        const previewSets = await get(token, `/v1/appStoreVersionLocalizations/${locId}/appPreviewSets`, {
          "include": "appPreviews",
          "fields[appPreviewSets]": "previewType",
          "fields[appPreviews]": "fileSize,fileName,previewFrameTimeCode,mimeType,videoUrl,assetDeliveryState,sourceFileChecksum,previewImage",
        });
        save(`preview-sets-${vStr}-${locale}.json`, previewSets);
      }
    }
  }

  // ═══════════════════════════════════════════════
  // 5. BUILDS (with beta details)
  // ═══════════════════════════════════════════════
  console.log("═══ BUILDS ═══");
  const builds = await get(token, "/v1/builds", {
    "filter[app]": appId,
    "sort": "-uploadedDate",
    "limit": "20",
    "fields[builds]": "version,uploadedDate,processingState,minOsVersion,usesNonExemptEncryption,expirationDate,expired,iconAssetToken,buildAudienceType,computedMinMacOsVersion",
    "include": "preReleaseVersion,buildBetaDetail,betaBuildLocalizations,icons",
    "fields[preReleaseVersions]": "version,platform",
    "fields[buildBetaDetails]": "autoNotifyEnabled,internalBuildState,externalBuildState",
    "fields[betaBuildLocalizations]": "locale,whatsNew",
    "fields[buildIcons]": "iconAsset,iconType",
  });
  save("builds.json", builds);

  // Individual build detail (first build)
  if (builds?.data?.[0]) {
    const buildId = builds.data[0].id;
    console.log(`═══ BUILD DETAIL: ${buildId} ═══`);

    // Beta groups for this build
    const buildGroups = await get(token, `/v1/builds/${buildId}/betaGroups`, {
      "fields[betaGroups]": "name,isInternalGroup,publicLinkEnabled,publicLink,feedbackEnabled,hasAccessToAllBuilds,createdDate",
    });
    save(`build-${buildId}-groups.json`, buildGroups);

    // Individual testers for this build
    const buildTesters = await get(token, `/v1/builds/${buildId}/individualTesters`, {
      "fields[betaTesters]": "firstName,lastName,email,state",
      "limit": "50",
    });
    save(`build-${buildId}-testers.json`, buildTesters);
  }

  // ═══════════════════════════════════════════════
  // 6. BETA GROUPS
  // ═══════════════════════════════════════════════
  console.log("═══ BETA GROUPS ═══");
  const betaGroups = await get(token, "/v1/betaGroups", {
    "filter[app]": appId,
    "fields[betaGroups]": "name,isInternalGroup,publicLinkEnabled,publicLinkId,publicLink,publicLinkLimit,publicLinkLimitEnabled,feedbackEnabled,hasAccessToAllBuilds,iosBuildsAvailableForAppleSiliconMac,createdDate",
    "limit": "50",
  });
  save("beta-groups.json", betaGroups);

  // Testers per group
  if (betaGroups?.data?.length) {
    for (const group of betaGroups.data.slice(0, 5)) {
      const gId = group.id;
      const gName = group.attributes.name;
      console.log(`═══ GROUP TESTERS: "${gName}" ═══`);

      const testers = await get(token, `/v1/betaGroups/${gId}/betaTesters`, {
        "fields[betaTesters]": "firstName,lastName,email,inviteType,state",
        "limit": "100",
      });
      save(`group-${gId}-testers.json`, testers);
    }
  }

  // ═══════════════════════════════════════════════
  // 7. BETA APP LOCALIZATIONS (test info)
  // ═══════════════════════════════════════════════
  console.log("═══ BETA APP LOCALIZATIONS (test info) ═══");
  const betaLocalizations = await get(token, "/v1/betaAppLocalizations", {
    "filter[app]": appId,
    "fields[betaAppLocalizations]": "description,feedbackEmail,locale,marketingUrl,privacyPolicyUrl,tvOsPrivacyPolicy",
  });
  save("beta-app-localizations.json", betaLocalizations);

  // ═══════════════════════════════════════════════
  // 8. BETA APP REVIEW DETAIL
  // ═══════════════════════════════════════════════
  console.log("═══ BETA APP REVIEW DETAIL ═══");
  const betaReview = await get(token, "/v1/betaAppReviewDetails", {
    "filter[app]": appId,
    "fields[betaAppReviewDetails]": "contactEmail,contactFirstName,contactLastName,contactPhone,demoAccountName,demoAccountPassword,demoAccountRequired,notes",
  });
  save("beta-review-detail.json", betaReview);

  // ═══════════════════════════════════════════════
  // 9. CUSTOMER REVIEWS
  // ═══════════════════════════════════════════════
  console.log("═══ CUSTOMER REVIEWS ═══");
  const reviews = await get(token, `/v1/apps/${appId}/customerReviews`, {
    "sort": "-createdDate",
    "limit": "20",
    "fields[customerReviews]": "rating,title,body,reviewerNickname,createdDate,territory",
    "include": "response",
    "fields[customerReviewResponses]": "responseBody,lastModifiedDate,state",
  });
  save("customer-reviews.json", reviews);

  // ═══════════════════════════════════════════════
  // 10. APP STORE REVIEW DETAIL (for latest editable version)
  // ═══════════════════════════════════════════════
  if (versions?.data?.length) {
    const editableVersion = versions.data.find((v: any) =>
      ["PREPARE_FOR_SUBMISSION", "REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED"].includes(v.attributes.appStoreState ?? v.attributes.appVersionState)
    ) ?? versions.data[0];

    console.log(`═══ REVIEW DETAIL: ${editableVersion.attributes.versionString} ═══`);
    const reviewDetail = await get(token, `/v1/appStoreVersions/${editableVersion.id}/appStoreReviewDetail`);
    save("review-detail.json", reviewDetail);
  }

  // ═══════════════════════════════════════════════
  // 11. IN-APP PURCHASES
  // ═══════════════════════════════════════════════
  console.log("═══ IN-APP PURCHASES ═══");
  const iaps = await get(token, `/v1/apps/${appId}/inAppPurchasesV2`, {
    "fields[inAppPurchases]": "name,productId,inAppPurchaseType,state,reviewNote,familySharable,contentHosting",
    "limit": "50",
  });
  save("in-app-purchases.json", iaps);

  // ═══════════════════════════════════════════════
  // 12. SUBSCRIPTION GROUPS
  // ═══════════════════════════════════════════════
  console.log("═══ SUBSCRIPTION GROUPS ═══");
  const subGroups = await get(token, `/v1/apps/${appId}/subscriptionGroups`, {
    "fields[subscriptionGroups]": "referenceName",
    "include": "subscriptions",
    "fields[subscriptions]": "name,productId,familySharable,state,subscriptionPeriod,reviewNote,groupLevel",
    "limit": "20",
  });
  save("subscription-groups.json", subGroups);

  // ═══════════════════════════════════════════════
  // 13. APP EVENTS
  // ═══════════════════════════════════════════════
  console.log("═══ APP EVENTS ═══");
  const events = await get(token, `/v1/apps/${appId}/appEvents`, {
    "fields[appEvents]": "referenceName,badge,deepLink,purchaseRequirement,priority,purpose,territorySchedules,archivedTerritorySchedules,eventState",
    "limit": "10",
  });
  save("app-events.json", events);

  // ═══════════════════════════════════════════════
  // 14. APP CLIPS (if any)
  // ═══════════════════════════════════════════════
  console.log("═══ APP CLIPS ═══");
  const clips = await get(token, `/v1/apps/${appId}/appClips`, {
    "fields[appClips]": "bundleId",
    "limit": "10",
  });
  save("app-clips.json", clips);

  // ═══════════════════════════════════════════════
  // 15. GAME CENTER (if any)
  // ═══════════════════════════════════════════════
  console.log("═══ GAME CENTER ═══");
  const gcDetail = await get(token, `/v1/apps/${appId}/gameCenterDetail`);
  save("game-center.json", gcDetail);

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  console.log(`\n═══ DONE ═══`);
  console.log(`Total API requests: ${requestCount}`);
  console.log(`Output directory: ${OUT_DIR}`);
  console.log(`Files written: ${fs.readdirSync(OUT_DIR).length}`);

  // Print a summary of what each page needs
  console.log(`\n═══ PAGE DATA MAP ═══`);
  console.log(`  Overview:      apps.json + versions.json (version states per platform)`);
  console.log(`  Store listing: localizations-*.json (per version, per locale)`);
  console.log(`  Screenshots:   screenshot-sets-*.json + preview-sets-*.json`);
  console.log(`  App review:    review-detail.json (demo account, notes)`);
  console.log(`  App details:   app-infos.json + app-info-localizations.json`);
  console.log(`  TF builds:     builds.json (with preReleaseVersion, buildBetaDetail)`);
  console.log(`  TF groups:     beta-groups.json + group-*-testers.json`);
  console.log(`  TF info:       beta-app-localizations.json + beta-review-detail.json`);
  console.log(`  Reviews:       customer-reviews.json (with responses)`);
  console.log(`  IAP/Subs:      in-app-purchases.json + subscription-groups.json`);
}

main().catch(console.error);
