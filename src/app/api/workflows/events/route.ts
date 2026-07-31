import { sseStream } from "@/lib/api-helpers";
import { workflowEvents } from "@/lib/ai/workflows/events";

export const dynamic = "force-dynamic";

export function GET() {
  return sseStream(workflowEvents, "workflow");
}
