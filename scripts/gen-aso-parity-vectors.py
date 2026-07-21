"""Generate parity vectors by running respectaso's real scoring code on
synthetic fixtures with a frozen clock. Output JSON is committed to
mybetteraso and replayed by Vitest to validate the TS port."""

import importlib.util
import json
import sys
import types
from datetime import datetime, timezone

# services.py imports `requests` at module level but scoring classes never use it.
sys.modules["requests"] = types.ModuleType("requests")
sys.modules["requests"].exceptions = types.SimpleNamespace(
    ConnectionError=Exception, Timeout=Exception, HTTPError=Exception
)
sys.modules["requests"].Timeout = Exception

BASE = "/Users/yacine/Documents/code/betteraso/respectaso/aso"


def load(name, path):
    # Python 3.9 host: enable PEP 604 (`X | None`) annotations via compile flag.
    import __future__
    mod = types.ModuleType(name)
    mod.__file__ = path
    with open(path) as f:
        code = compile(f.read(), path, "exec", flags=__future__.annotations.compiler_flag)
    sys.modules[name] = mod
    exec(code, mod.__dict__)
    return mod


services = load("services", f"{BASE}/services.py")
scoring = load("scoring", f"{BASE}/scoring.py")

# Freeze the clock inside services.py
FROZEN_NOW = datetime(2026, 7, 21, 0, 0, 0, tzinfo=timezone.utc)


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return FROZEN_NOW


services.datetime = FrozenDatetime


def app(name, reviews, rating=4.5, released="2020-01-15T08:00:00Z",
        seller="Some Dev LLC", genre="Productivity"):
    return {
        "trackId": abs(hash(name)) % 10**9,
        "trackName": name,
        "userRatingCount": reviews,
        "averageUserRating": rating,
        "releaseDate": released,
        "primaryGenreName": genre,
        "sellerName": seller,
    }


