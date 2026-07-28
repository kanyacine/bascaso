# ASO layer

This document explains what the ASO layer computes, where its data comes from, and – most importantly – which numbers are measurements and which are estimates. It is written for someone deciding how much to trust a score, not for someone modifying the code.

Everything described here lives in `src/lib/aso/`. Numeric behaviour is locked by unit tests and by parity vectors generated from the Python reference implementation the scoring was ported from (`tests/unit/aso/`).

## What the layer does

Given a keyword and a storefront, the layer:

1. Runs a public App Store search for that keyword in that country.
2. Reads the competitive shape of the results (rating counts, ratings, ages, publishers, titles).
3. Turns that into four numbers – popularity, difficulty, opportunity, a verdict label – plus your app's position in the results.
4. Caches the result in SQLite for 24 hours, keyed on `(keyword, country)`.

It never talks to App Store Connect and never uses your credentials. It only sees what any anonymous visitor of the App Store sees. Consequently it knows nothing about your actual impressions, conversion rate or downloads – those live in Analytics, not here.

Three surfaces consume it: the **My locales** and **Storefronts** tabs (score every keyword of the App Store Connect keyword field), the **Research** tab (score an arbitrary list), and the autonomous keyword-research run (see the last section).

## Scoring methodology

All four numbers derive from a single App Store search returning **at most 25 results**. That cap is the single most important thing to keep in mind while reading the rest of this section.

### Popularity (5–100, or unknown)

`estimatePopularity` in `estimators.ts`. Six signals are summed, then the total is truncated and clamped to 5–100. With zero results, popularity is `null` – the UI shows no value rather than a zero.

| Signal | Range | How |
|---|---|---|
| Result count | 0–25 | `min(25, n × 2.5)` |
| Leader strength | 0–30 | Highest rating count in the top half of the results, log-interpolated over 10 → 1, 100 → 5, 1 000 → 10, 10 000 → 17, 100 000 → 24, 1 000 000 → 30 |
| Title match density | 0–20 | `min(20, matches / n × 40)`, where a match is an exact phrase or all keyword words present in the title |
| Market depth | 0–10 | Median rating count, log-interpolated over 10 → 0.5, 100 → 3, 1 000 → 5, 10 000 → 8, 50 000 → 10 |
| Keyword specificity | −3 to −28 | 2 words −3, 3 words −8, 4 words −15, 5 words −22, 6+ words −28 |
| Exact phrase bonus | 0–15 | `min(15, exactPhraseMatches / n × 50)` |

Two dampening factors then apply:

- **Small sample** – the ratio-based signals (title density, exact bonus) are multiplied by `min(1, n / 10)`, so a keyword returning 3 results cannot claim a full title-density score.
- **Backfill** – Apple pads thin result sets with loosely related apps. Average title evidence across the results is turned into a factor `clamp(evidence / n × 2.6, 0.3, 1)` and multiplied into the result count, leader and depth signals. A result set where nothing matches the keyword loses 70 % of those three signals.

### Difficulty (1–100, 0 when there is no data)

`calculateDifficulty` in `estimators.ts`. Seven sub-scores, each 0–100, combined with fixed weights:

| Sub-score | Weight | What it reads |
|---|---|---|
| Rating volume | 30 % | Median rating count across the results (log bands 50 → 5 … 100 000 → 95, capped at 100) |
| Dominant players | 20 % | Log dominance per app against a 10 000 000-rating ceiling, top half weighted double |
| Review velocity | 10 % | Median ratings per year since release (log bands 10 → 5 … 50 000 → 95); defaults to 50 when no release date is usable |
| Rating quality | 10 % | Rating-count-weighted average star rating (bands 3.0 → 20 … 5.0 → 100) |
| Market age | 10 % | Average years since release (bands 0.5 y → 10 … 10 y → 100) |
| Publisher diversity | 10 % | Share of distinct publishers among the results |
| Title relevance | 10 % | Share of results with the keyword in the title |

