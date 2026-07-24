import { describe, expect, it } from "vitest";
import {
  AI_GROUP_DEFAULT_TIER,
  AI_ROUTED_GROUPS,
  AI_TASK_GROUPS,
  groupForTask,
} from "@/lib/ai/tasks";

describe("ai task registry", () => {
  it("maps every task to a group", () => {
    expect(groupForTask("draft-reply")).toBe("redaction");
    expect(groupForTask("translate")).toBe("metadata");
    expect(groupForTask("reviews-insights")).toBe("insights");
  });

  it("covers the six /api/ai actions plus the two insights tasks plus the three workflow tasks", () => {
    expect(Object.keys(AI_TASK_GROUPS).sort()).toEqual([
      "analytics-insights", "draft-appeal", "draft-nomination", "draft-reply",
      "fix-keywords", "improve", "reviews-insights", "translate",
      "workflow-compose", "workflow-relevance", "workflow-seeds",
    ]);
  });

  it("ships a default tier for every group", () => {
    expect(AI_GROUP_DEFAULT_TIER).toEqual({
      redaction: "local", metadata: "byok", insights: "byok", workflows: "byok",
    });
  });

  it("maps the three workflow tasks to the workflows group", () => {
    expect(groupForTask("workflow-seeds")).toBe("workflows");
    expect(groupForTask("workflow-relevance")).toBe("workflows");
    expect(groupForTask("workflow-compose")).toBe("workflows");
  });

  it("exposes the workflows group last in routing UI", () => {
    expect(AI_ROUTED_GROUPS).toEqual(["redaction", "metadata", "insights", "workflows"]);
  });
});
