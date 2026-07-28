# Managed AI tier

Bascaso can run an AI task three ways: on the machine, through your own provider key, or
through Bascaso cloud. The third one – the managed tier – is the only paid part of the
app, and the only path on which anything leaves the machine. It is opt-in: no account, no
managed tier, and everything else keeps working.

This document is the contract of that tier: how a task is routed to it, what it charges,
which errors it returns, which limits it enforces, and when it falls back.

**Client side** (this repository):

| Path | Role |
|---|---|
| `src/lib/managed/config.ts` | Backend URL and publishable key, both overridable by env |
| `src/lib/managed/auth.ts` | GoTrue sign-up, sign-in, email confirmation, token refresh |
| `src/lib/managed/account.ts` | The single-row local session store (encrypted at rest) |
| `src/lib/ai/tasks.ts` | Task ids, groups, shipped defaults |
| `src/lib/app-preferences.ts` | Stored routing preferences and the effective default |
| `src/lib/ai/provider-factory.ts` | `resolveTier` – the one place a tier becomes a model |

**Server side**: a separate, private Supabase project. Accounts live in GoTrue; billing
lives in Postgres; one edge function, `ai-proxy`, exposes an OpenAI-compatible
`/functions/v1/ai-proxy/v1/chat/completions`. The client talks to it with `@ai-sdk/openai`
pointed at that base URL, with the session JWT as the API key.

## The three tiers

| Tier | Runs on | Requires | Cost |
|---|---|---|---|
| `local` | The device – the embedded Apple model, or an OpenAI-compatible server on `127.0.0.1` (LM Studio by default) | The Apple model available on the machine, or a running local server | Free |
| `byok` | Anthropic, OpenAI, Google, xAI, Mistral or DeepSeek | Your own API key, stored encrypted | Your provider bill |
| `managed` | Bascaso cloud, which forwards to a provider | A Bascaso cloud account with credit | 1 credit per action |

The embedded Apple model carries two constraints the other tiers do not: inputs are capped
at 12 000 characters (`APPLE_FM_MAX_INPUT_CHARS`) and the sidecar reports the BCP-47
languages it officially supports, which callers may enforce (`Settings → AI` has an opt-in
override to generate outside that list anyway).

### Tasks and groups

Every LLM call in the app is keyed by a stable task id. Tasks are routed in groups, never
individually – four toggles, not eleven.

| Group | Tasks | Shipped default |
|---|---|---|
| `redaction` | `draft-reply`, `draft-appeal`, `draft-nomination` | `local` |
| `metadata` | `translate`, `improve`, `fix-keywords` | `byok` |
| `insights` | `reviews-insights`, `analytics-insights` | `byok` |
| `workflows` | `workflow-seeds`, `workflow-relevance`, `workflow-compose` | `byok` |

`groupForTask(taskId)` is the only mapping; the key namespace of the stored preference
(`ai_routing_group_<group>`) leaves room for finer scopes later, but v1 routes by group only.

### How a tier is chosen

`getLanguageModelForTask(taskId, context)` resolves task → group → tier → model. The tier
comes from `getRoutingTier(group)`:

1. An explicit `local` or `byok` preference is used as stored.
2. An explicit `managed` preference is used **only while a cloud account is linked**.
   Otherwise it is treated as unset – signing out would otherwise leave the group pointing
   at a tier that can only fail, behind a control the UI has greyed out. The preference
   stays in storage and applies again on the next sign-in.
3. With no explicit preference, the effective default is `managed` if an account is
   linked, and the shipped default of the table above if not.

Rule 3 is what makes the paid tier reachable: no shipped default ever points at it, so
without this a customer could create an account, buy credits, and have nothing consume
them until they flipped all four toggles by hand. It also repairs "Restore defaults",
which clears the explicit preferences and would otherwise silently undo a managed setup.

A local- or BYOK-only user never sees any of this: with no account linked, the effective
defaults are exactly the shipped ones.

The routing UI disables the `managed` option while no account is linked, and
`PUT /api/settings/ai/routing` rejects it with `422 managed_account_required` – the tier
used to be accepted and stored, then surfaced as a hard failure on the first AI action, far
from the setting that caused it.