FIXTURES = {
    "strong_market_meditation": {
        "keyword": "meditation",
        "competitors": [
            app("Calm - Sleep & Meditation", 1_500_000, 4.8, "2012-02-10T08:00:00Z", "Calm.com", "Health & Fitness"),
            app("Headspace: Meditation & Sleep", 900_000, 4.9, "2012-01-01T08:00:00Z", "Headspace Inc.", "Health & Fitness"),
            app("Insight Timer - Meditation App", 400_000, 4.9, "2010-06-01T08:00:00Z", "Insight Network Inc", "Health & Fitness"),
            app("Balance: Meditation & Sleep", 250_000, 4.8, "2019-10-01T08:00:00Z", "Elevate Labs", "Health & Fitness"),
            app("Meditation & Sleep: Serenity", 80_000, 4.7, "2017-03-01T08:00:00Z", "Olson Applications", "Health & Fitness"),
        ] + [
            app(f"Mindfulness App {i}", 5_000 + i * 700, 4.5, "2018-05-01T08:00:00Z", f"Dev {i}", "Health & Fitness")
            for i in range(20)
        ],
    },
    "single_weak_exact": {
        "keyword": "lan invoice",
        "competitors": [
            app("LAN Invoice Maker", 12, 4.0, "2024-11-01T08:00:00Z", "Tiny Dev", "Business"),
        ],
    },
    "backfill_lan_invoice": {
        "keyword": "lan invoice",
        "competitors": [
            app("LAN Invoice Pro", 40, 4.2, "2023-06-01T08:00:00Z", "Small Co", "Business"),
        ] + [
            app(f"Invoice Maker {i}", 200_000 - i * 10_000, 4.7, "2015-01-01T08:00:00Z", f"Big Invoice Corp {i}", "Business")
            for i in range(9)
        ],
    },
    "brand_weak_leader_nasdaq": {
        "keyword": "nasdaq",
        "competitors": [
            app("Nasdaq", 500, 4.1, "2013-01-01T08:00:00Z", "Nasdaq, Inc.", "Finance"),
            app("Stocks Tracker Pro", 60_000, 4.6, "2014-01-01T08:00:00Z", "TrackerCo", "Finance"),
            app("Market Watch", 45_000, 4.5, "2013-05-01T08:00:00Z", "MW Media", "Finance"),
            app("Trading Central", 30_000, 4.4, "2016-01-01T08:00:00Z", "TC Ltd", "Finance"),
            app("Investing Hub", 25_000, 4.3, "2015-08-01T08:00:00Z", "Hub Inc", "Finance"),
            app("Stock Screener X", 12_000, 4.2, "2017-02-01T08:00:00Z", "ScreenX", "Finance"),
        ],
    },
    "finance_ambiguous_call": {
        "keyword": "call recorder",
        "competitors": [
            app("Call Recorder - Save Calls", 85_000, 4.3, "2018-01-01T08:00:00Z", "RecApps", "Utilities"),
            app("Phone Call Recorder Plus", 40_000, 4.1, "2019-01-01T08:00:00Z", "PlusDev", "Utilities"),
            app("Auto Call Recorder", 20_000, 4.0, "2020-01-01T08:00:00Z", "AutoRec", "Utilities"),
            app("Voice Memo & Recorder", 15_000, 4.4, "2017-01-01T08:00:00Z", "MemoCo", "Utilities"),
            app("TapeACall: Call Recorder", 90_000, 4.5, "2013-01-01T08:00:00Z", "Epic Enterprises", "Business"),
        ],
    },
    "long_tail_five_words": {
        "keyword": "card value scanner for pokemon",
        "competitors": [
            app("Pokemon Card Scanner", 8_000, 4.6, "2021-01-01T08:00:00Z", "ScanCo", "Utilities"),
            app("TCG Card Value", 3_000, 4.4, "2022-01-01T08:00:00Z", "TCG Dev", "Utilities"),
            app("Card Collector Pro", 1_200, 4.2, "2020-06-01T08:00:00Z", "CollectPro", "Utilities"),
            app("Deck Builder", 900, 4.0, "2019-01-01T08:00:00Z", "DeckDev", "Games"),
        ],
    },
    "no_release_dates": {
        "keyword": "widget maker",
        "competitors": [
            {**app("Widget Maker One", 5_000, 4.5), "releaseDate": ""},
            {**app("Widget Maker Two", 2_000, 4.2), "releaseDate": ""},
            {**app("Cool Widgets", 800, 4.0), "releaseDate": ""},
            {**app("Widget Studio", 300, 3.9), "releaseDate": ""},
            {**app("My Widgets", 150, 4.1), "releaseDate": ""},
        ],
    },
    "three_apps_moderate": {
        "keyword": "habit tracker minimal",
        "competitors": [
            app("Minimal Habit Tracker", 25_000, 4.8, "2019-01-01T08:00:00Z", "MinDev", "Productivity"),
            app("Habit Tracker - Minimal", 9_000, 4.7, "2020-01-01T08:00:00Z", "HabCo", "Productivity"),
            app("Streaks", 40_000, 4.8, "2015-06-01T08:00:00Z", "Crunchy Bagel", "Productivity"),
        ],
    },
    "weak_leader_high_match": {
        "keyword": "budget planner",
        "competitors": [
            app(f"Budget Planner {i}", 200 if i == 0 else 400 + i * 120, 4.3,
                "2021-03-01T08:00:00Z", f"BudgetDev {i}", "Finance")
            for i in range(10)
        ],
    },
    "zero_reviews": {
        "keyword": "obscure niche tool",
        "competitors": [
            {**app(f"Obscure Tool {i}", 0, 0), "averageUserRating": 0} for i in range(5)
        ],
    },
    "bad_release_dates": {
        "keyword": "note taking",
        "competitors": [
            {**app("Note Taking Pro", 4_000, 4.4), "releaseDate": "not-a-date"},
            {**app("Notes & Tasks", 2_500, 4.2), "releaseDate": "2019-03-01T08:00:00Z"},
            {**app("Quick Note Taking", 1_000, 4.0), "releaseDate": "garbage"},
        ],
    },
    "future_release_dates": {
        "keyword": "ai journal",
        "competitors": [
            app("AI Journal", 300, 4.5, "2027-01-01T08:00:00Z", "FutureDev", "Lifestyle"),
            app("Journal AI Writer", 150, 4.3, "2027-03-01T08:00:00Z", "FutureDev2", "Lifestyle"),
        ],
    },
    "empty_keyword": {
        "keyword": "",
        "competitors": [
            app("Some App", 5_000, 4.5),
            app("Another App", 2_000, 4.2),
            app("Third App", 900, 4.0),
        ],
    },
    "six_word_keyword": {
        "keyword": "best free card value scanner app",
        "competitors": [
            app("Card Scanner", 3_000, 4.4, "2021-01-01T08:00:00Z", "ScanDev", "Utilities"),
            app("Value Finder", 1_500, 4.2, "2022-01-01T08:00:00Z", "FindDev", "Utilities"),
        ],
    },
    "perfect_five_star_young": {
        "keyword": "viral video maker",
        "competitors": [
            app("Viral Video Maker", 600_000, 5.0, "2025-09-01T08:00:00Z", "ViralCo", "Photo & Video"),
            app("Video Maker Viral Pro", 400_000, 5.0, "2025-10-01T08:00:00Z", "ProViral", "Photo & Video"),
            app("Make Viral Videos", 350_000, 5.0, "2025-08-01T08:00:00Z", "MVV Inc", "Photo & Video"),
        ],
    },
    "extreme_market": {
        "keyword": "photo editor",
        "competitors": [
            app(f"Photo Editor {i}", 2_000_000 + i * 50_000, 4.8, "2012-06-01T08:00:00Z", f"MegaCorp {i}", "Photo & Video")
            for i in range(25)
        ],
    },
    "very_hard_market": {
        "keyword": "photo editor",
        "competitors": [
            app(f"Photo Editor {i}" if i % 2 == 0 else f"Pic Tool {i}",
                60_000 + i * 9_000, 4.5, "2016-06-01T08:00:00Z", f"BigCo {i}", "Photo & Video")
            for i in range(10)
        ],
    },
    "brand_like_weak_field": {
        "keyword": "acme",
        "competitors": [
            app("Acme Notes", 100, 4.0, "2022-01-01T08:00:00Z", "Acme Inc", "Productivity"),
            app("Note App A", 800, 4.2, "2021-01-01T08:00:00Z", "DevA", "Productivity"),
            app("Note App B", 500, 4.1, "2020-01-01T08:00:00Z", "DevB", "Productivity"),
            app("Note App C", 200, 4.3, "2019-01-01T08:00:00Z", "DevC", "Productivity"),
        ],
    },
    "solo_publisher_brand": {
        "keyword": "acme",
        "competitors": [
            app("Acme Notes", 50, 4.0, "2022-01-01T08:00:00Z", "Acme Inc", "Productivity"),
            app("Acme Tasks", 30, 4.1, "2021-01-01T08:00:00Z", "Acme Inc", "Productivity"),
            app("Acme Mail", 20, 4.2, "2020-01-01T08:00:00Z", "Acme Inc", "Productivity"),
        ],
    },
    "sparse_fields": {
        "keyword": "todo list",
        "competitors": [
            {},
            {"trackName": "Todo List"},
            {"trackName": "Todo List Pro", "userRatingCount": 5_000,
             "averageUserRating": 4.5, "sellerName": "TodoCo",
             "releaseDate": "2020-01-01T08:00:00Z", "primaryGenreName": "Productivity"},
        ],
    },
    "strong_brand_spotify": {
        "keyword": "spotify",
        "competitors": [
            app("Spotify - Music and Podcasts", 39_000_000, 4.8, "2011-07-14T08:00:00Z", "Spotify AB", "Music"),
            app("Amazon Music", 1_200_000, 4.7, "2014-01-01T08:00:00Z", "AMZN Mobile LLC", "Music"),
            app("SoundCloud", 900_000, 4.7, "2012-01-01T08:00:00Z", "SoundCloud Ltd", "Music"),
            app("Deezer", 500_000, 4.6, "2012-06-01T08:00:00Z", "Deezer SA", "Music"),
            app("YouTube Music", 800_000, 4.6, "2015-11-01T08:00:00Z", "Google LLC", "Music"),
        ],
    },
    "punctuation_keyword": {
        "keyword": "!!!",
        "competitors": [
            app("Some Game", 10_000, 4.5, "2020-01-01T08:00:00Z", "GameDev", "Games"),
            app("Other Game", 5_000, 4.3, "2021-01-01T08:00:00Z", "OtherDev", "Games"),
        ],
    },
    "sparse_brand_signal_b": {
        "keyword": "acme",
        "competitors": [
            {"trackName": "Acme", "sellerName": "Acme Inc"},
            {"trackName": "Runner One", "userRatingCount": 25_000,
             "averageUserRating": 4.5, "releaseDate": "2018-01-01T08:00:00Z"},
            {"trackName": "Runner Two"},
        ],
    },
    "unicode_accents": {
        "keyword": "météo précise",
        "competitors": [
            app("Météo Précise - Radar", 30_000, 4.6, "2016-01-01T08:00:00Z", "WeatherFR", "Weather"),
            app("La Météo Française", 12_000, 4.4, "2018-01-01T08:00:00Z", "MeteoCo", "Weather"),
            app("Weather Radar Pro", 50_000, 4.5, "2014-01-01T08:00:00Z", "RadarInc", "Weather"),
        ],
    },
}

