"""Air-date verification and correction against TVMaze.

TMDB is the metadata source (title, overview, images, networks). For the
*release date* of a series episode we prefer TVMaze, which for many
Paramount+/streaming shows carries the streaming release day (a day or two
earlier than TMDB's linear broadcast day). When TVMaze is unavailable we
fall back to TMDB, optionally applying a learned per-season offset.

Everything here is fail-open: a TVMaze outage, timeout or rate-limit never
blocks the API response; the caller always gets a usable date plus a
``dateSource``/``confidence`` explaining where it came from.
"""
import concurrent.futures
import datetime as dt
import re
import threading
import time

from .cache import cache_get, cache_put
from .config import TVMaze
from .http import fetch_json

TVMAZE_LOOKUP_TTL = 30 * 86400
TVMAZE_EPISODES_TTL = 6 * 3600
OVERRIDE_TTL = 6 * 3600
OVERRIDE_STALE_AFTER = 12 * 3600

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Throttle TVMaze: 15 requests per 10 seconds (TVMaze allows ~20/10s).
_THROTTLE_LOCK = threading.Lock()
_THROTTLE_WINDOW = []
_THROTTLE_LIMIT = 15
_THROTTLE_SPAN = 10.0

# Circuit breaker: after 3 consecutive failures, pause TVMaze for 15 minutes.
_CB_LOCK = threading.Lock()
_CB_FAILS = 0
_CB_OPEN_UNTIL = 0.0

# Background warmer state.
_WARMER_LOCK = threading.Lock()
_WARMER_THREAD = None
_VERIFY_QUEUE = set()
_QUEUE_LOCK = threading.Lock()
_LAST_WARM = 0.0
_WARM_INTERVAL = 6 * 3600


def _throttle():
    with _THROTTLE_LOCK:
        now = time.time()
        cutoff = now - _THROTTLE_SPAN
        while _THROTTLE_WINDOW and _THROTTLE_WINDOW[0] < cutoff:
            _THROTTLE_WINDOW.pop(0)
        if len(_THROTTLE_WINDOW) >= _THROTTLE_LIMIT:
            wait = _THROTTLE_WINDOW[0] + _THROTTLE_SPAN - now
            if wait > 0:
                time.sleep(wait)
        _THROTTLE_WINDOW.append(time.time())


def _circuit_open():
    with _CB_LOCK:
        return time.time() < _CB_OPEN_UNTIL


def _record_success():
    global _CB_FAILS, _CB_OPEN_UNTIL
    with _CB_LOCK:
        _CB_FAILS = 0


def _record_failure():
    global _CB_FAILS, _CB_OPEN_UNTIL
    with _CB_LOCK:
        _CB_FAILS += 1
        if _CB_FAILS >= 3:
            _CB_OPEN_UNTIL = time.time() + 15 * 60


def _valid_date(value):
    return isinstance(value, str) and bool(DATE_RE.match(value))


def _parse_date(value):
    if not _valid_date(value):
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def _delta_days(a, b):
    da, db = _parse_date(a), _parse_date(b)
    if not da or not db:
        return None
    return (da - db).days


def tvmaze_lookup(external_ids):
    """Return TVMaze show id for a TMDB show, or None. Cached 30 days."""
    external_ids = external_ids or {}
    tvdb_id = external_ids.get("tvdb_id")
    imdb_id = external_ids.get("imdb_id")
    if not tvdb_id and not imdb_id:
        return None
    key = "tvmaze_lookup_%s_%s" % (tvdb_id or "-", imdb_id or "-")
    cached = cache_get(key, TVMAZE_LOOKUP_TTL)
    if cached is not None:
        return cached.get("id")
    if _circuit_open():
        return None
    try:
        _throttle()
        if tvdb_id:
            data = fetch_json("%s/lookup/shows?thetvdb=%s" % (TVMaze, tvdb_id), timeout=8)
        else:
            data = fetch_json("%s/lookup/shows?imdb=%s" % (TVMaze, imdb_id), timeout=8)
        _record_success()
        tvmaze_id = data.get("id") if isinstance(data, dict) else None
        cache_put(key, {"id": tvmaze_id})
        return tvmaze_id
    except Exception:
        _record_failure()
        return None


