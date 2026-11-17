#!/usr/bin/env python3
"""Small cached data service for Series Radar (TMDB + Box Office Mojo)."""

import concurrent.futures
import datetime as dt
import difflib
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("SERIES_RADAR_PORT", "8090"))
BASE_DIR = os.environ.get("SERIES_RADAR_HOME", "/opt/series-radar-api")
CACHE_DIR = os.environ.get("SERIES_RADAR_CACHE", os.path.join(BASE_DIR, "cache"))
TEHRAN_TZ = dt.timezone(dt.timedelta(hours=3, minutes=30))
TOKEN_FILE = os.environ.get("TMDB_TOKEN_FILE", os.path.join(BASE_DIR, "token"))
TMDB = "https://api.themoviedb.org/3"
BOM = "https://www.boxofficemojo.com"
OMDB = "http://www.omdbapi.com"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

os.makedirs(CACHE_DIR, exist_ok=True)

def today_tehran():
    """Current date in Asia/Tehran (Iran has no DST since 2022)."""
    return dt.datetime.now(TEHRAN_TZ).date()


def load_tmdb_token():
    """Prefer the environment (CI/dev), then the deployed token file."""
    token = os.environ.get("TMDB_BEARER_TOKEN", "").strip()
    if token:
        return token
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as token_file:
            return token_file.read().strip()
    except OSError:
        return ""

TMDB_TOKEN = load_tmdb_token()

TMDB_HEADERS = {"Authorization": "Bearer " + TMDB_TOKEN, "Accept": "application/json"}

# OMDB API key (set via environment variable OMDB_API_KEY)
OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "")

STARTED_AT = time.time()
REQUEST_COUNT = 0
ERROR_COUNT = 0
METRICS_LOCK = threading.Lock()

# Cache housekeeping: keep the service from growing forever.
CACHE_MAX_AGE = int(os.environ.get("SERIES_RADAR_CACHE_MAX_AGE", str(30 * 86400)))
LAST_PRUNE = 0.0


def cache_stats():
    files = 0
    size = 0
    try:
        for entry in os.scandir(CACHE_DIR):
            try:
                if entry.is_file() and entry.name.endswith(".json"):
                    files += 1
                    size += entry.stat().st_size
            except OSError:
                pass
    except OSError:
        pass
    return files, size


def prune_cache(force=False):
    """Delete stale cache files. Runs on startup and at most hourly."""
    global LAST_PRUNE
    now = time.time()
    if not force and now - LAST_PRUNE < 3600:
        return 0
    LAST_PRUNE = now
    removed = 0
    try:
        for name in os.listdir(CACHE_DIR):
            if not name.endswith(".json"):
                continue
            path = os.path.join(CACHE_DIR, name)
            try:
                if now - os.path.getmtime(path) > CACHE_MAX_AGE:
                    os.remove(path)
                    removed += 1
            except OSError:
                pass
    except OSError:
        pass
    return removed


# ---------------------------------------------------------------------------
# cache + http helpers
# ---------------------------------------------------------------------------

def cache_path(key):
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", key)
    return os.path.join(CACHE_DIR, safe + ".json")


def cache_get(key, ttl):
    try:
        with open(cache_path(key), "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if time.time() - payload.get("at", 0) <= ttl:
            return payload.get("data")
    except Exception:
        pass
    return None


def cache_put(key, data):
    path = cache_path(key)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump({"at": time.time(), "data": data}, handle, ensure_ascii=False)
    os.replace(temp, path)
    prune_cache()


def fetch_json(url, headers=None, timeout=35):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", "ignore"))


def fetch_text(url, timeout=35):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "ignore")


def tmdb_get(path, params=None, cache_ttl=1800, cache_key_extra=""):
    query = dict(params or {})
    key = "tmdb_" + path.strip("/").replace("/", "_") + "_" + cache_key_extra
    if not cache_key_extra:
        key += "_" + re.sub(r"[^a-zA-Z0-9_.-]", "_", urllib.parse.urlencode(sorted(query.items())))[:120]
    cached = cache_get(key, cache_ttl)
    if cached is not None:
        return cached
    url = TMDB + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = fetch_json(url, headers={"Authorization": "Bearer " + TMDB_TOKEN, "Accept": "application/json"})
    cache_put(key, data)
    return data