### The session

`signIn` / `signUp` / `verifySignup` talk to GoTrue directly and persist one row in the
local `managed_account` table: the email in clear, the access and refresh tokens encrypted
with the same AES-256-GCM envelope scheme as ASC keys. `getValidAccessToken()` returns the
access token, refreshing it when under 60 seconds remain, and clears the session – treating
the user as signed out – when the row is unreadable or the refresh is rejected.

Refreshes are serialised: GoTrue rotates refresh tokens, and a bulk run starting as many
refreshes as it starts calls would have the second one present an already-revoked token,
fail, and sign the user out mid-work.

## Actions and credits

### One action, one credit

An **action** is one user gesture, not one HTTP call. Adding a locale translates every
field and then fixes the keywords – dozens of calls, one gesture. A keyword-research run
chains `workflow-seeds`, `workflow-relevance` and `workflow-compose` across several
minutes – one gesture. Billing follows the gesture, so the price a user sees matches what
they think they asked for.

The unit is carried by the `x-action-id` request header, set in `resolveTier`:

```ts
headers: { "x-action-id": context?.actionId ?? crypto.randomUUID() }
```

Two origins, and the order matters:

- **The caller mints it** when a gesture spans several calls, and passes it down so every
  call shares it. `add-locale-dialog.tsx` and `fix-all-dialog.tsx` mint one per dialog run;
  `run-manager.ts` mints one per workflow run and `keyword-research.ts` threads it through
  all three of its LLM steps; `POST /api/ai` and the keyword-research route accept an
  optional `actionId` (validated as a UUID) so a retry can reuse the previous one.
- **The resolution mints one** when the caller supplies none – a single-shot gesture *is*
  its own action.

The proxy rejects anything that is not a UUID with `invalid_action_id`, so a missing id is
never silently billed as a fresh action.

### Replaying an action is free

This is the core of the model. The first call under a given action-id opens a row in
`actions`; every later call with the same id increments its counter and moves no credit, as
long as it stays within that action's call cap and time window. A retry after a failed run
therefore costs nothing – which is why the keyword-research dialog offers a free retry and
passes the original run's `actionId` back rather than starting a new action.

Three rules bound the replay, all returning `action_exhausted`:

