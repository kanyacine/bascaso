import { describe, expect, it } from "vitest";
import { resolveConnectionErrorMessage } from "@/lib/i18n/resolve-connection-error";
import type { ConnectionError } from "@/lib/apps-context";
import { parseAscError, networkError } from "@/lib/asc/errors";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("resolveConnectionErrorMessage", () => {
  it("uses key for client-side fallbacks", () => {
    const error: ConnectionError = {
      category: "network",
      message: "",
      key: "connectionErrors.networkFailed",
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(en.connectionErrors.networkFailed);
  });

  it("localizes server fallback keys", () => {
    const error: ConnectionError = {
      category: "auth",
      message: "API key may be invalid or expired",
      messageKey: "authInvalid",
      status: 401,
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(en.connectionErrors.authInvalid);
  });

  it("interpolates status for generic ASC errors", () => {
    const error: ConnectionError = {
      category: "api",
      message: "App Store Connect returned an error (422)",
      messageKey: "ascError",
      status: 422,
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(
      translate(getMessages("en"), "connectionErrors.ascError", { status: 422 }),
    );
  });

  it("passes through ASC detail text untouched", () => {
    const error: ConnectionError = {
      category: "api",
      message: "The provided entity is missing a required attribute",
      status: 409,
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(
      "The provided entity is missing a required attribute",
    );
  });

  it("falls back to unknown error when nothing is available", () => {
    const error: ConnectionError = { category: "api", message: "  " };
    expect(resolveConnectionErrorMessage(error, t)).toBe(en.common.unknownError);
  });
});

describe("parseAscError fallback keys", () => {
  it("marks default messages with a fallbackKey", () => {
    expect(parseAscError(401, "").fallbackKey).toBe("authInvalid");
    expect(parseAscError(503, "").fallbackKey).toBe("ascUnavailable");
    expect(parseAscError(422, "").fallbackKey).toBe("ascError");
    expect(networkError().fallbackKey).toBe("ascUnreachable");
  });

  it("omits fallbackKey when ASC provides detail", () => {
    const body = JSON.stringify({
      errors: [{ code: "X", title: "T", detail: "Entity missing attribute" }],
    });
    const err = parseAscError(422, body);
    expect(err.message).toBe("Entity missing attribute");
    expect(err.fallbackKey).toBeUndefined();
  });
});
