import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { updateVersionLocalization } from "@/lib/asc/localization-mutations";
import { updateAppInfoLocalization } from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { buildForbiddenKeywords } from "@/lib/asc/keyword-utils";
import { FIELD_LIMITS } from "@/lib/asc/locale-names";
import { emitChange } from "@/mcp/events";
import { cacheSet } from "@/lib/cache";

const LISTING_FIELDS = ["whatsNew", "description", "keywords", "promotionalText"] as const;
const DETAIL_FIELDS = ["name", "subtitle"] as const;
const ALL_FIELDS = [...LISTING_FIELDS, ...DETAIL_FIELDS] as const;

async function fixKeywords(
  translatedKeywords: string,
  locale: string,
  appName: string,
  subtitle: string | undefined,
  description: string | undefined,
  forbiddenWords: string[],
): Promise<string> {
  const res = await fetch("http://127.0.0.1:" + (process.env.PORT ?? "3000") + "/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fix-keywords",
      text: translatedKeywords,
      field: "keywords",
      locale,
      appName,
      subtitle,
      description,
      charLimit: 100,
      forbiddenWords,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `AI fix-keywords failed (${res.status})`);
  }

  const data = await res.json() as { result: string };
  return data.result;
}

async function translateText(
  text: string,
  fromLocale: string,
  toLocale: string,
  field: string,
  appName: string,
): Promise<string> {
  const res = await fetch("http://127.0.0.1:" + (process.env.PORT ?? "3000") + "/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      text,
      field,
      fromLocale,
      toLocale,
      appName,
      charLimit: FIELD_LIMITS[field],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `AI translation failed (${res.status})`);
  }

  const data = await res.json() as { result: string };
  return data.result;
}

