# Radar Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make «سریالهای زیر رادار» show the full current TMDB slate by adding an `/api/tv/upcoming` feed and relaxing the Radar's default filters, without changing favorite identity or calendar/reminder behavior.

**Architecture:** A cached, pure server helper fetches two TMDB `/discover/tv` queries (future episode air dates and future first-air dates), normalizes and merges them, and exposes them through a new list endpoint. The web schedule adds this feed to its existing `Promise.allSettled` fan-in and dedupes by `tmdb:<id>`; Radar preference defaults move to a small pure helper with versioned sessionStorage keys so returning users get the new defaults.

**Tech Stack:** Python 3 stdlib HTTP server; React 19.3.1 / TypeScript 7 / Vite 8.3.6; Vitest 2.1.9; pytest.

**Spec:** `docs/superpowers/specs/2026-11-21-radar-coverage-design.md`

## Global Constraints

- TMDB is the only series source; identity stays `tmdb:<id>` everywhere.
- Do not reintroduce TVMaze as a Radar source; do not change favorite storage, reminders, calendar filtering, download parsing, or movie behavior.
- Defaults after this change: `hideUnscripted = true`, `language = "all"`, `country = "all"`, `onlyPopular = false`, sort `date`, view `grid`.
- Persian/RTL copy and `prefers-reduced-motion` behavior stay intact; no new UI component is added.
- Official TMDB `/discover/tv` parameters used here: `air_date.gte`, `air_date.lte`, `first_air_date.gte`, `first_air_date.lte`, `sort_by=popularity.desc`, `page` (https://developer.themoviedb.org/reference/discover-tv).
- Test commands: web `npm test` / `npm run build` in `web/`; server `python3 -m pytest tests -q` in `server/`.

## Review Focus

- **An announced show absent from the four standard lists** (Blade Runner 2099, id `171802`) must appear → Task 1 test asserts the helper's merged results contain id `171802` from a mocked discover response.
- **The same show returned by two feeds** must produce one card → Task 1 test asserts dedupe by `id`; Task 2 test asserts `fetchTVSchedule()` keeps only one `tmdb:171802`.
- **One or both discover queries failing** must not blank Radar → Task 1 test asserts results from the surviving query and an empty list when both fail.
- **Returning users with old `sessionStorage` filter values** must get the new defaults → Task 3 test asserts default state and versioned keys; live verification checks the stored keys.
- **Filter badge showing a permanent count of 2** must not happen → Task 3 test asserts `countNonDefaultFilters(defaults) === 0`.

---

### Task 1: Upcoming TV server helper and endpoint

**Files:**
- Modify: `server/series_radar/tmdb.py`
- Modify: `server/series_radar/handler.py`
- Test: `server/tests/test_server.py`

**Interfaces:**
- Consumes: existing `localized_collection(path, base_params, cache_ttl, cache_key_extra, max_pages)` from `.http`, `norm_tv_show`, `enrich_tv_meta`, `cache_get(key, ttl)`, `cache_put(key, data)`, `today_tehran()` from `.config`.
- Produces: `fetch_upcoming_tv(today: dt.date | None = None, max_pages: int = 2) -> list[dict]` in `series_radar.tmdb`; `GET /api/tv/upcoming` returns `{"results": [...]}` with the same show shape as other TV list endpoints.

- [ ] **Step 1: Write failing tests in `server/tests/test_server.py`**

Add three tests that import `fetch_upcoming_tv` from `series_radar.tmdb` and monkeypatch `series_radar.tmdb.localized_collection` and `series_radar.tmdb.enrich_tv_meta` (identity function). In every test, also monkeypatch `series_radar.tmdb.cache_get` to return `None` and `series_radar.tmdb.cache_put` to a no-op so the shared disk cache cannot leak results between tests:
  - `test_upcoming_tv_merges_both_discover_queries_and_dedupes`: mock `localized_collection` to return `{"results": [...]}` containing `{"id": 171802, "name": "Blade Runner 2099", "first_air_date": "2026-11-25"}` from the `air_date.gte` query and the same id plus `{"id": 42, ...}` from the `first_air_date.gte` query. Call `fetch_upcoming_tv(today=dt.date(2026, 11, 21))`. Assert ids `[171802, 42]`, that the two query parameter sets contain `air_date.gte == "2026-11-21"` / `air_date.lte == "2027-02-19"` and `first_air_date.gte == "2026-11-21"` / `first_air_date.lte == "2027-05-20"`, and `sort_by == "popularity.desc"` on both.
  - `test_upcoming_tv_survives_one_failed_query`: make the first query raise `RuntimeError`, second returns one show; assert one result with that id. Then make both raise and assert `[]`.
  - `test_upcoming_tv_caps_at_80`: make one query return 100 unique ids; assert `len(result) == 80`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && python3 -m pytest tests/test_server.py -k upcoming -q`
Expected: FAIL with `ImportError: cannot import name 'fetch_upcoming_tv'`.

- [ ] **Step 3: Implement the helper and route**

In `tmdb.py`: import `today_tehran` from `.config`; add `fetch_upcoming_tv(today=None, max_pages=2)` with signature above. Use `cache_get("upcoming_tv_v1_%s_%d" % (day.isoformat(), max_pages), 3600)` first. Build the two base parameter dicts with the exact dates from Step 1, call `localized_collection("/discover/tv", params, cache_ttl=1800, cache_key_extra="upcoming_air" / "upcoming_first", max_pages=max_pages)` inside independent `try/except Exception` blocks, normalize each result with `norm_tv_show`, de-duplicate by `id` preserving first occurrence, cap at 80, then call `enrich_tv_meta(shows, include_omdb=False)`; cache and return the list only when at least one query succeeded.

In `handler.py`: import `fetch_upcoming_tv` from `.tmdb` and add, immediately before the generic `/api/tv/<id>` route:

```python
if path == "/api/tv/upcoming":
    return self.send_json({"results": fetch_upcoming_tv()})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && python3 -m pytest tests/test_server.py -k upcoming -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full server suite**

Run: `cd server && python3 -m pytest tests -q`
Expected: PASS (existing 21 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add server/series_radar/tmdb.py server/series_radar/handler.py server/tests/test_server.py
git commit -m "feat(api): add cached upcoming TV discover feed"
```

### Task 2: Web schedule consumes the new feed

**Files:**
- Modify: `web/src/lib/tmdb-tv.ts`
- Test: `web/src/lib/__tests__/tmdb-tv.test.ts` (new)

**Interfaces:**
- Consumes: `cachedFetchJson<T>(url, timeoutMs)`, `MOVIE_API`, `toScheduleShow` (all already in `tmdb-tv.ts`).
- Produces: `fetchUpcomingTV(): Promise<Show[]>`; `fetchTVSchedule()` now includes it and still returns de-duplicated shows sorted by `airstamp`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/__tests__/tmdb-tv.test.ts` with a `MemoryStorage` localStorage mock, `window` as an `EventTarget`, and `vi.stubGlobal("fetch", vi.fn((url: string) => ...))` that returns `{"results": [...]}` per URL:
  - `/api/tv/on_the_air`, `/api/tv/airing_today`, `/api/tv/popular`, `/api/tv/top_rated` → one show each with ids 1, 2, 3, 4.
  - `/api/tv/upcoming` → shows with ids `171802` (title `Blade Runner 2099`, `firstAirDate: "2026-12-01"`) and `3` (duplicate of the popular item).
  - Each item must include `source: "tmdb"`, `id`, `title`, `firstAirDate` so `toScheduleShow` creates an airstamp.
  - Test `fetchTVSchedule()` returns ids including `171802`, contains exactly one `tmdb:3`, and that `fetch` was called with a URL ending in `/api/tv/upcoming`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/__tests__/tmdb-tv.test.ts`
Expected: FAIL because no `/api/tv/upcoming` request is made.

- [ ] **Step 3: Implement the feed wiring**

In `web/src/lib/tmdb-tv.ts`: bump `TMDB_TV_CACHE` from `sr:tmdbtv:v3` to `sr:tmdbtv:v4`; add `export async function fetchUpcomingTV(): Promise<Show[]> { return fetchWithCache("/api/tv/upcoming"); }`; add `fetchUpcomingTV()` as the fifth entry in the `Promise.allSettled` array inside `fetchTVSchedule()`. Keep the existing de-dup and sort code unchanged.

- [ ] **Step 4: Run the test and full web suite**

Run: `cd web && npx vitest run src/lib/__tests__/tmdb-tv.test.ts && npm test`
Expected: PASS (new test + all 31 existing tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/tmdb-tv.ts web/src/lib/__tests__/tmdb-tv.test.ts
git commit -m "feat(web): include upcoming TV feed in radar schedule"
```

### Task 3: Radar default filters and non-default badge

**Files:**
- Create: `web/src/lib/radar-filters.ts`
- Modify: `web/src/pages/RadarPage.tsx`
- Test: `web/src/lib/__tests__/radar-filters.test.ts` (new)

**Interfaces:**
- Consumes: `readUiState`/`writeUiState(key, value)` from `../lib/ui-state`, existing `ShowFilters` type from `../hooks/useSchedule`.
- Produces: `RADAR_DEFAULTS` with `{ category: "all", onlyPopular: false, hideUnscripted: true, language: "all", country: "all", genre: null }`; `countNonDefaultFilters(state: RadarFilterState): number` where `RadarFilterState` is those six fields.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/__tests__/radar-filters.test.ts` asserting:
  - `countNonDefaultFilters({ ...RADAR_DEFAULTS }) === 0`
  - `countNonDefaultFilters({ ...RADAR_DEFAULTS, language: "en", country: "US", onlyPopular: true }) === 3`
  - `countNonDefaultFilters({ ...RADAR_DEFAULTS, hideUnscripted: false }) === 1`

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/__tests__/radar-filters.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `radar-filters.ts`**

Export `RADAR_DEFAULTS` and `RadarFilterState` as specified; `countNonDefaultFilters` returns the number of fields whose value differs from `RADAR_DEFAULTS`.

- [ ] **Step 4: Wire `RadarPage.tsx`**

Replace hard-coded initial values with `RADAR_DEFAULTS`: `readUiState("radar.category.v2", RADAR_DEFAULTS.category)`, `readUiState("radar.onlyPopular.v2", ...)`, `readUiState("radar.language.v2", ...)`, `readUiState("radar.country.v2", ...)`; keep existing keys for `radar.genre`, `radar.view`, `radar.hideUnscripted`, `radar.sortBy`; update the corresponding `writeUiState` effects and `clearFilters()` to write the v2 keys and defaults. Replace the `activeFilterCount` expression and `hasFilters` with `countNonDefaultFilters({ category: filters.category, onlyPopular: filters.onlyPopular, genre, hideUnscripted, language, country })`; leave `hasNarrowingFilters` unchanged.

- [ ] **Step 5: Run tests and build**

Run: `cd web && npm test && npm run build`
Expected: PASS (all tests, build exits 0).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/radar-filters.ts web/src/lib/__tests__/radar-filters.test.ts web/src/pages/RadarPage.tsx
git commit -m "feat(radar): open default filters and count only non-default ones"
```

### Task 4: Verify, release, and document

**Files:**
- Modify: `CHANGELOG.md`
- Version files via `scripts/version-bump.py`

**Interfaces:**
- Consumes: Tasks 1–3 on `master`, GitHub workflows `deploy-api.yml` and `release.yml`.

- [ ] **Step 1: Full local verification**

Run: `cd web && npm test && npm run build`
Run: `cd server && python3 -m pytest tests -q`
Expected: all green.

- [ ] **Step 2: Verify the new live endpoint after API deploy**

Push the branch (workflow `deploy-api.yml` deploys on `server/**` changes), then run:

```bash
env -u CURL_CA_BUNDLE -u SSL_CERT_FILE -u REQUESTS_CA_BUNDLE curl -ks \
  --max-time 30 'https://radar.hajsharifi.online:8443/api/tv/upcoming' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d["results"]; print(len(r), any(x.get("id")==171802 for x in r))'
```

Expected: count > 0 and `True` for the Blade Runner 2099 id.

- [ ] **Step 3: Bump, tag, and release**

Add a `v1.16.0` section to `CHANGELOG.md` describing the wider Radar coverage and relaxed defaults; then run:

```bash
python3 scripts/version-bump.py patch
git push origin master --tags
gh run list --workflow release.yml --limit 3
gh run watch <run-id> --exit-status --interval 10
```

Expected: a `v1.15.9` → `v1.16.0` patch bump (versionCode 48), release workflow concludes `success`, signed APK published.

- [ ] **Step 4: Verify published artifacts**

Run: `gh release view v1.16.0 --json tagName,assets`
Run: `env -u CURL_CA_BUNDLE -u SSL_CERT_FILE -u REQUESTS_CA_BUNDLE curl -kIs --max-time 20 https://radar.hajsharifi.online:8443/apk/series-radar.apk | head -4`
Run: `env -u CURL_CA_BUNDLE -u SSL_CERT_FILE -u REQUESTS_CA_BUNDLE curl -sI --max-time 20 http://31.56.229.237:8080/series-radar.apk | head -4`
Expected: release asset present; both URLs return `HTTP 200`.

- [ ] **Step 5: Commit changelog if not already included in the version bump commit**

```bash
git status --short
git add CHANGELOG.md && git commit -m "docs: note v1.16.0 radar coverage changes"  # only if needed
git push origin master  # only if a new commit was created
```
