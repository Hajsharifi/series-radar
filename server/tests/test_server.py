"""Focused tests for the Series Radar data service.

The module reads its token/cache paths at import time, so the environment is
prepared before loading it. No network calls are made here.
"""

import datetime as dt
import importlib.util
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
os.environ.setdefault("SERIES_RADAR_HOME", tempfile.mkdtemp(prefix="series-radar-test-"))
os.environ.setdefault("TMDB_BEARER_TOKEN", "test-token")
sys.path.insert(0, str(ROOT))

from series_radar import cache as cache_module  # noqa: E402
from series_radar.people import norm_person  # noqa: E402


def load_server():
    spec = importlib.util.spec_from_file_location("series_radar_server", ROOT / "server.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


server = load_server()


def test_cast_orders_by_billing_and_limits():
    credits = {
        "cast": [
            {"name": "Third", "character": "C", "order": 3},
            {"name": "First", "character": "A", "order": 1},
            {"name": "Second", "character": "B", "order": 2},
        ]
    }
    cast = server.cast_from_credits(credits, limit=2)
    assert [person["name"] for person in cast] == ["First", "Second"]
    assert cast[0]["character"] == "A"


def test_directors_are_unique_and_ignore_other_jobs():
    credits = {
        "crew": [
            {"name": "Denis", "job": "Director"},
            {"name": "Denis", "job": "Producer"},
            {"name": "Denis", "job": "Director"},
            {"name": "Someone", "job": "Writer"},
        ]
    }
    assert server.directors_from_credits(credits) == ["Denis"]


def test_pick_release_dates_prefers_us_and_keeps_order():
    detail = {
        "release_dates": {
            "results": [
                {
                    "iso_3166_1": "US",
                    "release_dates": [
                        {"type": 3, "release_date": "2026-03-01T00:00:00.000Z", "certification": "PG-13"},
                        {"type": 4, "release_date": "2026-04-10T00:00:00.000Z"},
                        {"type": 5, "release_date": "2026-05-01T00:00:00.000Z"},
                    ],
                },
                {
                    "iso_3166_1": "GB",
                    "release_dates": [{"type": 3, "release_date": "2026-02-01T00:00:00.000Z"}],
                },
            ]
        }
    }
    dates = server.pick_release_dates(detail)
    assert dates["theatricalDate"] == "2026-03-01"
    assert dates["digitalDate"] == "2026-04-10"
    assert dates["physicalDate"] == "2026-05-01"
    assert dates["certification"] == "PG-13"


def test_archived_rules():
    today = dt.date(2026, 11, 17)
    assert server.is_archived_movie({"digitalDate": "2026-11-01"}, today) is True
    assert server.is_archived_movie({"digitalDate": "2026-12-01"}, today) is False
    assert server.is_archived_movie({"theatricalDate": "2026-06-01"}, today) is True
    assert server.is_archived_movie({"theatricalDate": "2026-10-01"}, today) is False


def test_slim_search_dates_reuses_existing_fields():
    payload = {
        "theatricalDate": "2026-01-01",
        "digitalDate": "2026-02-01",
        "physicalDate": None,
        "certification": "R",
        "imdbId": "tt1",
    }
    slim = server.slim_search_dates(payload)
    assert slim["digitalDate"] == "2026-02-01"
    assert slim["imdbId"] == "tt1"


def test_norm_tv_show_maps_next_episode_and_names():
    raw = {
        "id": 42,
        "name": "Test Show",
        "original_name": "Test Show",
        "first_air_date": "2020-01-01",
        "vote_average": 8.25,
        "vote_count": 120,
        "next_episode_to_air": {
            "id": 7,
            "season_number": 3,
            "episode_number": 4,
            "name": "Episode 4",
            "air_date": "2026-11-20",
            "overview": "Next",
        },
        "networks": [{"name": "HBO"}],
        "genres": [{"name": "Drama"}],
    }
    show = server.norm_tv_show(raw)
    assert show["title"] == "Test Show"
    assert show["rating"] == 8.2
    assert show["votes"] == 120
    assert show["nextEpisode"]["season"] == 3
    assert show["nextEpisode"]["number"] == 4
    assert show["networkNames"] == ["HBO"]
    assert show["genres"] == ["Drama"]


def test_prune_cache_removes_only_stale_json(tmp_path, monkeypatch):
    old = tmp_path / "old.json"
    fresh = tmp_path / "fresh.json"
    old.write_text("{}", encoding="utf-8")
    fresh.write_text("{}", encoding="utf-8")
    stale_time = 1_000_000
    os.utime(old, (stale_time, stale_time))
    monkeypatch.setattr(cache_module, "CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(cache_module, "CACHE_MAX_AGE", 3600)
    monkeypatch.setattr(cache_module, "LAST_PRUNE", 0.0)
    server.prune_cache(force=True)
    assert not old.exists()
    assert fresh.exists()


def test_norm_person_dedupes_and_sorts_credits():
    data = {
        "id": 1,
        "name": "Actor",
        "biography": "Bio",
        "profile_path": "/p.jpg",
        "known_for_department": "Acting",
        "combined_credits": {
            "cast": [
                {"media_type": "movie", "id": 10, "title": "Old", "release_date": "2020-01-01", "poster_path": "/a.jpg", "vote_average": 7.0},
                {"media_type": "tv", "id": 11, "name": "New Show", "first_air_date": "2026-01-01", "poster_path": "/b.jpg", "vote_average": 8.0},
                {"media_type": "movie", "id": 10, "title": "Old duplicate", "release_date": "2020-01-01"},
                {"media_type": "person", "id": 12, "name": "Ignore"},
            ],
            "crew": [],
        },
    }
    person = norm_person(data)
    assert person["name"] == "Actor"
    assert person["profilePath"] == "/p.jpg"
    assert len(person["credits"]) == 2
    assert person["credits"][0]["id"] == 11
    assert person["credits"][1]["id"] == 10


def _stub_upcoming_cache(monkeypatch):
    from series_radar import tmdb as tmdb_module

    monkeypatch.setattr(tmdb_module, "cache_get", lambda key, ttl: None)
    monkeypatch.setattr(tmdb_module, "cache_put", lambda key, data: None)
    monkeypatch.setattr(tmdb_module, "enrich_tv_meta", lambda shows, include_omdb=True: shows)
    return tmdb_module


def test_upcoming_tv_merges_both_discover_queries_and_dedupes(monkeypatch):
    import datetime as dt

    tmdb_module = _stub_upcoming_cache(monkeypatch)
    captured = []

    def fake_collection(path, base_params, cache_ttl=1800, cache_key_extra="", max_pages=1):
        captured.append(dict(base_params))
        if "air_date.gte" in base_params:
            return {"results": [{"id": 171802, "name": "Blade Runner 2099", "first_air_date": "2026-11-25"}]}
        if "first_air_date.gte" in base_params:
            return {"results": [
                {"id": 171802, "name": "Blade Runner 2099", "first_air_date": "2026-11-25"},
                {"id": 42, "name": "Other Show", "first_air_date": "2026-12-01"},
            ]}
        return {"results": []}

    monkeypatch.setattr(tmdb_module, "localized_collection", fake_collection)

    result = tmdb_module.fetch_upcoming_tv(today=dt.date(2026, 11, 21))

    assert [item["id"] for item in result] == [171802, 42]
    assert len(captured) == 2
    assert captured[0]["air_date.gte"] == "2026-11-21"
    assert captured[0]["air_date.lte"] == "2027-02-19"
    assert captured[1]["first_air_date.gte"] == "2026-11-21"
    assert captured[1]["first_air_date.lte"] == "2027-05-20"
    assert all(params["sort_by"] == "popularity.desc" for params in captured)


def test_upcoming_tv_survives_one_failed_query(monkeypatch):
    import datetime as dt

    tmdb_module = _stub_upcoming_cache(monkeypatch)

    def fail_one(path, base_params, **kwargs):
        if "air_date.gte" in base_params:
            raise RuntimeError("upstream down")
        return {"results": [{"id": 7, "name": "Survivor", "first_air_date": "2026-12-01"}]}

    monkeypatch.setattr(tmdb_module, "localized_collection", fail_one)
    assert [item["id"] for item in tmdb_module.fetch_upcoming_tv(today=dt.date(2026, 11, 21))] == [7]

    def fail_both(path, base_params, **kwargs):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(tmdb_module, "localized_collection", fail_both)
    assert tmdb_module.fetch_upcoming_tv(today=dt.date(2026, 11, 21)) == []


def test_upcoming_tv_caps_at_80(monkeypatch):
    import datetime as dt

    tmdb_module = _stub_upcoming_cache(monkeypatch)
    many = [{"id": i, "name": "Show %d" % i, "first_air_date": "2026-12-01"} for i in range(100)]

    def fake_collection(path, base_params, **kwargs):
        return {"results": many if "air_date.gte" in base_params else []}

    monkeypatch.setattr(tmdb_module, "localized_collection", fake_collection)
    assert len(tmdb_module.fetch_upcoming_tv(today=dt.date(2026, 11, 21))) == 80
