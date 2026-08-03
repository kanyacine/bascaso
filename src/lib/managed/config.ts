/** The bascaso cloud managed backend. Overridable through env to test locally
 *  (supabase start: http://127.0.0.1:54321 + the local anon key).
 *
 *  Trailing slashes are stripped once here rather than at every call site – otherwise a
 *  misconfigured `BASCASO_CLOUD_URL` would produce `…co//functions/…` everywhere the URL
 *  is used. */
export const BASCASO_CLOUD_URL = (
  process.env.BASCASO_CLOUD_URL ?? "https://akbuzxhyegcdskesfjdc.supabase.co"
).replace(/\/+$/, "");
export const BASCASO_CLOUD_PUBLISHABLE_KEY =
  process.env.BASCASO_CLOUD_PUBLISHABLE_KEY ?? "sb_publishable_L_lTfckj8rcwQ6cODGzANA_z3OKtmDO";
