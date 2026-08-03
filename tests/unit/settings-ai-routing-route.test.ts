import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedManagedAccount } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

function putRoutingRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/settings/ai/routing", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetModules();
  });

  it("sets an explicit tier for a routed group", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRoutingRequest({ group: "metadata", tier: "local" }));
    expect(await response.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.groups.metadata).toEqual({ tier: "local", explicit: true });
  });

  it("accepts the managed tier once a cloud account is linked", async () => {
    seedManagedAccount(testDb);
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRoutingRequest({ group: "metadata", tier: "managed" }));
    expect(await response.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.groups.metadata).toEqual({ tier: "managed", explicit: true });
  });

  // With no account, nothing can route this tier: accepted and then stored, it only
  // showed up on the first AI action, far from the setting at fault.
  it("rejects the managed tier when no cloud account is linked", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRoutingRequest({ group: "metadata", tier: "managed" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "managed_account_required" });
    const settings = await (await GET()).json();
    expect(settings.routing.groups.metadata).toEqual({ tier: "byok", explicit: false });
  });

  it("reports whether the managed tier is selectable", async () => {
    const { GET } = await import("@/app/api/settings/ai/route");

    expect((await (await GET()).json()).routing.managedAvailable).toBe(false);

    seedManagedAccount(testDb);
    expect((await (await GET()).json()).routing.managedAvailable).toBe(true);
  });

  it("resets a group to its shipped default when tier is null", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    await PUT(putRoutingRequest({ group: "metadata", tier: "local" }));
    const resetResponse = await PUT(putRoutingRequest({ group: "metadata", tier: null }));
    expect(await resetResponse.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.groups.metadata).toEqual({ tier: "byok", explicit: false });
  });

  it("resets every routed group to its shipped default with { reset: true }", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    await PUT(putRoutingRequest({ group: "metadata", tier: "local" }));
    await PUT(putRoutingRequest({ group: "redaction", tier: "byok" }));
    const response = await PUT(putRoutingRequest({ reset: true }));
    expect(await response.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.groups.metadata).toEqual({ tier: "byok", explicit: false });
    expect(settings.routing.groups.redaction).toEqual({ tier: "local", explicit: false });
    expect(settings.routing.groups.insights).toEqual({ tier: "byok", explicit: false });
    expect(settings.routing.groups.workflows).toEqual({ tier: "byok", explicit: false });
  });

  // The original bug: "Reset" clears the explicit preferences, and the frozen default
  // sent them back to byok – a managed routing silently disappeared and the client went
  // back to its BYOK key without noticing.
  it("restores the managed default on reset when a cloud account is linked", async () => {
    seedManagedAccount(testDb);
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    await PUT(putRoutingRequest({ group: "metadata", tier: "local" }));
    await PUT(putRoutingRequest({ reset: true }));

    const settings = await (await GET()).json();
    for (const group of ["redaction", "metadata", "insights", "workflows"]) {
      expect(settings.routing.groups[group]).toEqual({ tier: "managed", explicit: false });
    }
  });

  it("persists the fallback toggle", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRoutingRequest({ fallback: true }));
    expect(await response.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.fallback).toBe(true);
  });

  it("persists the allow-unsupported-languages toggle", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");
    const { GET } = await import("@/app/api/settings/ai/route");

    const response = await PUT(putRoutingRequest({ allowUnsupportedLanguages: true }));
    expect(await response.json()).toEqual({ ok: true });

    const settings = await (await GET()).json();
    expect(settings.routing.allowUnsupportedLanguages).toBe(true);
  });

  it("rejects a group outside AI_ROUTED_GROUPS", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");

    const response = await PUT(putRoutingRequest({ group: "bogus", tier: "local" }));

    expect(response.status).toBe(400);
  });

  it("rejects an unrecognized body shape", async () => {
    const { PUT } = await import("@/app/api/settings/ai/routing/route");

    const response = await PUT(putRoutingRequest({ nonsense: true }));

    expect(response.status).toBe(400);
  });
});
