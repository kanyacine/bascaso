import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { APP_VERSION, BUILD_NUMBER } from "./src/lib/version";
import { APP_BUNDLE_ID, BRAND_NAME } from "./src/lib/brand";

/** Two ways to authenticate notarisation, and exactly one must be complete.
 *
 *  `APPLE_KEYCHAIN_PROFILE` is the one to prefer. The password strategy makes
 *  @electron/notarize spawn `notarytool --password <secret>`, which puts the
 *  app-specific password in the process arguments – readable by any process on
 *  the machine with a plain `ps`, for as long as the submission runs. Store it
 *  once instead:
 *
 *    xcrun notarytool store-credentials bascaso \
 *      --apple-id you@example.com --team-id XXXXXXXXXX --password xxxx-xxxx-xxxx-xxxx
 *
 *  Signing itself needs no variable: @electron/osx-sign finds the
 *  `Developer ID Application` certificate in the login keychain. The variables
 *  gate signing anyway, because signing without notarising still trips
 *  Gatekeeper on a downloaded build – shipping one without the other is never
 *  what you meant. */
const PASSWORD_ENV = ["APPLE_ID", "APPLE_ID_PASSWORD", "APPLE_TEAM_ID"] as const;
const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
const providedPasswordEnv = PASSWORD_ENV.filter((name) => process.env[name]);
const passwordConfigured = providedPasswordEnv.length === PASSWORD_ENV.length;
const signingConfigured = Boolean(keychainProfile) || passwordConfigured;

// A half-filled environment used to gate osxSign on APPLE_TEAM_ID and osxNotarize
// on APPLE_ID independently, so setting one and forgetting the other produced an
// unsigned or un-notarized DMG with no warning – the sort of artefact you only
// discover after handing it to someone, when Gatekeeper refuses it on their Mac.
// Fail the build instead: an unsigned build is fine when it is what you asked for,
// and never fine when it is an accident.
if (!keychainProfile && providedPasswordEnv.length > 0 && !passwordConfigured) {
  const missing = PASSWORD_ENV.filter((name) => !process.env[name]);
  throw new Error(
    `Code signing is half-configured: ${providedPasswordEnv.join(", ")} set, ` +
      `${missing.join(", ")} missing. Set all three, or set APPLE_KEYCHAIN_PROFILE ` +
      `instead (preferred – it keeps the password out of the process arguments), ` +
      `or none of them to produce an unsigned local build.`,
  );
}

if (!signingConfigured) {
  console.warn(
    "[forge] No Apple credentials in the environment – building UNSIGNED. " +
      "Gatekeeper will refuse this build on any Mac but the one that produced it.",
  );
} else if (!keychainProfile) {
  console.warn(
    "[forge] Notarising with APPLE_ID_PASSWORD: the password will be visible in " +
      "`ps` output while notarytool runs. Prefer APPLE_KEYCHAIN_PROFILE.",
  );
}

const makers = [
  new MakerDMG({
    format: "ULFO",
    name: BRAND_NAME,
    icon: "public/icon.icns",
    overwrite: true,
  }),
  new MakerZIP({}),
];

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: APP_BUNDLE_ID,
    name: BRAND_NAME,
    appVersion: APP_VERSION,
    buildVersion: BUILD_NUMBER,
    icon: "public/icon",
    asar: false,
    extraResource: ["native/afm-server/.build/release/afm-server"],
    // entitlements.plist was in the repo but never wired up: the JIT and
    // unsigned-executable-memory entitlements it grants are what keep Chromium's
    // renderer from being killed under the hardened runtime, which notarisation
    // requires. Signing without them produces a build that passes notarisation
    // and then crashes on launch.
    osxSign: signingConfigured
      ? { optionsForFile: () => ({ entitlements: "entitlements.plist" }) }
      : undefined,
    osxNotarize: keychainProfile
      ? { keychainProfile }
      : passwordConfigured
        ? {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_ID_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          }
        : undefined,
    osxUniversal: {
      // Native modules live under `.next/standalone/node_modules`.
      // Use an explicit pattern that matches hidden `.next` paths during
      // @electron/universal's Mach-O comparison.
      x64ArchFiles: "Contents/Resources/app/.next/standalone/node_modules/**/*.{node,dylib}",
    },
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
  makers,
};

export default config;
