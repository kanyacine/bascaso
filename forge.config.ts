import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { execSync } from "child_process";
import { APP_VERSION, BUILD_NUMBER } from "./src/lib/version";

const isMAS = process.env.MAS === "1";
const isMasDev = process.env.MAS_DEV === "1";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.itsyconnect.app",
    name: "Itsyconnect",
    appVersion: APP_VERSION,
    buildVersion: BUILD_NUMBER,
    icon: "public/icon",
    asar: false,
    ...(isMAS ? { extendInfo: { ElectronTeamID: "R892A93W42" } } : {}),
    osxSign: isMAS
      ? {
          identity: isMasDev
            ? "Apple Development: Nikolajs Ustinovs (95YH3V335V)"
            : "3rd Party Mac Developer Application: Nikolajs Ustinovs (R892A93W42)",
          provisioningProfile: isMasDev
            ? "provisioning.dev.provisionprofile"
            : "provisioning.dist.provisionprofile",
          optionsForFile: (filePath: string) => ({
            entitlements: filePath.includes("/Frameworks/")
              ? "entitlements.mas.child.plist"
              : "entitlements.mas.plist",
          }),
        }
      : process.env.APPLE_TEAM_ID ? {} : undefined,
    osxNotarize: isMAS
      ? undefined
      : process.env.APPLE_ID
        ? {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          }
        : undefined,
    osxUniversal: {
      x64ArchFiles: "**/*.node",
    },
    afterCopy: [
      // Rebuild better-sqlite3 for the target architecture.
      // `next build` standalone output only has the host-arch .node file,
      // so universal builds need it rebuilt per-arch and copied in.
      (buildPath: string, _electronVersion: string, _platform: string, arch: string, callback: (err?: Error) => void) => {
        try {
          execSync(
            `npx electron-rebuild -f -o better-sqlite3 --build-from-source --arch=${arch}`,
            { stdio: "inherit" },
          );
          const dest = `${buildPath}/.next/standalone/node_modules/better-sqlite3/build/Release`;
          execSync(`mkdir -p "${dest}"`, { stdio: "inherit" });
          execSync(
            `cp node_modules/better-sqlite3/build/Release/better_sqlite3.node "${dest}/better_sqlite3.node"`,
            { stdio: "inherit" },
          );
          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    ],
    ignore: (filePath: string) => {
      if (!filePath) return false;
      if (filePath === "/package.json") return false;
      if (filePath.startsWith("/electron")) return false;
      if (filePath === "/.next" || filePath.startsWith("/.next/standalone")) return false;
      if (filePath.startsWith("/drizzle")) return false;
      if (filePath.startsWith("/public")) return false;
      return true;
    },
  },
  makers: [
    new MakerDMG({
      format: "ULFO",
      name: "Itsyconnect",
      icon: "public/icon.icns",
      overwrite: true,
    }),

    new MakerZIP({}),
  ],
};

export default config;
