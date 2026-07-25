import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #8 du roll-up : un BASCASO_CLOUD_URL mal configuré avec un slash final
// produisait "…co//functions/…" à chaque site d'appel. Normalisé une fois à
// la frontière de config plutôt qu'à chaque appelant.
describe("BASCASO_CLOUD_URL", () => {
  const original = process.env.BASCASO_CLOUD_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BASCASO_CLOUD_URL;
    else process.env.BASCASO_CLOUD_URL = original;
    vi.resetModules();
  });

  it("strips a single trailing slash from an env override", async () => {
    process.env.BASCASO_CLOUD_URL = "https://example.supabase.co/";
    const { BASCASO_CLOUD_URL } = await import("@/lib/managed/config");
    expect(BASCASO_CLOUD_URL).toBe("https://example.supabase.co");
  });

  it("strips repeated trailing slashes", async () => {
    process.env.BASCASO_CLOUD_URL = "https://example.supabase.co///";
    const { BASCASO_CLOUD_URL } = await import("@/lib/managed/config");
    expect(BASCASO_CLOUD_URL).toBe("https://example.supabase.co");
  });

  it("leaves a URL without a trailing slash untouched", async () => {
    process.env.BASCASO_CLOUD_URL = "https://example.supabase.co";
    const { BASCASO_CLOUD_URL } = await import("@/lib/managed/config");
    expect(BASCASO_CLOUD_URL).toBe("https://example.supabase.co");
  });

  it("falls back to the shipped default when unset, itself free of a trailing slash", async () => {
    delete process.env.BASCASO_CLOUD_URL;
    const { BASCASO_CLOUD_URL } = await import("@/lib/managed/config");
    expect(BASCASO_CLOUD_URL).toBe("https://akbuzxhyegcdskesfjdc.supabase.co");
  });
});
