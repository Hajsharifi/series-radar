"""Movie lists, discovery and multi-search."""

import concurrent.futures
import datetime as dt
import re

from .cache import cache_get, cache_put
from .config import OMDB_API_KEY, TMDB, TMDB_TOKEN, today_tehran
from .http import fetch_json, localized_collection, tmdb_get
from .omdb import omdb_fetch
from .text import fuzzy_score, normalize_fa, normalize_title, translate_fa_to_en
from .tmdb import (
    enrich_tmdb_details,
    movie_detail,
    norm_movie,
    norm_tv_show,
    pick_release_dates,
    tmdb_search,
)

SEARCH_DATES_TTL = 7 * 86400
SEARCH_DATES_FAIL_TTL = 6 * 3600


def is_archived_movie(movie, today=None):
    """A movie is archived when quality is already available, or the theatrical
    release is older than 90 days with no known digital date. The app is a
    reminder tool, not a movie journal, so archived movies are hidden everywhere
    except direct search/detail links.
    """
    today = today or today_tehran()
    today_iso = today.isoformat()
    digital = movie.get("digitalDate") or movie.get("onlineDate")
    theatrical = movie.get("theatricalDate") or movie.get("releaseDate")
    if digital and digital <= today_iso:
        return True
    if not digital and theatrical and theatrical <= (today - dt.timedelta(days=90)).isoformat():
        return True
    return False


def drop_archived(movies):
    return [movie for movie in movies if not is_archived_movie(movie)]


def enrich_with_omdb(movies):
    """Enrich a list of movies with TMDB release dates and OMDB ratings."""
    enrich_tmdb_details(movies)
    if not OMDB_API_KEY:
        return movies
    for movie in movies:
        imdb_id = movie.get("imdbId")
        if imdb_id:
            movie.update(omdb_fetch(imdb_id))
    return movies


def slim_search_dates(source):
    """Compact dates from an already-cached detail/list payload (no network)."""
    if "theatricalDate" in source or "digitalDate" in source:
        dates = {
            "theatricalDate": source.get("theatricalDate"),
            "digitalDate": source.get("digitalDate"),
            "physicalDate": source.get("physicalDate"),
            "certification": source.get("certification"),
        }
    else:
        dates = pick_release_dates(source)
    dates["imdbId"] = source.get("imdbId") or (source.get("external_ids") or {}).get("imdb_id")
    return dates


def build_search_dates_index():
    """Index dates from cached movie lists, built once per search request."""
    index = {}
    for key in ("quality_us", "upcoming_us", "now_playing_us", "online_us"):
        payload = cache_get(key, SEARCH_DATES_TTL)
        for movie in (payload or {}).get("items") or []:
            if movie.get("id") and movie["id"] not in index:
                index[movie["id"]] = slim_search_dates(movie)
    return index


def enrich_search_dates(movies):
    """Add release dates to raw TMDB search results so the client can label a
    movie's lifecycle correctly (quality vs released vs upcoming).

    Fast path: reuse dates cached from detail pages / movie lists. Only the
    remaining films trigger a TMDB detail call (parallel, cached for a week),
    so a brand-new search is usually much quicker than one call per result.
    """
    interesting = [m for m in movies if m.get("id") and m.get("mediaType") == "movie"]
    if not interesting:
        return movies
    local_index = build_search_dates_index()

    def enrich(movie):
        key = "search_dates_slim_%s" % movie["id"]
        dates = cache_get(key, SEARCH_DATES_TTL)
        if dates and dates.get("failed") and time.time() - dates.get("failedAt", 0) > SEARCH_DATES_FAIL_TTL:
            dates = None
        if not dates:
            dates = local_index.get(movie["id"])
        if not dates:
            cached_detail = cache_get("movie_detail_%s" % movie["id"], SEARCH_DATES_TTL)
            if cached_detail:
                dates = slim_search_dates(cached_detail)
        if not dates:
            try:
                detail = tmdb_get(
                    "/movie/%s" % movie["id"],
                    {"append_to_response": "release_dates,external_ids", "language": "en-US"},
                    cache_ttl=SEARCH_DATES_TTL,
                    cache_key_extra="search_dates_%s" % movie["id"],
                )
                dates = slim_search_dates(detail)
            except Exception:
                dates = {"failed": True, "failedAt": time.time()}
            cache_put(key, dates)
        for field in ("theatricalDate", "digitalDate", "physicalDate", "certification"):
            if dates.get(field) is not None:
                movie[field] = dates[field]
        if dates.get("imdbId"):
            movie["imdbId"] = movie.get("imdbId") or dates["imdbId"]
        return movie

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(enrich, interesting))
    return movies