def tvmaze_show(tvmaze_id):
    if not tvmaze_id:
        return None
    key = "tvmaze_show_%s" % tvmaze_id
    cached = cache_get(key, TVMAZE_EPISODES_TTL)
    if cached is not None:
        return cached.get("data")
    if _circuit_open():
        return None
    try:
        _throttle()
        data = fetch_json("%s/shows/%s?embed[]=nextepisode&embed[]=previousepisode" % (TVMaze, tvmaze_id), timeout=8)
        _record_success()
        cache_put(key, {"data": data})
        return data
    except Exception:
        _record_failure()
        return None


def tvmaze_episodes(tvmaze_id):
    if not tvmaze_id:
        return []
    key = "tvmaze_episodes_%s" % tvmaze_id
    cached = cache_get(key, TVMAZE_EPISODES_TTL)
    if cached is not None:
        return cached.get("data") or []
    if _circuit_open():
        return []
    try:
        _throttle()
        data = fetch_json("%s/shows/%s/episodes" % (TVMaze, tvmaze_id), timeout=12)
        _record_success()
        if isinstance(data, list):
            cache_put(key, {"data": data})
            return data
        return []
    except Exception:
        _record_failure()
        return []


def _tvmaze_next_episode(tvmaze_show, tvmaze_episodes):
    """Pick the next episode to air from TVMaze data."""
    show = tvmaze_show or {}
    embedded = (show.get("_embedded") or {}).get("nextepisode")
    if isinstance(embedded, dict) and _valid_date(embedded.get("airdate")):
        return embedded
    # Fall back to the earliest future episode in the full list.
    today = dt.date.today()
    future = []
    for ep in (tvmaze_episodes or []):
        d = _parse_date(ep.get("airdate"))
        if d and d >= today:
            future.append((d, ep))
    if future:
        future.sort(key=lambda x: x[0])
        return future[0][1]
    return None


def _season_offset(tmdb_detail, tvmaze_episodes):
    """Learn a per-season day offset from aligned episodes (TMDB season air_date
    vs TVMaze first episode of that season). Returns (offset_days, confidence)."""
    seasons = (tmdb_detail or {}).get("seasons") or []
    tmdb_by_season = {s.get("season_number"): s for s in seasons if s.get("season_number") is not None}
    by_season = {}
    for ep in (tvmaze_episodes or []):
        by_season.setdefault(ep.get("season"), []).append(ep)
    offsets = []
    for sn, eps in by_season.items():
        if not eps:
            continue
        eps_sorted = sorted(eps, key=lambda e: (e.get("number") or 0))
        first = eps_sorted[0]
        tmdb_season = tmdb_by_season.get(sn)
        tmdb_day = (tmdb_season or {}).get("air_date")
        if not _valid_date(tmdb_day):
            continue
        delta = _delta_days(first.get("airdate"), tmdb_day)
        if delta is None:
            continue
        # Require at least a few episodes in the season to trust the pattern.
        if len(eps) >= 2:
            offsets.append((sn, delta, len(eps)))
    if not offsets:
        return None, "none"
    # Use the most recent season's offset (latest data is most reliable).
    offsets.sort(key=lambda x: x[0])
    sn, delta, n = offsets[-1]
    return delta, "season"


