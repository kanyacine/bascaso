import type { ConnectionError } from "@/lib/apps-context";
import type { MessageKey } from "./messages";

/** Server fallback keys (AscError.fallbackKey) → catalog keys. */
const SERVER_MESSAGE_KEYS: Record<string, MessageKey> = {
  authInvalid: "connectionErrors.authInvalid",
  ascUnavailable: "connectionErrors.ascUnavailable",
  ascUnreachable: "connectionErrors.ascUnreachable",
  ascError: "connectionErrors.ascError",
};

/** Resolve a connection error to a user-facing string. */
export function resolveConnectionErrorMessage(
  error: ConnectionError,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  if (error.key) return t(error.key);

  const mapped = error.messageKey
    ? SERVER_MESSAGE_KEYS[error.messageKey]
    : undefined;
  if (mapped) {
    return t(mapped, error.status !== undefined ? { status: error.status } : undefined);
  }

  const msg = error.message.trim();
  if (!msg) return t("common.unknownError");

  // ASC API detail text – keep server message as-is
  return msg;
}
