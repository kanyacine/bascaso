import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteAllRuns = vi.fn();
const mockClearScoreCache = vi.fn();

vi.mock("@/lib/ai/workflows/run-manager", () => ({
  deleteAllRuns: (...args: unknown[]) => mockDeleteAllRuns(...args),
}));
vi.mock("@/lib/aso/score-service", () => ({
  clearScoreCache: (...args: unknown[]) => mockClearScoreCache(...args),
}));

import { DELETE } from "@/app/api/settings/aso/route";

function req(query: string) {
  return new Request(`http://localhost/api/settings/aso${query}`, { method: "DELETE" });
}

beforeEach(() => {
  mockDeleteAllRuns.mockReset();
  mockClearScoreCache.mockReset();
});

describe("DELETE /api/settings/aso", () => {
  it("clears all reports when target=reports", async () => {
    mockDeleteAllRuns.mockReturnValue(3);
    const res = await DELETE(req("?target=reports"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 3 });
    expect(mockDeleteAllRuns).toHaveBeenCalledOnce();
    expect(mockClearScoreCache).not.toHaveBeenCalled();
  });

  it("clears the score cache when target=scores", async () => {
    const res = await DELETE(req("?target=scores"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockClearScoreCache).toHaveBeenCalledOnce();
    expect(mockDeleteAllRuns).not.toHaveBeenCalled();
  });

  it("rejects an unknown target", async () => {
    const res = await DELETE(req("?target=bogus"));
    expect(res.status).toBe(400);
    expect(mockDeleteAllRuns).not.toHaveBeenCalled();
    expect(mockClearScoreCache).not.toHaveBeenCalled();
  });
});