The same small-sample and backfill dampening as popularity applies to the ratio-shaped sub-scores before weighting. The weighted total is truncated and clamped to 1–100 – this is the `rawTotal` shown in the detail panel.

Three post-processing overrides can then lower it, in this order:

1. **Small result set cap** – 1 result caps difficulty at 10, 2 at 20, 3 at 31, 4 at 40.
2. **Weak leader cap** – if the #1 app has fewer than 1 000 ratings and the keyword is not a brand name, the score is capped at `15 + 35 × log10(leader + 1) / log10(1001)`. When more than 20 % of results genuinely carry the keyword in their title, the cap is blended rather than applied flat.
3. **Backfill discount** – if fewer than 20 % of results match the title *and* the leader is under 1 000 ratings *and* the keyword is not a brand, the score is multiplied by a factor between 0.6 and 1.

**Brand keywords** disable overrides 2 and 3. A keyword is treated as a brand name when every one of its words appears in the #1 app's publisher name, and either that app has 1 000+ ratings or the next results from other publishers (up to four of them) have a median of at least 10 000 ratings. The rationale: a brand companion app with few ratings does not make the keyword easy.

When an override moves the score, the detail panel says so explicitly ("Adjusted 62 → 31") rather than silently showing the corrected number.

The label attached to the final score: ≤ 15 Very Easy, ≤ 35 Easy, ≤ 55 Moderate, ≤ 75 Hard, ≤ 90 Very Hard, above that Extreme. No results at all gives "No Data".

### Opportunity (0–100)

`calcOpportunity` in `scoring.ts` – the only place where popularity and difficulty are combined:

```
searches     = popularity → estimated daily searches (see the table below)
volume       = log10(1 + searches) / log10(1 + 32000)
gate         = 1 − (difficulty / 100)²
opportunity  = trunc(volume × gate × 100), clamped to 0–100
```

Because the gate is quadratic, difficulty only bites hard at the top end: at difficulty 30 a maximally popular keyword still scores 91, at 50 it scores 75, at 70 it scores 51, at 90 it scores 18. Popularity 0 or unknown always yields 0.

### Verdict

`classifyKeyword`, evaluated top to bottom – the first rule that matches wins:

| Verdict | Condition |
|---|---|
| Sweet Spot | popularity ≥ 40 and difficulty ≤ 40 |
| Hidden Gem | 25 ≤ popularity < 40, difficulty ≤ 30, opportunity ≥ 30 |
| Low Volume | popularity < 15 |
| High Competition | difficulty ≥ 65 |
| Good Target | opportunity ≥ 55 |
| Avoid | opportunity ≤ 25 |
| Moderate | anything else |

### Ranking tiers (Top 5 / Top 10 / Top 20)

The detail panel scores each tier separately: the same difficulty algorithm is run on the first 5, 10 and 20 results, but dampened on the *full* result count rather than the slice size, and corrected with the keyword-level match ratio, leader strength and brand flag. Two invariants are then enforced: every tier is at least as hard as the overall difficulty, and a wider tier can never score harder than a narrower one.

### Colour bands

The bands behind the coloured numbers, from `score-display.ts`:

- **Popularity** – 50+ excellent, 30–49 good, 15–29 moderate, 5–14 low, below 5 minimal.
- **Difficulty** – ≤ 15, ≤ 35, ≤ 55, ≤ 75, ≤ 90, above (lower is better).
- **Opportunity** – ≥ 55 green, 26–54 amber, ≤ 25 red (the same thresholds as the Good Target / Avoid verdicts).
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

**Popularity** is not a measurement of search volume. Apple publishes no such figure. It is a 5–100 composite of how many results came back, how strong the leader is, how many titles carry the keyword, how deep the market is, and how many words the keyword has. Two keywords with the same popularity are only claiming to have similarly-shaped competitive fields.

