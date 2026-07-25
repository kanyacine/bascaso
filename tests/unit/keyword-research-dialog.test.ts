import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canRetryForFree } from "@/app/dashboard/apps/[appId]/aso/keywords/research/_components/keyword-research-dialog";

// Re-review Important : le hint "gratuit" s'affichait sans jamais vérifier
// si le retry avait une chance réelle de rester dans la fenêtre de 90 min du
// backend. canRetryForFree isole cette décision (30 min = 90 - le budget de
// 60 min qu'un retry peut lui-même consommer) pour la tester sans dépendre
// de l'horloge réelle.
describe("canRetryForFree", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is free for a fast failure (createdAt seconds ago)", () => {
    const createdAt = new Date("2026-01-01T11:59:50.000Z").toISOString();
    expect(canRetryForFree(createdAt)).toBe(true);
  });

  it("is free comfortably inside the 30-minute safe window", () => {
    const createdAt = new Date("2026-01-01T11:45:00.000Z").toISOString(); // 15 min ago
    expect(canRetryForFree(createdAt)).toBe(true);
  });

  // The exact case the review flagged: a run that itself burned the full
  // 60-minute wall-clock budget before failing – createdAt is already 60 min
  // old by the time the user can even click Retry.
  it("is NOT free for a run that exhausted its own 60-minute wall-clock budget", () => {
    const createdAt = new Date("2026-01-01T11:00:00.000Z").toISOString(); // 60 min ago
    expect(canRetryForFree(createdAt)).toBe(false);
  });

  it("boundary: just under 30 min is free, just over is not", () => {
    const justUnder = new Date("2026-01-01T11:30:01.000Z").toISOString(); // 29:59 ago
    const justOver = new Date("2026-01-01T11:29:59.000Z").toISOString(); // 30:01 ago
    expect(canRetryForFree(justUnder)).toBe(true);
    expect(canRetryForFree(justOver)).toBe(false);
  });

  it("is not free for a run from hours ago", () => {
    const createdAt = new Date("2026-01-01T09:00:00.000Z").toISOString(); // 3 h ago
    expect(canRetryForFree(createdAt)).toBe(false);
  });
});