def build_override(tmdb_id, tmdb_detail, tvmaze_show, tvmaze_episodes):
    tmdb_detail = tmdb_detail or {}
    tmdb_next = tmdb_detail.get("next_episode_to_air") or None
    tmdb_next_airdate = tmdb_next.get("air_date") if isinstance(tmdb_next, dict) else None
    tvmaze_next = _tvmaze_next_episode(tvmaze_show, tvmaze_episodes)
    offset, offset_source = _season_offset(tmdb_detail, tvmaze_episodes)

    override = {
        "tmdbId": tmdb_id,
        "tvmazeId": (tvmaze_show or {}).get("id"),
        "tvmazeMatched": bool(tvmaze_show),
        "firstAirDate": tmdb_detail.get("first_air_date"),
        "lastAirDate": tmdb_detail.get("last_air_date"),
        "nextEpisode": None,
        "dateSource": "tmdb",
        "confidence": "single-source",
        "deltaDays": offset,
        "checkedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    # firstAirDate from TVMaze premiered if available.
    premiered = (tvmaze_show or {}).get("premiered")
    if _valid_date(premiered):
        override["firstAirDate"] = premiered

    # lastAirDate: TVMaze doesn't expose a single last_air_date; keep TMDB.

    tmdb_airdate_valid = _valid_date(tmdb_next_airdate)

    if tvmaze_next and _valid_date(tvmaze_next.get("airdate")):
        same_episode = (
            isinstance(tmdb_next, dict)
            and tmdb_next.get("season_number") == tvmaze_next.get("season")
            and tmdb_next.get("episode_number") == tvmaze_next.get("number")
        )
        ne = {
            "id": tvmaze_next.get("id"),
            "season": tvmaze_next.get("season"),
            "number": tvmaze_next.get("number"),
            "name": tvmaze_next.get("name"),
            "airdate": tvmaze_next.get("airdate"),
            "overview": None,
            "dateSource": "tvmaze",
            "tmdbAirdate": tmdb_next_airdate if tmdb_airdate_valid else None,
            "tmdbNextSeason": tmdb_next.get("season_number") if isinstance(tmdb_next, dict) else None,
            "tmdbNextNumber": tmdb_next.get("episode_number") if isinstance(tmdb_next, dict) else None,
            "deltaDays": _delta_days(tvmaze_next.get("airdate"), tmdb_next_airdate) if (tmdb_airdate_valid and same_episode) else None,
            "sameEpisode": same_episode,
        }
        # Preserve TMDB overview if TVMaze has none (it usually doesn't).
        if tmdb_next and isinstance(tmdb_next, dict):
            ne["overview"] = tmdb_next.get("overview")
            if not ne.get("name"):
                ne["name"] = tmdb_next.get("name")
            if ne.get("id") is None:
                ne["id"] = tmdb_next.get("id")
        override["nextEpisode"] = ne
        override["dateSource"] = "tvmaze"
        override["confidence"] = "confirmed"
        return override

    # No TVMaze next episode: try pattern offset on TMDB's next.
    if tmdb_airdate_valid and offset is not None:
        d = _parse_date(tmdb_next_airdate)
        if d:
            corrected = (d + dt.timedelta(days=offset)).isoformat()
            ne = {
                "id": tmdb_next.get("id"),
                "season": tmdb_next.get("season_number"),
                "number": tmdb_next.get("episode_number"),
                "name": tmdb_next.get("name"),
                "airdate": corrected,
                "overview": tmdb_next.get("overview"),
                "dateSource": "pattern",
                "tmdbAirdate": tmdb_next_airdate,
                "deltaDays": offset,
            }
            override["nextEpisode"] = ne
            override["dateSource"] = "pattern"
            override["confidence"] = "estimated"
            return override

    # Final fallback: TMDB as-is.
    if tmdb_next and isinstance(tmdb_next, dict) and tmdb_airdate_valid:
        ne = {
            "id": tmdb_next.get("id"),
            "season": tmdb_next.get("season_number"),
            "number": tmdb_next.get("episode_number"),
            "name": tmdb_next.get("name"),
            "airdate": tmdb_next_airdate,
            "overview": tmdb_next.get("overview"),
            "dateSource": "tmdb",
            "tmdbAirdate": tmdb_next_airdate,
            "deltaDays": None,
        }
        override["nextEpisode"] = ne
        override["dateSource"] = "tmdb"
        override["confidence"] = "single-source"
    return override


def _tmdb_detail_for(tmdb_id):
    from .http import tmdb_get
    return tmdb_get(
        "/tv/%s" % tmdb_id,
        {"language": "en-US", "append_to_response": "external_ids"},
        cache_ttl=6 * 3600,
        cache_key_extra="airdate_detail",
    )


def verify_show(tmdb_id):
    """Verify a single show on demand. Returns override dict. Cached."""
    try:
        tmdb_id = int(tmdb_id)
    except (TypeError, ValueError):
        return None
    key = "airdate_override_%s" % tmdb_id
    cached = cache_get(key, OVERRIDE_TTL)
    if cached is not None and cached.get("data"):
        data = cached["data"]
        checked = data.get("checkedAt")
        if checked:
            try:
                age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(checked.replace("Z", "+00:00"))).total_seconds()
            except Exception:
                age = OVERRIDE_TTL + 1
            if age < OVERRIDE_STALE_AFTER:
                return data
    if _circuit_open():
        return cached["data"] if (cached and cached.get("data")) else None

    try:
        detail = _tmdb_detail_for(tmdb_id)
    except Exception:
        detail = {}
    external_ids = detail.get("external_ids") or {}
    # TMDB detail without append may nest external_ids differently; merge.
    if not external_ids.get("tvdb_id") and detail.get("tvdb_id"):
        external_ids["tvdb_id"] = detail.get("tvdb_id")
    if not external_ids.get("imdb_id") and detail.get("imdb_id"):
        external_ids["imdb_id"] = detail.get("imdb_id")

    tvmaze_id = tvmaze_lookup(external_ids)
    tvmaze_show_data = tvmaze_show(tvmaze_id) if tvmaze_id else None
    tvmaze_eps = tvmaze_episodes(tvmaze_id) if tvmaze_id else []

    override = build_override(tmdb_id, detail, tvmaze_show_data, tvmaze_eps)
    cache_put(key, {"data": override})
    return override


