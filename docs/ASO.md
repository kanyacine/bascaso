# ASO layer

This document explains what the ASO layer computes, where its data comes from, and – most importantly – which numbers are measurements and which are estimates. It is written for someone deciding how much to trust a score, not for someone modifying the code.

Everything described here lives in `src/lib/aso/`. Numeric behaviour is locked by unit tests and by parity vectors generated from the Python reference implementation the scoring was ported from (`tests/unit/aso/`).

## What the layer does

Given a keyword and a storefront, the layer:

1. Runs a public App Store search for that keyword in that country.
2. Reads the competitive shape of the results (rating counts, ratings, ages, publishers, titles).
3. Turns that into four numbers – popularity, difficulty, opportunity, a verdict label – plus your app's position in the results. Opportunity and the verdict are computed for your app, from its own store profile in that storefront.
4. Caches the result in SQLite for 24 hours, keyed on `(keyword, country)`.

It never talks to App Store Connect and never uses your credentials. It only sees what any anonymous visitor of the App Store sees. Consequently it knows nothing about your actual impressions, conversion rate or downloads – those live in Analytics, not here.

Three surfaces consume it: the **My locales** and **Storefronts** tabs (score every keyword of the App Store Connect keyword field), the **Research** tab (score an arbitrary list), and the autonomous keyword-research run (see the last section).

## Scoring methodology

All four numbers derive from a single App Store search returning **at most 25 results**. That cap is the single most important thing to keep in mind while reading the rest of this section.

### Popularity (1–100, or unknown)

`estimatePopularity` in `estimators.ts` – RespectASO's **estimate v2**. Eight signal components are extracted from the results, then combined with weights fitted upstream (2026-08-17) against 327 official Apple `searchPopularity1to100` values for the US plus 90 below-top-terms negatives (holdout Spearman 0.61). The weighted sum is rounded and clamped to 1–100, so the output speaks Apple's own scale: keywords Apple reports in its top-terms dataset land around 40 and up. With zero results, popularity is `null` – the UI shows no value rather than a zero.

| Component | Range | How | Weight |
|---|---|---|---|
| Intercept | | | 3.6672 |
| Result count | 0–25 | `min(25, n × 2.5)` | 1.0404 |
| Leader strength | 0–30 | Highest rating count in the top half of the results, log-interpolated over 10 → 1, 100 → 5, 1 000 → 10, 10 000 → 17, 100 000 → 24, 1 000 000 → 30 | −1.9714 |
| Title match density | 0–20 | `min(20, matches / n × 40)`, a match being the exact phrase (or its run-together form, "ScrollLess" for "scroll less") or all keyword words in the title | 0.6129 |
| Market depth | 0–10 | Median rating count, log-interpolated over 10 → 0.5, 100 → 3, 1 000 → 5, 10 000 → 8, 50 000 → 10 | 2.9001 |
| Keyword specificity | −3 to −28 | 2 words −3, 3 words −8, 4 words −15, 5 words −22, 6+ words −28 | 0.8644 |
| Exact phrase bonus | 0–15 | `min(15, exactPhraseMatches / n × 50)` | −0.338 |
| Brand magnitude | 0–~7 | `log10(1 + ratings)` of the strongest exact-title match in the top 5 | 2.1709 |
| Leader magnitude | 0–~8 | `log10(1 + ratings)` of the strongest top-half app | 8.1524 |

Two dampening factors apply to the components before weighting:

- **Small sample** – title density and exact bonus are multiplied by `min(1, n / 10)`.
- **Backfill** – average title evidence across the results becomes a factor `clamp(evidence / n × 2.6, 0.3, 1)`, multiplied into result count, leader strength and depth.

Words are runs of letters, combining marks and digits in any script (`tokenizeWords`), so accented, Thai or Hindi keywords are matched whole.

### Difficulty (1–100, 0 when there is no data)

`calculateDifficulty` in `estimators.ts`. Seven sub-scores, each 0–100, combined with fixed weights. The five per-app curves (volume, momentum, rating, age, title) live in `strength.ts` and are the same ones that measure *your* app's strength for the opportunity score – one yardstick for both:

