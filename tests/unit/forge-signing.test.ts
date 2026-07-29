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

  // Le cas dangereux : avant, `osxSign` était conditionné à APPLE_TEAM_ID et
  // `osxNotarize` à APPLE_ID. Un environnement à moitié rempli produisait donc
  // un DMG non signé qui se construisait proprement et ressemblait trait pour
  // trait à une release – on ne le découvre qu'une fois remis à quelqu'un,
  // quand Gatekeeper le refuse.
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

  // Le mode à préférer : notarytool lit le secret dans le trousseau, il ne
  // transite donc jamais par argv – où n'importe quel `ps` le lit pendant toute
  // la durée de la soumission.
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

  // Un profil suffit à lui seul : le compléter à moitié avec des variables de
  // mot de passe ne doit pas faire échouer un build par ailleurs valide.
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

  // entitlements.plist était dans le dépôt sans être référencé nulle part. Les
  // deux entitlements qu'il accorde sont ce qui empêche le renderer de Chromium
  // d'être tué sous le hardened runtime, exigé par la notarisation : signer sans
  // eux donne un build qui passe la notarisation puis crashe au lancement.
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
