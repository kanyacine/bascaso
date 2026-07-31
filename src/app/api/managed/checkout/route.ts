import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { proxyCloud, requireManagedSession } from "@/lib/managed/proxy";

// Format only, mirroring the CHECK on the cloud's skus table: the catalog of sellable
// SKUs lives in that table, and hardcoding its keys here made every new pack wait for a
// desktop release. The cloud answers unknown_sku for a well-formed sku it does not sell.
const schema = z.object({ sku: z.string().regex(/^[a-z0-9_]{1,40}$/) });

export async function POST(request: Request) {
  // Auth before validation, and not the other way round: an unauthenticated caller
  // must learn nothing about the sku schema, not even that one exists.
  const denied = await requireManagedSession();
  if (denied) return denied;
  const parsed = await parseBody(request, schema);
  if (parsed instanceof Response) return parsed;
  return proxyCloud("checkout", "POST", { sku: parsed.sku });
}