| Sub-score | Weight | What it reads |
|---|---|---|
| Rating volume | 30 % | Median rating count across the results (log bands 50 → 5 … 100 000 → 95 … 1 000 000 → 100) |
| Dominant players | 20 % | Log dominance per app against a 10 000 000-rating ceiling, top half weighted double |
| Review velocity | 10 % | Median ratings per year since release (log bands 10 → 5 … 50 000 → 95 … 500 000 → 100); defaults to 50 when no release date is usable |
| Rating quality | 10 % | Rating-count-weighted average star rating (bands 3.0 → 20 … 5.0 → 100) |
| Market age | 10 % | Average years since release (bands 0.5 y → 10 … 10 y → 100) |
| Publisher diversity | 10 % | Share of distinct publishers among the results |
| Title relevance | 10 % | Share of results with the keyword in the title |

The same small-sample and backfill dampening as popularity applies to the ratio-shaped sub-scores before weighting. The weighted total is truncated and clamped to 1–100 – this is the `rawTotal` shown in the detail panel.

Three post-processing overrides can then lower it, in this order:

1. **Small result set cap** – ten points per app returned, up to nine apps (1 → 10 … 9 → 90); from ten apps on, no cap.
2. **Weak leader cap** – the #1 app's rating count sets a ceiling `cap = 15 + 35 × log10(leader + 1) / log10(1001)`, which bites in proportion to the backfill: `cap + (total − cap) × matchRatio`. It applies in full up to 1 000 leader ratings and fades out on a log scale by 3 000, so crossing 1 000 ratings no longer makes difficulty jump.
3. **Backfill discount** – if fewer than 20 % of results match the title *and* the leader is under 1 000 ratings, the score is multiplied by a factor between 0.6 and 1.

**Brand keywords** disable overrides 2 and 3 (and the same corrections on every ranking tier). A keyword is treated as a brand name when every one of its words appears in the #1 app's publisher name, and either that app has 1 000+ ratings or the next results from other publishers (up to four of them) have a median of at least 10 000 ratings. The rationale: a brand companion app with few ratings does not make the keyword easy.

When an override moves the score, the detail panel says so explicitly ("Adjusted 62 → 31") rather than silently showing the corrected number.

The label attached to the final score: ≤ 15 Very Easy, ≤ 35 Easy, ≤ 55 Moderate, ≤ 75 Hard, ≤ 90 Very Hard, above that Extreme. No results at all gives "No Data".

### Opportunity (0–100)

`calcOpportunity` in `scoring.ts`: what the keyword is worth **to your app, in this storefront**. It is a plain function of the downloads a day the app can expect from the keyword:

```
strength     = your app's 0–100 strength in the storefront (strength.ts), keyword taken as in the title
gap          = difficulty − strength
rank         = effective rank at that gap (RANK_BY_GAP), or your real rank when better –
               or your real rank, full stop, when your title already carries the keyword
downloads    = daily searches(popularity, storefront) × tap-through(rank) × 5 %
opportunity  = round(50 + 20 × log10(downloads per day)), clamped to 0–100
```

One download a day scores 50, ten a day 70, one every ten days 30. `RANK_BY_GAP` was measured upstream (2026-09-22) on 309 App Store searches in six storefronts and 5 846 apps carrying the keyword in their title; each point is the rank whose tap-through equals the *average* of the apps at that gap, so it already counts the chance of landing in the top 10. The detail panel shows where the *middle* app like yours lands instead (`typicalLanding`), because the average is pulled up by the few that do very well.

Your app's profile (ratings, average stars, first release, name) is read per storefront from the public iTunes Lookup API and cached 24 h (`app-profile.ts`). Demo apps, apps the lookup cannot read, and calls without an app id score as a brand new app (strength ≈ 14).

### Verdict

`classifyKeyword`. Demand is decided first, from the keyword alone; then each label is one decade of what the app can expect:

| Verdict | Condition |
|---|---|
| Low Volume | #1 in this storefront brings under one download a day (same for every app) |
| Sweet Spot | opportunity ≥ 70 – 10+ downloads a day |
| Good Target | opportunity 50–69 – 1 to 10 a day |
| Supporting | opportunity 30–49 – one every 10 days to 1 a day |
| Worth Climbing | below that today, but #1 brings 1+ a day |

### Ranking tiers (Top 5 / Top 10 / Top 20)

The detail panel scores each tier separately: the same difficulty algorithm is run on the first 5, 10 and 20 results, but dampened on the *full* result count rather than the slice size, and corrected with the keyword-level match ratio, leader strength and brand flag. Two invariants are then enforced: every tier is at least as hard as the overall difficulty, and a wider tier can never score harder than a narrower one.

### Colour bands

The bands behind the coloured numbers, from `score-display.ts`:

