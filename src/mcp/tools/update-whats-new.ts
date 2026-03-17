import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listApps } from "@/lib/asc/apps";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { updateVersionLocalization } from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";

export function registerUpdateWhatsNew(server: McpServer): void {
  server.registerTool(
    "update_whats_new",
    {
      title: "Update what's new",
      description:
        "Update the 'What's New' release notes for an app version across one or more locales. " +
        "Provide release notes as a map of locale codes (e.g. 'en-US', 'de-DE') to text. " +
        "Only locales that already exist on the version will be updated.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID (numeric string)"),
        versionId: z.string().describe("The app store version ID to update"),
        whatsNew: z
          .record(z.string(), z.string().max(4000))
          .describe("Map of locale code to release notes text (max 4000 chars each)"),
      }),
    },
    async ({ appId, versionId, whatsNew }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured. Set them up in Itsyconnect first." }],
        };
      }

      // Verify the app exists
      const apps = await listApps();
      const app = apps.find((a) => a.id === appId);
      if (!app) {
        return {
          isError: true,
          content: [{ type: "text", text: `App ${appId} not found. Available apps: ${apps.map((a) => `${a.attributes.name} (${a.id})`).join(", ")}` }],
        };
      }

      // Verify the version exists and is editable
      const versions = await listVersions(appId);
      const version = versions.find((v) => v.id === versionId);
      if (!version) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${versionId} not found. Available versions: ${versions.map((v) => `${v.attributes.versionString} ${v.attributes.appVersionState} (${v.id})`).join(", ")}` }],
        };
      }

      if (!EDITABLE_STATES.has(version.attributes.appVersionState)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${version.attributes.versionString} is in state "${version.attributes.appVersionState}" and cannot be edited.` }],
        };
      }

      // Fetch existing localizations
      const localizations = await listLocalizations(versionId);
      const localeMap = new Map(localizations.map((l) => [l.attributes.locale, l]));

      const updated: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      // Update sequentially to avoid ASC rate limits
      for (const [locale, text] of Object.entries(whatsNew)) {
        const loc = localeMap.get(locale);
        if (!loc) {
          skipped.push(locale);
          continue;
        }
        try {
          await updateVersionLocalization(loc.id, { whatsNew: text });
          updated.push(locale);
        } catch (err) {
          errors.push(`${locale}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Invalidate localizations cache
      cacheSet(`localizations:${versionId}`, null, 0);

      const parts: string[] = [];
      if (updated.length > 0) parts.push(`Updated: ${updated.join(", ")}`);
      if (skipped.length > 0) parts.push(`Skipped (locale not found on version): ${skipped.join(", ")}`);
      if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}`);

      return {
        isError: errors.length > 0 && updated.length === 0,
        content: [{ type: "text", text: parts.join("\n") }],
      };
    },
  );
}
