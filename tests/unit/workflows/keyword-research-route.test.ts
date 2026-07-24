import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStart = vi.fn();
const mockCancel = vi.fn();
const mockGetLatest = vi.fn();
const mockList = vi.fn();
const mockDeleteRun = vi.fn();

vi.mock("@/lib/ai/workflows/run-manager", () => ({
  startKeywordResearch: (...args: unknown[]) => mockStart(...args),
  cancelRun: (...args: unknown[]) => mockCancel(...args),
  getLatestRun: (...args: unknown[]) => mockGetLatest(...args),
  listRuns: (...args: unknown[]) => mockList(...args),
  deleteRun: (...args: unknown[]) => mockDeleteRun(...args),
}));

import {
  POST,
  GET,
  DELETE,
} from "@/app/api/apps/[appId]/aso/keyword-research/route";

function ctx(appId: string) {
  return { params: Promise.resolve({ appId }) };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/apps/app-1/aso/keyword-research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { country: "us", locale: "en-US", appName: "Habitly" };

beforeEach(() => {
  mockStart.mockReset();
  mockCancel.mockReset();
  mockGetLatest.mockReset();
  mockList.mockReset();
  mockDeleteRun.mockReset();
});

describe("POST /api/apps/[appId]/aso/keyword-research", () => {
  it("starts a run and returns the runId", async () => {
    mockStart.mockResolvedValue({ runId: "run-1" });

    const res = await POST(postRequest(validBody), ctx("app-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-1" });
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "app-1",
        appName: "Habitly",
        country: "us",
        locale: "en-US",
        appAppleId: null,
      }),
    );
  });

  it("passes the optional fields through", async () => {
    mockStart.mockResolvedValue({ runId: "run-2" });

    await POST(
      postRequest({
        ...validBody,
        appAppleId: 42,
        title: "T",
        subtitle: "S",
        description: "D",
        currentKeywords: "a,b",
      }),
      ctx("app-9"),
    );

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "app-9",
        appAppleId: 42,
        title: "T",
        subtitle: "S",
        description: "D",
        currentKeywords: "a,b",
      }),
    );
  });

  it("returns 409 when a run is already running", async () => {
    mockStart.mockResolvedValue({ error: "already_running" });

    const res = await POST(postRequest(validBody), ctx("app-1"));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "workflow_already_running" });
  });

  it("rejects an invalid body without starting a run", async () => {
    const res = await POST(
      postRequest({ country: "usa", locale: "e", appName: "" }),
      ctx("app-1"),
    );

    expect(res.status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("GET /api/apps/[appId]/aso/keyword-research", () => {
  it("returns the latest run for the app", async () => {
    const run = { id: "run-1", status: "succeeded" };
    mockGetLatest.mockReturnValue(run);

    const res = await GET(new Request("http://localhost"), ctx("app-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ run });
    expect(mockGetLatest).toHaveBeenCalledWith("app-1");
  });

  it("returns null when there is no run", async () => {
    mockGetLatest.mockReturnValue(null);

    const res = await GET(new Request("http://localhost"), ctx("app-1"));

    expect(await res.json()).toEqual({ run: null });
  });
});

describe("GET /api/apps/[appId]/aso/keyword-research (list mode)", () => {
  it("returns the filtered runs when list=1", async () => {
    mockList.mockReturnValue([{ id: "r-new" }, { id: "r-old" }]);
    const req = new Request(
      "http://localhost/api/apps/app-1/aso/keyword-research?list=1&country=us&locale=en-US",
    );
    const res = await GET(req, ctx("app-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: [{ id: "r-new" }, { id: "r-old" }] });
    expect(mockList).toHaveBeenCalledWith("app-1", { country: "us", locale: "en-US" });
  });

  it("still returns the latest run without list param", async () => {
    mockGetLatest.mockReturnValue({ id: "latest" });
    const res = await GET(new Request("http://localhost/x"), ctx("app-1"));
    expect(await res.json()).toEqual({ run: { id: "latest" } });
  });
});

describe("DELETE /api/apps/[appId]/aso/keyword-research", () => {
  it("cancels a known run", async () => {
    mockCancel.mockReturnValue(true);

    const res = await DELETE(
      new Request("http://localhost/x?runId=run-1", { method: "DELETE" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockCancel).toHaveBeenCalledWith("run-1");
  });

  it("returns 404 for an unknown run", async () => {
    mockCancel.mockReturnValue(false);

    const res = await DELETE(
      new Request("http://localhost/x?runId=nope", { method: "DELETE" }),
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when runId is missing", async () => {
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
    );

    expect(res.status).toBe(404);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("deletes a persisted run when delete=1 (does not cancel)", async () => {
    mockDeleteRun.mockReturnValue(true);

    const res = await DELETE(
      new Request("http://localhost/x?runId=run-1&delete=1", { method: "DELETE" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDeleteRun).toHaveBeenCalledWith("run-1");
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
