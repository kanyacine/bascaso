import { readFileSync } from "node:fs";

export const APPLE_FM_PROVIDER_ID = "apple-fm";
export const APPLE_FM_MODEL_ID = "apple-fm";
/** ~3k tokens of the 4k window at 4 chars/token – leaves room for the answer.
 *  ponytail: char-based estimate; swap for a tokenizer if it ever misfires. */
export const APPLE_FM_MAX_INPUT_CHARS = 12_000;

export type AppleFmStatus = {
  available: boolean;
  reason: string | null;
  /** BCP-47 language codes the model supports, when available (e.g. ["en","fr"]). */
  languages?: string[];
};

/**
 * Read the sidecar's live TCP port from the state file Electron writes.
 * The path comes from AFM_STATE_FILE; the file is `{"port":<n>}` when the
 * sidecar is up (or `{"error":<reason>}` when it failed to start). Returns
 * null when the env var is unset, the file is unreadable, or it has no port.
 */
function readAppleFmPort(): number | null {
  const stateFile = process.env.AFM_STATE_FILE;
  if (!stateFile) return null;
  try {
    const parsed = JSON.parse(readFileSync(stateFile, "utf8")) as { port?: unknown };
    return typeof parsed.port === "number" ? parsed.port : null;
  } catch {
    return null;
  }
}

/**
 * The sidecar's OpenAI-compatible `/v1` base URL, derived from the live port.
 * Null when the sidecar isn't running (no state file / no port). The live URL
 * is read fresh each call – the stored settings row never holds it.
 */
export function getAppleFmBaseUrl(): string | null {
  const port = readAppleFmPort();
  return port == null ? null : `http://127.0.0.1:${port}/v1`;
}

/**
 * Probe the sidecar's availability. `/health` lives at the ROOT (not under
 * `/v1`), so we hit it directly from the port. No state file → sidecar_missing;
 * any network failure or non-ok response → sidecar_unreachable (the only
 * network reason); a 200 returns the server's own `{available, reason}` verdict.
 */
export async function getAppleFmStatus(): Promise<AppleFmStatus> {
  const port = readAppleFmPort();
  if (port == null) {
    return { available: false, reason: "sidecar_missing" };
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return { available: false, reason: "sidecar_unreachable" };
    }
    const body = (await res.json()) as AppleFmStatus;
    return {
      available: Boolean(body.available),
      reason: body.reason ?? null,
      languages: Array.isArray(body.languages) ? body.languages : undefined,
    };
  } catch {
    return { available: false, reason: "sidecar_unreachable" };
  }
}
