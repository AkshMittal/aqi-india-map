# aqi-india-map

An auto-updating AQI heatmap — India-focused, extensible worldwide. The frontend
is a simple map; all ingestion, processing and cleanup happens in a Cloudflare
Worker on a cron schedule.

**Live:** https://akshmittal.github.io/aqi-india-map/
**Build writeup:** [I tried to build an AQI heatmap — the data fought back](https://medium.com/@akshmittal/i-tried-to-build-an-aqi-heatmap-the-data-fought-back-69d6bf91c41e)

Not a polished product. A learning-first system, built to understand how
real-world data pipelines actually behave.

**What it demonstrates:** scheduled serverless ingestion · cursor-based
incremental fetch · pagination without a reliable total · last-known-good
storage · write-time spatial deduplication.

---

## How it works

1. Cron triggers the Worker
2. Fetch locations page-by-page from OpenAQ (no reliable total count available)
3. Use a **cursor + page state** to incrementally scan, resuming where the last
   cycle stopped instead of restarting
4. Guard filters — valid coordinates, PM2.5 sensor exists, reading within the
   last 30 days
5. Fetch the latest reading per station
6. Store in KV as **last-known-good**
7. **Deduplicate on write** — haversine distance; if under 100 m, compare
   timestamps and keep the fresher reading
8. Frontend consumes the cleaned KV directly

The system **converges over time** rather than recomputing everything each
cycle.

---

## The three problems that shaped it

### Pagination, disguised as everything else

The map stalled at ~1000 locations no matter how long it ran. OpenAQ caps
results at 1000 per call, and Workers were hitting subrequest limits. Adding a
cursor fixed the reset-every-cycle problem.

`countries=IN` didn't filter by country — it returned the whole world. I worked
around that with India/world ingestion buckets before realising the premise was
wrong, and switched to a bounding box.

The punchline: `meta.found`, which should give the total across pages, is *also*
capped at 1000. So pagination had to be designed without knowing the number of
pages — detecting true exhaustion, handling edge cases, resetting cleanly to
page 1.

Most of the early "bugs" were pagination misunderstandings wearing a filtering
costume.

### IDs don't mean identity

650 stations in KV, but only 100–150 heat signatures rendering.

Eyeballing the raw KV showed the same physical stations appearing many times
with coordinates differing by 0.001° or less — multiple sources reporting the
same station, undeduplicated upstream. The heatmap wasn't sparse; it was
collapsed by duplicates.

Hence haversine dedup at write time. **Station IDs ≠ physical stations.**
Deduplication is on distance and time, not on IDs.

### The bug that deleted the database

After running a while, KV started slowly emptying itself. The log said something
impossible:

```
[DEDUP] 358448 replaced 358448 | d=0m
```

JavaScript object keys are always strings. `loc.id` from the API was a number;
the KV keys were strings. The self-skip condition failed silently, so entries
were comparing against themselves — and deleting themselves.

```js
if (otherId === String(loc.id)) continue;
```

One line. It had been quietly invalidating the entire system.

---

## What I took from it

- APIs lie by omission
- Raw data inspection beats docs when the docs lag reality
- IDs don't mean identity
- Deduplication without information dominance doesn't converge
- Data engineering is less about clever code and more about defensive thinking

---

## Design note: sequential multi-source ingestion (not implemented)

This ingests from a single provider. The logic was shaped to support more
sources without compromising correctness.

Write-time dedup already guarantees convergence — if several sources report the
same location, KV stabilises on one record regardless of origin. So more volume
isn't a correctness or storage problem. The real constraint is the execution
environment: Cloudflare Worker subrequest caps and runtime limits.

The model that fits those constraints is **sequential exhaustion** — ingest one
source at a time, fully exhaust it with its own cursor, move to the next, and
keep a lightweight source-level cursor that resets once all sources are done.
Slower, but predictable, and it works with the platform rather than against it.

**Deliberately not implemented.** The project didn't need it. Understanding
where the bottleneck actually lived was the result; writing the code would have
been performative.

---

## Repository

```
aqi-data-fetch/          Cloudflare Worker — ingestion, dedup, KV
  src/index.js           the pipeline
  test/                  vitest
  wrangler.jsonc         Worker config
docs/                    static frontend (map)
```

---

## Provenance

Written by hand. I read docs and asked AI questions throughout — this was my
first time dealing with APIs, cron jobs, pagination, serverless backends and
messy real-world data. Nothing here is pasted.
