import type { EventEmitter } from "node:events";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AscApiError } from "@/lib/asc/client";
import type { AscErrorEntry } from "@/lib/asc/errors";
import { AIRoutingError } from "@/lib/ai/provider-factory";

/**
 * Build an error JSON response from a caught value.
 * For AscApiError, includes category, ascErrors, ascMethod, and ascPath
 * so the client can show structured error details.
 */
export function errorJson(err: unknown, status = 502, fallback = "Unknown error"): NextResponse {
  if (err instanceof AscApiError) {
    const { message, category, fallbackKey, statusCode, entries, method, path, associatedErrors } = err.ascError;
    return NextResponse.json(
      {
        error: message,
        category,
        statusCode,
        ...(fallbackKey && { messageKey: fallbackKey }),
        ...(entries && { ascErrors: entries }),
        ...(method && { ascMethod: method }),
        ...(path && { ascPath: path }),
        ...(associatedErrors && { ascAssociatedErrors: associatedErrors }),
      },
      { status: statusCode ?? status },
    );
  }

  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

/** Map a routing failure to the API shape callers already handle. */
export function routingErrorResponse(err: unknown): Response {
  if (err instanceof AIRoutingError) {
    const body =
      err.code === "local_server_unavailable"
        ? { error: err.message } // existing local-server copy stays user-facing
        : { error: err.code, reason: err.message };
    return NextResponse.json(body, { status: err.status });
  }
  return NextResponse.json({ error: "ai_not_configured" }, { status: 400 });
}

/**
 * Parse a JSON request body and validate it against a Zod schema.
 * Returns either the parsed data or an error Response (400).
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | Response> {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  return parsed.data;
}

/**
 * Server-sent events relaying one emitter event: a `data:` frame per event, a heartbeat
 * so an idle connection is not dropped, and a listener detached as soon as the client
 * goes away.
 */
export function sseStream(emitter: EventEmitter, event: string): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // Enqueuing to a controller a disconnected client already closed throws;
      // detach immediately so the throw can't reach the event's emitter.
      function send(frame: string) {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          cleanup();
        }
      }

      function onEvent(payload: unknown) {
        send(`data: ${JSON.stringify(payload)}\n\n`);
      }

      emitter.on(event, onEvent);
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 30_000);

      cleanup = () => {
        emitter.off(event, onEvent);
        clearInterval(heartbeat);
      };

      send(": connected\n\n");
    },
    // Runs when the client disconnects – remove the listener right away rather
    // than waiting up to 30s for the next heartbeat to fail.
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export interface SyncError {
  operation: "update" | "create" | "delete";
  locale: string;
  message: string;
  ascErrors?: AscErrorEntry[];
  ascMethod?: string;
  ascPath?: string;
}

export interface SyncLocalizationsMutations {
  update: (id: string, fields: Record<string, unknown>) => Promise<void>;
  create: (parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>;
  delete: (id: string) => Promise<void>;
  invalidateCache: () => void;
}

/**
 * Core localization sync logic: update existing, create new, delete removed.
 * Accepts data directly – no Request parsing.
 */
export async function syncLocalizationsFromData(
  locales: Record<string, Record<string, unknown>>,
  originalLocaleIds: Record<string, string>,
  parentId: string,
  mutations: SyncLocalizationsMutations,
): Promise<{ ok: boolean; errors: SyncError[]; createdIds: Record<string, string> }> {
  const errors: SyncError[] = [];
  const createdIds: Record<string, string> = {};

  console.log("[syncLocalizations] parentId=%s locales=%s existing=%s", parentId, Object.keys(locales).join(","), Object.keys(originalLocaleIds).join(","));

  // Process mutations sequentially to avoid hitting ASC rate limits.
  // Parallel requests caused RATE_LIMIT_EXCEEDED errors for users with many locales.

  for (const [locale, fields] of Object.entries(locales)) {
    const existingId = originalLocaleIds[locale];
    if (existingId) {
      console.log("[syncLocalizations] update locale=%s id=%s fields=%s", locale, existingId, Object.keys(fields).join(","));
      try {
        await mutations.update(existingId, fields);
      } catch (err) {
        const syncErr: SyncError = {
          operation: "update",
          locale,
          message: err instanceof Error ? err.message : "failed",
        };
        if (err instanceof AscApiError) {
          syncErr.ascErrors = err.ascError.entries;
          syncErr.ascMethod = err.ascError.method;
          syncErr.ascPath = err.ascError.path;
        }
        errors.push(syncErr);
      }
    } else {
      console.log("[syncLocalizations] create locale=%s fields=%s", locale, Object.keys(fields).join(","));
      try {
        const id = await mutations.create(parentId, locale, fields);
        console.log("[syncLocalizations] created locale=%s id=%s", locale, id);
        createdIds[locale] = id;
      } catch (err) {
        const syncErr: SyncError = {
          operation: "create",
          locale,
          message: err instanceof Error ? err.message : "failed",
        };
        if (err instanceof AscApiError) {
          syncErr.ascErrors = err.ascError.entries;
          syncErr.ascMethod = err.ascError.method;
          syncErr.ascPath = err.ascError.path;
        }
        errors.push(syncErr);
      }
    }
  }

  for (const [locale, locId] of Object.entries(originalLocaleIds)) {
    if (!locales[locale]) {
      try {
        await mutations.delete(locId);
      } catch (err) {
        const syncErr: SyncError = {
          operation: "delete",
          locale,
          message: err instanceof Error ? err.message : "failed",
        };
        if (err instanceof AscApiError) {
          syncErr.ascErrors = err.ascError.entries;
          syncErr.ascMethod = err.ascError.method;
          syncErr.ascPath = err.ascError.path;
        }
        errors.push(syncErr);
      }
    }
  }

  console.log("[syncLocalizations] all ops done, errors=%d created=%s", errors.length, Object.keys(createdIds).join(","));
  mutations.invalidateCache();

  return { ok: errors.length === 0, errors, createdIds };
}

/**
 * Sync localizations: parse request body, then delegate to syncLocalizationsFromData.
 * Used by version, app info, and TestFlight localization PUT handlers.
 */
export async function syncLocalizations(
  request: Request,
  parentId: string,
  mutations: SyncLocalizationsMutations,
): Promise<NextResponse> {
  const body = await request.json() as {
    locales: Record<string, Record<string, unknown>>;
    originalLocaleIds: Record<string, string>;
  };

  const result = await syncLocalizationsFromData(
    body.locales,
    body.originalLocaleIds,
    parentId,
    mutations,
  );

  if (!result.ok) {
    return NextResponse.json(result, { status: 207 });
  }

  return NextResponse.json(result);
}
