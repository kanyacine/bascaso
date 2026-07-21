import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScoreKeyword = vi.fn();
vi.mock("@/lib/aso/score-service", () => ({
  scoreKeyword: (...args: unknown[]) => mockScoreKeyword(...args),
}));

import { POST } from "@/app/api/aso/scores/route";
import { SearchApiUnavailableError } from "@/lib/aso/itunes";

const request = (body: unknown) =>
  new Request("http://localhost/api/aso/scores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/aso/scores", () => {
  beforeEach(() => {
    mockScoreKeyword.mockReset();
  });

  it("returns the score for a keyword and country", async () => {
    const score = {
      keyword: "meditation",
      country: "fr",
      popularity: 50,
      difficulty: 59,
      opportunity: 33,
      classification: "Moderate",
      fetchedAt: 1700000000000,
      stale: false,
    };
    mockScoreKeyword.mockResolvedValue(score);

    const res = await POST(request({ keyword: "meditation", country: "fr" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.score).toEqual(score);
    expect(mockScoreKeyword).toHaveBeenCalledWith("meditation", "fr");
  });

  it("rejects a missing keyword", async () => {
    const res = await POST(request({ country: "fr" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(mockScoreKeyword).not.toHaveBeenCalled();
  });

  it("rejects an empty keyword", async () => {
    const res = await POST(request({ keyword: "   ", country: "fr" }));

    expect(res.status).toBe(400);
  });

  it("rejects an invalid country code", async () => {
    const res = await POST(request({ keyword: "meditation", country: "FRA" }));

    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/aso/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("maps search unavailability to an error response", async () => {
    mockScoreKeyword.mockRejectedValue(
      new SearchApiUnavailableError("App Store search data is temporarily unavailable."),
    );

    const res = await POST(request({ keyword: "meditation", country: "fr" }));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("unavailable");
  });
});
