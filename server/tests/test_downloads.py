"""Tests for the Film2Media download-link adapter.

The fixtures are trimmed copies of real Film2Media pages (download boxes only),
so a markup change in the source is caught without any network access.
"""

import importlib.util
import pathlib
import tempfile
import os
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
os.environ.setdefault("SERIES_RADAR_HOME", tempfile.mkdtemp(prefix="series-radar-dl-"))
os.environ.setdefault("TMDB_BEARER_TOKEN", "test-token")
sys.path.insert(0, str(ROOT))

from series_radar import downloads as dl  # noqa: E402


MOVIE_PAGE = (FIXTURES / "movie-odyssey.html").read_text(encoding="utf-8")
SERIES_PAGE = (FIXTURES / "series-severance.html").read_text(encoding="utf-8")


def test_parse_key_accepts_only_stable_keys():
    assert dl.parse_key("movie:603692") == {"kind": "movie", "source": "tmdb", "id": 603692}
    assert dl.parse_key("series:tmdb:95396") == {"kind": "series", "source": "tmdb", "id": 95396}
    assert dl.parse_key("series:tvmaze:12345")["source"] == "tvmaze"
    for bad in ("movie:abc", "series:imdb:123", "movie:1:2", "http://x/1", ""):
        assert dl.parse_key(bad) is None


def test_fingerprint_ignores_volatile_query():
    a = "https://x.abrtech.top/p/S01E01.mkv?v=111"
    b = "https://x.abrtech.top/p/S01E01.mkv?v=999"
    assert dl.fingerprint(a) == dl.fingerprint(b)
    assert dl.fingerprint(a) != dl.fingerprint("https://x.abrtech.top/p/S01E02.mkv")


def test_movie_page_parses_every_quality_and_variant():
    groups = dl.parse_movie_page(MOVIE_PAGE)
    assert [group["kind"] for group in groups] == ["dubbled", "hardsub"]
    assert len(groups[0]["items"]) == 11
    assert len(groups[1]["items"]) == 12
    qualities = {item["quality"] for item in groups[0]["items"]}
    assert "BluRay 1080p" in qualities
    assert "BluRay 4K 2160p 10bit HDR" in qualities
    for item in groups[0]["items"]:
        assert item["links"]
        for link in item["links"]:
            assert link["url"].startswith("https://")
            assert link["filename"].endswith((".mkv", ".mka"))
            assert len(link["id"]) == 16
    note = groups[0]["items"][0]["note"]
    assert "IMAX" in note


def test_series_page_groups_episodes_by_season_and_quality():
    seasons = dl.parse_series_page(SERIES_PAGE)
    assert [season["number"] for season in seasons] == [1, 1, 2]
    first = seasons[0]["groups"][0]
    assert first["kind"] == "hardsub"
    assert len(first["episodes"]) == 27  # 9 episodes × 3 qualities
    assert {ep["quality"] for ep in first["episodes"]} == {
        "WEB-DL 1080p 10bit x265", "WEB-DL 480p", "WEB-DL 720p 10bit x265",
    }
    numbers = {ep["number"] for ep in first["episodes"]}
    assert numbers == set(range(1, 10))
    final = seasons[-1]["groups"][0]
    episode = next(ep for ep in final["episodes"] if ep["number"] == 10)
    assert "S02E10" in episode["links"][0]["filename"]


def test_matchers_reject_wrong_year_and_unrelated_titles():
    odyssey = {"url": "https://www.myf2ms.top/62388/the-odyssey-2026/", "title": "adiسه 2026 The Odyssey"}
    assert dl._matches_movie(odyssey, ["The Odyssey"], "2026")
    assert not dl._matches_movie(odyssey, ["The Odyssey"], "1997")
    old = {"url": "https://www.myf2ms.top/1501/the-odyssey-1997-farsi-dubbed/", "title": "The Odyssey"}
    assert dl._matches_movie(old, ["The Odyssey"], "1997")
    el_camino = {"url": "https://www.myf2ms.top/4492/breaking-bad-movie-2019/", "title": "Breaking Bad"}
    assert not dl._matches_movie(el_camino, ["Breaking Bad"], "2008")
    severance = {"url": "https://www.myf2ms.top/series/severance/", "title": "Severance"}
    assert dl._matches_series(severance, ["Severance"])
    assert not dl._matches_series(severance, ["The Last of Us"])


def test_resolve_key_returns_found_payload(monkeypatch):
    monkeypatch.setattr(dl, "metadata", lambda spec, refresh=False: {
        "title": "The Odyssey", "original": "The Odyssey", "year": "2026",
    })
    monkeypatch.setattr(dl, "_search", lambda kind, query, refresh=False: [
        {"url": "https://www.myf2ms.top/62388/the-odyssey-2026/", "title": "The Odyssey 2026"},
    ])
    monkeypatch.setattr(dl, "fetch_page", lambda url, refresh=False: MOVIE_PAGE)
    payload = dl.resolve_key("movie:603692")
    assert payload["status"] == "found"
    assert payload["source"]["url"].endswith("the-odyssey-2026/")
    assert len(payload["groups"]) == 2
    assert payload["checkedAt"].endswith("Z")


def test_source_errors_are_not_cached_as_missing(monkeypatch):
    key = "movie:12345"
    calls = []

    def boom(spec, refresh=False):
        calls.append(1)
        raise dl.SourceError("network down")

    monkeypatch.setattr(dl, "metadata", boom)
    first = dl.match_downloads([key])
    second = dl.match_downloads([key])
    assert first[0]["status"] == second[0]["status"] == "error"
    assert len(calls) == 2  # an error is retried on the next check


def test_none_results_are_cached_briefly(monkeypatch):
    key = "series:tmdb:999999"
    calls = []

    def meta(spec, refresh=False):
        calls.append(1)
        return {"title": "Missing Show", "original": "Missing Show", "year": "2020"}

    monkeypatch.setattr(dl, "metadata", meta)
    monkeypatch.setattr(dl, "_search", lambda *args, **kwargs: [])
    monkeypatch.setattr(dl, "_search_html", lambda *args, **kwargs: [])
    first = dl.match_downloads([key])
    second = dl.match_downloads([key])
    assert first[0]["status"] == second[0]["status"] == "none"
    assert len(calls) == 1