- **Popularity** – 50+ excellent, 30–49 good, 15–29 moderate, 5–14 low, below 5 minimal. On the v2 scale, 40 is roughly where Apple's own top-terms dataset starts (~70 searches a day in the US).
- **Difficulty** – ≤ 15, ≤ 35, ≤ 55, ≤ 75, ≤ 90, above (lower is better).
- **Opportunity** – ≥ 50 green (a download a day or more), 30–49 amber (Supporting), below 30 red.
- **Rank** – ≤ 10 excellent, ≤ 30 strong, ≤ 100 moderate, beyond that low. In practice this pipeline can only ever report ranks 1–25 (see below).

## Data sources

### iTunes Search API (primary)

```
GET https://itunes.apple.com/search?term=<keyword>&country=<cc>&entity=software&limit=25
```

Public, unauthenticated, no API key, no App Store Connect account involved. Timeout 15 s. The country code is an ISO alpha-2 code derived from the App Store storefront you selected (`storefront-country.ts` maps all 175 storefronts).

**What it gives, per result:** app id, name, publisher name, artwork URL, average star rating, rating count, primary genre, formatted price, release date, current-version release date, store URL. Results come back in Apple's own search ordering, which is what makes a rank readable at all: your app's rank is the 1-based position of its Apple id in that list.

**What it does not give:** search volume, impressions, downloads, conversion rate, keyword-level metrics of any kind, ranking beyond the results fetched, historical data, or anything specific to your account. Every number in the layer that looks like traffic is inferred from the list above and nothing else.

### App Store web page + Lookup API (fallback)

When the Search API fails with something other than a rate limit, the layer scrapes `https://apps.apple.com/<country>/iphone/search?term=…`, extracts app ids from the page's `serialized-server-data` payload, then hydrates them through `https://itunes.apple.com/lookup` in chunks of 50 (30 s timeout, a failed chunk is dropped rather than failing the whole search). Apple's ranking order is preserved; ids the lookup does not return are dropped from the list. This produces exactly the same result shape as the primary source, so scores are comparable either way.

### Rate limits and backoff

Rate limiting is handled at three levels.

**Per request (`itunes.ts`).** The Search API is tried twice, deliberately no more, so the fallback takes over quickly:

| Response | Behaviour |
|---|---|
| 429 or 503, first attempt | Wait `min(5, Retry-After)` seconds, or 2 s when the header is missing or unparseable, then retry |
| 429 or 503, second attempt | Throw `ItunesRateLimited` carrying `Retry-After`. The fallback is **not** attempted – the App Store web page would be throttled too |
| 5xx, first attempt | Wait 1.5 s and retry |
| 5xx or 4xx after that | Fall through to the App Store web page fallback |
| Both sources fail | Throw `SearchApiUnavailableError` |

The fallback keeps at least 1 s between its own requests and retries up to 3 times with exponential backoff (1 s, 2 s) on 5xx, connection errors and timeouts. It does not retry 4xx.

**Between requests (`AdaptiveRateLimiter` in `itunes.ts`).** Every scoring call goes through one serialized chain with an adaptive delay: base 3 s (≈ 20 requests/minute), multiplied by 1.6 on each failure up to a 20 s ceiling, or set straight to `Retry-After` when the server sends one (also capped at 20 s). After 3 consecutive successes the delay decays by 0.7, never below 3 s.

**Across requests (`score-service.ts`).** A 24 h cache in the `keyword_scores` table means a keyword is scored at most once per day per country, whatever the number of apps or locales that reference it. A stale row is served immediately while a refresh runs in the background; only a true cold miss waits. Concurrent requests for the same `(keyword, country)` share a single iTunes call. If a background refresh fails, the previous value stays in place and stays flagged stale.

Every score and its history are stored locally in SQLite and can be wiped from **Settings › ASO › Delete search history**.

## Estimates versus measurements

This is the section to read before acting on any number.

### Measured

Reported by Apple's public endpoints, passed through unmodified:

- Competitor names, publishers, genres, prices, artwork.
- Rating counts and average star ratings.
- Release dates and last-update dates.
- The number of results Apple returned for the keyword (0–25).
- **Your app's rank** – a real observation, but only within the top 25, only for the storefront queried, and only at the moment of the query.

### Estimated

Computed here by fixed models. No Apple data of that kind exists behind them:

**Popularity** is not a measurement of search volume. Apple publishes no such figure for arbitrary keywords. It is a 1–100 composite of the competitive field, fitted to Apple's official popularity values for the keywords Apple does report. Two keywords with the same popularity are only claiming to have similarly-shaped competitive fields.

**Difficulty** is likewise a model output, and one that gets actively corrected: on thin or backfilled result sets the raw score is capped or discounted by the overrides above. The detail panel always shows both the raw and the adjusted value when they differ.

