# Privacy

> **Status: draft, pending legal review.** The data flows below are derived from the code
> and are accurate as of this commit — every claim can be checked against the source, and
> the sections say where. The legal framing around them (controller identity, lawful basis,
> retention periods, complaint routes) needs a lawyer and details that do not exist yet:
> see [What is still missing](#what-is-still-missing).

Bascaso runs on your Mac. Almost everything it does stays there. The exception is the
managed AI tier, which is opt-in and requires an account — this document exists mostly to
draw that line precisely.

## Without an account

This is the default. No account, no server, no request to us.

**Stored on your Mac**, in `~/Library/Application Support/bascaso/`:

| Data | Where | Protection |
|---|---|---|
| App Store Connect API key | `bascaso.db` | AES-256-GCM envelope encryption; the master key lives in the macOS Keychain |
| Your Bascaso cloud session, if any | `bascaso.db` | Same |
| Your own AI provider keys (BYOK) | `bascaso.db` | Same |
| Cached App Store Connect data, ASO scores, preferences, pending changes | `bascaso.db` | Plain — it is your own data on your own machine |

**Leaves your Mac even without an account**, because the app cannot work otherwise:

- **Apple App Store Connect** (`api.appstoreconnect.apple.com`) — using *your* API key, to read
  and write *your* apps. This is the same connection Apple's own web console makes.
- **The public App Store search API** (`itunes.apple.com`) — the ASO layer queries it for
  keyword rankings and competitor data. These requests carry no account identifier and no
  data of yours; they are the same public searches anyone can run. See [ASO.md](ASO.md).

**AI, without the managed tier:**

- **On-device model** — runs on your Mac. Nothing leaves it.
- **Your own API key (BYOK)** — the app calls your provider **directly** from your machine,
  with your key. We are not in that path and never see the content.

## With a Bascaso cloud account (the managed AI tier)

Creating an account is a deliberate action, and routing a task to the managed tier is
another. Both are reversible: sign out and the app returns to the behaviour above.

**What we hold**

| Data | Why |
|---|---|
| Email address, password hash | Authentication (Supabase Auth) |
| Credit balance | To know what you can spend |
| Credit ledger — amount, reason (`purchase` / `refund` / `signup_bonus`), Stripe reference, timestamp | To justify every movement on your balance if you dispute one |
| Subscription status and current period end | To know whether to charge per action |
| Actions — task name, call count, timestamps | Rate limiting, and the free-replay window that stops you paying twice for one gesture |
| Per-call record — task name, model used, input/output token counts, latency | To reconcile what a provider charged us against what we charged you |
| Stripe customer id | To link you to your payments |

**What we do not hold — and this is the part worth checking**

We do **not** store the text you send to the managed tier, nor the text the model returns.
The per-call record above holds counters, not content: `task`, `model`, `input_tokens`,
`output_tokens`, `latency_ms`. There is no column anywhere in our schema for a prompt or a
response.

Your text passes *through* our proxy on its way to the model provider, and is not written
down on the way. Provider failures are logged with the error's name, message and HTTP status
only — deliberately, because the SDK's error objects carry the request body and would
otherwise put your text into our logs.

**Payments.** Stripe processes them. We never see your card details; they do not transit
through our servers. Stripe receives your email address and holds the payment record.

## Who else processes your data

Only for the managed tier. Without an account, none of these are involved.

| Processor | Role | Location |
|---|---|---|
| Supabase | Hosting, database, authentication | *(to confirm — depends on the project's region)* |
| Stripe | Payments | EU / US |
| Google | AI model provider (Gemini) | US |
| Anthropic | AI model provider (Claude) | US |

Which provider serves which task is configuration, and can change. The current mapping lives
in the backend's `models.config.ts`.

## Telemetry

**There is none.** No analytics SDK is installed in the app: no such dependency in
`package.json`, no such call in the source. Nothing reports how you use Bascaso.

The per-account records described above are the one nuance, and we would rather name it than
let it read as a contradiction: for the managed tier we do record which task ran, on which
model, and how many tokens it used. That is billing data, not behavioural analytics — it
exists because you are being charged and are entitled to see why. It does not exist for
local or BYOK use, because nothing is charged there.

## Your data, and getting rid of it

**Deleting your account deletes everything attached to it.** Every table keys on the user
and cascades on deletion: profile, wallet, ledger, subscription, actions, per-call records.
Nothing survives keyed to you.

That sentence was not true when this document was first written: `llm_calls` — the per-call
records — had no foreign key, so deleting an account left its rows behind, still carrying the
deleted user id. It was caught reviewing this file against the database rather than against
the code, and fixed by the migration that added the missing constraint. The cascade is
verified, not assumed: deleting a user with a per-call record removes it.

Two things sit outside that:

- **Stripe** keeps payment records under its own legal obligations. Accounting law requires
  it; we cannot delete them on request.
- **Your local data** never left your Mac. Deleting the app's folder removes it.

## What is still missing

This document describes what the software does. It is not yet a complete privacy policy,
and shipping it as one would be a mistake. Before the first paying customer:

- **The data controller has to exist and be named** — legal entity, address, contact. That is
  the [legal status](../README.md) decision, still open.
- **A lawyer has to review this**, particularly the lawful basis for each processing purpose
  and the retention periods, which are currently "until you delete your account" and probably
  need to be stated per category.
- **Supabase's region has to be confirmed** and written into the processor table above,
  because it determines whether data leaves the EU.
- **Data subject requests need a route** — an address that is monitored, and someone who
  answers within the legal deadline.

Related: [TERMS.md](TERMS.md) · [MANAGED.md](MANAGED.md) (what the managed tier charges and
why) · [ASO.md](ASO.md) (what the ASO layer queries).
