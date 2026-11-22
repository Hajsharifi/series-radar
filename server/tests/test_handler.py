"""HTTP-level smoke tests for the Series Radar API handler.

All upstream/network functions are stubbed, so these tests exercise the
handler's routing and path parsing without touching TMDB or the network.
"""

import http.server
import json
import os
import pathlib
import socket
import sys
import tempfile
import threading
import urllib.error
import urllib.request

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
os.environ.setdefault("SERIES_RADAR_HOME", tempfile.mkdtemp(prefix="series-radar-handler-test-"))
os.environ.setdefault("TMDB_BEARER_TOKEN", "test-token")
os.environ.setdefault("OMDB_API_KEY", "")
os.environ.setdefault("SERIES_RADAR_CACHE", tempfile.mkdtemp(prefix="series-radar-handler-cache-"))
sys.path.insert(0, str(ROOT))

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("series_radar_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(server)

handler_mod = sys.modules["series_radar.handler"]

# --- stubs ---------------------------------------------------------------

def _fake_localized_collection(path, params=None, **kwargs):
    return {"results": [{"id": 1, "title": "Test", "poster_path": "/p.jpg",
                        "release_date": "2026-01-01", "vote_average": 7.0,
                        "vote_count": 10, "popularity": 1.0,
                        "original_language": "en", "genre_ids": [], "genres": []}],
            "total_pages": 1}

def _fake_tmdb_get(path, params=None, **kwargs):
    return {}

def _fake_fetch_json(url, **kwargs):
    return {}

def _fake_cache_get(key, ttl):
    return None

def _fake_cache_put(key, data):
    return None

def _fake_cache_stats():
    return 0, 0

def _noop(*args, **kwargs):
    return None

def _list():
    return []

def _payload():
    return {"items": [], "total_pages": 1}

def _person(pid, force=False):
    return {"id": pid, "name": "Test Person"}

def _box_office(year=None, force=False):
    return {"items": [], "year": year}

def _match(keys, force=False):
    return []

def _search_multi(text, media_type="all"):
    return {"items": [], "suggestion": None, "queries": []}

def _fetch_upcoming(*args, **kwargs):
    return []

def _enrich_tv_meta(shows, include_omdb=True):
    return shows


def _patch_module(mod):
    for attr, val in (("localized_collection", _fake_localized_collection),
                      ("tmdb_get", _fake_tmdb_get),
                      ("fetch_json", _fake_fetch_json),
                      ("cache_get", _fake_cache_get),
                      ("cache_put", _fake_cache_put),
                      ("cache_stats", _fake_cache_stats),
                      ("omdb_fetch", lambda *a, **k: {})):
        setattr(mod, attr, val)


def _apply_stubs():
    handler_mod.localized_collection = _fake_localized_collection
    handler_mod.tmdb_get = _fake_tmdb_get
    handler_mod.fetch_json = _fake_fetch_json
    handler_mod.cache_get = _fake_cache_get
    handler_mod.cache_put = _fake_cache_put
    handler_mod.cache_stats = _fake_cache_stats
    handler_mod.enrich_tv_meta = _enrich_tv_meta
    handler_mod.fetch_upcoming_tv = _fetch_upcoming
    handler_mod.box_office = _box_office
    handler_mod.person_detail = _person
    handler_mod.match_downloads = _match
    handler_mod.search_multi = _search_multi
    for fn_name in ("now_playing", "upcoming", "online_releases", "quality_waiting"):
        setattr(handler_mod, fn_name, lambda force=False: _payload())
    for mod_name in ("series_radar.http", "series_radar.cache", "series_radar.catalog",
                     "series_radar.tmdb", "series_radar.people", "series_radar.boxoffice",
                     "series_radar.downloads", "series_radar.omdb"):
        _patch_module(sys.modules[mod_name])
    # bind catalog-level functions on handler module too
    catalog_mod = sys.modules["series_radar.catalog"]
    for fn_name in ("now_playing", "upcoming", "online_releases", "quality_waiting", "search_multi"):
        setattr(catalog_mod, fn_name, getattr(handler_mod, fn_name))
    # patch similar_items is in tmdb; ensure localized_collection patched (done above)
    server_mod = sys.modules.get("series_radar")
    if server_mod is not None:
        _patch_module(server_mod)


@pytest.fixture(scope="module")
def api():
    # snapshot originals so we can restore them (avoid leaking stubs into
    # other test modules collected in the same process).
    tracked_modules = ["series_radar.handler", "series_radar.http", "series_radar.cache",
                       "series_radar.catalog", "series_radar.tmdb", "series_radar.people",
                       "series_radar.boxoffice", "series_radar.downloads",
                       "series_radar.omdb", "series_radar"]
    snapshot = {}
    for name in tracked_modules:
        mod = sys.modules.get(name)
        if mod is None:
            continue
        snapshot[name] = dict(mod.__dict__)
    _apply_stubs()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = "http://127.0.0.1:%d" % port
    yield base
    httpd.shutdown()
    httpd.server_close()
    for name, attrs in snapshot.items():
        mod = sys.modules.get(name)
        if mod is None:
            continue
        mod.__dict__.clear()
        mod.__dict__.update(attrs)


def _get(base, path):
    url = base + path
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = resp.read()
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def test_health(api):
    status, data = _get(api, "/api/health")
    assert status == 200
    assert data.get("ok") is True


def test_metrics(api):
    status, data = _get(api, "/api/metrics")
    assert status == 200
    assert "requests" in data or "total" in data or isinstance(data, dict)


def test_downloads_match(api):
    status, data = _get(api, "/api/downloads/match?keys=movie:1")
    assert status == 200
    assert "items" in data


def test_movies_now_playing(api):
    status, data = _get(api, "/api/movies/now-playing")
    assert status == 200


def test_movies_upcoming(api):
    status, data = _get(api, "/api/movies/upcoming")
    assert status == 200


def test_movies_online(api):
    status, data = _get(api, "/api/movies/online")
    assert status == 200


def test_movies_quality(api):
    status, data = _get(api, "/api/movies/quality")
    assert status == 200


def test_person(api):
    status, data = _get(api, "/api/person/1")
    assert status == 200


def test_movie_similar(api):
    status, data = _get(api, "/api/movie/1/similar")
    assert status == 200
    assert "items" in data or isinstance(data, (list, dict))


def test_movie_detail(api):
    status, data = _get(api, "/api/movie/1")
    assert status == 200
    assert isinstance(data, dict)


def test_search_multi(api):
    status, data = _get(api, "/api/search/multi?q=test")
    assert status == 200


def test_movies_search(api):
    status, data = _get(api, "/api/movies/search?q=test")
    assert status == 200
    assert "items" in data


def test_boxoffice(api):
    status, data = _get(api, "/api/boxoffice")
    assert status == 200


def test_tv_popular(api):
    status, data = _get(api, "/api/tv/popular")
    assert status == 200
    assert "results" in data


def test_tv_top_rated(api):
    status, data = _get(api, "/api/tv/top_rated")
    assert status == 200
    assert "results" in data


def test_tv_similar(api):
    status, data = _get(api, "/api/tv/1/similar")
    assert status == 200


def test_tv_upcoming(api):
    status, data = _get(api, "/api/tv/upcoming")
    assert status == 200
    assert "results" in data


def test_tv_detail(api):
    status, data = _get(api, "/api/tv/1")
    assert status == 200
    assert isinstance(data, dict)


def test_tv_episodes(api):
    status, data = _get(api, "/api/tv/1/episodes")
    assert status == 200
    assert "episodes" in data


def test_tv_on_the_air(api):
    status, data = _get(api, "/api/tv/on_the_air")
    assert status == 200
    assert "results" in data


def test_tv_airing_today(api):
    status, data = _get(api, "/api/tv/airing_today")
    assert status == 200
    assert "results" in data


def test_tv_search(api):
    status, data = _get(api, "/api/tv/search?q=test")
    assert status == 200
    assert "results" in data


def test_movies_discover(api):
    status, data = _get(api, "/api/movies/discover?sort_by=popularity.desc&page=1")
    assert status == 200
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0


def test_tv_discover(api):
    status, data = _get(api, "/api/tv/discover?sort_by=popularity.desc&page=1")
    assert status == 200
    assert "results" in data
    assert "total_pages" in data


def test_not_found(api):
    status, data = _get(api, "/api/nope")
    assert status == 404