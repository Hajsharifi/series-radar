"""TMDB normalization and detail endpoints."""

import concurrent.futures

from .cache import cache_get, cache_put
from .config import TMDB, TMDB_HEADERS, TMDB_TOKEN
from .http import fetch_json, localized_collection, tmdb_get
from .omdb import omdb_fetch
from .text import normalize_title


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
            "id": person.get("id"),
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


def director_ids_from_credits(credits):
    result = []
    for person in ((credits or {}).get("crew") or []):
        person_id = person.get("id")
        if person.get("job") in ("Director", "Co-Director") and person_id and person_id not in result:
            result.append(person_id)
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
            "directorIds": director_ids_from_credits(credits),
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
        "createdByIds": [p.get("id") for p in (detail.get("created_by") or []) if p.get("id")],
        "directors": directors_from_credits(detail.get("credits")),
        "directorIds": director_ids_from_credits(detail.get("credits")),
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
    key = "tv_detail_v3_%s" % show_id
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
    key = "movie_detail_v3_%s" % movie_id
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