pop = services.PopularityEstimator()
diff = services.DifficultyCalculator()

DIFF_FIELDS = [
    "total_score", "raw_total", "override_reason", "is_brand_keyword",
    "rating_volume", "review_velocity", "dominant_players", "rating_quality",
    "market_age", "publisher_diversity", "title_relevance", "interpretation",
    "title_match_count", "median_reviews", "avg_reviews",
]

out = {"frozen_now": FROZEN_NOW.isoformat(), "cases": []}
for name, fx in FIXTURES.items():
    kw, comps = fx["keyword"], fx["competitors"]
    popularity = pop.estimate(comps, kw)
    total, breakdown = diff.calculate(comps, kw)
    expected_diff = {k: breakdown.get(k) for k in DIFF_FIELDS}
    out["cases"].append({
        "name": name,
        "keyword": kw,
        "competitors": comps,
        "expected_popularity": popularity,
        "expected_difficulty": expected_diff,
        "expected_opportunity": scoring.calc_opportunity(popularity or 0, total),
        "expected_classification": scoring.classify_keyword(popularity or 0, total),
    })

# Edge: empty competitor list
out["cases"].append({
    "name": "empty_competitors",
    "keyword": "anything",
    "competitors": [],
    "expected_popularity": None,
    "expected_difficulty": {"total_score": 0, "interpretation": "No Data"},
    "expected_opportunity": 0,
    "expected_classification": "Low Volume",
})

path = sys.argv[1] if len(sys.argv) > 1 else "parity-vectors.json"
with open(path, "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print(f"Wrote {len(out['cases'])} cases to {path}")
for c in out["cases"]:
    ed = c["expected_difficulty"]
    print(f"  {c['name']}: pop={c['expected_popularity']} diff={ed.get('total_score')} "
          f"({ed.get('override_reason')}) opp={c['expected_opportunity']} → {c['expected_classification']}")
