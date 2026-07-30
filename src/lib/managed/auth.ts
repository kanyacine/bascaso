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
  // `unknown` and not `string`: GoTrue's `data` field – the only route into
  // user_metadata – is an object, not a scalar.
  body: Record<string, unknown>,
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

/** PUT /auth/v1/user – GoTrue's own store for the account itself (email, password,
 *  user_metadata). Everything mutable about the account goes through here with the
 *  user's own token; none of it lives in a table of ours. */
async function putUser(accessToken: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: BASCASO_CLOUD_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as GoTrueResponse;
    throw new ManagedAuthError(json.msg ?? "Update failed", json.error_code);
  }
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

/** `username` is required, not optional: it is the account's presence label in the
 *  sidebar, the account menu and the AI settings page. GoTrue stores it in
 *  user_metadata (via `data`), which the `me` endpoint reads back – no table of ours
 *  holds it. */
export async function signUp(email: string, password: string, username: string): Promise<SignUpOutcome> {
  const { res, json } = await postGoTrue("signup", { email, password, data: { username } });
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

function readSessionOrClear(): ManagedSession | null {
  try {
    return getManagedSession();
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
}

/** Rafraîchissement en cours, partagé par tous les appelants concurrents.
 *  GoTrue fait tourner le refresh token : le second rafraîchissement d'une
 *  paire concurrente (un bulk IA en déclenche autant qu'il lance d'appels)
 *  présente un token déjà révoqué, échoue, et purge la session – l'utilisateur
 *  se retrouve déconnecté au milieu de son travail. Processus unique (le
 *  serveur Next embarqué dans Electron), donc une variable de module suffit. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Relecture SOUS le verrou : un appelant mis en attente derrière un
  // rafraîchissement en cours détient un instantané pris avant celui-ci, dont
  // le refresh token vient justement d'être invalidé.
  const session = readSessionOrClear();
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

/** Access token valide (rafraîchi si < 60 s restantes), ou null si non connecté. */
export async function getValidAccessToken(): Promise<string | null> {
  const session = readSessionOrClear();
  if (!session) return null;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session.accessToken;
  // `??=` n'évalue sa droite que si la gauche est nulle, et rien ne s'exécute
  // entre le test et l'affectation : deux appelants ne peuvent pas démarrer
  // deux rafraîchissements.
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Sign out, both ends.
 *
 *  Deleting our row is the easy half and used to be the only half: GoTrue keeps a
 *  refresh token valid until something revokes it, so a "signed out" machine still
 *  held a credential that could mint access tokens for the account. `scope=global`
 *  kills every session of this user, which is what a user asking to sign out of a
 *  desktop app they may be giving away actually means.
 *
 *  The local session is cleared whichever way the revocation goes – one we cannot
 *  revoke is still one we must stop using – and the return value says whether the
 *  server side landed, so the caller can say so rather than swallow it. */
export async function signOut(): Promise<{ revoked: boolean }> {
  // Refreshed first: an expired access token is rejected by /logout, and this is
  // exactly the state a machine left alone overnight is in.
  const token = await getValidAccessToken();
  clearManagedSession();
  if (!token) return { revoked: true }; // nothing on the server to revoke
  try {
    const res = await fetch(`${BASCASO_CLOUD_URL}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: { apikey: BASCASO_CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    });
    return { revoked: res.ok };
  } catch {
    return { revoked: false };
  }
}

/** Send the password-reset email. Never says whether the address exists: GoTrue
 *  answers 200 either way, and so do we – the alternative is an oracle telling
 *  anyone which emails have an account here. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { res, json } = await postGoTrue("recover", { email });
  if (!res.ok) throw new ManagedAuthError(json.msg ?? "Reset failed", json.error_code);
}

/**
 * Second half of the reset: the six-digit code from the email, plus the new password.
 *
 * A code and not the link the email also carries – the link goes to a website, and
 * this is a desktop app with no browser callback to land on. `type: "recovery"`
 * exchanges the code for a session, and that session is the only thing GoTrue accepts
 * as authority to set a password without knowing the old one. The user ends up signed
 * in, which is what they wanted in the first place.
 */
export async function resetPassword(email: string, code: string, password: string): Promise<ManagedSession> {
  const { res, json } = await postGoTrue("verify", { type: "recovery", email, token: code });
  if (!res.ok || !json.access_token) {
    throw new ManagedAuthError(json.msg ?? "Verification failed", json.error_code);
  }
  await putUser(json.access_token, { password });
  const session = toSession(json, email);
  saveManagedSession(session);
  return session;
}

/** Rename the account (GoTrue user_metadata – no table of ours holds it). */
export async function updateUsername(username: string): Promise<void> {
  const token = await requireAccessToken();
  await putUser(token, { data: { username } });
}

/**
 * Change the account's email. `double_confirm_changes` is on, so GoTrue mails both
 * the old and the new address and nothing moves until both are confirmed – which is
 * also why the session keeps working meanwhile and the local row is left alone.
 */
export async function changeEmail(email: string): Promise<void> {
  const token = await requireAccessToken();
  await putUser(token, { email });
}

/**
 * Change the password, current one required.
 *
 * GoTrue does not ask for it (`secure_password_change` is off on this project), so
 * without the re-authentication below anyone at an unlocked Mac could take the
 * account over – lock the owner out of a balance they paid for, and out of the
 * address the receipts go to. The grant doubles as the source of the session we
 * keep: GoTrue invalidates the other sessions of an account whose password changed.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const session = readSessionOrClear();
  if (!session) throw new ManagedAuthError("Not signed in");
  const fresh = await signIn(session.email, currentPassword);
  await putUser(fresh.accessToken, { password: newPassword });
}

/**
 * Delete the account and everything the cloud holds about it. The edge function does
 * the work with the service role (cancelling any live Stripe subscription first);
 * this side only proves who is asking and drops the local session once it is gone.
 */
export async function deleteAccount(): Promise<void> {
  const token = await requireAccessToken();
  const res = await fetch(`${BASCASO_CLOUD_URL}/functions/v1/delete-account`, {
    method: "DELETE",
    headers: { apikey: BASCASO_CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  // The local session is kept on failure, on purpose: clearing it would show a
  // signed-out app while the account and its subscription are still very much alive.
  if (!res.ok) throw new ManagedAuthError("Account deletion failed");
  clearManagedSession();
}

async function requireAccessToken(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new ManagedAuthError("Not signed in");
  return token;
}
