import type { AscErrorEntry } from "@/lib/asc/errors";

export class ApiError extends Error {
  readonly category?: string;
  readonly ascErrors?: AscErrorEntry[];
  readonly ascMethod?: string;
  readonly ascPath?: string;
  readonly ascAssociatedErrors?: Record<string, AscErrorEntry[]>;

  constructor(
    message: string,
    opts?: {
      category?: string;
      ascErrors?: AscErrorEntry[];
      ascMethod?: string;
      ascPath?: string;
      ascAssociatedErrors?: Record<string, AscErrorEntry[]>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.category = opts?.category;
    this.ascErrors = opts?.ascErrors;
    this.ascMethod = opts?.ascMethod;
    this.ascPath = opts?.ascPath;
    this.ascAssociatedErrors = opts?.ascAssociatedErrors;
  }
}

/**
 * Client-side fetch wrapper with consistent error handling.
 *
 * On non-ok responses, extracts structured error data and throws ApiError.
 * Returns parsed JSON (or `null` for 204 No Content).
 */
export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 204) return null as T;

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      (data.error as string) ?? `Request failed (${res.status})`,
      {
        category: data.category as string | undefined,
        ascErrors: data.ascErrors as AscErrorEntry[] | undefined,
        ascMethod: data.ascMethod as string | undefined,
        ascPath: data.ascPath as string | undefined,
        ascAssociatedErrors: data.ascAssociatedErrors as Record<string, AscErrorEntry[]> | undefined,
      },
    );
  }

  return res.json() as Promise<T>;
}
