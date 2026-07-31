/** Backend managé bascaso cloud. Override par env pour tester en local
 *  (supabase start : http://127.0.0.1:54321 + clé anon locale).
 *
 *  Slash(es) final(aux) retiré(s) une fois ici plutôt qu'à chaque site d'appel –
 *  sinon un `BASCASO_CLOUD_URL` mal configuré produirait `…co//functions/…`
 *  partout où l'URL est utilisée. */
export const BASCASO_CLOUD_URL = (
  process.env.BASCASO_CLOUD_URL ?? "https://akbuzxhyegcdskesfjdc.supabase.co"
).replace(/\/+$/, "");
export const BASCASO_CLOUD_PUBLISHABLE_KEY =
  process.env.BASCASO_CLOUD_PUBLISHABLE_KEY ?? "sb_publishable_L_lTfckj8rcwQ6cODGzANA_z3OKtmDO";
