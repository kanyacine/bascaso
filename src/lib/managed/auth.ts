import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "./config";
import {
  clearManagedSession,
  getManagedSession,
  saveManagedSession,
  type ManagedSession,
} from "./account";

export class ManagedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedAuthError";
  }
}

interface GoTrueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user?: { email?: string };
  error_description?: string;
  msg?: string;
}

async function goTrue(path: string, body: Record<string, string>): Promise<GoTrueTokenResponse> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GoTrueTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Authentication failed");
  }
  return json;
}

function toSession(json: GoTrueTokenResponse, email: string): ManagedSession {
  return {
    email: json.user?.email ?? email,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
  };
}

export async function signIn(email: string, password: string): Promise<ManagedSession> {
  const session = toSession(await goTrue("token?grant_type=password", { email, password }), email);
  saveManagedSession(session);
  return session;
}

export async function signUp(email: string, password: string): Promise<ManagedSession> {
  const session = toSession(await goTrue("signup", { email, password }), email);
  saveManagedSession(session);
  return session;
}

/** Access token valide (rafraîchi si < 60 s restantes), ou null si non connecté. */
export async function getValidAccessToken(): Promise<string | null> {
  let session: ManagedSession | null;
  try {
    session = getManagedSession();
  } catch {
    // Session illisible (clé maître changée, ligne corrompue…) : traitée
    // comme déconnectée. Elle ne sera plus jamais exploitable, on la purge
    // pour éviter de répéter l'échec à chaque appel.
    clearManagedSession();
    return null;
  }
  if (!session) return null;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session.accessToken;
  try {
    const refreshed = toSession(
      await goTrue("token?grant_type=refresh_token", { refresh_token: session.refreshToken }),
      session.email,
    );
    saveManagedSession(refreshed);
    return refreshed.accessToken;
  } catch {
    clearManagedSession();
    return null;
  }
}
