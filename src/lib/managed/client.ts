import type { MessageKey } from "@/lib/i18n/messages";

/** Client-side helpers for the Bascaso cloud account: the fetch wrappers the
 *  billing page drives, and the two predicates its display depends on.
 *
 *  They used to live in the AI settings page and be imported from it by tests.
 *  The account UI has since moved to its own page, so a module is the honest
 *  home for them – a page exporting logic another page's tests import is not. */

type ManagedAuthResult =
  | { ok: true; confirmationRequired?: boolean }
  // `code`/`message` viennent du corps du 401 (voir route.ts) : le vrai code
  // GoTrue et son message, pour que l'appelant affiche autre chose que
  // "vérifiez identifiants" quand ce n'est pas le problème (voir
  // managedAuthErrorMessage).
  | { ok: false; reason: "auth"; code?: string; message?: string }
  | { ok: false; reason: "network" };

/** `res.json().catch(...)` ne rattrape pas un `res.json` absent (le throw est
 *  synchrone, avant la promesse) – utilisé par les tests qui ne mockent que
 *  `ok`/`status`. Ce wrapper couvre les deux cas : méthode absente et corps
 *  non-JSON. */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Step one of the reset: ask for the email carrying the code. */
export function requestManagedPasswordReset(email: string): Promise<ManagedAuthResult> {
  return postManagedAuth({ mode: "recover", email });
}

/** Step two: the code plus the new password. Succeeds signed in. */
export function resetManagedPassword(
  email: string,
  code: string,
  password: string,
): Promise<ManagedAuthResult> {
  return postManagedAuth({ mode: "reset", email, code, password });
}

/**
 * Isolé du composant pour être testable sans rendu React : distingue un échec
 * d'authentification (401 – identifiants) d'un échec réseau (fetch qui lève),
 * pour que l'appelant puisse afficher le bon message dans chaque cas. Un
 * signup accepté mais en attente de confirmation email est un succès HTTP
 * (200) qui porte `confirmationRequired: true` dans le corps – ni un échec
 * ni une connexion effective.
 */