def strip_tags(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = value.replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    return re.sub(r"\s+", " ", value).strip()


def parse_money(value):
    if value is None:
        return None
    cleaned = value.replace("$", "").replace(",", "").strip()
    if cleaned in ("", "-", "--"):
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def normalize_title(value):
    value = (value or "").lower().replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_fa(value):
    """Normalize Persian/Arabic text so typos and Arabic script variants match."""
    text = (value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = (text.replace("ي", "ی").replace("ئ", "ی").replace("ك", "ک")
                .replace("ۀ", "ه").replace("ة", "ه").replace("ؤ", "و")
                .replace("ـ", "").replace("\u200c", "").replace("\u200d", ""))
    text = re.sub(r"[\u064b-\u065f\u0670]", "", text)
    text = re.sub(r"[^0-9a-z\u0600-\u06ff]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fuzzy_score(query, *candidates):
    """Similarity in 0..1 against one or more candidate titles."""
    q = normalize_fa(query)
    if not q:
        return 0.0
    q_compact = q.replace(" ", "")
    best = 0.0
    for candidate in candidates:
        n = normalize_fa(candidate)
        if not n:
            continue
        compact = n.replace(" ", "")
        if q == n or q_compact == compact:
            best = max(best, 1.0)
        elif n.startswith(q) or compact.startswith(q_compact):
            best = max(best, 0.9)
        elif q in n or q_compact in compact:
            best = max(best, 0.85)
        else:
            best = max(best, difflib.SequenceMatcher(None, q_compact, compact).ratio())
    return round(best, 3)


def translate_fa_to_en(text):
    """Persian -> English via cached googletrans. Never raises."""
    text = (text or "").strip()
    if not text:
        return ""
    key = "fa2en_" + text
    cached = cache_get(key, 30 * 86400)
    if cached:
        return cached
    try:
        from googletrans import Translator
        result = Translator().translate(text, src="fa", dest="en")
        translated = (result.text or "").strip()
    except Exception:
        translated = ""
    if translated:
        cache_put(key, translated)
    return translated


def localized_collection(path, base_params, cache_ttl=1800, cache_key_extra=""):
    """Fetch a TMDB list in fa-IR, filling missing text from en-US by id."""
    fa_params = dict(base_params)
    fa_params["language"] = "fa-IR"
    en_params = dict(base_params)
    en_params["language"] = "en-US"
    fa = tmdb_get(path, fa_params, cache_ttl, cache_key_extra="fa_" + cache_key_extra)
    en = {}
    try:
        en = tmdb_get(path, en_params, cache_ttl, cache_key_extra="en_" + cache_key_extra)
    except Exception:
        pass
    en_by_id = {item.get("id"): item for item in (en.get("results") or [])}
    merged = []
    for item in (fa.get("results") or []):
        fallback = en_by_id.get(item.get("id")) or {}
        if not (item.get("title") or item.get("name")):
            item["title"] = fallback.get("title") or fallback.get("name")
        if not (item.get("original_title") or item.get("original_name")):
            item["original_title"] = fallback.get("original_title") or fallback.get("original_name")
        if not item.get("overview"):
            item["overview"] = fallback.get("overview")
        merged.append(item)
    payload = dict(fa)
    payload["results"] = merged
    return payload


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


# ---------------------------------------------------------------------------
# Translation (Persian)
# ---------------------------------------------------------------------------

TRANSLATION_CACHE_DIR = os.path.join(BASE_DIR, "cache", "translation")
os.makedirs(TRANSLATION_CACHE_DIR, exist_ok=True)

_translation_cache = {}

def load_translation_cache():
    global _translation_cache
    cache_file = os.path.join(TRANSLATION_CACHE_DIR, "cache.json")
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            _translation_cache = json.load(f)
    except Exception:
        _translation_cache = {}

def save_translation_cache():
    cache_file = os.path.join(TRANSLATION_CACHE_DIR, "cache.json")
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(_translation_cache, f, ensure_ascii=False)
    except Exception:
        pass

def translate_to_persian(text):
    """Translate English text to Persian with caching."""
    if not text or not text.strip():
        return text
    text = text.strip()
    # Check cache
    if text in _translation_cache:
        return _translation_cache[text]
    # Translate using googletrans
    try:
        from googletrans import Translator
        translator = Translator()
        result = translator.translate(text, src='en', dest='fa')
        persian = result.text if result.text else text
    except Exception:
        persian = text
    # Cache and save
    _translation_cache[text] = persian
    save_translation_cache()
    return persian

def enrich_with_persian(items, text_field="overview"):
    """Add Persian translation for a text field in a list of items."""
    if not _translation_cache:
        load_translation_cache()
    for item in items:
        text = item.get(text_field)
        if text:
            item[text_field + "_fa"] = translate_to_persian(text)
    return items

# ---------------------------------------------------------------------------
# TMDB normalization
# ---------------------------------------------------------------------------

def image_path(value):
    return value or None


def norm_movie(movie):
    release_date = movie.get("release_date") or None
    return {
        "mediaType": "movie",
        "id": movie.get("id"),
        "title": movie.get("title") or movie.get("name"),
        "originalTitle": movie.get("original_title") or movie.get("original_name"),
        "overview": movie.get("overview") or "",
        "posterPath": image_path(movie.get("poster_path")),
        "backdropPath": image_path(movie.get("backdrop_path")),
        "releaseDate": release_date,
        "theatricalDate": release_date,
        "rating": round(float(movie.get("vote_average") or 0), 1),
        "votes": movie.get("vote_count") or 0,
        "popularity": movie.get("popularity") or 0,
        "language": movie.get("original_language"),
        "genreIds": movie.get("genre_ids") or [],
        "genres": [g.get("name") for g in (movie.get("genres") or []) if g.get("name")],
        "source": "tmdb",
    }

def norm_tv_show(show):
    next_ep = show.get("next_episode_to_air") or None
    return {
        "mediaType": "tv",
        "source": "tmdb",
        "id": show.get("id"),
        "title": show.get("name") or show.get("original_name") or "بدون عنوان",
        "originalTitle": show.get("original_name"),
        "overview": show.get("overview") or "",
        "posterPath": image_path(show.get("poster_path")),
        "backdropPath": image_path(show.get("backdrop_path")),
        "firstAirDate": show.get("first_air_date") or None,
        "rating": round(float(show.get("vote_average") or 0), 1),
        "votes": show.get("vote_count") or 0,
        "popularity": show.get("popularity") or 0,
        "language": show.get("original_language"),
        "genreIds": show.get("genre_ids") or [],
        "status": show.get("status"),
        "numberOfSeasons": show.get("number_of_seasons"),
        "numberOfEpisodes": show.get("number_of_episodes"),
        "lastAirDate": show.get("last_air_date") or None,
        "networks": show.get("networks") or [],
        "networkNames": [n.get("name") for n in (show.get("networks") or []) if n.get("name")],
        "genres": [g.get("name") for g in (show.get("genres") or []) if g.get("name")],
        "nextEpisode": ({
            "id": next_ep.get("id"),
            "season": next_ep.get("season_number"),
            "number": next_ep.get("episode_number"),
            "name": next_ep.get("name"),
            "airdate": next_ep.get("air_date"),
            "overview": next_ep.get("overview"),
        } if next_ep else None),
    }


def us_release_dates(detail):
    results = (detail.get("release_dates") or {}).get("results") or []
    for country in results:
        if country.get("iso_3166_1") == "US":
            return country.get("release_dates") or []
    return []


def pick_release_dates(detail):
    dates = us_release_dates(detail)
    theatrical = []
    digital = []
    physical = []
    certification = None
    for item in dates:
        raw = (item.get("release_date") or "")[:10]
        if not raw:
            continue
        kind = item.get("type")
        if kind in (2, 3):
            theatrical.append(raw)
            certification = certification or item.get("certification") or None
        elif kind == 4:
            digital.append(raw)
        elif kind == 5:
            physical.append(raw)
    theatrical.sort()
    digital.sort()
    physical.sort()
    first_theatrical = theatrical[0] if theatrical else None
    if first_theatrical:
        digital = [day for day in digital if day >= first_theatrical] or digital
        physical = [day for day in physical if day >= first_theatrical] or physical
    return {
        "theatricalDate": first_theatrical,
        "digitalDate": digital[0] if digital else None,
        "physicalDate": physical[0] if physical else None,
        "certification": certification,
    }


def omdb_fetch(imdb_id):
    """Fetch additional ratings from OMDB API."""
    if not OMDB_API_KEY or not imdb_id:
        return {}
    try:
        url = "%s/?apikey=%s&i=%s&plot=short&r=json" % (OMDB, OMDB_API_KEY, imdb_id)
        data = fetch_json(url, headers={"Accept": "application/json"})
        if data.get("Response") != "True":
            return {}
        ratings = data.get("Ratings") or []
        result = {}
        for r in ratings:
            source = r.get("Source")
            value = r.get("Value")
            if source == "Internet Movie Database":
                result["imdbRating"] = value  # e.g. "8.5/10"
            elif source == "Rotten Tomatoes":
                result["rottenTomatoesRating"] = value  # e.g. "92%"
            elif source == "Metacritic":
                result["metacriticRating"] = value  # e.g. "78/100"
        result["omdbAwards"] = data.get("Awards")
        result["omdbGenre"] = data.get("Genre")
        result["omdbDirector"] = data.get("Director")
        result["omdbActors"] = data.get("Actors")
        result["omdbPlot"] = data.get("Plot")
        return result
    except Exception:
        return {}

def enrich_tmdb_details(movies):
    """Fill release dates / imdb id from TMDB detail (needed for the archive rule)."""
    for movie in movies:
        if "digitalDate" in movie and movie.get("imdbId"):
            continue
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
    return movies


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

def tv_meta(show_id):
    """Cached TMDB detail used to complete TV list items."""
    return tmdb_get(
        "/tv/%s" % show_id,
        {"language": "en-US", "append_to_response": "external_ids"},
        cache_ttl=6 * 3600,
        cache_key_extra="listmeta",
    )


def enrich_tv_meta(shows):
    """Fill fields TMDB list endpoints omit (next episode, seasons, network).

    TMDB list responses only carry a small subset of fields, so the client
    cannot tell a mid-season episode apart from a genuine new season. One
    cached detail request per show fixes that; OMDB is an optional extra.
    """
    def one(show):
        if not show.get("id"):
            return
        try:
            detail = tv_meta(show["id"])
        except Exception:
            return
        for src, dst in (
            ("number_of_seasons", "numberOfSeasons"),
            ("number_of_episodes", "numberOfEpisodes"),
            ("status", "status"),
            ("last_air_date", "lastAirDate"),
        ):
            if not show.get(dst) and detail.get(src):
                show[dst] = detail[src]
        if not show.get("nextEpisode") and detail.get("next_episode_to_air"):
            nxt = detail["next_episode_to_air"]
            show["nextEpisode"] = {
                "id": nxt.get("id"),
                "season": nxt.get("season_number"),
                "number": nxt.get("episode_number"),
                "name": nxt.get("name"),
                "airdate": nxt.get("air_date"),
                "overview": nxt.get("overview"),
            }
        if not show.get("networkNames") and detail.get("networks"):
            show["networks"] = detail["networks"]
            show["networkNames"] = [n.get("name") for n in detail["networks"] if n.get("name")]
        if not show.get("genres") and detail.get("genres"):
            show["genres"] = [g.get("name") for g in detail["genres"] if g.get("name")]
        imdb_id = show.get("imdbId") or (detail.get("external_ids") or {}).get("imdb_id")
        if imdb_id:
            show["imdbId"] = imdb_id
            try:
                show.update(omdb_fetch(imdb_id))
            except Exception:
                pass

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(one, shows))
    return shows



def cast_from_credits(credits, limit=8):
    """Top-billed cast, ordered by TMDB billing order."""
    people = (credits or {}).get("cast") or []
    people = sorted(people, key=lambda p: p.get("order") if isinstance(p.get("order"), int) else 999)
    result = []
    for person in people[:limit]:
        name = person.get("name")
        if not name:
            continue
        result.append({
            "name": name,
            "character": person.get("character") or None,
            "profilePath": person.get("profile_path") or None,
        })
    return result


def directors_from_credits(credits):
    """Directors (or other named crew jobs) from TMDB credits."""
    result = []
    for person in ((credits or {}).get("crew") or []):
        name = person.get("name")
        if person.get("job") in ("Director", "Co-Director") and name and name not in result:
            result.append(name)
    return result


def norm_detail(detail):
    releases = pick_release_dates(detail)
    genres = [item.get("name") for item in detail.get("genres") or [] if item.get("name")]
    external = detail.get("external_ids") or {}
    credits = detail.get("credits") or {}
    trailer = None
    for video in (detail.get("videos") or {}).get("results") or []:
        if video.get("site") == "YouTube" and video.get("type") in ("Trailer", "Teaser"):
            if trailer is None or video.get("type") == "Trailer":
                trailer = video.get("key")
    payload = norm_movie(detail)
    payload.update(
        {
            "overview": detail.get("overview") or "",
            "runtime": detail.get("runtime") or None,
            "genres": genres,
            "status": detail.get("status"),
            "tagline": detail.get("tagline") or "",
            "budget": detail.get("budget") or None,
            "revenue": detail.get("revenue") or None,
            "imdbId": external.get("imdb_id"),
            "trailerKey": trailer,
            "homepage": detail.get("homepage") or None,
            "productionCountries": [c.get("name") for c in (detail.get("production_countries") or []) if c.get("name")],
            "spokenLanguages": [l.get("name") for l in (detail.get("spoken_languages") or []) if l.get("name")],
            "externalIds": {k: v for k, v in external.items() if k in ("imdb_id", "wikidata_id", "facebook_id", "instagram_id", "twitter_id")},
            "directors": directors_from_credits(credits),
            "cast": cast_from_credits(credits),
        }
    )
    # Fetch OMDB ratings if imdb_id available
    imdb_id = external.get("imdb_id")
    if imdb_id:
        omdb_data = omdb_fetch(imdb_id)
        payload.update(omdb_data)
        if not payload["directors"] and omdb_data.get("omdbDirector"):
            payload["directors"] = [x.strip() for x in omdb_data["omdbDirector"].split(",") if x.strip()]
        if not payload["cast"] and omdb_data.get("omdbActors"):
            payload["cast"] = [
                {"name": x.strip(), "character": None, "profilePath": None}
                for x in omdb_data["omdbActors"].split(",") if x.strip()
            ]
    payload.update(releases)
    return payload


def localized_detail(kind, item_id, append):
    """TMDB detail in fa-IR with English fallback per text field."""
    url = "%s/%s/%s?append_to_response=%s&language=fa-IR" % (TMDB, kind, item_id, append)
    try:
        detail = fetch_json(url, headers=TMDB_HEADERS, timeout=20)
    except Exception:
        detail = {}
    if not any((detail.get("overview"), detail.get("title"), detail.get("name"))):
        try:
            english = fetch_json(url.replace("fa-IR", "en-US"), headers=TMDB_HEADERS, timeout=20)
            for field in ("title", "name", "overview", "tagline"):
                if not detail.get(field) and english.get(field):
                    detail[field] = english[field]
        except Exception:
            pass
    return detail


def trailer_key(detail):
    for video in (detail.get("videos") or {}).get("results") or []:
        if video.get("site") == "YouTube" and video.get("type") in ("Trailer", "Teaser"):
            if video.get("type") == "Trailer":
                return video.get("key")
    return None


def norm_tv_detail(detail):
    payload = norm_tv_show(detail)
    payload.update({
        "overview": detail.get("overview") or "",
        "status": detail.get("status"),
        "tagline": detail.get("tagline") or "",
        "numberOfSeasons": detail.get("number_of_seasons"),
        "numberOfEpisodes": detail.get("number_of_episodes"),
        "lastAirDate": detail.get("last_air_date") or None,
        "episodeRunTime": detail.get("episode_run_time") or [],
        "inProduction": detail.get("in_production"),
        "productionCountries": [c.get("name") for c in (detail.get("production_countries") or []) if c.get("name")],
        "spokenLanguages": [l.get("name") for l in (detail.get("spoken_languages") or []) if l.get("name")],
        "trailerKey": trailer_key(detail),
        "imdbId": (detail.get("external_ids") or {}).get("imdb_id"),
        "createdBy": [p.get("name") for p in (detail.get("created_by") or []) if p.get("name")],
        "directors": directors_from_credits(detail.get("credits")),
        "cast": cast_from_credits(detail.get("credits")),
        "seasons": [{
            "seasonNumber": s.get("season_number"),
            "name": s.get("name"),
            "episodeCount": s.get("episode_count"),
            "airDate": s.get("air_date"),
            "posterPath": image_path(s.get("poster_path")),
        } for s in (detail.get("seasons") or []) if (s.get("season_number") or 0) > 0],
    })
    if payload.get("imdbId"):
        omdb_data = omdb_fetch(payload["imdbId"])
        payload.update(omdb_data)
        if not payload["createdBy"] and omdb_data.get("omdbDirector"):
            payload["createdBy"] = [x.strip() for x in omdb_data["omdbDirector"].split(",") if x.strip()]
        if not payload["cast"] and omdb_data.get("omdbActors"):
            payload["cast"] = [
                {"name": x.strip(), "character": None, "profilePath": None}
                for x in omdb_data["omdbActors"].split(",") if x.strip()
            ]
    return payload


def tv_detail(show_id, force=False):
    key = "tv_detail_v2_%s" % show_id
    if not force:
        cached = cache_get(key, 86400)
        if cached is not None:
            return cached
    payload = norm_tv_detail(localized_detail("tv", show_id, "external_ids,videos,content_ratings,credits"))
    payload["overview_fa"] = payload.get("overview")
    cache_put(key, payload)
    return payload


def similar_items(kind, item_id):
    """12 similar titles, localized with English fallback."""
    data = localized_collection(
        "/%s/%s/recommendations" % (kind, item_id),
        {"page": 1},
        cache_ttl=86400,
        cache_key_extra="similar_%s_%s" % (kind, item_id),
    )
    return [norm_movie(item) if kind == "movie" else norm_tv_show(item)
            for item in (data.get("results") or [])[:12]]


def localized_season(show_id, season_number):
    """Season episodes in fa-IR with English per-episode fallback."""
    path = "/tv/%s/season/%s" % (show_id, season_number)
    fa = tmdb_get(path, {"language": "fa-IR"}, cache_ttl=3600,
                  cache_key_extra="season_fa_%s_%s" % (show_id, season_number))
    try:
        en = tmdb_get(path, {"language": "en-US"}, cache_ttl=3600,
                      cache_key_extra="season_en_%s_%s" % (show_id, season_number))
    except Exception:
        en = {}
    en_by_id = {ep.get("id"): ep for ep in (en.get("episodes") or [])}
    for episode in (fa.get("episodes") or []):
        fallback = en_by_id.get(episode.get("id")) or {}
        if not episode.get("name"):
            episode["name"] = fallback.get("name")
        if not episode.get("overview"):
            episode["overview"] = fallback.get("overview")
    return fa


def movie_detail(movie_id, force=False):
    key = "movie_detail_v2_%s" % movie_id
    if not force:
        cached = cache_get(key, 86400)
        if cached is not None:
            return cached
    payload = norm_detail(localized_detail("movie", movie_id, "release_dates,external_ids,videos,credits"))
    payload["overview_fa"] = payload.get("overview")
    cache_put(key, payload)
    return payload


def tmdb_search(title, year=None):
    params = {"query": title, "language": "en-US", "include_adult": "false", "page": 1}
    if year:
        params["year"] = year
    key = "search_" + normalize_title(title) + "_" + str(year or "")
    cached = cache_get(key, 86400)
    if cached is not None:
        return cached
    try:
        data = tmdb_get("/search/movie", params, cache_ttl=86400, cache_key_extra="search_" + normalize_title(title) + "_" + str(year or ""))
        results = data.get("results") or []
        target = normalize_title(title)
        chosen = None
        for item in results:
            if normalize_title(item.get("title")) == target:
                chosen = item
                break
        if chosen is None and results:
            chosen = results[0]
        payload = norm_movie(chosen) if chosen else None
    except Exception:
        payload = None
    cache_put(key, payload)
    return payload


SEARCH_DATES_TTL = 7 * 86400
SEARCH_DATES_FAIL_TTL = 6 * 3600


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


# ---------------------------------------------------------------------------
# movie endpoints
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Box Office Mojo
# ---------------------------------------------------------------------------

def bom_rows(html):
    rows = []
    for chunk in html.split("</tr>")[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", chunk, flags=re.S)
        if cells:
            rows.append(cells)
    return rows


def bom_latest_weekend():
    html = fetch_text(BOM + "/weekend/")
    for cells in bom_rows(html):
        joined = " ".join(cells)
        link = re.search(r'href="(/weekend/\d{4}W\d+/)', joined)
        if not link:
            continue
        gross = parse_money(strip_tags(cells[1])) if len(cells) > 1 else None
        if gross is None:
            continue
        return link.group(1), strip_tags(cells[0])
    return None, None


def bom_weekend_table(path):
    html = fetch_text(BOM + path)
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 9:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title_html = cells[2]
        title = strip_tags(title_html)
        link = re.search(r'href="(/release/[^"?]+)', title_html)
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "releasePath": link.group(1) if link else None,
                "weekendGross": parse_money(strip_tags(cells[3])),
                "theaters": parse_money(strip_tags(cells[5])) if len(cells) > 5 else None,
                "domestic": parse_money(strip_tags(cells[8])) if len(cells) > 8 else None,
                "weeks": parse_money(strip_tags(cells[9])) if len(cells) > 9 else None,
                "distributor": strip_tags(cells[10]) if len(cells) > 10 else None,
            }
        )
    return entries


def bom_year_world(year):
    html = fetch_text(BOM + "/year/world/%s/" % year)
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 7:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title_html = cells[1]
        title = strip_tags(title_html)
        if not title or title == "-":
            continue
        link = re.search(r'href="(/releasegroup/[^"?]+)', title_html)
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "releasePath": link.group(1) if link else None,
                "worldwide": parse_money(strip_tags(cells[2])),
                "domestic": parse_money(strip_tags(cells[3])),
                "international": parse_money(strip_tags(cells[5])),
            }
        )
    return entries


