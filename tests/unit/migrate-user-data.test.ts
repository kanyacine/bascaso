import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DB_FILE_NAME, migrateLegacyUserData } from "../../electron/migrate-user-data";

// Deux répertoires frères, comme dans ~/Library/Application Support : la
// migration déduit l'ancien du parent du nouveau.
let root: string;
let legacyDir: string;
let userDataDir: string;

function write(dir: string, name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function read(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name), "utf-8");
}

describe("legacy userData migration", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
    legacyDir = path.join(root, "itsyconnect-macos");
    userDataDir = path.join(root, "bascaso");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Le cas qui justifie tout ce module : sans master-key.enc, les identifiants
  // ASC et la session cloud stockés chiffrés sont définitivement illisibles –
  // aucun « refaire le setup » ne les récupère.
  it("carries the master key and the database across", () => {
    write(legacyDir, "master-key.enc", "encrypted-key");
    write(legacyDir, "itsyconnect.db", "sqlite-bytes");

    migrateLegacyUserData(userDataDir);

    expect(read(userDataDir, "master-key.enc")).toBe("encrypted-key");
    expect(read(userDataDir, DB_FILE_NAME)).toBe("sqlite-bytes");
  });

  // Une base fermée sans commit garde ses dernières transactions dans le -wal :
  // migrer le fichier principal seul les perdrait en silence.
  it("carries the sqlite sidecar files across", () => {
    write(legacyDir, "itsyconnect.db", "main");
    write(legacyDir, "itsyconnect.db-wal", "wal");
    write(legacyDir, "itsyconnect.db-shm", "shm");

    migrateLegacyUserData(userDataDir);

    expect(read(userDataDir, `${DB_FILE_NAME}-wal`)).toBe("wal");
    expect(read(userDataDir, `${DB_FILE_NAME}-shm`)).toBe("shm");
  });

  it("copies rather than moves, so a failed launch cannot destroy the only copy", () => {
    write(legacyDir, "master-key.enc", "encrypted-key");

    migrateLegacyUserData(userDataDir);

    expect(read(legacyDir, "master-key.enc")).toBe("encrypted-key");
  });

  // Idempotence : au second lancement la destination existe déjà. L'écraser avec
  // la copie figée d'avant migration ferait perdre tout le travail depuis.
  it("never overwrites an existing destination", () => {
    write(legacyDir, "itsyconnect.db", "stale");
    write(userDataDir, DB_FILE_NAME, "current");

    migrateLegacyUserData(userDataDir);

    expect(read(userDataDir, DB_FILE_NAME)).toBe("current");
  });

  it("does nothing on a fresh install with no legacy directory", () => {
    migrateLegacyUserData(userDataDir);

    expect(fs.existsSync(path.join(userDataDir, DB_FILE_NAME))).toBe(false);
  });

  it("skips files the legacy directory does not have", () => {
    write(legacyDir, "master-key.enc", "encrypted-key");

    migrateLegacyUserData(userDataDir);

    expect(fs.existsSync(path.join(userDataDir, DB_FILE_NAME))).toBe(false);
    expect(read(userDataDir, "master-key.enc")).toBe("encrypted-key");
  });

  // Un échec de copie ne doit jamais empêcher l'app de démarrer : une install
  // neuve reste une install qui marche.
  it("does not throw when a file cannot be copied", () => {
    write(legacyDir, "master-key.enc", "encrypted-key");
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => {
      throw new Error("EACCES");
    });

    expect(() => migrateLegacyUserData(userDataDir)).not.toThrow();
  });
});