def get_override(tmdb_id):
    try:
        tmdb_id = int(tmdb_id)
    except (TypeError, ValueError):
        return None
    cached = cache_get("airdate_override_%s" % tmdb_id, OVERRIDE_TTL)
    if cached is not None and cached.get("data"):
        return cached["data"]
    return None


def request_verify(tmdb_id):
    """Enqueue a show for background verification (non-blocking)."""
    try:
        tmdb_id = int(tmdb_id)
    except (TypeError, ValueError):
        return
    with _QUEUE_LOCK:
        _VERIFY_QUEUE.add(tmdb_id)


def apply_override(show):
    """Mutate a normalized show dict in place with cached override (no network)."""
    if not isinstance(show, dict) or not show.get("id"):
        return show
    override = get_override(show["id"])
    if not override:
        request_verify(show["id"])
        show["dateSource"] = show.get("dateSource") or "pending"
        show["dateConfidence"] = show.get("dateConfidence") or "pending"
        return show
    if override.get("firstAirDate"):
        show["firstAirDate"] = override["firstAirDate"]
    ne = override.get("nextEpisode")
    if ne:
        existing = show.get("nextEpisode") if isinstance(show.get("nextEpisode"), dict) else {}
        show["nextEpisode"] = {
            "id": ne.get("id") if ne.get("id") is not None else existing.get("id"),
            "season": ne.get("season") if ne.get("season") is not None else existing.get("season"),
            "number": ne.get("number") if ne.get("number") is not None else existing.get("number"),
            "name": ne.get("name") or existing.get("name"),
            "airdate": ne.get("airdate"),
            "overview": ne.get("overview") or existing.get("overview"),
            "dateSource": ne.get("dateSource"),
            "tmdbAirdate": ne.get("tmdbAirdate"),
            "deltaDays": ne.get("deltaDays"),
        }
    show["dateSource"] = override.get("dateSource")
    show["dateConfidence"] = override.get("confidence")
    show["dateCheckedAt"] = override.get("checkedAt")
    show["dateDeltaDays"] = override.get("deltaDays")
    return show


def verify_batch(ids):
    """Verify a list of TMDB ids (parallel, throttled). Returns list of overrides."""
    ids = [i for i in (ids or []) if i]
    unique = []
    seen = set()
    for i in ids:
        try:
            i = int(i)
        except (TypeError, ValueError):
            continue
        if i in seen:
            continue
        seen.add(i)
        unique.append(i)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(verify_show, i): i for i in unique}
        for future in concurrent.futures.as_completed(futures):
            try:
                r = future.result()
                if r is not None:
                    results.append(r)
            except Exception:
                pass
    return results