def popular_title_index():
    """Small cached index of popular titles, used for did-you-mean suggestions."""
    cached = cache_get("search_popular_index", 24 * 3600)
    if cached:
        return cached
    tasks = [
        ("movie", "/movie/popular"),
        ("tv", "/tv/popular"),
        ("movie", "/movie/top_rated"),
        ("tv", "/tv/top_rated"),
        ("all", "/trending/all/week"),
    ]
    entries = []
    seen = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(tmdb_get, path, {"language": "en-US", "page": 1}, 3600)
                   for _, path in tasks]
        for (kind, _), future in zip(tasks, futures):
            try:
                results = future.result().get("results") or []
            except Exception:
                continue
            for item in results[:20]:
                title = item.get("title") or item.get("name")
                if not title:
                    continue
                item_kind = kind if kind != "all" else (
                    "tv" if item.get("name") and not item.get("title") else "movie")
                key = (item_kind, item.get("id"))
                if key in seen:
                    continue
                seen.add(key)
                entries.append({
                    "id": item.get("id"),
                    "kind": item_kind,
                    "title": title,
                    "originalTitle": item.get("original_title") or item.get("original_name") or title,
                })
    cache_put("search_popular_index", entries)
    return entries


def search_multi(text, media_type="all"):
    """Persian-aware unified search with typo tolerance and did-you-mean."""
    text = (text or "").strip()
    if len(text) < 2:
        return {"items": [], "suggestion": None, "queries": []}
    media_type = media_type if media_type in ("movie", "tv", "all") else "all"
    key = "multi_" + normalize_fa(text) + "_" + media_type
    cached = cache_get(key, 3600)
    if cached is not None:
        return cached

    queries = [text]
    if re.search(r"[\u0600-\u06ff]", text):
        english = translate_fa_to_en(text)
        if english and normalize_fa(english) != normalize_fa(text):
            queries.append(english)

    kinds = ["movie", "tv"] if media_type == "all" else [media_type]
    found = []
    for kind in kinds:
        for q in queries:
            try:
                data = localized_collection(
                    "/search/%s" % kind,
                    {"query": q, "include_adult": "false", "page": 1},
                    cache_ttl=3600,
                    cache_key_extra="search_%s_%s" % (kind, normalize_fa(q)),
                )
                for item in (data.get("results") or [])[:15]:
                    found.append((kind, item))
            except Exception:
                pass

    seen = set()
    items = []
    for kind, item in found:
        identity = (kind, item.get("id"))
        if identity in seen or not item.get("id"):
            continue
        seen.add(identity)
        normalized = norm_movie(item) if kind == "movie" else norm_tv_show(item)
        score = fuzzy_score(
            text,
            item.get("title"), item.get("name"),
            item.get("original_title"), item.get("original_name"),
            normalized.get("title"), normalized.get("originalTitle"),
        )
        if score < 0.42:
            continue
        normalized["matchScore"] = score
        items.append(normalized)
    items.sort(key=lambda x: (-x.get("matchScore", 0), -(x.get("votes") or 0)))
    items = enrich_search_dates(items[:30])

    suggestion = None
    if len(items) < 4:
        best, best_score = None, 0.0
        for entry in popular_title_index():
            score = fuzzy_score(text, entry.get("title"), entry.get("originalTitle"))
            if score > best_score:
                best, best_score = entry, score
        if best and best_score >= 0.55:
            suggestion = {"text": best.get("title"), "type": best.get("kind")}

    payload = {"items": items, "suggestion": suggestion, "queries": queries}
    cache_put(key, payload)
    return payload