**Difficulty** is likewise a model output, and one that gets actively corrected: on thin or backfilled result sets the raw score is capped or discounted by the overrides above. The detail panel always shows both the raw and the adjusted value when they differ.

**Daily searches** (`≈ N searches/day`) come from a fixed piecewise-linear table mapping popularity to volume, calibrated on US App Store observations and baked into the source:

| Popularity | 5 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Searches/day | 1 | 3 | 10 | 35 | 90 | 200 | 400 | 750 | 2 000 | 8 000 | 32 000 |

Values in between are interpolated linearly, values below 5 scale linearly to zero, values above 100 are capped at 32 000.

**Download estimates** apply one formula:

```
downloads(position) = daily searches × tap-through rate(position) × conversion rate
```

The tap-through rate is a fixed table: 30 % at position 1, 18 % at 2, 12 % at 3, 8.5 % at 4, 6 % at 5, then a decaying tail down to 0.07 % at position 20. The conversion rate is a fixed **range for free apps, 5 % to 20 %** – and that range is the entire reason download figures are shown as an interval. The low/high band you see is a factor-of-four spread built into the model's assumption, **not** a statistical confidence interval, and not derived from your app's real conversion rate.

**Storefronts other than the US.** The popularity table is US-only. Other countries are handled by multiplying search volume by a crude installed-base ratio (1.0 US, 0.45 CN, 0.35 JP, 0.30 GB, 0.25 DE, 0.22 FR, … down to 0.02), with 0.03 assumed for any country not in the table. Because that is an extrapolation on top of an estimate, download figures are **hidden outside the US** unless you explicitly enable "Show estimates for every storefront" in Settings › ASO.

**Aggregates.** The Storefront summary's "Est. downloads/day" is the sum of per-keyword estimates at each keyword's current rank; keywords ranked below #20 contribute zero, because the tap-through table stops at position 20. "Headroom to #1" is the same sum recomputed with every keyword at position 1, minus the current one – a ceiling under the model's own assumptions, not a forecast of what optimisation would deliver.

### On margins of error

The code carries no error bar for popularity, difficulty or opportunity, so this document cannot state one. The only interval anywhere in the layer is the conversion-rate band on downloads, and that band is an assumption rather than a measurement of dispersion. The tables are static: they are not refit against observed data, they do not adapt per category, and nothing calibrates them outside the US App Store.

Read popularity, difficulty, opportunity and download figures as a consistent way to rank keywords against one another – which is what they are good at – rather than as quantities with physical meaning.

## Known limits

**The 25-result horizon.** Everything is computed from at most 25 search results. Your app either appears there or is reported as not ranking; there is no way to distinguish rank 26 from rank 300. Result counts saturate at 25, so a "low result count" signal only means Apple returned few apps, and the rank distribution buckets stop at 21–25.

**No Apple keyword data at all.** No search volume, no impressions, no keyword-level conversion. Popularity is an inference from the competitive field.

**US calibration.** See above. Popularity, daily searches and every download figure inherit a US baseline.

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
| Score stored before the detail columns existed | "No detail stored yet – refreshes with the next score update"; no breakdown, no rank, no signals |
| A research run hits repeated iTunes failures | A banner naming how many keywords could not be scored, with the proposal built from the rest |
| A research run scores too few keywords | The run fails outright rather than proposing metadata from a token sample |

**Scope.** iOS App Store only – no Google Play, no Mac App Store. Scores are shared per `(keyword, country)` across every app in your install; only the rank is per app.

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
| Sweet Spot | 1.3 | 1.5 | 0.9 |
| Hidden Gem | 1.2 | 0.8 | 1.6 |
| Good Target | 1.1 | 1.2 | 1.0 |
| Moderate | 1.0 | 1.0 | 0.8 |
| Low Volume | 0.6 | 0.3 | 0.7 |
| High Competition | 0.4 | 0.6 | 0.2 |
| Avoid | 0.2 | 0.2 | 0.2 |

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
