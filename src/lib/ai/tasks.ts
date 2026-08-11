/** Every place the app calls an LLM, keyed by a stable task id.
 *  /api/ai actions reuse their action name as task id on purpose. */
export type AITaskId =
  | "translate"
  | "improve"
  | "fix-keywords"
  | "draft-reply"
  | "draft-appeal"
  | "draft-nomination"
  | "reviews-insights"
  | "analytics-insights"
  | "workflow-seeds"
  | "workflow-relevance"
  | "workflow-compose";

export type AIGroupId = "redaction" | "metadata" | "insights" | "workflows";
export type AITier = "local" | "byok" | "managed";

export const AI_TASK_GROUPS: Record<AITaskId, AIGroupId> = {
  "draft-reply": "redaction",
  "draft-appeal": "redaction",
  "draft-nomination": "redaction",
  translate: "metadata",
  improve: "metadata",
  "fix-keywords": "metadata",
  "reviews-insights": "insights",
  "analytics-insights": "insights",
  "workflow-seeds": "workflows",
  "workflow-relevance": "workflows",
  "workflow-compose": "workflows",
};

/** Shipped defaults – the routing UI resets to these. */
export const AI_GROUP_DEFAULT_TIER: Record<AIGroupId, AITier> = {
  redaction: "local",
  metadata: "byok",
  insights: "byok",
  workflows: "byok",
};

/** Groups shown in the routing settings UI, in display order. */
export const AI_ROUTED_GROUPS: AIGroupId[] = ["redaction", "metadata", "insights", "workflows"];

export function groupForTask(taskId: AITaskId): AIGroupId {
  return AI_TASK_GROUPS[taskId];
}