def now_playing(force=False):
    cached = None if force else cache_get("now_playing_us", 900)
    if cached is not None:
        return cached
    today = today_tehran()
    # Movies in theaters now: keep a 45-day window after theatrical release.
    # Future releases belong to the `upcoming` tab, so `max_release` is today.
    min_release = (today - dt.timedelta(days=45)).isoformat()
    max_release = today.isoformat()
    movies = []
    seen = set()
    for page in (1, 2, 3, 4):
        data = localized_collection("/movie/now_playing", {"region": "US", "page": page}, cache_ttl=900, cache_key_extra="nowplaying_p%s" % page)
        for movie in data.get("results") or []:
            if movie.get("id") in seen:
                continue
            rel = (movie.get("release_date") or "")[:10]
            # Require a recent theatrical date; drop undated or very old re-releases.
            if not rel or rel < min_release or rel > max_release:
                continue
            seen.add(movie.get("id"))
            movies.append(norm_movie(movie))
    movies = enrich_with_omdb(movies)
    # Re-check after enrichment: TMDB's primary release_date can differ from the
    # actual US theatrical date returned by release_dates.
    today_iso = today.isoformat()
    movies = [
        movie for movie in movies
        if (movie.get("theatricalDate") or movie.get("releaseDate") or "") <= today_iso
    ]
    movies = drop_archived(movies)
    payload = {"updatedAt": dt.datetime.utcnow().isoformat() + "Z", "source": "TMDB", "items": movies}
    cache_put("now_playing_us", payload)
    return payload


def upcoming(force=False):
    cached = None if force else cache_get("upcoming_us", 1800)
    if cached is not None:
        return cached
    today = today_tehran().isoformat()
    movies = []
    seen = set()
    for page in (1, 2, 3, 4):
        data = localized_collection("/movie/upcoming", {"region": "US", "page": page}, cache_ttl=1800, cache_key_extra="upcoming_p%s" % page)
        for movie in data.get("results") or []:
            if movie.get("id") in seen:
                continue
            rel = (movie.get("release_date") or "")[:10]
            # Strictly future: a film released today is no longer "upcoming".
            if not rel or rel <= today:
                continue
            seen.add(movie.get("id"))
            movies.append(norm_movie(movie))
    movies = enrich_with_omdb(movies)
    # Re-check after enrichment (primary release_date may not be the theatrical date).
    movies = [
        movie for movie in movies
        if (movie.get("theatricalDate") or movie.get("releaseDate") or "") > today
    ]
    movies = drop_archived(movies)
    payload = {"updatedAt": dt.datetime.utcnow().isoformat() + "Z", "source": "TMDB", "items": movies}
    cache_put("upcoming_us", payload)
    return payload


def online_releases(force=False):
    """Movies waiting for digital/physical release (future dates only).
    This tab is for tracking upcoming home releases - not for browsing already-available movies.
    """
    cached = None if force else cache_get("online_us", 1800)
    if cached is not None:
        return cached
    today = today_tehran()
    today_iso = today.isoformat()
    # Look for movies with future digital/physical releases
    # Search recent + upcoming theatrical releases (they'll get digital/physical later)
    low = (today - dt.timedelta(days=180)).isoformat()  # 6 months back for recent theatrical
    high = (today + dt.timedelta(days=365)).isoformat()  # 1 year forward
    candidates = []
    seen = set()
    for page in (1, 2, 3, 4, 5):
        data = tmdb_get(
            "/discover/movie",
            {
                "with_release_type": "2|3",  # theatrical releases (types 2,3)
                "release_date.gte": low,
                "release_date.lte": high,
                "region": "US",
                "sort_by": "popularity.desc",
                "language": "en-US",
                "include_adult": "false",
                "page": page,
                "vote_count.gte": 10,
            },
            cache_ttl=1800,
        )
        for movie in data.get("results") or []:
            if movie.get("id") not in seen:
                seen.add(movie.get("id"))
                candidates.append(movie)

    def enrich(movie):
        try:
            detail = movie_detail(movie["id"])
            # Digital only - no physical/Blu-ray.
            digital = detail.get("digitalDate")
            if not digital or digital <= today_iso:
                return None
            detail["releaseKind"] = "digital"
            detail["onlineDate"] = digital
            detail["availableNow"] = False  # Always future for this tab
            return detail
        except Exception:
            return None

    items = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for detail in pool.map(enrich, candidates[:120]):
            if detail:
                items.append(detail)
    # Sort by nearest upcoming release date
    items.sort(key=lambda item: item.get("onlineDate") or "9999")
    payload = {"updatedAt": dt.datetime.utcnow().isoformat() + "Z", "source": "TMDB", "items": items}
    cache_put("online_us", payload)
    return payload


