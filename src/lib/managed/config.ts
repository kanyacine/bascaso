/** Backend managé bascaso cloud. Override par env pour tester en local
 *  (supabase start : http://127.0.0.1:54321 + clé anon locale). */
export const BASCASO_CLOUD_URL =
  process.env.BASCASO_CLOUD_URL ?? "https://akbuzxhyegcdskesfjdc.supabase.co";
export const BASCASO_CLOUD_PUBLISHABLE_KEY =
  process.env.BASCASO_CLOUD_PUBLISHABLE_KEY ?? "sb_publishable_L_lTfckj8rcwQ6cODGzANA_z3OKtmDO";
