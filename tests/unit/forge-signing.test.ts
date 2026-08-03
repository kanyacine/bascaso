import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNING_ENV = ["APPLE_ID", "APPLE_ID_PASSWORD", "APPLE_TEAM_ID", "APPLE_KEYCHAIN_PROFILE"] as const;
let saved: Record<string, string | undefined>;

async function loadConfig() {
  vi.resetModules();
  return (await import("../../forge.config")).default;
}

describe("forge signing configuration", () => {
  beforeEach(() => {
    saved = Object.fromEntries(SIGNING_ENV.map((n) => [n, process.env[n]]));
    for (const n of SIGNING_ENV) delete process.env[n];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [n, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
    vi.restoreAllMocks();
  });

  // The dangerous case: `osxSign` used to be gated on APPLE_TEAM_ID and `osxNotarize` on
  // APPLE_ID. A half-filled environment therefore produced an unsigned DMG that built
  // cleanly and looked exactly like a release – you only find out once it is handed to
  // someone and Gatekeeper refuses it.
  it.each([
    ["APPLE_TEAM_ID"],
    ["APPLE_ID"],
    ["APPLE_ID_PASSWORD"],
  ])("refuses to build when only %s is set", async (name) => {
    process.env[name] = "value";
    await expect(loadConfig()).rejects.toThrow(/half-configured/i);
  });

  it("names the missing variables so the message is actionable", async () => {
    process.env.APPLE_ID = "you@example.com";
    const error = await loadConfig().catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("APPLE_ID_PASSWORD");
    expect((error as Error).message).toContain("APPLE_TEAM_ID");
  });

  // The mode to prefer: notarytool reads the secret from the keychain, so it never
  // travels through argv – where any `ps` reads it for the whole duration of the
  // submission.
  it("notarises from the keychain profile alone, with no password in the environment", async () => {
    process.env.APPLE_KEYCHAIN_PROFILE = "bascaso";
    const config = await loadConfig();
    expect(config.packagerConfig?.osxNotarize).toEqual({ keychainProfile: "bascaso" });
    expect(config.packagerConfig?.osxSign).toBeDefined();
  });

  it("prefers the keychain profile over a password set alongside it", async () => {
    process.env.APPLE_KEYCHAIN_PROFILE = "bascaso";
    process.env.APPLE_ID = "you@example.com";
    process.env.APPLE_ID_PASSWORD = "abcd-efgh-ijkl-mnop";
    process.env.APPLE_TEAM_ID = "TEAM123456";
    const config = await loadConfig();
    expect(config.packagerConfig?.osxNotarize).toEqual({ keychainProfile: "bascaso" });
  });

  // A profile is sufficient on its own: half-completing it with password variables must
  // not fail an otherwise valid build.
  it("does not fail on a partial password set when a keychain profile is present", async () => {
    process.env.APPLE_KEYCHAIN_PROFILE = "bascaso";
    process.env.APPLE_ID = "you@example.com";
    await expect(loadConfig()).resolves.toBeDefined();
  });

  it("builds unsigned, and says so, when no credential is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = await loadConfig();
    expect(config.packagerConfig?.osxSign).toBeUndefined();
    expect(config.packagerConfig?.osxNotarize).toBeUndefined();
    expect(warn.mock.calls.flat().join(" ")).toMatch(/UNSIGNED/);
  });

  // entitlements.plist sat in the repo without being referenced anywhere. The two
  // entitlements it grants are what keeps Chromium's renderer from being killed under
  // the hardened runtime that notarisation requires: signing without them yields a build
  // that passes notarisation and then crashes on launch.
  it("wires the entitlements file when all three credentials are set", async () => {
    process.env.APPLE_ID = "you@example.com";
    process.env.APPLE_ID_PASSWORD = "abcd-efgh-ijkl-mnop";
    process.env.APPLE_TEAM_ID = "TEAM123456";

    const config = await loadConfig();
    const osxSign = config.packagerConfig?.osxSign as
      | { optionsForFile?: (f: string) => { entitlements?: string } }
      | undefined;

    expect(osxSign?.optionsForFile?.("any/file")).toEqual({ entitlements: "entitlements.plist" });
    expect(config.packagerConfig?.osxNotarize).toEqual({
      appleId: "you@example.com",
      appleIdPassword: "abcd-efgh-ijkl-mnop",
      teamId: "TEAM123456",
    });
  });
});
