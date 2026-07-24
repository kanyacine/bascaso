// Supervises the `afm-server` sidecar (Swift CLI wrapping Apple's on-device
// FoundationModels, see native/afm-server/) from the Electron main process.
//
// Contract with the binary (native/afm-server/Sources/AfmServer/main.swift):
//   afm-server --check  -> one line of JSON {"available":bool,"reason":string|null}, exit 0
//   afm-server --serve  -> binds a free port in 43110-43119, prints "PORT=<n>\n"
//                          (flushed) then serves HTTP; exits non-zero if unavailable
//                          or no free port was found.
import { app } from "electron";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

export function afmBinaryPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "afm-server")
    : path.join(app.getAppPath(), "native/afm-server/.build/release/afm-server");
}

export function checkAfmAvailability(): { available: boolean; reason?: string } {
  try {
    const result = spawnSync(afmBinaryPath(), ["--check"], { encoding: "utf8" });
    if (result.error || result.status !== 0 || !result.stdout) {
      return { available: false, reason: "sidecar_missing" };
    }
    const parsed = JSON.parse(result.stdout.trim()) as { available: boolean; reason: string | null };
    return { available: parsed.available, reason: parsed.reason ?? undefined };
  } catch {
    return { available: false, reason: "sidecar_missing" };
  }
}

let afmProcess: ChildProcess | null = null;
let currentStateFile: string | null = null;
let restartAttempts = 0;
let stopping = false;
let pendingRespawn: ReturnType<typeof setTimeout> | null = null;

// ponytail: fixed 3-try backoff schedule (1s / 5s / 15s) instead of exponential
// backoff with jitter – this supervises one best-effort local sidecar, not a
// fleet of distributed workers; if it can't stay up within ~21s it's not going to.
const BACKOFF_MS = [1_000, 5_000, 15_000];

// ponytail: 30s is a "did it actually come up" threshold, not a tuned SLO –
// long enough that a crash-loop (bind, print PORT, die immediately) never
// refills the retry budget, short enough that a sidecar which served fine
// for half a minute is trusted again after a later, unrelated crash.
const MIN_UPTIME_MS = 30_000;

function writeStateFile(stateFile: string, data: unknown): void {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(data));
  } catch (err) {
    console.error("[afm-sidecar] failed to write state file:", err);
  }
}

function removeStateFile(stateFile: string): void {
  try {
    fs.rmSync(stateFile, { force: true });
  } catch (err) {
    console.error("[afm-sidecar] failed to remove state file:", err);
  }
}

export function startAfmSidecar(stateFile: string): void {
  currentStateFile = stateFile;
  stopping = false;
  restartAttempts = 0;

  const availability = checkAfmAvailability();
  if (!availability.available) {
    writeStateFile(stateFile, { error: availability.reason ?? "unavailable" });
    return;
  }

  spawnSidecar(stateFile);
}

function spawnSidecar(stateFile: string): void {
  const child = spawn(afmBinaryPath(), ["--serve"], { stdio: ["ignore", "pipe", "pipe"] });
  afmProcess = child;
  const spawnedAt = Date.now();

  const rl = createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    const match = /^PORT=(\d+)/.exec(line);
    if (!match) return;
    writeStateFile(stateFile, { port: Number(match[1]) });
  });

  // Drain stderr so a long-running --serve child never blocks on a full pipe
  // buffer, and surface it in the electron log for diagnosing failures.
  child.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[afm-server] ${chunk.toString().trim()}`);
  });

  // `exit` and `error` can both fire for the same failed spawn; a per-child
  // guard keeps the retry counter (and the resulting setTimeout chain) from
  // being driven twice for one process.
  let settled = false;
  const handleExit = () => {
    if (settled) return;
    settled = true;
    rl.close();
    afmProcess = null;
    if (stopping) return;

    // Only forgive past failures once the child proved it could stay up for
    // a while. Resetting on every PORT line (instead of on sustained uptime)
    // let a bind-then-immediately-die crash loop respawn forever at ~1s
    // cadence, never hitting the cap below.
    if (Date.now() - spawnedAt > MIN_UPTIME_MS) {
      restartAttempts = 0;
    }

    if (restartAttempts >= BACKOFF_MS.length) {
      removeStateFile(stateFile);
      return;
    }
    const delay = BACKOFF_MS[restartAttempts];
    restartAttempts += 1;
    pendingRespawn = setTimeout(() => {
      pendingRespawn = null;
      if (!stopping) spawnSidecar(stateFile);
    }, delay);
  };

  child.on("exit", handleExit);
  child.on("error", handleExit);
}

export function stopAfmSidecar(): void {
  stopping = true;
  if (pendingRespawn) {
    clearTimeout(pendingRespawn);
    pendingRespawn = null;
  }
  if (afmProcess) {
    afmProcess.kill();
    afmProcess = null;
  }
  if (currentStateFile) {
    removeStateFile(currentStateFile);
    currentStateFile = null;
  }
}
