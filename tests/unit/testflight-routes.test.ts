import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListGroups = vi.fn();
const mockCreateGroup = vi.fn();
const mockGetGroupDetail = vi.fn();
const mockDeleteGroup = vi.fn();
const mockAddBuildToGroups = vi.fn();
const mockRemoveBuildFromGroups = vi.fn();
const mockListAppBetaTesters = vi.fn();
const mockAddTestersToGroup = vi.fn();
const mockRemoveTestersFromGroup = vi.fn();
const mockListBuildIndividualTesters = vi.fn();
const mockAddIndividualTestersToBuild = vi.fn();
const mockRemoveIndividualTestersFromBuild = vi.fn();
const mockCreateBetaTester = vi.fn();
const mockSendBetaTesterInvitations = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockErrorJson = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoGroups = vi.fn();
const mockGetDemoGroupDetail = vi.fn();

vi.mock("@/lib/asc/testflight", () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
  createGroup: (...args: unknown[]) => mockCreateGroup(...args),
  getGroupDetail: (...args: unknown[]) => mockGetGroupDetail(...args),
  deleteGroup: (...args: unknown[]) => mockDeleteGroup(...args),
  addBuildToGroups: (...args: unknown[]) => mockAddBuildToGroups(...args),
  removeBuildFromGroups: (...args: unknown[]) => mockRemoveBuildFromGroups(...args),
  listAppBetaTesters: (...args: unknown[]) => mockListAppBetaTesters(...args),
  addTestersToGroup: (...args: unknown[]) => mockAddTestersToGroup(...args),
  removeTestersFromGroup: (...args: unknown[]) => mockRemoveTestersFromGroup(...args),
  listBuildIndividualTesters: (...args: unknown[]) =>
    mockListBuildIndividualTesters(...args),
  addIndividualTestersToBuild: (...args: unknown[]) =>
    mockAddIndividualTestersToBuild(...args),
  removeIndividualTestersFromBuild: (...args: unknown[]) =>
    mockRemoveIndividualTestersFromBuild(...args),
  createBetaTester: (...args: unknown[]) => mockCreateBetaTester(...args),
  sendBetaTesterInvitations: (...args: unknown[]) =>
    mockSendBetaTesterInvitations(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoGroups: (...args: unknown[]) => mockGetDemoGroups(...args),
  getDemoGroupDetail: (...args: unknown[]) => mockGetDemoGroupDetail(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("testflight routes", () => {
  beforeEach(() => {
    for (const mock of [
      mockListGroups,
      mockCreateGroup,
      mockGetGroupDetail,
      mockDeleteGroup,
      mockAddBuildToGroups,
      mockRemoveBuildFromGroups,
      mockListAppBetaTesters,
      mockAddTestersToGroup,
      mockRemoveTestersFromGroup,
      mockListBuildIndividualTesters,
      mockAddIndividualTestersToBuild,
      mockRemoveIndividualTestersFromBuild,
      mockCreateBetaTester,
      mockSendBetaTesterInvitations,
      mockCacheGetMeta,
      mockErrorJson,
      mockGetDemoGroups,
      mockGetDemoGroupDetail,
    ]) {
      mock.mockReset();
    }
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(false);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
  });

  it("GET /groups returns groups and metadata", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    mockListGroups.mockResolvedValue([{ id: "group-1" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(
      new Request("http://localhost?refresh=1"),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(mockListGroups).toHaveBeenCalledWith("app-1", true);
    expect(data).toEqual({ groups: [{ id: "group-1" }], meta: { fetchedAt: 1 } });
  });

  it("GET /groups returns demo groups in demo mode", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoGroups.mockReturnValue([{ id: "demo-group" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({ groups: [{ id: "demo-group" }], meta: null });
  });

  it("POST /groups validates and creates a group", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    mockCreateGroup.mockResolvedValue({ id: "group-1" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Beta", isInternal: true }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreateGroup).toHaveBeenCalledWith("app-1", "Beta", true);
    expect(data).toEqual({ group: { id: "group-1" } });
  });

  it("POST /groups rejects invalid JSON", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("GET /groups/[groupId] returns 404 when detail is missing", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    mockGetGroupDetail.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Group not found");
  });

  it("GET /groups/[groupId] returns demo detail when available", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoGroupDetail.mockReturnValue({ group: { id: "group-1" }, builds: [] });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({ group: { id: "group-1" }, builds: [], meta: null });
  });

  it("DELETE /groups/[groupId] deletes the group", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    const data = await response.json();

    expect(mockDeleteGroup).toHaveBeenCalledWith("group-1");
    expect(data).toEqual({ ok: true });
  });

  it("DELETE /groups/[groupId] is a no-op without credentials", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    mockHasCredentials.mockReturnValue(false);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    const data = await response.json();

    expect(mockDeleteGroup).not.toHaveBeenCalled();
    expect(data).toEqual({ ok: true });
  });

  it("POST /groups/[groupId]/builds adds multiple builds", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/builds/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: ["b1", "b2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(mockAddBuildToGroups).toHaveBeenCalledWith("b1", ["group-1"]);
    expect(mockAddBuildToGroups).toHaveBeenCalledWith("b2", ["group-1"]);
    expect(data).toEqual({ ok: true });
  });

  it("DELETE /groups/[groupId]/builds removes multiple builds", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/builds/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: ["b1", "b2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(mockRemoveBuildFromGroups).toHaveBeenCalledWith("b1", ["group-1"]);
    expect(mockRemoveBuildFromGroups).toHaveBeenCalledWith("b2", ["group-1"]);
    expect(data).toEqual({ ok: true });
  });

  it("group-build and build-group routes handle demo, credentials, invalid payloads, and mapped errors", async () => {
    const groupBuilds = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/builds/route"
    );
    const buildGroups = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/groups/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await groupBuilds.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockHasCredentials.mockReturnValue(true);
    response = await groupBuilds.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    mockAddBuildToGroups.mockRejectedValueOnce(new Error("boom"));
    response = await groupBuilds.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockRemoveBuildFromGroups.mockRejectedValueOnce(new Error("boom"));
    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /groups/[groupId]/testers requires scope=app", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );

    const response = await GET(
      new Request("http://localhost?scope=group"),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("scope=app");
  });

  it("GET /groups/[groupId]/testers returns app testers when scope=app", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );

    mockListAppBetaTesters.mockResolvedValue([{ id: "tester-1" }]);

    const response = await GET(
      new Request("http://localhost?scope=app"),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(mockListAppBetaTesters).toHaveBeenCalledWith("app-1");
    expect(data).toEqual({ testers: [{ id: "tester-1" }] });
  });

  it("POST /groups/[groupId]/testers adds testers to a group", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1", "t2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(mockAddTestersToGroup).toHaveBeenCalledWith("group-1", ["t1", "t2"]);
    expect(data).toEqual({ ok: true });
  });

  it("DELETE /groups/[groupId]/testers removes testers from a group", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1", "t2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    const data = await response.json();

    expect(mockRemoveTestersFromGroup).toHaveBeenCalledWith("group-1", ["t1", "t2"]);
    expect(data).toEqual({ ok: true });
  });

  it("POST /builds/[buildId]/groups adds groups to a build", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/groups/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ["g1", "g2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockAddBuildToGroups).toHaveBeenCalledWith("build-1", ["g1", "g2"]);
    expect(data).toEqual({ ok: true });
  });

  it("DELETE /builds/[buildId]/groups removes groups from a build", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/groups/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ["g1", "g2"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockRemoveBuildFromGroups).toHaveBeenCalledWith("build-1", ["g1", "g2"]);
    expect(data).toEqual({ ok: true });
  });

  it("GET /builds/[buildId]/testers returns build testers by default", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    mockListBuildIndividualTesters.mockResolvedValue([{ id: "tester-1" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    const data = await response.json();

    expect(mockListBuildIndividualTesters).toHaveBeenCalledWith("build-1");
    expect(data).toEqual({ testers: [{ id: "tester-1" }] });
  });

  it("GET /builds/[buildId]/testers returns app-level testers with scope=app", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    mockListAppBetaTesters.mockResolvedValue([{ id: "tester-app" }]);

    const response = await GET(
      new Request("http://localhost?scope=app"),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockListAppBetaTesters).toHaveBeenCalledWith("app-1");
    expect(data).toEqual({ testers: [{ id: "tester-app" }] });
  });

  it("POST /builds/[buildId]/testers adds existing testers and sends invitations", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockAddIndividualTestersToBuild).toHaveBeenCalledWith("build-1", ["t1"]);
    expect(mockSendBetaTesterInvitations).toHaveBeenCalledWith("app-1", ["t1"]);
    expect(data).toEqual({ ok: true });
  });

  it("POST /builds/[buildId]/testers creates a new tester when email is provided", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    mockCreateBetaTester.mockResolvedValue("tester-2");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", firstName: "T" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockCreateBetaTester).toHaveBeenCalledWith(
      "build-1",
      "test@example.com",
      "T",
      undefined,
    );
    expect(mockSendBetaTesterInvitations).toHaveBeenCalledWith("app-1", ["tester-2"]);
    expect(data).toEqual({ ok: true, testerId: "tester-2" });
  });

  it("DELETE /builds/[buildId]/testers removes testers from a build", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockRemoveIndividualTestersFromBuild).toHaveBeenCalledWith("build-1", ["t1"]);
    expect(data).toEqual({ ok: true });
  });

  it("group-tester and build-tester routes cover demo, credentials, validation, and mapped errors", async () => {
    const groupTesters = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );
    const buildTesters = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await groupTesters.GET(new Request("http://localhost?scope=app"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(await response.json()).toEqual({ testers: [] });

    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await groupTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    response = await buildTesters.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ testers: [] });

    mockHasCredentials.mockReturnValue(true);
    response = await groupTesters.GET(new Request("http://localhost?scope=app"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(mockListAppBetaTesters).toHaveBeenCalledWith("app-1");

    response = await groupTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await groupTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Only" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Validation failed: provide testerIds or email",
    });

    response = await buildTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    mockListAppBetaTesters.mockRejectedValueOnce(new Error("boom"));
    response = await groupTesters.GET(new Request("http://localhost?scope=app"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockAddTestersToGroup.mockRejectedValueOnce(new Error("boom"));
    response = await groupTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockRemoveTestersFromGroup.mockRejectedValueOnce(new Error("boom"));
    response = await groupTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockListBuildIndividualTesters.mockRejectedValueOnce(new Error("boom"));
    response = await buildTesters.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockAddIndividualTestersToBuild.mockRejectedValueOnce(new Error("boom"));
    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockCreateBetaTester.mockRejectedValueOnce(new Error("boom"));
    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockRemoveIndividualTestersFromBuild.mockRejectedValueOnce(new Error("boom"));
    response = await buildTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /groups returns empty when no credentials", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ groups: [], meta: null });
  });

  it("GET /groups maps errors from listGroups", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    mockListGroups.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /groups covers demo, validation, no-credentials, and error branches", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/testflight/groups/route"
    );

    // demo branch (line 46)
    mockIsDemoMode.mockReturnValue(true);
    let response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "Beta", isInternal: true }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockCreateGroup).not.toHaveBeenCalled();

    // validation failed branch (line 56)
    mockIsDemoMode.mockReturnValue(false);
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // no-credentials branch (line 63)
    mockHasCredentials.mockReturnValue(false);
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Beta", isInternal: true }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    // error branch (line 70)
    mockHasCredentials.mockReturnValue(true);
    mockCreateGroup.mockRejectedValueOnce(new Error("boom"));
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Beta", isInternal: false }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /groups/[groupId] returns 404 in demo mode when detail is null", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoGroupDetail.mockReturnValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Group not found" });
  });

  it("GET /groups/[groupId] returns no-credentials error and success with meta", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    // no-credentials branch (line 25)
    mockHasCredentials.mockReturnValue(false);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    // success with meta (lines 33-36)
    mockHasCredentials.mockReturnValue(true);
    mockGetGroupDetail.mockResolvedValue({ group: { id: "group-1" }, builds: [] });
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 5 });
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(await response.json()).toEqual({
      group: { id: "group-1" },
      builds: [],
      meta: { fetchedAt: 5 },
    });

    // error branch (line 36 catch)
    mockGetGroupDetail.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("DELETE /groups/[groupId] covers demo and error branches", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/route"
    );

    // demo branch (line 47)
    mockIsDemoMode.mockReturnValue(true);
    let response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockDeleteGroup).not.toHaveBeenCalled();

    // error branch (line 58)
    mockIsDemoMode.mockReturnValue(false);
    mockDeleteGroup.mockRejectedValueOnce(new Error("boom"));
    response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", groupId: "group-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("builds/[buildId]/groups covers remaining demo, validation, error, and no-credentials branches", async () => {
    const buildGroups = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/groups/route"
    );

    // POST demo branch (line 19)
    mockIsDemoMode.mockReturnValue(true);
    let response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    // POST invalid JSON (line 28)
    mockIsDemoMode.mockReturnValue(false);
    response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    // POST validation failed
    response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // POST error branch (line 43)
    mockAddBuildToGroups.mockRejectedValueOnce(new Error("boom"));
    response = await buildGroups.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    // DELETE no-credentials (line 58)
    mockHasCredentials.mockReturnValue(false);
    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    // DELETE validation failed (line 68)
    mockHasCredentials.mockReturnValue(true);
    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // DELETE error branch
    mockRemoveBuildFromGroups.mockRejectedValueOnce(new Error("boom"));
    response = await buildGroups.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ["g1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("groups/[groupId]/builds covers no-credentials POST, validation POST, demo DELETE, invalid JSON DELETE, and error DELETE", async () => {
    const groupBuilds = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/builds/route"
    );

    // POST no-credentials (line 23)
    mockHasCredentials.mockReturnValue(false);
    let response = await groupBuilds.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockAddBuildToGroups).not.toHaveBeenCalled();

    // POST validation failed (line 33)
    mockHasCredentials.mockReturnValue(true);
    response = await groupBuilds.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // DELETE demo (line 56)
    mockIsDemoMode.mockReturnValue(true);
    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRemoveBuildFromGroups).not.toHaveBeenCalled();

    // DELETE invalid JSON (line 65)
    mockIsDemoMode.mockReturnValue(false);
    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    // DELETE validation failed
    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // DELETE error (line 82)
    mockRemoveBuildFromGroups.mockRejectedValueOnce(new Error("boom"));
    response = await groupBuilds.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: ["b1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("groups/[groupId]/testers covers no-credentials GET, demo POST, validation POST, demo DELETE, no-credentials DELETE, and invalid JSON DELETE", async () => {
    const groupTesters = await import(
      "@/app/api/apps/[appId]/testflight/groups/[groupId]/testers/route"
    );

    // GET no-credentials (line 21)
    mockHasCredentials.mockReturnValue(false);
    let response = await groupTesters.GET(
      new Request("http://localhost?scope=app"),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ testers: [] });

    // POST demo (line 47)
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(true);
    response = await groupTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockAddTestersToGroup).not.toHaveBeenCalled();

    // POST validation (line 61)
    mockIsDemoMode.mockReturnValue(false);
    response = await groupTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    // DELETE demo (line 82)
    mockIsDemoMode.mockReturnValue(true);
    response = await groupTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRemoveTestersFromGroup).not.toHaveBeenCalled();

    // DELETE no-credentials (line 86)
    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await groupTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    // DELETE invalid JSON (line 91)
    mockHasCredentials.mockReturnValue(true);
    response = await groupTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", groupId: "group-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("builds/[buildId]/testers covers demo GET, no-credentials POST, demo DELETE, no-credentials DELETE, and invalid JSON DELETE", async () => {
    const buildTesters = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/testers/route"
    );

    // GET demo (line 24)
    mockIsDemoMode.mockReturnValue(true);
    let response = await buildTesters.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ testers: [] });

    // POST no-credentials (line 63)
    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await buildTesters.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockAddIndividualTestersToBuild).not.toHaveBeenCalled();

    // DELETE demo (line 117)
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(true);
    response = await buildTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRemoveIndividualTestersFromBuild).not.toHaveBeenCalled();

    // DELETE no-credentials (line 121)
    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await buildTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ testerIds: ["t1"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    // DELETE invalid JSON (line 126)
    mockHasCredentials.mockReturnValue(true);
    response = await buildTesters.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });
});
