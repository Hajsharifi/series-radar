"""Optional OMDB ratings."""

from .config import OMDB, OMDB_API_KEY
from .http import fetch_json


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