**Daily searches** (`≈ N searches/day`) come from a fixed table mapping popularity to US volume, anchored on Apple's top-search-terms dataset (it only reports terms with roughly 500+ weekly searches, and its floor sits around popularity 40):

| Popularity | 1 | 20 | 39 | 40 | 45 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Searches/day | 1 | 35 | 65 | 70 | 140 | 280 | 1 150 | 4 600 | 19 000 | 76 000 | 300 000 |

Linear below 40, about 15 % per point above, interpolated linearly between points.

**Download estimates** apply one formula:

```
downloads(rank) = daily searches × tap-through rate(rank) × 5 %
```

The tap-through rate is a fixed table: 30 % at #1, 18 % at #2, 12 % at #3, 8.5 % at #4, 6 % at #5, down to 0.07 % at #20; between whole ranks it is log-interpolated, past #20 it keeps falling as a power law (exponent ≈ 4.2, the slope between #10 and #20), never a cliff to zero. Every range shown runs **from a tenth of the estimate to the estimate**. RespectASO checked that band against one app's App Store Connect figures (US, June to September 2026): about 14 search downloads a day estimated, about 2 a day real – the band is an assumption about unknowns (searches below Apple's reporting floor, install rate), not a confidence interval.

**Storefronts other than the US.** Search volume is multiplied by the storefront's market size relative to the US (`countries.ts`, 175 storefronts). 48 of them were measured upstream against observed App Store data; the rest are derived from population and regional iOS share. An unknown storefront gets the smallest market in the table. Download figures stay **hidden outside the US** unless you enable "Show estimates for every storefront" in Settings › ASO; opportunity and verdicts use the market size everywhere.

**Aggregates.** The Storefront summary's "Est. downloads/day" is the sum of per-keyword estimates at each keyword's current rank, positions 1–20. "Headroom to #1" is the same sum recomputed with every keyword at #1, minus the current one – a ceiling under the model's own assumptions, not a forecast.

### On margins of error

The code carries no error bar for popularity, difficulty or opportunity, so this document cannot state one. The only interval anywhere in the layer is the tenth-to-estimate band on downloads, and that band is an assumption rather than a measurement of dispersion. The tables are static in Bascaso: they move only when they are re-ported from a newer RespectASO, which refits them upstream.

Read popularity, difficulty, opportunity and download figures as a consistent way to rank keywords against one another – which is what they are good at – rather than as quantities with physical meaning.

## Known limits

**The 25-result horizon.** Everything is computed from at most 25 search results. Your app either appears there or is reported as not ranking; there is no way to distinguish rank 26 from rank 300. Result counts saturate at 25, so a "low result count" signal only means Apple returned few apps, and the rank distribution buckets stop at 21–25.

**No Apple keyword data at all.** No search volume, no impressions, no keyword-level conversion. Popularity is an inference from the competitive field.

**US calibration.** Popularity is fitted on US Apple data and the rank model on six storefronts; other storefronts scale by market size. See above.

**One snapshot per day.** Scores refresh at most every 24 h per keyword and country. Rank movements are computed against the previous stored observation, so a keyword scored twice in a day shows no movement, and a keyword scored a week apart shows a week of drift as a single step.

**The disambiguation guard is finance-only.** Keywords like "option", "call" or "signal" are prevented from claiming strong relevance against non-finance apps, via a hardcoded token list. No equivalent guard exists for other ambiguous verticals – a keyword that is a common word elsewhere may overstate title relevance.

**Backfill correction is a heuristic.** Apple pads thin result sets with loosely related apps; the layer detects this through title-match ratio and leader strength and discounts the score. It can be wrong in both directions – a genuinely competitive niche keyword whose competitors do not put it in their titles will be scored easier than it is.

**Degraded modes, and what you see.** The layer does not hide these:

| Situation | What you see |
|---|---|
| Both search sources fail, or the keyword stays rate-limited | "Score unavailable" on that keyword's badge; other keywords are unaffected |
| Cached score older than 24 h and the refresh has not landed | The previous score, flagged stale, while a background refresh runs |
| Background refresh fails | The previous score stays; nothing is overwritten with a worse value |
| Zero results | Popularity blank, difficulty 0, opportunity 0, verdict "Low Volume", every ranking tier "Easy" with no competitor |
| Your app's store profile cannot be read | Opportunity and verdict computed for a brand new app |
| Score stored before the detail columns existed | "No detail stored yet – refreshes with the next score update"; no breakdown, no rank, no signals |
| A research run hits repeated iTunes failures | A banner naming how many keywords could not be scored, with the proposal built from the rest |
| A research run scores too few keywords | The run fails outright rather than proposing metadata from a token sample |

