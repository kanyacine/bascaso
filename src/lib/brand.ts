/** Outward-facing identity, in one place.
 *
 *  Every one of these was a literal repeated across four files, which is exactly
 *  how they all ended up still pointing at the upstream project after the fork:
 *  a rename fixed some call sites and missed others, invisibly. Anything a user
 *  can click, copy or write to belongs here.
 *
 *  Electron's main process compiles separately (electron/tsconfig.json) and
 *  cannot import from `src/`, so it carries its own copies – grep for the repo
 *  slug before changing it. */

export const BRAND_NAME = "Bascaso";

/** Reverse-DNS of a domain we control. Apple ties signing, notarisation, the
 *  Keychain entry and the userData directory to it – changing it after release
 *  strands every existing install. */
export const APP_BUNDLE_ID = "app.zavyn.bascaso";

export const BRAND_SITE_URL = "https://zavyn.app";
export const BRAND_REPO_URL = "https://github.com/kanyacine/bascaso";
export const BRAND_ISSUES_URL = `${BRAND_REPO_URL}/issues/new`;
/** Also the route for data subject requests – access, portability, erasure, objection –
 *  published as such by PRIVACY.md. One mailbox rather than two: a second address nobody
 *  reads is worse than a support queue that already exists, and the legal deadline
 *  attaches to whichever address is published. */
export const SUPPORT_EMAIL = "bascaso-support@zavyn.app";

/** MCP server id – what the user types in their client config, and the key the
 *  copyable snippets are built around. */
export const MCP_SERVER_NAME = "bascaso";

/** Privacy policy and terms of sale. They live in the repository for as long as no
 *  domain is in place: a dead link is worth less than a link to the source, and the
 *  source is the authoritative version anyway. To be repointed at the site the day it
 *  exists. */
export const PRIVACY_URL = `${BRAND_REPO_URL}/blob/main/docs/PRIVACY.md`;
export const TERMS_URL = `${BRAND_REPO_URL}/blob/main/docs/TERMS.md`;
