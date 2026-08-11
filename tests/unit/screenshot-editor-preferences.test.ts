import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockRun = vi.fn();
const mockValues = vi.fn(() => ({ onConflictDoUpdate: () => ({ run: mockRun }) }));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: mockGet }) }) }),
    insert: () => ({ values: mockValues }),
  },
}));
vi.mock("@/db/schema", () => ({ appPreferences: { key: "key", value: "value" } }));
vi.mock("drizzle-orm", () => ({ eq: (col: string, val: string) => ({ col, val }) }));

import { getGoogleFontsEnabled, setGoogleFontsEnabled } from "@/lib/screenshot-editor-preferences";

describe("screenshot editor preferences", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockValues.mockClear();
  });

  it("keeps Google downloads off until they are granted", () => {
    mockGet.mockReturnValue(undefined);
    expect(getGoogleFontsEnabled()).toBe(false);
    mockGet.mockReturnValue({ value: "false" });
    expect(getGoogleFontsEnabled()).toBe(false);
    mockGet.mockReturnValue({ value: "true" });
    expect(getGoogleFontsEnabled()).toBe(true);
  });

  it("stays off when the database is unreadable", () => {
    mockGet.mockImplementation(() => { throw new Error("DB error"); });
    expect(getGoogleFontsEnabled()).toBe(false);
  });

  it("stores the flag as a string under its own key", () => {
    setGoogleFontsEnabled(true);
    expect(mockValues).toHaveBeenCalledWith({
      key: "screenshot_editor_google_fonts", value: "true",
    });
    expect(mockRun).toHaveBeenCalled();
  });
});
