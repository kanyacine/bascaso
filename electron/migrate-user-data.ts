import fs from "node:fs";
import path from "node:path";

/** Database filename, and the origin host the production window loads from.
 *  Both moved with the rebranding; kept here so the migration below and main.ts
 *  agree on what the new names are. */
export const DB_FILE_NAME = "bascaso.db";

const LEGACY_USER_DATA_DIR = "itsyconnect-macos";
const LEGACY_DB_FILE_NAME = "itsyconnect.db";

/** What gets carried across, old name → new name.
 *
 *  master-key.enc first: without it every stored ASC credential and the cloud
 *  session are permanently undecryptable, so it is the one file whose loss
 *  cannot be undone by re-running setup.
 *
 *  The sqlite sidecars matter too – a database that was not closed cleanly keeps
 *  its most recent transactions in the -wal, not in the main file. */
const MIGRATED_FILES: readonly (readonly [string, string])[] = [
  ["master-key.enc", "master-key.enc"],
  [LEGACY_DB_FILE_NAME, DB_FILE_NAME],
  [`${LEGACY_DB_FILE_NAME}-wal`, `${DB_FILE_NAME}-wal`],
  [`${LEGACY_DB_FILE_NAME}-shm`, `${DB_FILE_NAME}-shm`],
];

/**
 * Carry an install off the upstream userData directory.
 *
 * Electron derives `app.getPath("userData")` from package.json's `name`, so
 * renaming the package to "bascaso" silently moved the whole directory and left
 * the previous one behind, master key included.
 *
 * Copies rather than moves: a launch that fails midway must not destroy the only
 * copy, and the legacy directory stays for the user to delete once they are
 * satisfied. Caches, cookies and Local Storage are deliberately not carried over
 * – they regenerate, and the `app://` origin rename discards that storage anyway.
 *
 * Must run before the master key is read, which would otherwise mint a fresh one
 * and strand the old ciphertext for good. Never throws: a fresh install is still
 * a working install, and failing here would leave the app unable to start.
 *
 * Delete this once no install predates the rename.
 */
export function migrateLegacyUserData(userDataDir: string): void {
  const legacyDir = path.join(path.dirname(userDataDir), LEGACY_USER_DATA_DIR);
  if (path.resolve(legacyDir) === path.resolve(userDataDir)) return;
  if (!fs.existsSync(legacyDir)) return;

  for (const [from, to] of MIGRATED_FILES) {
    const src = path.join(legacyDir, from);
    const dest = path.join(userDataDir, to);
    // An existing destination wins: the migration already ran, or this install
    // has data of its own that must not be overwritten by an older copy.
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`[migrate] carried ${from} over from ${legacyDir}`);
    } catch (err) {
      console.error(`[migrate] could not carry ${from} over:`, err);
    }
  }
}