export async function postManagedAuth(
  body: Record<string, string | undefined>,
): Promise<ManagedAuthResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Un 5xx est une panne réseau/serveur en parlant au cloud managé (voir
    // route.ts), pas un problème d'identifiants – testé avant de lire le
    // corps, sinon ce 500 (sans `code`) retombe sur managedAuthFailed
    // ("vérifiez votre mot de passe") pour une coupure réseau.
    if (res.status >= 500) return { ok: false, reason: "network" };
    if (!res.ok) {
      // La confirmation email active en prod rend "déjà inscrit" et "quota
      // d'emails dépassé" probables – ni l'un ni l'autre n'est un problème
      // d'identifiants (voir managedAuthErrorMessage côté appelant).
      const data = await safeJson(res);
      return { ok: false, reason: "auth", code: data.code as string | undefined, message: data.error as string | undefined };
    }
    const data = await safeJson(res);
    return data.confirmationRequired ? { ok: true, confirmationRequired: true } : { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Message affiché sous le formulaire managé pour un échec "auth" (401). Les
 * codes connus – compte déjà inscrit, quota d'emails Supabase dépassé, email
 * pas encore confirmé – ont chacun une action différente et un message dédié.
 * `invalid_credentials` (mauvais mot de passe – forme réelle mesurée en prod :
 * {code:400, error_code:"invalid_credentials", msg:…}, pas la forme OAuth2
 * {error, error_description} supposée avant) et l'absence de code partagent
 * le même message générique "vérifiez vos identifiants". Pour tout autre code
 * (renvoyé par le serveur mais non mappé ici), on affiche son message plutôt
 * que d'accuser un mot de passe qui n'est peut-être pas en cause – jamais le
 * générique par défaut pour un code qu'on ne reconnaît pas.
 */
export function managedAuthErrorMessage(
  code: string | undefined,
  message: string | undefined,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case "user_already_exists":
      return t("settings.account.authUserExists");
    case "over_email_send_rate_limit":
      return t("settings.account.authRateLimited");
    case "email_not_confirmed":
      return t("settings.account.authEmailNotConfirmed");
    // Distinct de over_email_send_rate_limit : GoTrue limite aussi /token et /signup
    // par IP, ce que produit un clic répété impatient sur « je me suis confirmé ».
    case "over_request_rate_limit":
      return t("settings.account.authTooManyRequests");
    // Reset and email-change codes. Without them the default arm below would print
    // GoTrue's raw English at a French user, at the one moment they are least able to
    // guess what to do next.
    case "otp_expired":
      return t("settings.account.confirmFailed");
    case "email_exists":
      return t("settings.account.authUserExists");
    case "weak_password":
      return t("settings.account.authWeakPassword");
    case "same_password":
      return t("settings.account.authSamePassword");
    case "invalid_credentials":
    case undefined:
      return t("settings.account.authFailed");
    default:
      return message || t("settings.account.authFailed");
  }
}

/** Minimum password length – same value as the zod schemas on both managed routes, so
 *  the checklist below and the server agree. A checklist that ticked green on a
 *  password the route rejects is exactly the kind of lying validation this replaces. */
const MIN_PASSWORD_LENGTH = 8;

interface PasswordRule {
  key: MessageKey;
  ok: boolean;
}

/**
 * The live checklist under a new-password field. Deliberately short: it lists what is
 * actually enforced and nothing else. The old form claimed nothing until the server
 * refused, then blamed the credentials for a password that was merely too short.
 *
 * `confirm` is part of it rather than a separate error line so that the two rules read
 * as one gate – the button turns on exactly when both are green (see allRulesPass).
 */
export function passwordRules(password: string, confirm: string): PasswordRule[] {
  return [
    { key: "settings.account.ruleLength", ok: password.length >= MIN_PASSWORD_LENGTH },
    { key: "settings.account.ruleMatch", ok: password.length > 0 && password === confirm },
  ];
}

export function allRulesPass(rules: PasswordRule[]): boolean {
  return rules.every((r) => r.ok);
}

type ManagedVerifyResult = { ok: true } | { ok: false; reason: "auth" | "network" };

/**
 * Chemin secondaire de la confirmation par email : vérifie un code reçu par
 * l'utilisateur (quand le modèle d'email en contient un, plutôt qu'un simple
 * lien de confirmation). Même distinction auth/réseau que postManagedAuth.
 */
export async function verifyManagedSignup(email: string, code: string): Promise<ManagedVerifyResult> {
  try {
    const res = await fetch("/api/managed/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify", email, code }),
    });
    if (res.status >= 500) return { ok: false, reason: "network" };
    return res.ok ? { ok: true } : { ok: false, reason: "auth" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Remet `setBusy(false)` quel que soit le chemin de sortie de `fn` – succès,
 * retour anticipé ou exception. Corrige une régression où un `return` précoce
 * dans le bloc `!res.ok` contournait la remise à zéro du flag "busy" et
 * bloquait définitivement les boutons du formulaire après un échec.
 */
export async function runWithBusyFlag(setBusy: (busy: boolean) => void, fn: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await fn();
  } finally {
    setBusy(false);
  }
}

interface ManagedSubscription {
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * Miroir exact de la condition de `debit_action` côté backend : un
 * abonnement ne dispense de débit que s'il est actif/en essai ET pas expiré
 * (`currentPeriodEnd` null = pas d'échéance connue → traité comme valide,
 * sinon comparé à "maintenant"). Une divergence ici ferait afficher
 * "Abonnement illimité" sur la carte alors qu'un abonnement zombie fait
 * débiter des jetons à chaque appel IA.
 */
export function isManagedSubscriptionActive(
  subscription: ManagedSubscription | null | undefined,
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (subscription.currentPeriodEnd == null) return true;
  return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
}

/** Presence label for the account: the chosen username, else the email local part.
 *  Never the full email – it shows in the sidebar footer, where an address is both too
 *  long and more than the user asked to display. */
export function accountDisplayName(a: { username: string | null; email: string }): string {
  return a.username ?? a.email.split("@")[0];
}

/** Currencies Stripe carries without a minor unit: their `amount` is already the
 *  whole figure, not hundredths. Dividing those by 100 would show ¥10 for a
 *  ¥1000 price – a hundredfold error on a button that charges money.
 *  https://docs.stripe.com/currencies#zero-decimal */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Format a Stripe amount for display.
 *
 *  The currency comes from the price, not from the locale: Stripe charges in
 *  whatever the price is denominated in, and showing a euro figure to a user
 *  whose locale implies dollars would misstate what they are about to pay. Only
 *  the grouping and decimal marks follow the locale. */
export function formatPrice(amount: number, currency: string, locale: string): string {
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
  const value = zeroDecimal ? amount : amount / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    // Stripe amounts are exact, so a round price reads better as "10 €" than
    // "10,00 €" on a price list.
    minimumFractionDigits: zeroDecimal || amount % 100 === 0 ? 0 : 2,
  }).format(value);
}