def bom_alltime_world():
    html = fetch_text(BOM + "/alltime/world/")
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 4:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title = strip_tags(cells[1])
        if not title:
            continue
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "worldwide": parse_money(strip_tags(cells[2])),
                "domestic": parse_money(strip_tags(cells[3])),
                "international": parse_money(strip_tags(cells[4])) if len(cells) > 4 else None,
            }
        )
    return entries


def box_office(year=None, force=False):
    year = year or str(dt.date.today().year)
    key = "boxoffice_" + year
    cached = None if force else cache_get(key, 3 * 3600)
    if cached is not None:
        return cached

    weekend_path, weekend_label = bom_latest_weekend()
    weekend = bom_weekend_table(weekend_path) if weekend_path else []
    yearly = bom_year_world(year) if year.isdigit() else bom_alltime_world()
    year_map = {normalize_title(item["title"]): item for item in yearly}

    combined = []
    seen = set()
    for item in weekend[:10]:
        key_title = normalize_title(item["title"])
        match = year_map.get(key_title) or {}
        item["worldwide"] = match.get("worldwide")
        item["international"] = match.get("international")
        combined.append(item)
        seen.add(key_title)
    for item in yearly[:20]:
        key_title = normalize_title(item["title"])
        if key_title in seen:
            continue
        entry = dict(item)
        entry.update({"weekendGross": None, "theaters": None, "weeks": None, "distributor": None})
        combined.append(entry)
        seen.add(key_title)

    def enrich(entry):
        search_year = year if year.isdigit() else None
        match = tmdb_search(entry["title"], search_year)
        if not match:
            match = tmdb_search(entry["title"], None)
        if match:
            entry.update(
                {
                    "id": match.get("id"),
                    "posterPath": match.get("posterPath"),
                    "rating": match.get("rating"),
                    "releaseDate": match.get("releaseDate"),
                    "tmdbOverview": match.get("overview"),
                }
            )
            try:
                detail = movie_detail(match["id"])
                entry["budget"] = detail.get("budget") or None
                entry["revenue"] = detail.get("revenue") or None
                entry["genres"] = detail.get("genres") or []
            except Exception:
                entry["budget"] = None
        return entry

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        combined = list(pool.map(enrich, combined))

    cheap = [item for item in combined if item.get("weekendGross") is not None]
    cheap.sort(key=lambda item: item.get("rank") or 999)
    yearly_out = [item for item in combined if item.get("weekendGross") is None]
    yearly_out.sort(key=lambda item: item.get("worldwide") or 0, reverse=True)

    payload = {
        "updatedAt": dt.datetime.utcnow().isoformat() + "Z",
        "source": "Box Office Mojo",
        "year": year,
        "weekendLabel": weekend_label,
        "weekend": cheap,
        "yearly": yearly_out,
    }
    cache_put(key, payload)
    return payload


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "SeriesRadarAPI/1.0"

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = urllib.parse.parse_qs(parsed.query)
        # parse_qs returns lists; TMDB expects scalar query values.
        flat_query = {k: v[0] for k, v in query.items() if v}
        force = query.get("refresh", ["0"])[0] == "1"
        global REQUEST_COUNT, ERROR_COUNT
        with METRICS_LOCK:
            REQUEST_COUNT += 1
        try:
            if path == "/api/health":
                return self.send_json({"ok": True, "time": dt.datetime.utcnow().isoformat() + "Z"})
            if path == "/api/metrics":
                files, size = cache_stats()
                with METRICS_LOCK:
                    metrics = {
                        "ok": True,
                        "uptimeSeconds": int(time.time() - STARTED_AT),
                        "requests": REQUEST_COUNT,
                        "errors": ERROR_COUNT,
                        "cacheFiles": files,
                        "cacheBytes": size,
                    }
                return self.send_json(metrics)
            if path == "/api/movies/now-playing":
                return self.send_json(now_playing(force))
            if path == "/api/movies/upcoming":
                return self.send_json(upcoming(force))
            if path == "/api/movies/online":
                return self.send_json(online_releases(force))
            if path == "/api/movies/quality":
                return self.send_json(quality_waiting(force))
            if path.startswith("/api/movie/") and path.endswith("/similar"):
                movie_id = int(path.split("/")[-2])
                return self.send_json({"items": similar_items("movie", movie_id)})
            if path.startswith("/api/movie/"):
                movie_id = int(path.rsplit("/", 1)[-1])
                return self.send_json(movie_detail(movie_id, force))
            if path == "/api/search/multi":
                text = (query.get("q") or [""])[0].strip()
                media_type = (query.get("type") or ["all"])[0]
                return self.send_json(search_multi(text, media_type))
            if path == "/api/movies/search":
                text = (query.get("q") or [""])[0].strip()
                if not text:
                    return self.send_json({"items": []})
                result_key = "legacy_search_movie_full_" + normalize_fa(text)
                cached_result = cache_get(result_key, 1800)
                if cached_result is not None:
                    return self.send_json(cached_result)
                data = localized_collection(
                    "/search/movie",
                    {"query": text, "include_adult": "false", "page": 1},
                    cache_ttl=3600,
                    cache_key_extra="legacy_search_movie_" + normalize_fa(text),
                )
                items = [norm_movie(item) for item in (data.get("results") or [])[:20]]
                payload = {"items": enrich_search_dates(items)}
                cache_put(result_key, payload)
                return self.send_json(payload)
            if path == "/api/boxoffice":
                year = (query.get("year") or [str(dt.date.today().year)])[0]
                return self.send_json(box_office(year, force))
            if path == "/api/tv/popular":
                data = localized_collection("/tv/popular", {"page": 1}, cache_ttl=3600, cache_key_extra="tvpopular")
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows})
            if path == "/api/tv/top_rated":
                data = localized_collection("/tv/top_rated", {"page": 1}, cache_ttl=3600, cache_key_extra="tvtoprated")
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows})
            if path.startswith("/api/tv/") and path.endswith("/similar"):
                show_id = int(path.split("/")[-2])
                return self.send_json({"results": similar_items("tv", show_id)})
            if path.startswith("/api/tv/") and path.count("/") == 3 and path.split("/")[-1].isdigit():
                show_id = int(path.split("/")[-1])
                return self.send_json(tv_detail(show_id, force))
            if path.startswith("/api/tv/") and path.endswith("/episodes"):
                show_id = int(path.split("/")[-2])
                # First get show details to know number of seasons
                show_detail = tmdb_get(f"/tv/{show_id}", {"language": "en-US"}, cache_ttl=3600)
                seasons = show_detail.get("seasons") or []
                season_numbers = [s.get("season_number") for s in seasons if s.get("season_number") and s.get("season_number") > 0]
                all_episodes = []
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                    futures = {pool.submit(localized_season, show_id, sn): sn for sn in season_numbers}
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            season_data = future.result()
                            for ep in (season_data.get("episodes") or []):
                                still = ep.get("still_path")
                                all_episodes.append({
                                    "id": ep.get("id"),
                                    "season": ep.get("season_number"),
                                    "number": ep.get("episode_number"),
                                    "name": ep.get("name"),
                                    "airdate": ep.get("air_date"),
                                    "airtime": None,
                                    "airstamp": (ep.get("air_date") + "T12:00:00") if ep.get("air_date") else None,
                                    "summary": ep.get("overview"),
                                    "image": {"medium": "https://image.tmdb.org/t/p/w300" + still, "original": "https://image.tmdb.org/t/p/original" + still} if still else None,
                                    "rating": {"average": ep.get("vote_average")} if ep.get("vote_average") else None,
                                })
                        except Exception:
                            pass
                return self.send_json({"episodes": all_episodes})
            if path == "/api/tv/on_the_air":
                data = localized_collection("/tv/on_the_air", {"page": 1}, cache_ttl=1800, cache_key_extra="ontheair")
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows})
            if path == "/api/tv/airing_today":
                data = localized_collection("/tv/airing_today", {"page": 1}, cache_ttl=900, cache_key_extra="airingtoday")
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows})
            if path == "/api/tv/search":
                text = (query.get("q") or [""])[0].strip()
                if not text:
                    return self.send_json({"results": []})
                data = localized_collection(
                    "/search/tv",
                    {"query": text, "include_adult": "false", "page": 1},
                    cache_ttl=3600,
                    cache_key_extra="legacy_search_tv_" + normalize_fa(text),
                )
                shows = [norm_tv_show(item) for item in (data.get("results") or [])[:20]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows})
            if path == "/api/movies/discover":
                params = dict(flat_query)
                params.pop("refresh", None)
                # Map friendly sort keys to real TMDB sort fields.
                sort_map = {"date": "release_date", "rating": "vote_average", "popularity": "popularity"}
                sort_by = params.pop("sort_by", "popularity.desc")
                if "." in sort_by:
                    key, order = sort_by.rsplit(".", 1)
                else:
                    key, order = sort_by, "desc"
                key = sort_map.get(key, key)
                params["sort_by"] = f"{key}.{order}"
                params.pop("language", None)
                params.setdefault("include_adult", "false")
                params.setdefault("page", "1")
                extra = "disc_movie_" + re.sub(r"[^a-zA-Z0-9_.-]", "_", urllib.parse.urlencode(sorted(params.items())))[:120]
                data = localized_collection("/discover/movie", params, cache_ttl=1800, cache_key_extra=extra)
                items = [norm_movie(item) for item in (data.get("results") or [])[:50]]
                items = enrich_with_omdb(items)
                return self.send_json({"items": items, "total_pages": data.get("total_pages")})
            if path == "/api/tv/discover":
                params = dict(flat_query)
                params.pop("refresh", None)
                # TV uses first_air_date (not primary_release_date) and its own sort fields.
                if "primary_release_date.gte" in params:
                    params["first_air_date.gte"] = params.pop("primary_release_date.gte")
                if "primary_release_date.lte" in params:
                    params["first_air_date.lte"] = params.pop("primary_release_date.lte")
                sort_map = {"date": "first_air_date", "rating": "vote_average", "popularity": "popularity"}
                sort_by = params.pop("sort_by", "popularity.desc")
                if "." in sort_by:
                    key, order = sort_by.rsplit(".", 1)
                else:
                    key, order = sort_by, "desc"
                key = sort_map.get(key, key)
                params["sort_by"] = f"{key}.{order}"
                params.pop("language", None)
                params.setdefault("include_adult", "false")
                params.setdefault("page", "1")
                extra = "disc_tv_" + re.sub(r"[^a-zA-Z0-9_.-]", "_", urllib.parse.urlencode(sorted(params.items())))[:120]
                data = localized_collection("/discover/tv", params, cache_ttl=1800, cache_key_extra=extra)
                shows = [norm_tv_show(item) for item in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows)
                return self.send_json({"results": shows, "total_pages": data.get("total_pages")})
            return self.send_json({"error": "not found"}, 404)
        except urllib.error.HTTPError as error:
            with METRICS_LOCK:
                ERROR_COUNT += 1
            return self.send_json({"error": "upstream HTTP %s" % error.code}, 502)
        except Exception as error:
            with METRICS_LOCK:
                ERROR_COUNT += 1
            return self.send_json({"error": str(error)}, 500)

    def log_message(self, fmt, *args):
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        sys.stderr.write("%s %s %s\n" % (stamp, self.address_string(), fmt % args))


if __name__ == "__main__":
    removed = prune_cache(force=True)
    if removed:
        print("Pruned %d stale cache files" % removed, flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Series Radar API on :%d" % PORT, flush=True)
    server.serve_forever()