- **The call cap and the window**, per class (see [Limits](#limits)).
- **The class is frozen** at the first call. Several tasks may legitimately share one
  action – `workflow-seeds → workflow-relevance → workflow-compose`, or `translate` on each
  field then `fix-keywords` – so the guard is not "same task" but "same class". Without it,
  one credit spent on `bascaso/translate` (cap 400, cheap model) bought 399 replays on
  `bascaso/draft-reply` (frontier model).
- **The owner is frozen**. An action-id already used by another account is refused with the
  same code rather than leaking that it exists.

Because the free window is real time, the client mirrors it where it matters:
`keyword-research-dialog.tsx` only offers a free retry while the action was minted less
than 30 minutes ago – the 90-minute window minus the hour a retry may itself take – and
measures from when the id was *minted*, never from the retrying run's own start.

### Authorise now, settle on the response

Two RPCs, deliberately split:

| Step | Function | Does |
|---|---|---|
| Before generation | `authorize_action(user, action, task)` | All guards – hourly rate limit, class cap and window, sufficient balance – and opens or increments the action row. Touches no wallet. |
| After generation | `settle_action(user, action)` | Debits one credit, once per action. Idempotent. |

The guards must run first: checking a balance after the provider's tokens are already spent
protects nothing. The debit must run last: the credit used to leave before the call, so a
generation that failed – a task routed to a provider with no key on that deployment, for
instance – burned a credit for nothing.

Consequences worth knowing:

- A failed generation costs nothing. The action row exists with `settled = false`; the
  retry authorises as a replay and settles on success.
- Settlement never fails the request. The response is already earned; a settlement error is
  logged loudly and the call is under-billed rather than refused after the fact.
- Concurrency is bounded, not eliminated: the balance lock is released before settlement,
  so N concurrent first calls from an account with 1 credit all pass the check and settle,
  taking the balance a few units negative. The hourly rate limit bounds it, the next
  `authorize_action` refuses at `<= 0`, and exact accounting in the negative was preferred
  to a silently dropped debit.

### Where credits come from

| Source | Amount |
|---|---|
| Sign-up bonus | 5 credits, granted when the email is **confirmed**, not at sign-up |
| `pack_10` / `pack_50` / `pack_100` | 10 / 50 / 100 credits, one-off Stripe payments |
| `sub_monthly` | A subscription – see below |

The bonus moved to email confirmation because open sign-up plus 5 free credits on an
unverified address is a cost exposure, not a growth feature. The idempotency guard lives on
the ledger, so it can never credit twice.

An active subscription (`active` or `trialing`) whose `current_period_end` has not passed
skips the debit entirely: `settle_action` marks the action settled without moving a credit.
The expiry check is a second belt – Stripe does not guarantee event ordering, and a delayed
`customer.subscription.updated` arriving after its `.deleted` would otherwise leave a
permanently active row.

Prices shown in `Settings → AI` are placeholders in the client; the authoritative prices
are the Stripe price ids the checkout function resolves from its environment.

## Error contract

Every JSON error from the proxy has the same shape:

```json
{ "error": { "code": "insufficient_credits", "message": "insufficient_credits: …" } }
```

The code appears verbatim inside `message` on purpose. The AI SDK builds its `Error` from
`error.message` and never from `error.code`, and `classifyAIError()` matches on that
message – prose that paraphrases the code instead of containing it makes the error
invisible to the classifier and turns a 402 that should offer a top-up into a generic 500.

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `unauthorized` | No `Authorization: Bearer`, or the JWT does not resolve to a user |
| 400 | `invalid_action_id` | `x-action-id` missing or not a UUID |
| 400 | `invalid_json` | Request body is not valid JSON |
| 400 | `unknown_task` | `model` is not `bascaso/<known task>`, or `messages` is not an array |
| 400 | `unsupported_role` | A message role other than `system` or `user` |
| 402 | `insufficient_credits` | Balance at or below zero and no usable subscription |
| 429 | `rate_limited` | More than 60 actions started in the last hour |
| 429 | `action_exhausted` | Call cap or window exceeded, class changed, or id owned by another account |
| 500 | `debit_failed` | The authorisation RPC itself failed – never a generation problem |
| 500 | `generation_failed` | Every candidate model failed; nothing to refund, since nothing was settled |

Two responses are outside the JSON contract: a non-`POST` request gets a plain-text
`405 method not allowed`, and anything that crashes before the handler gets the platform's
own error page.

`generation_failed` deserves its own note: the proxy tries the task's mapped model, then
the default model, skipping any provider with no key configured on the deployment. Only
when the whole chain fails does the client see this code – and because settlement never
ran, the credit is untouched.

### How the client reads them

`classifyAIError()` in `src/lib/ai/provider-factory.ts` maps the message to a category,
and `POST /api/ai` maps the category to a status the UI can act on:

| Proxy code | Category | App response |
|---|---|---|
| `insufficient_credits` | `credits` | `402 ai_credits_exhausted` – offer a top-up |
| `rate_limited` | `rate_limited` | `429 ai_rate_limited` – hourly cap, try later |
| `action_exhausted` | `action_exhausted` | `429 ai_action_exhausted` – this gesture is closed, start a new one |
| `unauthorized` | `auth` | `401 ai_auth_error` |

Order in the classifier is load-bearing: `rate_limited` and `action_exhausted` are tested
before the generic `/429|rate.limit|quota/` pattern, which would otherwise swallow
`rate_limited` (`rate.limit` is a substring of it) and leave `action_exhausted` unreachable.
`rate_limited` and `action_exhausted` are kept distinct from the generic BYOK `rate_limit`
because they mean different things to the user – an hourly ceiling versus a spent gesture.

The remaining codes have no pattern of their own. They reach the app as `unknown` and
surface as a generic 500; they all describe a malformed request or a server fault, which no
end-user action can fix.

## Limits

Three classes, derived from the task by `action_class()` – one source from which the
guard, the cap and the window all follow, so they cannot drift apart.

| Class | Tasks | Calls per action | Window |
|---|---|---|---|
| `workflow` | `workflow-*` | 30 | 90 minutes |
| `bulk` | `translate`, `improve`, `fix-keywords` | 400 | 15 minutes |
| `single` | Everything else | 10 | 15 minutes |

Plus one global guard: **60 new actions per rolling hour per account**, counted on
`actions.created_at`. Replays do not count against it – only calls that open a new action.

Every number above is calibrated against a real failure, not chosen for symmetry:

| Value | Migration | Why |
|---|---|---|
| 60 actions/hour | `20260724221651_billing_functions.sql` | Original abuse ceiling |
| 15-minute window | `20260724221651_billing_functions.sql` | Default replay window |
| Cap 30 (`workflow`) | `20260724221651_billing_functions.sql` | Workflow fan-out, unchanged since |
| Cap 400 (`bulk`) | `20260725040405_debit_action_caps.sql` | A bulk translation is locales × fields ≈ 100-300 calls in one click; the previous cap of 5 rejected the sixth |
| Cap 10 (`single`) | `20260725040405_debit_action_caps.sql` | One call plus the route's internal shorten-retries |
| 90-minute window (`workflow`) | `20260725044312_debit_action_workflow_ttl_headroom.sql` | Raised from 15 to 60 in `…_debit_action_workflow_ttl.sql`, then to 90: a keyword-research run paces its iTunes calls between LLM steps and a throttled run approaches 45-50 minutes. The cap, not the window, is what bounds abuse |
| Classes and the class guard | `20260725052000_debit_action_task_guard.sql` | Introduced `action_class()` and froze the class per action |
| Authorise/settle split | `20260727222443_settle_action_on_response.sql` | Moved the debit after the response; `debit_action` dropped in `20260727224021_drop_debit_action.sql` |

The window is measured from `actions.created_at` – when the action was first opened – not
from the last call, so a long chain of replays cannot walk the deadline forward.

## Fallback

`Settings → AI` has one fallback switch, off by default, and it means the same thing for
both non-BYOK tiers: when the chosen tier cannot serve the request at all, try the BYOK
tier once, and only if it is configured.

| Situation | With fallback on | With fallback off |
|---|---|---|
| No cloud session – never signed in, or the refresh token no longer works | BYOK if configured | `ai_tier_not_configured` (400) |
| Embedded Apple model unavailable | BYOK if configured | `apple_fm_unavailable` (422) |
| Local server will not load the model | BYOK if configured | `local_server_unavailable` (422) |

`getValidAccessToken()` returns `null` both for "never signed in" and for "session expired",
so the managed tier treats them identically – the local tier already did, and an expired
session being a hard failure while a dead sidecar was not made no sense.

The fallback is deliberately shallow. It fires **once**, before any request leaves the
machine, and the BYOK resolution it delegates to cannot itself fall back further. Anything
that happens *after* the request is sent – `insufficient_credits`, `rate_limited`,
`action_exhausted`, `generation_failed` – is a hard failure surfaced to the user. Silently
re-running a failed paid call on the user's own provider key would spend their money to
hide ours.

## What travels and what is stored

Sent to the proxy, per call: the task alias (`bascaso/<task>`), the system and user text
that task needs – the metadata, review or prompt in question – an optional `temperature`,
and an optional JSON schema when the caller wants structured output. Nothing else. ASC
credentials, the local database and the BYOK keys never leave the machine.

The proxy flattens the messages into a single system string and a single prompt; there is
no multi-turn history, which is why a non-`system`/`user` role is rejected rather than
dropped after billing.

Stored server-side:

| Table | Contents |
|---|---|
| `llm_calls` | user, action, task, resolved model, input/output token counts, latency – no prompt and no completion text |
| `actions` | action id, user, task, call count, timestamps, settled flag |
| `wallets`, `credit_ledger` | balance and every movement, with its reason and Stripe reference |
| `subscriptions`, `profiles` | subscription mirror and the Stripe customer id |

Row-level security allows an account to read its own rows and nothing else; all writes go
through the service role.

The response echoes the alias the client sent (`bascaso/translate`), not the provider model
that served it. Which model backs a task is internal routing, already recorded per call in
`llm_calls` for audit and billing disputes, and not something an AGPL client needs to know
to use a managed tier.