export function registerTranslate(server: McpServer): void {
  server.registerTool(
    "translate",
    {
      title: "Translate listing fields",
      description:
        "Translate store listing or app details fields from a source locale to target locales " +
        "using the configured AI provider. Translatable fields: whatsNew, description, keywords, " +
        "promotionalText (store listing), name, subtitle (app details). " +
        "If targetLocales is omitted, translates to all existing locales.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z.string().optional().describe("The version ID (required for store listing fields)"),
        fields: z.string().describe("Comma-separated fields to translate (e.g. 'whatsNew' or 'whatsNew,description')"),
        sourceLocale: z.string().describe("Source locale code (e.g. 'en-US')"),
        targetLocales: z.string().optional().describe("Comma-separated target locale codes (e.g. 'ar-SA,de-DE'). If omitted, translates to all existing locales."),
      }),
    },
    async ({ appId, versionId, fields: fieldsStr, sourceLocale, targetLocales: targetStr }): Promise<CallToolResult> => {
      const fields = fieldsStr.split(",").map((f) => f.trim()).filter(Boolean);
      const targetLocales = targetStr ? targetStr.split(",").map((l) => l.trim()).filter(Boolean) : undefined;

      const invalidFields = fields.filter((f) => !(ALL_FIELDS as readonly string[]).includes(f));
      if (invalidFields.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid fields: ${invalidFields.join(", ")}. Valid: ${ALL_FIELDS.join(", ")}` }],
        };
      }
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const listingFields = fields.filter((f): f is typeof LISTING_FIELDS[number] =>
        (LISTING_FIELDS as readonly string[]).includes(f),
      );
      const detailFields = fields.filter((f): f is typeof DETAIL_FIELDS[number] =>
        (DETAIL_FIELDS as readonly string[]).includes(f),
      );

      // Get app name for AI context
      const { listApps } = await import("@/lib/asc/apps");
      const apps = await listApps();
      const app = apps.find((a) => a.id === appId);
      const appName = app?.attributes.name ?? "";

      const results: string[] = [];
      const errors: string[] = [];

      // Translate store listing fields
      if (listingFields.length > 0) {
        if (!versionId) {
          return {
            isError: true,
            content: [{ type: "text", text: "versionId is required for store listing fields." }],
          };
        }

        const versions = await listVersions(appId);
        const version = versions.find((v) => v.id === versionId);
        if (!version || !EDITABLE_STATES.has(version.attributes.appVersionState)) {
          return {
            isError: true,
            content: [{ type: "text", text: "Version not found or not editable." }],
          };
        }

        const localizations = await listLocalizations(versionId, true);
        const localeMap = new Map(localizations.map((l) => [l.attributes.locale, l]));

        const sourceLoc = localeMap.get(sourceLocale);
        if (!sourceLoc) {
          return {
            isError: true,
            content: [{ type: "text", text: `Source locale ${sourceLocale} not found on this version.` }],
          };
        }

        const targets = targetLocales
          ? targetLocales.filter((l) => l !== sourceLocale && localeMap.has(l))
          : [...localeMap.keys()].filter((l) => l !== sourceLocale);

        // Collect other locales' keywords for forbidden-word deduplication
        const otherKeywords: Record<string, string> = {};
        for (const [loc, data] of localeMap) {
          if (data.attributes.keywords) otherKeywords[loc] = data.attributes.keywords;
        }

        for (const field of listingFields) {
          const sourceText = sourceLoc.attributes[field];
          if (!sourceText) {
            results.push(`${field}: skipped (empty in ${sourceLocale})`);
            continue;
          }

          for (const locale of targets) {
            try {
              const translated = await translateText(sourceText, sourceLocale, locale, field, appName);

              let finalValue = translated;
              if (field === "keywords") {
                // Keywords need special handling: translate → strip forbidden → fix budget
                const forbidden = buildForbiddenKeywords({
                  appName,
                  subtitle: sourceLoc.attributes.promotionalText || undefined,
                  otherLocaleKeywords: otherKeywords,
                });
                const forbiddenSet = new Set(forbidden.map((w) => w.toLowerCase()));
                const stripped = translated
                  .split(",")
                  .map((w) => w.trim())
                  .filter((w) => w && !forbiddenSet.has(w.toLowerCase()))
                  .join(",");
                finalValue = await fixKeywords(
                  stripped,
                  locale,
                  appName,
                  sourceLoc.attributes.description || undefined,
                  undefined,
                  forbidden,
                );
              }

              const loc = localeMap.get(locale)!;
              await updateVersionLocalization(loc.id, { [field]: finalValue });
              results.push(`${field} → ${locale}: done`);
            } catch (err) {
              errors.push(`${field} → ${locale}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        cacheSet(`localizations:${versionId}`, null, 0);
        emitChange({ scope: "listing", appId, versionId });
      }

      // Translate app details fields
      if (detailFields.length > 0) {
        const appInfos = await listAppInfos(appId);
        if (appInfos.length === 0) {
          errors.push("No app info found.");
        } else {
          const appInfo = pickAppInfo(appInfos)!;
          const localizations = await listAppInfoLocalizations(appInfo.id, true);
          const localeMap = new Map(localizations.map((l) => [l.attributes.locale, l]));

          const sourceLoc = localeMap.get(sourceLocale);
          if (!sourceLoc) {
            errors.push(`Source locale ${sourceLocale} not found in app details.`);
          } else {
            const targets = targetLocales
              ? targetLocales.filter((l) => l !== sourceLocale && localeMap.has(l))
              : [...localeMap.keys()].filter((l) => l !== sourceLocale);

            for (const field of detailFields) {
              const sourceText = sourceLoc.attributes[field];
              if (!sourceText) {
                results.push(`${field}: skipped (empty in ${sourceLocale})`);
                continue;
              }

              for (const locale of targets) {
                try {
                  const translated = await translateText(sourceText, sourceLocale, locale, field, appName);
                  const loc = localeMap.get(locale)!;
                  await updateAppInfoLocalization(loc.id, { [field]: translated });
                  results.push(`${field} → ${locale}: done`);
                } catch (err) {
                  errors.push(`${field} → ${locale}: ${err instanceof Error ? err.message : String(err)}`);
                }
              }
            }

            cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
            emitChange({ scope: "details", appId });
          }
        }
      }

      const parts = [...results, ...errors];
      return {
        isError: errors.length > 0 && results.length === 0,
        content: [{ type: "text", text: parts.join("\n") || "Nothing to translate." }],
      };
    },
  );
}
