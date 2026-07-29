# Terms of sale — managed AI tier

> **Status: draft, pending legal review.** What the software actually does is accurate and
> checkable against the code. What that means contractually is not settled: the selling
> entity does not exist yet, and the withdrawal-right clause below is the one a lawyer
> should read first. See [What is still missing](#what-is-still-missing).

These terms cover **only** the managed AI tier. The application itself is free software under
[AGPL-3.0](../LICENSE); nothing is sold, and nothing here applies, unless you create a
Bascaso cloud account and buy credits or a subscription.

## What is sold

**Credits.** One credit buys one *action*. An action is a single AI gesture — one
translation, one draft, one keyword-research run — however many model calls it takes
internally. Replaying the same action within its window costs nothing: that is what stops a
retry after a network failure from charging you twice. The window is 15 minutes for most
tasks and 90 minutes for agentic workflows, which run longer. See
[MANAGED.md](MANAGED.md) for the exact mechanics.

Credits do not expire.

**Subscription.** A monthly plan replaces per-action billing for its duration. While it is
active, actions do not consume credits.

Prices are shown in the app before purchase and are set in Stripe. The price displayed at
checkout is the price charged.

## Payment

Stripe processes all payments. Your card details never reach our servers.

A purchase is credited when Stripe confirms the payment, not when you click. If our system
fails to credit a confirmed payment, Stripe retries the notification until it succeeds — the
handler is built to fail loudly rather than silently accept a payment it did not record.

## Refunds

A refunded purchase has its credits removed from your balance automatically, for the exact
amount it granted. If your balance has since gone below that, it can go negative; it returns
to positive with your next purchase.

Packs are refunded whole. Partial refunds of a credit pack are not supported: a purchase is
refunded once, in full, or not at all.

Subscriptions are managed through the Stripe customer portal, reachable from
**Settings → Account**. Cancelling stops the next renewal; the current period runs to its end.

## Right of withdrawal

⚠️ **This is the clause that needs legal review, and the reason is worth stating.**

EU consumer law gives a 14-day right of withdrawal, but it can be waived for digital content
supplied immediately, *provided* the customer gives prior express consent and acknowledges
losing the right. Bascaso's credits are usable the instant they are bought — so either that
consent is collected at checkout, or the withdrawal right applies in full and credits must be
refundable for 14 days.

**Neither is currently implemented.** There is no consent checkbox at checkout, and no
14-day refund path beyond a manual Stripe refund. This has to be settled before the first
sale, not after.

## Availability

The managed tier depends on third-party model providers. When a provider fails, the service
falls back to another model where one is configured. When no model can serve a task, the
action fails and **no credit is consumed** — authorisation and settlement are separate steps,
and settlement only happens on a successful response.

No uptime guarantee is offered.

## What is still missing

- **The selling entity.** No legal status, no company name, no address, no VAT number. All of
  it is required before Stripe can be switched to live mode.
- **VAT.** Stripe Tax is not configured. Selling digital services to EU consumers means VAT
  at the customer's rate, and that has to be decided before the first euro.
- **The withdrawal clause above**, which is a real gap, not a formality.
- **Final prices.** Those currently in Stripe come from the sandbox setup script and are
  marked as indicative in the code.

Related: [PRIVACY.md](PRIVACY.md) · [MANAGED.md](MANAGED.md)
