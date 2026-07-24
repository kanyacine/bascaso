import { workflowEvents, type WorkflowEvent } from "@/lib/ai/workflows/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      function onEvent(event: WorkflowEvent) {
        // Enqueuing to a controller a disconnected client already closed throws;
        // detach immediately so the throw can't reach emitWorkflowEvent's caller.
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      }

      workflowEvents.on("workflow", onEvent);

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 30_000);

      cleanup = () => {
        workflowEvents.off("workflow", onEvent);
        clearInterval(heartbeat);
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    // Runs when the client disconnects – remove the listener right away rather
    // than waiting up to 30s for the next heartbeat to fail.
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
