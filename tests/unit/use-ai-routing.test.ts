import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRouting, invalidateAIRouting } from "@/lib/hooks/use-ai-routing";

// The store is a React hook, but the part that can be wrong is the request coalescing,
// and that is pure. Same shape as the sibling use-managed-account test.
describe("fetchRouting coalescing", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  function body(tier: string) {
    return new Response(JSON.stringify({ routing: { groups: { metadata: { tier } } } }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAIRouting();
  });

  // Every TokenCostHint on a page reads this store. Without the shared promise, a page
  // with five wand buttons fires five identical requests – the case the hook's own
  // docstring rules out.
  it("serves concurrent callers from one request", async () => {
    fetchMock.mockResolvedValue(body("managed"));
    const [a, b, c] = await Promise.all([fetchRouting(), fetchRouting(), fetchRouting()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a?.groups?.metadata?.tier).toBe("managed");
  });

  it("refetches after an invalidation instead of replaying the settled request", async () => {
    fetchMock.mockResolvedValueOnce(body("managed")).mockResolvedValueOnce(body("local"));
    expect((await fetchRouting())?.groups?.metadata?.tier).toBe("managed");
    invalidateAIRouting();
    expect((await fetchRouting())?.groups?.metadata?.tier).toBe("local");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Signing in or out invalidates, then the badges re-read. A request started before
  // the sign-in must not write the signed-out routing back over the fresh one.
  it("discards a response that lands after an invalidation", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { release = r; }));
    const stale = fetchRouting();
    invalidateAIRouting();
    release(body("local"));
    await stale;

    fetchMock.mockResolvedValueOnce(body("managed"));
    expect((await fetchRouting())?.groups?.metadata?.tier).toBe("managed");
  });

  // A transient outage must not pin "no routing" until the next invalidate, which would
  // hide every cost hint for the rest of the session.
  it("does not cache a failed request", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchRouting()).toBeNull();
    fetchMock.mockResolvedValueOnce(body("managed"));
    expect((await fetchRouting())?.groups?.metadata?.tier).toBe("managed");
  });
});