def quality_waiting(force=False):
    """Films that have been released theatrically but are still waiting for a
    good digital release. Replaces the old cinema + hidden online split.
    """
    cached = None if force else cache_get("quality_us", 1800)
    if cached is not None:
        return cached
    today = today_tehran()
    today_iso = today.isoformat()
    archive_from = (today - dt.timedelta(days=90)).isoformat()

    candidates = {}

    # Recent theatrical releases (already enriched with dates and ratings).
    for movie in now_playing(force).get("items") or []:
        candidates[movie["id"]] = movie

    # Films with a known future digital date (searched up to 180 days back).
    merge_keys = (
        "digitalDate", "onlineDate", "theatricalDate", "certification", "imdbId",
        "releaseKind", "imdbRating", "rottenTomatoesRating", "metacriticRating",
    )
    for movie in online_releases(force).get("items") or []:
        current = candidates.get(movie["id"])
        if current:
            for key in merge_keys:
                if movie.get(key):
                    current[key] = movie[key]
        else:
            candidates[movie["id"]] = movie

    # Theatrical releases aged 45-90 days that have no known digital date.
    low = (today - dt.timedelta(days=90)).isoformat()
    for page in (1, 2, 3):
        data = tmdb_get(
            "/discover/movie",
            {
                "with_release_type": "2|3",
                "release_date.gte": low,
                "release_date.lte": archive_from,
                "region": "US",
                "sort_by": "popularity.desc",
                "language": "en-US",
                "include_adult": "false",
                "page": page,
                "vote_count.gte": 10,
            },
            cache_ttl=1800,
            cache_key_extra="quality_p%s" % page,
        )
        for movie in data.get("results") or []:
            if movie.get("id") not in candidates:
                candidates[movie["id"]] = norm_movie(movie)

    def enrich(movie):
        if "digitalDate" in movie and movie.get("imdbId"):
            return movie
        try:
            detail = fetch_json(
                "%s/movie/%s?append_to_response=release_dates,external_ids&language=en-US" % (TMDB, movie["id"]),
                headers={"Authorization": "Bearer " + TMDB_TOKEN, "Accept": "application/json"},
                timeout=20,
            )
            movie.update(pick_release_dates(detail))
            movie["imdbId"] = movie.get("imdbId") or (detail.get("external_ids") or {}).get("imdb_id")
        except Exception:
            pass
        return movie

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        enriched = list(pool.map(enrich, list(candidates.values())))

    items = []
    for movie in enriched:
        theatrical = movie.get("theatricalDate") or movie.get("releaseDate")
        digital = movie.get("digitalDate")
        if not theatrical or theatrical > today_iso:
            continue
        if digital and digital <= today_iso:
            continue
        if not digital and theatrical <= archive_from:
            continue
        if digital:
            movie["onlineDate"] = digital
            movie["releaseKind"] = "digital"
        else:
            movie["onlineDate"] = None
            movie.pop("releaseKind", None)
        movie["availableNow"] = False
        items.append(movie)

    with_date = sorted((m for m in items if m.get("onlineDate")), key=lambda m: m["onlineDate"])
    no_date = sorted((m for m in items if not m.get("onlineDate")), key=lambda m: m.get("theatricalDate") or "", reverse=True)
    items = with_date + no_date

    payload = {"updatedAt": dt.datetime.utcnow().isoformat() + "Z", "source": "TMDB", "items": items}
    cache_put("quality_us", payload)
    return payload
