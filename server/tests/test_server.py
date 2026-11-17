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
