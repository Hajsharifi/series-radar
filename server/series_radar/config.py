"""Environment, paths and shared constants."""

import datetime as dt
import os

PORT = int(os.environ.get("SERIES_RADAR_PORT", "8090"))
BASE_DIR = os.environ.get("SERIES_RADAR_HOME", "/opt/series-radar-api")
CACHE_DIR = os.environ.get("SERIES_RADAR_CACHE", os.path.join(BASE_DIR, "cache"))
TEHRAN_TZ = dt.timezone(dt.timedelta(hours=3, minutes=30))
TOKEN_FILE = os.environ.get("TMDB_TOKEN_FILE", os.path.join(BASE_DIR, "token"))
TMDB = "https://api.themoviedb.org/3"
TVMaze = "https://api.tvmaze.com"
BOM = "https://www.boxofficemojo.com"
OMDB = "http://www.omdbapi.com"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

os.makedirs(CACHE_DIR, exist_ok=True)


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
OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "")
CACHE_MAX_AGE = int(os.environ.get("SERIES_RADAR_CACHE_MAX_AGE", str(30 * 86400)))


def today_tehran():
    """Current date in Asia/Tehran (Iran has no DST since 2022)."""
    return dt.datetime.now(TEHRAN_TZ).date()
