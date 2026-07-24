import { EventEmitter } from "node:events";
import type {
  WorkflowProgress,
  WorkflowStepId,
} from "@/lib/ai/workflows/keyword-research";

// Shared emitter on globalThis to survive HMR, mirroring src/mcp/events.ts.
const g = globalThis as unknown as { __workflowEvents?: EventEmitter };
if (!g.__workflowEvents) {
  g.__workflowEvents = new EventEmitter();
  g.__workflowEvents.setMaxListeners(50);
}

export const workflowEvents = g.__workflowEvents;

export interface WorkflowEvent {
  runId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  step?: WorkflowStepId;
  progress?: WorkflowProgress;
}

// A listener that throws (e.g. an SSE route enqueuing to a controller a
// disconnected client already closed) must never propagate into the emitter's
// synchronous caller – that would corrupt the run-manager's persistence flow.
export function emitWorkflowEvent(event: WorkflowEvent): void {
  try {
    workflowEvents.emit("workflow", event);
  } catch (err) {
    console.error("[workflowEvents] listener threw", err);
  }
}
