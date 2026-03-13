import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockRun = vi.fn();
const mockGetAISettings = vi.fn();
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          run: mockRun,
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        run: mockRun,
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  appPreferences: { key: "key", value: "value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAISettings: (...args: unknown[]) => mockGetAISettings(...args),
}));

import {
  getGeminiKey,
  saveGeminiKey,
  removeGeminiKey,
  hasGeminiKey,
} from "@/lib/ai/gemini-key";

describe("gemini-key", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockGetAISettings.mockReset();
    mockEncrypt.mockReset();
    mockDecrypt.mockReset();
  });

  describe("getGeminiKey", () => {
    it("returns key from google provider settings", async () => {
      mockGetAISettings.mockResolvedValue({
        provider: "google",
        apiKey: "google-key-123",
      });

      const result = await getGeminiKey();
      expect(result).toBe("google-key-123");
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("returns key from dedicated DB preference", async () => {
      mockGetAISettings.mockResolvedValue({
        provider: "anthropic",
        apiKey: "anthropic-key",
      });

      const encrypted = {
        ciphertext: "ct",
        iv: "iv",
        authTag: "tag",
        encryptedDek: "dek",
      };
      mockGet.mockReturnValue({ value: JSON.stringify(encrypted) });
      mockDecrypt.mockReturnValue("dedicated-gemini-key");

      const result = await getGeminiKey();
      expect(result).toBe("dedicated-gemini-key");
      expect(mockDecrypt).toHaveBeenCalledWith(encrypted);
    });

    it("returns null when no key is available", async () => {
      mockGetAISettings.mockResolvedValue(null);
      mockGet.mockReturnValue(undefined);

      const result = await getGeminiKey();
      expect(result).toBeNull();
    });

    it("returns null on JSON parse error", async () => {
      mockGetAISettings.mockResolvedValue(null);
      mockGet.mockReturnValue({ value: "not-valid-json" });

      const result = await getGeminiKey();
      expect(result).toBeNull();
    });
  });

  describe("saveGeminiKey", () => {
    it("encrypts and stores the key", () => {
      mockEncrypt.mockReturnValue({
        ciphertext: "ct",
        iv: "iv",
        authTag: "tag",
        encryptedDek: "dek",
      });

      saveGeminiKey("my-api-key");

      expect(mockEncrypt).toHaveBeenCalledWith("my-api-key");
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("removeGeminiKey", () => {
    it("deletes the key from DB", () => {
      removeGeminiKey();
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("hasGeminiKey", () => {
    it("returns true when google provider is configured", async () => {
      mockGetAISettings.mockResolvedValue({ provider: "google" });

      const result = await hasGeminiKey();
      expect(result).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("returns true when dedicated key exists in DB", async () => {
      mockGetAISettings.mockResolvedValue({
        provider: "anthropic",
      });
      mockGet.mockReturnValue({ value: "some-encrypted-value" });

      const result = await hasGeminiKey();
      expect(result).toBe(true);
    });

    it("returns false when no key is available", async () => {
      mockGetAISettings.mockResolvedValue(null);
      mockGet.mockReturnValue(undefined);

      const result = await hasGeminiKey();
      expect(result).toBe(false);
    });
  });
});
