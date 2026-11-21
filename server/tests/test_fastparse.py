"""The optional Rust parser must stay interchangeable with the Python one."""

import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
os.environ.setdefault("SERIES_RADAR_HOME", tempfile.mkdtemp(prefix="series-radar-native-"))
os.environ.setdefault("TMDB_BEARER_TOKEN", "test-token")
sys.path.insert(0, str(ROOT))

from series_radar import downloads as dl  # noqa: E402
from series_radar import fastparse  # noqa: E402

MOVIE_PAGE = (FIXTURES / "movie-odyssey.html").read_text(encoding="utf-8")
SERIES_PAGE = (FIXTURES / "series-severance.html").read_text(encoding="utf-8")


def _reset_fastparse(monkeypatch):
    monkeypatch.setattr(fastparse, "_loaded", False)
    monkeypatch.setattr(fastparse, "_module", None)
    monkeypatch.setattr(fastparse, "_origin", None)


def test_public_parsers_match_the_python_originals():
    assert dl.parse_movie_page(MOVIE_PAGE) == dl._parse_movie_page_python(MOVIE_PAGE)
    assert dl.parse_series_page(SERIES_PAGE) == dl._parse_series_page_python(SERIES_PAGE)


def test_native_failure_falls_back_to_the_python_parser(monkeypatch):
    class Broken:
        def parse_series_page(self, *args, **kwargs):
            raise RuntimeError("native exploded")

    wrapped = dl._native_call(
        "parse_series_page", dl._parse_series_page_python, native_module=Broken()
    )
    assert wrapped(SERIES_PAGE) == dl._parse_series_page_python(SERIES_PAGE)


def test_missing_native_module_keeps_the_python_parser(monkeypatch):
    wrapped = dl._native_call("parse_series_page", dl._parse_series_page_python, native_module=None)
    assert wrapped is dl._parse_series_page_python


def test_parser_can_be_forced_back_to_python(monkeypatch):
    monkeypatch.setenv("SERIES_RADAR_PARSER", "python")
    _reset_fastparse(monkeypatch)
    assert fastparse.load() is None
    assert fastparse.origin().startswith("python")


def test_native_package_exports_the_same_entry_points():
    native = fastparse.load()
    if native is None:
        return
    for name in ("fingerprint", "elements", "parse_movie_page", "parse_series_page"):
        assert callable(getattr(native, name))
