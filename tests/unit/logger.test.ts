import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initLogger, getLogPath, getLogDir } from "../../electron/logger";

const mockLogDir = path.join(os.tmpdir(), `logger-test-${process.pid}`);
const MAX_LOG_SIZE = 10 * 1024 * 1024;

describe("logger", () => {
  beforeEach(() => {
    fs.mkdirSync(mockLogDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(mockLogDir, { recursive: true, force: true });
  });

  it("initLogger creates log directory and sets paths", () => {
    initLogger(mockLogDir);
    expect(getLogDir()).toBe(mockLogDir);
    expect(getLogPath()).toBe(path.join(mockLogDir, "itsyconnect.log"));
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toContain("--- App starting");
  });

  it("console.log writes to log file with [info] level", () => {
    initLogger(mockLogDir);
    console.log("test message");
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toContain("[info] test message");
  });

  it("console.warn writes to log file with [warn] level", () => {
    initLogger(mockLogDir);
    console.warn("warning message");
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toContain("[warn] warning message");
  });

  it("console.error writes to log file with [error] level", () => {
    initLogger(mockLogDir);
    console.error("error message");
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toContain("[error] error message");
  });

  it("formats timestamps as [YYYY-MM-DD HH:MM:SS]", () => {
    initLogger(mockLogDir);
    console.log("timestamp check");
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
  });

  it("serialises non-string arguments as JSON", () => {
    initLogger(mockLogDir);
    console.log("data:", { key: "value" });
    const content = fs.readFileSync(getLogPath(), "utf-8");
    expect(content).toContain('"key": "value"');
  });

  it("rotates log file when it exceeds 10 MB", () => {
    initLogger(mockLogDir);
    const logFile = getLogPath();

    // Write > 10 MB to the log file directly
    const bigContent = "x".repeat(MAX_LOG_SIZE + 1);
    fs.writeFileSync(logFile, bigContent);

    // Next write should trigger rotation
    console.log("after rotation");

    expect(fs.existsSync(logFile + ".1")).toBe(true);
    const rotatedContent = fs.readFileSync(logFile + ".1", "utf-8");
    expect(rotatedContent).toBe(bigContent);

    const newContent = fs.readFileSync(logFile, "utf-8");
    expect(newContent).toContain("after rotation");
    expect(newContent).not.toContain("x".repeat(100));
  });

  it("keeps only one backup file", () => {
    initLogger(mockLogDir);
    const logFile = getLogPath();

    // Create existing backup
    fs.writeFileSync(logFile + ".1", "old backup");

    // Write > 10 MB to trigger rotation
    fs.writeFileSync(logFile, "y".repeat(MAX_LOG_SIZE + 1));
    console.log("new entry");

    // Old backup should be replaced
    const backup = fs.readFileSync(logFile + ".1", "utf-8");
    expect(backup).not.toBe("old backup");
    expect(backup).toContain("y".repeat(100));
  });
});