**Scope.** iOS App Store only – no Google Play, no Mac App Store. Popularity and difficulty are shared per `(keyword, country)` across every app in your install; rank, opportunity and verdict are per app.

**Scoring version.** Each stored score carries the methodology it was computed with. Scores from before the October 2026 port (popularity v1) are served as stale once and refreshed in the background, since v1 and v2 popularity are not on the same scale.

## Keyword research

Two different things share the name.

**Manual scoring** – the Research tab and the keyword tabs score keywords one at a time through `POST /api/aso/scores`. Entirely deterministic, no AI, no cost beyond the paced public iTunes calls. Paste a list, get scores.

**Autonomous research** – an eight-step run that goes from an app to a ready-to-apply metadata proposal. Three steps call a language model, five do not:

| # | Step | AI? | What happens |
|---|---|---|---|
| 1 | Context | No | One iTunes search on the app's own name (10 results) to collect competitor titles |
| 2 | Seeds | **Yes** | The model proposes seed queries from the app's name, metadata and competitor titles – capped at 25 |
| 3 | Expand | No | Scores each seed (cache-first), and harvests single-word candidates from the competitor titles those searches already returned – no extra API calls. Total candidates capped at 120 |
| 4 | Relevance | **Yes** | The model filters seeds and harvested candidates in batches of 30. Deliberately placed *before* scoring, so an irrelevant candidate never costs an iTunes call |
| 5 | Score | No | Scores the relevant harvested candidates through the same paced, cached service |
| 6 | Rank | No | Relevant first, then opportunity × strategy weight, popularity as tiebreak |
| 7 | Compose | **Yes** | The model writes a title, a subtitle and a summary. Both fields are capped at 30 characters deterministically; one retry is issued if the model overshoots |
| 8 | Report | No | Opportunity and insight signals for the top 10 candidates, from already-stored data |

**The 100-character keyword field is never written by the model.** A language model cannot count characters reliably, so the field is packed by deterministic budgeted phrase coverage: candidate phrases are sorted by value, words already present in the title or subtitle cost nothing, words Apple provably ignores (`a`, `an`, `the`, `and`, `or`, `for`, `of`, `with`, `app`, `apps`, `free`, `iphone`, `ipad`) are never packed, and the field is filled greedily by value per missing character, then topped up word by word. Output order follows phrase value, since earlier keywords weigh more in Apple's index.

**Strategies** reweight the ranking by verdict rather than changing the scores:

| Verdict | Balanced | Broad reach | Niche |
|---|---|---|---|
| Sweet Spot | 1.3 | 1.5 | 1.2 |
| Good Target | 1.1 | 1.2 | 1.3 |
| Supporting | 1.0 | 0.8 | 1.1 |
| Worth Climbing | 0.6 | 0.7 | 0.4 |
| Low Volume | 0.4 | 0.2 | 0.7 |

Broad reach and Niche additionally inject one orientation line into the seed prompt – reweighting alone cannot surface phrases the model never generated.

### What a run costs

On the managed AI tier, **one run is one action**, regardless of how many model calls it makes internally. The credit is spent on the first model call (step 2), before any keyword is scored. Retrying a failed run reuses the same action id and is free inside the backend's replay window; the dialog says which of the two applies. With your own API key, you pay your provider for the seeds call, the relevance batches and the compose call. Steps 1, 3, 5, 6 and 8 are local code plus public iTunes requests, and cost nothing either way.

### How a run degrades

Because the credit is already spent by the time scoring starts, a throttled iTunes API downgrades a run rather than aborting it – within limits designed so "degraded" never becomes "quietly wrong":

- A keyword that cannot be scored is skipped and listed, and the run continues.
- After **3 consecutive** iTunes failures, a circuit breaker stops attempting the remaining keywords instead of paying the full backoff ladder for each.
- A **60-minute** wall-clock budget backs the breaker up, since cache hits interleaved with failures could otherwise keep resetting the failure counter.
- The run **fails** if fewer than **5** keywords were scored, or if fewer than **30 %** of the keywords it actually attempted came back – too thin a sample to build a proposal worth one-click applying. The error shown is "The App Store search stayed unavailable for too many keywords – there isn't enough data for a trustworthy proposal."
- Otherwise the report is delivered with a banner stating how many keywords are missing, so a partial proposal is never presented as a complete one.
