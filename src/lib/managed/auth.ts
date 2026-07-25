import { BASCASO_CLOUD_PUBLISHABLE_KEY, BASCASO_CLOUD_URL } from "./config";
import {
  clearManagedSession,
  getManagedSession,
  saveManagedSession,
  type ManagedSession,
} from "./account";

export class ManagedAuthError extends Error {
  // `code` porte le error_code GoTrue (ex. "invalid_credentials", "user_already_exists",
  // "over_email_send_rate_limit", "email_not_confirmed"). Mesuré en prod : ce GoTrue
  // renvoie systématiquement {code, error_code, msg} sur /token comme sur /signup –
  // pas la forme OAuth2 {error, error_description} qu'on supposait avant. `code`
  // reste undefined seulement si le serveur omet error_code (défensif). Permet à
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
  // Vide sur la réponse sanitisée d'une adresse déjà inscrite ; exactement une entrée
  // sur une vraie inscription en attente. Seul signal qui distingue les deux.
  identities?: unknown[];
  // Jamais envoyé par ce GoTrue : vestige de l'hypothèse OAuth2. Conservé en
  // premier arm du ?? uniquement par prudence si un proxy le réintroduisait.
  error_description?: string;
  msg?: string;
  // Code machine-readable, présent sur TOUS les endpoints, /token compris.
  // L'hypothèse inverse (forme OAuth2 sur /token) est ce qui avait rendu
  // managedAuthFailed inatteignable et affiché de l'anglais brut aux non-anglophones.
  // Mesuré en prod : mot de passe erroné → {code:400, error_code:"invalid_credentials", msg:…}.
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
  // Adresse déjà inscrite. GoTrue ne renvoie 422 user_already_exists que si l'autoconfirm
  // email OU SMS est actif ; les deux étant coupés sur ce projet, il répond un 200 « sanitisé »
  // impossible à distinguer d'une inscription en attente – sauf par `identities`, vide ici alors
  // qu'une vraie nouvelle inscription en porte exactement une. Sans ce test, l'utilisateur qui
  // revient s'inscrire se voit promettre un email de confirmation qu'il ne recevra jamais.
  // Le cas 422 reste géré plus bas : le code doit rester correct si l'autoconfirm est réactivé.
  // Réserve connue : GoTrue vide aussi `identities` pour un utilisateur INVITÉ
  // (HasBeenInvited, internal/api/signup.go) – une vraie inscription en attente qui
  // serait ici prise pour un doublon. bascaso n'a aucun flux d'invitation ; si on en
  // ajoute un pour le tier payant, discriminer avec `invited_at`.
  if (res.ok && !json.access_token && Array.isArray(json.identities) && json.identities.length === 0) {
    throw new ManagedAuthError("User already registered", "user_already_exists");
  }
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
  } catch (err) {
    // Session illisible (clé maître changée, ligne corrompue…) : traitée
    // comme déconnectée. Elle ne sera plus jamais exploitable, on la purge
    // pour éviter de répéter l'échec à chaque appel. Logué (jamais le
    // contenu du token) pour qu'une rotation de clé mal préparée reste
    // visible en prod plutôt qu'un silencieux "déconnecté".
    console.warn(
      "[managed/auth] unreadable session, clearing:",
      err instanceof Error ? err.message : String(err),
    );
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
  } catch (err) {
    console.warn(
      "[managed/auth] token refresh failed, clearing session:",
      err instanceof Error ? err.message : String(err),
    );
    clearManagedSession();
    return null;
  }
}
