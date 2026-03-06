export type AscErrorCategory = "auth" | "connection" | "api";

export interface AscErrorEntry {
  code: string;
  title: string;
  detail: string;
  source?: { pointer?: string };
}

export interface AscError {
  category: AscErrorCategory;
  message: string;
  statusCode?: number;
  method?: string;
  path?: string;
  entries?: AscErrorEntry[];
  associatedErrors?: Record<string, AscErrorEntry[]>;
}

/**
 * Parse an ASC API error response into a structured AscError.
 * Extracts the full `errors[]` array from the JSON:API envelope.
 */
export function parseAscError(status: number, responseText: string): AscError {
  let detail: string | undefined;
  let entries: AscErrorEntry[] | undefined;

  let associatedErrors: Record<string, AscErrorEntry[]> | undefined;

  try {
    const body = JSON.parse(responseText);
    if (Array.isArray(body?.errors)) {
      const parsed: AscErrorEntry[] = body.errors.map((e: Record<string, unknown>) => ({
        code: (e.code as string) ?? "",
        title: (e.title as string) ?? "",
        detail: (e.detail as string) ?? "",
        source: e.source as { pointer?: string } | undefined,
      }));
      entries = parsed;
      detail = parsed[0]?.detail;

      // Extract associatedErrors from meta (e.g. 409 submission errors)
      const meta = body.errors[0]?.meta as Record<string, unknown> | undefined;
      const assocRaw = meta?.associatedErrors as Record<string, unknown[]> | undefined;
      if (assocRaw) {
        associatedErrors = {};
        for (const [key, errs] of Object.entries(assocRaw)) {
          if (Array.isArray(errs)) {
            associatedErrors[key] = errs.map((e: unknown) => {
              const entry = e as Record<string, unknown>;
              return {
              code: (entry.code as string) ?? "",
              title: (entry.title as string) ?? "",
              detail: (entry.detail as string) ?? "",
              source: entry.source as { pointer?: string } | undefined,
            };
            });
          }
        }
      }
    }
  } catch {
    // Not JSON – use default messages below
  }

  if (status === 401 || status === 403) {
    return {
      category: "auth",
      message: detail ?? "API key may be invalid or expired",
      statusCode: status,
      entries,
      associatedErrors,
    };
  }

  if (status >= 500) {
    return {
      category: "connection",
      message: detail ?? "App Store Connect is temporarily unavailable",
      statusCode: status,
      entries,
      associatedErrors,
    };
  }

  return {
    category: "api",
    message: detail ?? `App Store Connect returned an error (${status})`,
    statusCode: status,
    entries,
    associatedErrors,
  };
}

/** Build an AscError for a network-level failure (no HTTP response). */
export function networkError(): AscError {
  return {
    category: "connection",
    message: "Could not connect to App Store Connect",
  };
}
