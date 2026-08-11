import { describe, expect, it } from "vitest";
import {
  COALESCE_MS, EMPTY_HISTORY, HISTORY_LIMIT, coalesceKey, pushHistory,
} from "@/lib/screenshot-editor/history";
import { createEmptyDoc } from "@/lib/screenshot-docs";
import type { EditorAction } from "@/lib/screenshot-editor/reducer";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

const doc = (marker: number) => ({ ...createEmptyDoc(), selectedIndex: marker }) as ScreenshotDoc;
const scale = (v: number): EditorAction => ({ type: "set-screenshot-setting", index: 0, patch: { scale: v } });
const addElement: EditorAction = {
  type: "add-element", index: 0, element: { id: "e1", type: "emoji", x: 0, y: 0, width: 10, rotation: 0, opacity: 100, layer: "above-text" },
};

describe("pushHistory", () => {
  it("stacks the snapshot an action was applied to", () => {
    const a = doc(1);
    const b = doc(2);
    const one = pushHistory(EMPTY_HISTORY, a, addElement, 0);
    expect(pushHistory(one, b, addElement, 5000).stack).toEqual([a, b]);
  });

  it("is idempotent on the same snapshot – a doubled updater must not add a second step", () => {
    const a = doc(1);
    const once = pushHistory(EMPTY_HISTORY, a, addElement, 0);
    expect(pushHistory(once, a, addElement, 0).stack).toEqual([a]);
  });

  it("drops the oldest step past the limit", () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = pushHistory(h, doc(i), addElement, i * 5000);
    expect(h.stack).toHaveLength(HISTORY_LIMIT);
    expect(h.stack[0].selectedIndex).toBe(10); // the first ten are gone
  });

  it("purges on anything a snapshot could not survive", () => {
    const full = pushHistory(EMPTY_HISTORY, doc(1), addElement, 0);
    for (const type of [
      "replace-doc", "set-output-device", "toggle-output-device",
      "set-current-language", "add-language", "remove-language",
    ] as const) {
      expect(pushHistory(full, doc(4), { type } as EditorAction, 100).stack, type).toEqual([]);
    }
  });
});

describe("coalescing", () => {
  it("a slider drag is one step, not one per frame", () => {
    let h = EMPTY_HISTORY;
    const before = doc(0);
    for (let frame = 0; frame < 60; frame++) {
      h = pushHistory(h, frame === 0 ? before : doc(frame), scale(50 + frame), frame * 16);
    }
    expect(h.stack).toEqual([before]); // undo lands before the drag started
  });

  it("splits when the run pauses longer than the window", () => {
    const first = pushHistory(EMPTY_HISTORY, doc(0), scale(50), 0);
    const later = pushHistory(first, doc(1), scale(51), COALESCE_MS + 1);
    expect(later.stack).toHaveLength(2);
  });

  it("splits when another control takes over", () => {
    const first = pushHistory(EMPTY_HISTORY, doc(0), scale(50), 0);
    const other = pushHistory(first, doc(1), { type: "set-screenshot-setting", index: 0, patch: { rotation: 5 } }, 10);
    expect(other.stack).toHaveLength(2);
  });

  it("keeps discrete actions apart even back to back", () => {
    const first = pushHistory(EMPTY_HISTORY, doc(0), addElement, 0);
    expect(pushHistory(first, doc(1), addElement, 1).stack).toHaveLength(2);
  });

  it("keys a control by its target, so two sliders never merge", () => {
    expect(coalesceKey(scale(10))).toBe(coalesceKey(scale(20)));
    expect(coalesceKey(scale(10))).not.toBe(
      coalesceKey({ type: "set-screenshot-setting", index: 1, patch: { scale: 10 } }),
    );
    expect(coalesceKey({ type: "update-element", index: 0, elementId: "a", patch: { x: 1 } })).not.toBe(
      coalesceKey({ type: "update-element", index: 0, elementId: "b", patch: { x: 1 } }),
    );
    expect(coalesceKey(addElement)).toBeNull();
  });

  it("collapses typing in one field but not across fields", () => {
    const type1: EditorAction = { type: "set-headline", index: 0, language: "en-US", value: "He" };
    const type2: EditorAction = { type: "set-headline", index: 0, language: "en-US", value: "Hel" };
    const other: EditorAction = { type: "set-subheadline", index: 0, language: "en-US", value: "x" };
    let h = pushHistory(EMPTY_HISTORY, doc(0), type1, 0);
    h = pushHistory(h, doc(1), type2, 200);
    expect(h.stack).toHaveLength(1);
    expect(pushHistory(h, doc(2), other, 300).stack).toHaveLength(2);
  });
});
