// Undo stack for the editor doc. Snapshots are the reducer's own immutable states, so a step
// costs a reference, not a copy – and nothing here is ever persisted: the history lives for the
// life of the page and never reaches the database or an exported document.
import type { EditorAction } from "./reducer";
import type { ScreenshotDoc } from "./types";

/** Deep enough for a working session, short enough to stay cheap. */
export const HISTORY_LIMIT = 100;

/**
 * A slider drag emits an action per frame and a typed headline one per keystroke. Consecutive runs
 * on the same control collapse into the step that precedes the whole run, so one drag costs one
 * undo. Long enough to survive a pause mid-drag or between two keystrokes, short enough that
 * coming back to the same slider a moment later is its own step.
 */
export const COALESCE_MS = 1000;

export interface HistoryState {
  stack: ScreenshotDoc[];
  /** Control the last step came from, null when it cannot be coalesced with anything. */
  key: string | null;
  at: number;
}

export const EMPTY_HISTORY: HistoryState = { stack: [], key: null, at: 0 };

/**
 * Actions after which a snapshot could no longer be replayed safely, so the stack is dropped
 * instead – best effort, and at the first risk we purge:
 *  - replace-doc: an import or a restored version, the old doc belongs to another document;
 *  - the format actions: undoing across a canvas resize would restore sizes for the wrong one;
 *  - the language actions: a snapshot keyed by a language that no longer exists.
 */
const PURGING: ReadonlySet<EditorAction["type"]> = new Set([
  "replace-doc",
  "set-output-device",
  "toggle-output-device",
  "set-custom-size",
  "set-current-language",
  "add-language",
  "remove-language",
]);

/**
 * Identifies the control an action came from: same key in a row = one continuous edit. Null for
 * the discrete ones (add, delete, reorder, style transfer…), which always earn their own step.
 */
export function coalesceKey(action: EditorAction): string | null {
  const patch = (action as { patch?: Record<string, unknown> }).patch;
  const fields = patch ? Object.keys(patch).sort().join(",") : "";
  switch (action.type) {
    case "set-background":
    case "set-screenshot-setting":
    case "set-shadow":
    case "set-frame":
    case "set-text-setting":
      return `${action.type}:${action.index}:${fields}`;
    case "set-language-layout":
      return `${action.type}:${action.index}:${action.language}:${fields}`;
    case "set-gradient-stop":
      return `${action.type}:${action.index}:${action.stopIndex}:${fields}`;
    case "set-headline":
    case "set-subheadline":
      return `${action.type}:${action.index}:${action.language}`;
    case "set-element-text":
      return `${action.type}:${action.index}:${action.elementId}:${action.language}`;
    case "update-element":
    case "set-element-icon-shadow":
      return `${action.type}:${action.index}:${action.elementId}:${fields}`;
    case "update-popout":
    case "set-popout-shadow":
    case "set-popout-border":
      return `${action.type}:${action.index}:${action.popoutId}:${fields}`;
    default:
      return null;
  }
}

/**
 * `at` comes from the caller rather than Date.now() so the function stays pure – React may run a
 * state updater twice, and both runs must land on the same stack.
 */
export function pushHistory(
  history: HistoryState,
  previous: ScreenshotDoc,
  action: EditorAction,
  at: number,
  limit = HISTORY_LIMIT,
): HistoryState {
  if (PURGING.has(action.type)) return { ...EMPTY_HISTORY, at };
  const key = coalesceKey(action);
  // Still the same control: the step already on top predates the run, keep it and let it grow.
  if (key !== null && key === history.key && at - history.at < COALESCE_MS) {
    return { ...history, at };
  }
  // Idempotent on the same snapshot, for a doubled updater.
  if (history.stack[history.stack.length - 1] === previous) return { ...history, key, at };
  const stack = [...history.stack, previous];
  return { stack: stack.length > limit ? stack.slice(stack.length - limit) : stack, key, at };
}
