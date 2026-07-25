import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "./config";
import {
  clearManagedSession,
  getManagedSession,
  saveManagedSession,
  type ManagedSession,
} from "./account";

export class ManagedAuthError extends Error {
  // `code` porte le error_code GoTrue quand il est présent (ex. "user_already_exists",
  // "over_email_send_rate_limit") – absent pour la forme OAuth2 du grant password
  // (mauvais mot de passe), qui ne renvoie que error/error_description. Permet à
  // l'appelant de distinguer ces cas d'un vrai problème d'identifiants au lieu
  // de tout collapse sur le même message générique.
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "ManagedAuthError";
  }
}

interface GoTrueResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { email?: string };
  // Réponse d'un signup en attente de confirmation : GoTrue renvoie l'objet
  // utilisateur directement à la racine (champ "id" au premier niveau), pas
  // sous une clé "user" imbriquée – cf. internal/api/signup.go de
  // supabase/auth (`sendJSON(w, http.StatusOK, user)`).
  id?: string;
  error_description?: string;
  msg?: string;
  // Code machine-readable des endpoints REST (signup/verify) – absent sur la
  // forme OAuth2 du endpoint /token (grant password/refresh).
  error_code?: string;
}

/** POST bas niveau vers GoTrue : ne lève jamais, laisse l'appelant décider
 *  comment interpréter un statut non-2xx (signUp et verifySignup ont chacun
 *  une logique différente pour ça). */
async function postGoTrue(
  path: string,
  body: Record<string, string>,
): Promise<{ res: Response; json: GoTrueResponse }> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GoTrueResponse;
  return { res, json };
}

/** Variante stricte utilisée par signIn/refresh : un statut non-2xx ou une
 *  réponse sans access_token est toujours un échec d'authentification. */
async function goTrue(path: string, body: Record<string, string>): Promise<GoTrueResponse> {
  const { res, json } = await postGoTrue(path, body);
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Authentication failed", json.error_code);
  }
  return json;
}

function toSession(json: GoTrueResponse, email: string): ManagedSession {
  return {
    email: json.user?.email ?? email,
    accessToken: json.access_token!,
    refreshToken: json.refresh_token!,
    expiresAt: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
  };
}

export async function signIn(email: string, password: string): Promise<ManagedSession> {
  const session = toSession(await goTrue("token?grant_type=password", { email, password }), email);
  saveManagedSession(session);
  return session;
}

export type SignUpOutcome =
  | { status: "signed_in"; session: ManagedSession }
  | { status: "confirmation_required" };

export async function signUp(email: string, password: string): Promise<SignUpOutcome> {
  const { res, json } = await postGoTrue("signup", { email, password });
  // Confirmation email activée côté projet : /signup répond 200 sans tokens.
  // Ce n'est pas un échec d'identifiants – lever ManagedAuthError ferait
  // afficher « identifiants invalides » pour un compte qui vient d'être créé.
  // On détecte l'objet utilisateur sous ses deux formes possibles (voir
  // GoTrueResponse ci-dessus) : "user" imbriqué, ou "id" à la racine.
  if (res.ok && !json.access_token && (json.user != null || json.id != null)) {
    return { status: "confirmation_required" };
  }
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Authentication failed", json.error_code);
  }
  const session = toSession(json, email);
  saveManagedSession(session);
  return { status: "signed_in", session };
}

/**
 * Confirme un signup via le code de vérification envoyé par email. GoTrue
 * attend `type: "signup"` pour ce flux, mais selon la version du projet ce
 * type peut être rejeté (400) au profit de `type: "email"` – le repli est
 * géré ici plutôt que figé à l'écriture, pour rester correct quelle que soit
 * la version acceptée par ce backend. Un code invalide/expiré (observé
 * empiriquement : 403 "otp_expired") n'est PAS un problème de type : on ne
 * retente donc que sur un 400.
 */
export async function verifySignup(email: string, code: string): Promise<ManagedSession> {
  let { res, json } = await postGoTrue("verify", { type: "signup", email, token: code });
  if (res.status === 400) {
    ({ res, json } = await postGoTrue("verify", { type: "email", email, token: code }));
  }
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.error_description ?? json.msg ?? "Verification failed", json.error_code);
  }
  const session = toSession(json, email);
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