def warm_overrides(extra_ids=None):
    """Background: verify candidate shows. Called by warmer thread."""
    global _LAST_WARM
    candidates = set(extra_ids or [])
    # Gather from cached feeds if available.
    try:
        from .cache import cache_get
        for key in ("now_playing_us", "upcoming_us", "on_the_air", "airing_today"):
            pass
    except Exception:
        pass
    # Pull TMDB ids from recently cached override-less shows is not tracked;
    # instead rely on request_verify queue + explicit ids.
    with _QUEUE_LOCK:
        queued = list(_VERIFY_QUEUE)
        _VERIFY_QUEUE.clear()
    candidates.update(queued)
    if not candidates:
        _LAST_WARM = time.time()
        return
    verify_batch(list(candidates))
    _LAST_WARM = time.time()


def start_warmer():
    global _WARMER_THREAD
    with _WARMER_LOCK:
        if _WARMER_THREAD is not None and _WARMER_THREAD.is_alive():
            return _WARMER_THREAD
        def loop():
            global _LAST_WARM
            # Initial delay to let server finish startup.
            time.sleep(10)
            while True:
                try:
                    warm_overrides()
                except Exception:
                    pass
                # Sleep in small increments so we can react to queue.
                for _ in range(60):
                    time.sleep(60)
                    with _QUEUE_LOCK:
                        has_pending = bool(_VERIFY_QUEUE)
                    if has_pending:
                        try:
                            warm_overrides()
                        except Exception:
                            pass
        _WARMER_THREAD = threading.Thread(target=loop, name="airdate-warmer", daemon=True)
        _WARMER_THREAD.start()
        return _WARMER_THREAD


def tvmaze_episode_dates(tvmaze_id):
    """Return a dict (season, number) -> airdate from TVMaze."""
    eps = tvmaze_episodes(tvmaze_id)
    out = {}
    for ep in eps or []:
        key = (ep.get("season"), ep.get("number"))
        if _valid_date(ep.get("airdate")):
            out[key] = ep.get("airdate")
    return out


def apply_tvmaze_to_episodes(tmdb_id, episodes):
    """Given a list of TMDB episode dicts, override airdate from TVMaze when
    available, applying the season offset as a fallback. Mutates in place and
    adds ``dateSource``. Returns (failed_seasons_list)."""
    if not episodes:
        return []
    # Resolve tvmaze id from cache or verify.
    override = get_override(tmdb_id)
    if not override:
        try:
            override = verify_show(tmdb_id)
        except Exception:
            override = None
    tvmaze_id = (override or {}).get("tvmazeId")
    tvmaze_dates = tvmaze_episode_dates(tvmaze_id) if tvmaze_id else {}
    delta = (override or {}).get("deltaDays")
    failed = []
    seen_seasons = set()
    for ep in episodes:
        season = ep.get("season")
        number = ep.get("number")
        tmdb_air = ep.get("airdate")
        key = (season, number)
        if key in tvmaze_dates:
            ep["airdate"] = tvmaze_dates[key]
            ep["airstamp"] = tvmaze_dates[key] + "T12:00:00Z" if tvmaze_dates[key] else ep.get("airstamp")
            ep["dateSource"] = "tvmaze"
            ep["tmdbAirdate"] = tmdb_air
        elif _valid_date(tmdb_air) and delta is not None:
            d = _parse_date(tmdb_air)
            if d:
                ep["airdate"] = (d + dt.timedelta(days=delta)).isoformat()
                ep["airstamp"] = ep["airdate"] + "T12:00:00Z"
                ep["dateSource"] = "pattern"
                ep["tmdbAirdate"] = tmdb_air
        else:
            if _valid_date(tmdb_air):
                ep["dateSource"] = "tmdb"
                ep["tmdbAirdate"] = tmdb_air
            else:
                ep["dateSource"] = "unknown"
    return failed
