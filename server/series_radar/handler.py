"""HTTP handler and entry point."""

import concurrent.futures
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .airdates import (
    apply_override,
    apply_tvmaze_to_episodes,
    get_override,
    request_verify,
    start_warmer,
    verify_batch,
    verify_show,
)
from .boxoffice import box_office
from .cache import cache_get, cache_put, cache_stats, prune_cache
from .catalog import (
    enrich_search_dates,
    enrich_with_omdb,
    now_playing,
    online_releases,
    quality_waiting,
    search_multi,
    upcoming,
)
from .config import PORT, TMDB, TMDB_HEADERS, TMDB_TOKEN
from .downloads import MAX_KEYS, match_downloads
from .http import localized_collection, tmdb_get
from .metrics import inc_error, inc_request, observe_latency, snapshot
from .people import person_detail
from .text import normalize_fa
from .tmdb import (
    enrich_tv_meta,
    fetch_upcoming_tv,
    localized_season,
    movie_detail,
    norm_movie,
    norm_tv_show,
    similar_items,
    tv_detail,
)


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
        _started = time.time()
        inc_request(path)
        try:
            if path == "/api/health":
                tmdb_ok = bool(TMDB_TOKEN)
                return self.send_json({"ok": tmdb_ok, "tmdb": tmdb_ok, "time": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")})
            if path == "/api/downloads/match":
                keys = [item.strip() for item in (query.get("keys") or [""])[0].split(",") if item.strip()]
                return self.send_json({"items": match_downloads(keys[:MAX_KEYS], force)})
            if path == "/api/metrics":
                files, size = cache_stats()
                return self.send_json(snapshot(files, size))
            if path == "/api/movies/now-playing":
                return self.send_json(now_playing(force))
            if path == "/api/movies/upcoming":
                return self.send_json(upcoming(force))
            if path == "/api/movies/online":
                return self.send_json(online_releases(force))
            if path == "/api/movies/quality":
                return self.send_json(quality_waiting(force))
            if path.startswith("/api/person/") and path.rsplit("/", 1)[-1].isdigit():
                person_id = int(path.rsplit("/", 1)[-1])
                return self.send_json(person_detail(person_id, force))
            if path.startswith("/api/movie/") and path.endswith("/similar") and path.split("/")[-2].isdigit():
                movie_id = int(path.split("/")[-2])
                return self.send_json({"items": similar_items("movie", movie_id)})
            if path.startswith("/api/movie/") and path.rsplit("/", 1)[-1].isdigit():
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
                shows = enrich_tv_meta(shows, include_omdb=False)
                return self.send_json({"results": shows})
            if path == "/api/tv/top_rated":
                data = localized_collection("/tv/top_rated", {"page": 1}, cache_ttl=3600, cache_key_extra="tvtoprated")
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:50]]
                shows = enrich_tv_meta(shows, include_omdb=False)
                return self.send_json({"results": shows})
            if path.startswith("/api/tv/") and path.endswith("/similar") and path.split("/")[-2].isdigit():
                show_id = int(path.split("/")[-2])
                return self.send_json({"results": similar_items("tv", show_id)})
            if path == "/api/tv/upcoming":
                return self.send_json({"results": fetch_upcoming_tv()})
            if path.startswith("/api/tv/") and path.count("/") == 3 and path.split("/")[-1].isdigit():
                show_id = int(path.split("/")[-1])
                return self.send_json(tv_detail(show_id, force))
            if path.startswith("/api/tv/") and path.endswith("/episodes") and path.split("/")[-2].isdigit():
                show_id = int(path.split("/")[-2])
                # First get show details to know number of seasons
                show_detail = tmdb_get(f"/tv/{show_id}", {"language": "en-US"}, cache_ttl=3600)
                seasons = show_detail.get("seasons") or []
                season_numbers = [s.get("season_number") for s in seasons if s.get("season_number") and s.get("season_number") > 0]
                all_episodes = []
                failed_seasons = []
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                    futures = {pool.submit(localized_season, show_id, sn): sn for sn in season_numbers}
                    for future in concurrent.futures.as_completed(futures):
                        sn = futures[future]
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
                            failed_seasons.append(sn)
                # Apply TVMaze as date basis (fills missing seasons via offset).
                try:
                    apply_tvmaze_to_episodes(show_id, all_episodes)
                except Exception:
                    pass
                # Retry failed seasons once.
                if failed_seasons:
                    retry_failed = []
                    for sn in list(failed_seasons):
                        try:
                            season_data = localized_season(show_id, sn)
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
                            failed_seasons.remove(sn)
                        except Exception:
                            pass
                    try:
                        apply_tvmaze_to_episodes(show_id, all_episodes)
                    except Exception:
                        pass
                payload = {"episodes": all_episodes}
                if failed_seasons:
                    payload["failedSeasons"] = failed_seasons
                    payload["partial"] = True
                # Normalize airstamp to ISO with Z for client consistency.
                for ep in all_episodes:
                    if ep.get("airdate") and not (ep.get("airstamp") or "").endswith("Z"):
                        ep["airstamp"] = ep["airdate"] + "T12:00:00Z"
                return self.send_json(payload)
            if path == "/api/tv/verify":
                raw = (query.get("ids") or [""])[0]
                ids = [x.strip() for x in raw.split(",") if x.strip().isdigit()]
                try:
                    overrides = verify_batch([int(x) for x in ids[:50]])
                except Exception:
                    overrides = []
                return self.send_json({"items": overrides})
            if path == "/api/tv/on_the_air":
                # Fetch first 3 pages (≈60 items) to include popular shows beyond page 1
                data = localized_collection("/tv/on_the_air", {}, cache_ttl=1800, cache_key_extra="ontheair", max_pages=3)
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:60]]
                shows = enrich_tv_meta(shows, include_omdb=False)
                return self.send_json({"results": shows})
            if path == "/api/tv/airing_today":
                data = localized_collection("/tv/airing_today", {}, cache_ttl=900, cache_key_extra="airingtoday", max_pages=3)
                shows = [norm_tv_show(s) for s in (data.get("results") or [])[:60]]
                shows = enrich_tv_meta(shows, include_omdb=False)
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
                shows = enrich_tv_meta(shows, include_omdb=False)
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
                shows = enrich_tv_meta(shows, include_omdb=False)
                return self.send_json({"results": shows, "total_pages": data.get("total_pages")})
            return self.send_json({"error": "not found"}, 404)
        except urllib.error.HTTPError as error:
            inc_error(path)
            return self.send_json({"error": "upstream HTTP %s" % error.code}, 502)
        except Exception as error:
            inc_error(path)
            request_id = "%d" % int(time.time() * 1000)
            sys.stderr.write("request %s %s failed: %r\\n" % (request_id, path, error))
            return self.send_json({"error": "internal error", "requestId": request_id}, 500)
        finally:
            try:
                observe_latency(path, (time.time() - _started) * 1000.0)
            except Exception:
                pass

    def log_message(self, fmt, *args):
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        sys.stderr.write("%s %s %s\n" % (stamp, self.address_string(), fmt % args))


def main():
    removed = prune_cache(force=True)
    if removed:
        print("Pruned %d stale cache files" % removed, flush=True)
    try:
        start_warmer()
        print("Airdate warmer started", flush=True)
    except Exception as exc:
        print("Airdate warmer failed to start: %s" % exc, flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Series Radar API on :%d" % PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
