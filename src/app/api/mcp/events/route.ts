import { sseStream } from "@/lib/api-helpers";
import { mcpEvents } from "@/mcp/events";

export const dynamic = "force-dynamic";

export function GET() {
  return sseStream(mcpEvents, "change");
}
