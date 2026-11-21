# Radar coverage: more series under the radar (v1.16.0 design)

## Intent

The Radar list «سریالهای زیر رادار» is much shorter than it should be, and known
upcoming shows (example given by the user: **Blade Runner 2099**, TMDB id
`171802`, first air date `2026-11-25`) never appear. The user chose **both**
approach 1 (relax the default filters) and approach 2 (expand the TMDB feed).
TMDB remains the only series source and identity stays `tmdb:<id>`.

## Measured current state (live API, 2026-11-21)

- Four TMDB lists (`popular`, `top_rated`, `on_the_air`, `airing_today`) union to
  **131** unique shows.
- **68** have a future `nextEpisode.airdate` (the only entries that pass the
  `airstamp >= now - 6h` filter).
- Default UI filters shrink 68 → 43 (hide unscripted) → 23 (language `en`) →
  **17** (country `US`).
- `Blade Runner 2099` is present in TMDB search with a future episode and
  `popularity` 14.1, but is in none of those four lists.

Root causes are therefore two separate ones: (a) defaults are too narrow, and
(b) there is no TMDB "upcoming" feed in `/api/tv/*`.

## Goals

- The default Radar shows all currently relevant dated shows, not just 17.
- Shows with a future first-air date or next-episode date that are absent from
  the four standard lists appear in Radar (Blade Runner 2099 is the acceptance
  example).
- No change to favorite identity, storage, reminders, calendar, downloads, or
  the Persian/RTL UI beyond the filter defaults and a small hint when filters
  are active.
- No new external series source; no TVMaze schedule reintroduction.

## Non-goals / anti-goals

- Not reintroducing TVMaze as a Radar source (would break `tmdb:<id>` identity
  and require re-migration of favorites).
- Not changing sorting/ranking algorithms, download parsing, or the movies tab.
- Not showing undated shows with no air date at all.

## Constraints

- Stack: React 19.3.1 / Vite 8.3.6 / TypeScript 7 (web/package.json), Python
  stdlib HTTP server (server/series_radar), Vitest 2.1.9, pytest.
- UI preferences are persisted in `sessionStorage` through `readUiState`, so
  merely changing the default values would **not** affect returning users.
- TMDB official `/discover/tv` reference documents `air_date.gte`,
  `air_date.lte`, `first_air_date.gte`, `sort_by=popularity.desc`, `page`, and
  `with_status`: https://developer.themoviedb.org/reference/discover-tv

## Chosen design

### 1. API: new `/api/tv/upcoming`

- In `server/series_radar/handler.py`, handle `GET /api/tv/upcoming` before the
  generic `/api/tv/<id>` route.
- Use the existing `localized_collection("/discover/tv", ...)` helper with two
  cached queries, each 2 pages (40 results each before de-duplication):
  - `air_date.gte=<tehran today>`, `air_date.lte=<today + 90d>`,
    `sort_by=popularity.desc`, `include_adult=false`
  - `first_air_date.gte=<tehran today>`, `first_air_date.lte=<today + 180d>`,
    `sort_by=popularity.desc`, `include_adult=false`
- Feed results through `norm_tv_show` and `enrich_tv_meta(shows,
  include_omdb=False)`, de-duplicate by `id`, cap at 80 shows, cache the merged
  response (TTL 1h) using the existing `cache_get`/`cache_put` helpers. Keep the
  response shape `{"results": [...]}` identical to other TV list endpoints.
- Fail soft: if one discover query fails, still return the other; if both fail,
  return `{"results": []}` so a single upstream error cannot blank Radar.
- Tests in `server/tests/test_server.py` monkeypatch the collection/enrichment
  helpers, asserting: both queries are issued with expected date params,
  results are de-duplicated and capped, and a failure in one query still yields
  results from the other.

### 2. Web: include the new feed

- In `web/src/lib/tmdb-tv.ts` add `fetchUpcomingTV()` calling
  `/api/tv/upcoming` through the existing cached fetch path, and add it to the
  `Promise.allSettled` list in `fetchTVSchedule()`. De-duplication is already by
  `source:id`, so overlap with the other lists is harmless.
- The 24h localStorage fallback cache for `popular` must be refreshed when the
  new feed is added (bump `TMDB_TV_CACHE` to `v4`) so returning users do not keep
  a stale 20-item snapshot.

### 3. Web: relax defaults with a one-time migration

- Change Radar defaults to `language: "all"`, `country: "all"`,
  `onlyPopular: false`. Keep `hideUnscripted: true`, sort `date`, view `grid`.
- Because `sessionStorage` holds the old values, bump only the three affected
  preference keys to a versioned form (`radar.language.v2`,
  `radar.country.v2`, `radar.onlyPopular.v2`) in `RadarPage.tsx`; `clearFilters`
  writes the new defaults. `radar.category`, `radar.genre`, `radar.view`,
  `radar.hideUnscripted`, `radar.sortBy` keep their existing keys.
- Update `web/src/lib/__tests__/` with a small pure test for the effective
  default filter set if a suitable module exists; otherwise rely on the
  existing `filterShows` tests plus manual verification against the live API.
- Expected visible counts with live data: 131 unique shows in the cache,
  68 with future dates before scripted filtering, 43 after hide-unscripted
  (the prior 17 with en/US defaults).

### 4. Verification and release

- Run `npm test`, `npm run build`, and `python3 -m pytest server/tests -q`.
- Deploy API through `deploy-api.yml` (server/** change).
- Bump patch version, commit/tag, push, let `release.yml` build and publish the
  APK with the existing signing key.
- Verify live: `GET /api/tv/upcoming` returns Blade Runner 2099; Radar section
  header shows a substantially larger count; HTTPS and legacy HTTP APK URLs
  return 200.

## Open choices left to the builder

- Exact cache TTLs and page counts are defaults above; adjust only if live
  latency or TMDB rate limits require it, and keep them documented here.
- Whether to expose the new feed in the Calendar is out of scope for this
  release; Radar and the schedule cache are the only consumers.
