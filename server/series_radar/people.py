"""TMDB person profiles and combined credits."""

from .cache import cache_get, cache_put
from .config import TMDB, TMDB_HEADERS
from .http import fetch_json
from .tmdb import image_path


def _raw_person(person_id):
    url = "%s/person/%s?append_to_response=combined_credits,external_ids&language=fa-IR" % (TMDB, person_id)
    try:
        data = fetch_json(url, headers=TMDB_HEADERS, timeout=20)
    except Exception:
        data = {}
    # Per-field English fallback for biographies and missing names.
    if not data.get("name") or not data.get("biography"):
        try:
            english = fetch_json(url.replace("fa-IR", "en-US"), headers=TMDB_HEADERS, timeout=20)
            for field in ("name", "biography", "place_of_birth", "known_for_department"):
                if not data.get(field) and english.get(field):
                    data[field] = english[field]
            if not data.get("combined_credits"):
                data["combined_credits"] = english.get("combined_credits") or {}
        except Exception:
            pass
    return data


def norm_person(data):
    combined = data.get("combined_credits") or {}
    credits = []
    seen = set()
    for item in (combined.get("cast") or []) + (combined.get("crew") or []):
        media = item.get("media_type")
        if media not in ("movie", "tv"):
            continue
        key = (media, item.get("id"))
        if not item.get("id") or key in seen:
            continue
        seen.add(key)
        title = item.get("title") or item.get("name") or "بدون عنوان"
        date = (item.get("release_date") or item.get("first_air_date") or "")[:10]
        credits.append({
            "mediaType": media,
            "id": item.get("id"),
            "title": title,
            "originalTitle": item.get("original_title") or item.get("original_name"),
            "character": item.get("character") or item.get("job") or None,
            "date": date or None,
            "posterPath": image_path(item.get("poster_path")),
            "rating": round(float(item.get("vote_average") or 0), 1),
            "popularity": item.get("popularity") or 0,
        })
    credits.sort(key=lambda entry: entry.get("date") or "0000", reverse=True)
    return {
        "id": data.get("id"),
        "name": data.get("name") or "بدون نام",
        "biography": data.get("biography") or "",
        "profilePath": image_path(data.get("profile_path")),
        "birthday": data.get("birthday") or None,
        "deathday": data.get("deathday") or None,
        "placeOfBirth": data.get("place_of_birth") or None,
        "knownForDepartment": data.get("known_for_department") or None,
        "imdbId": (data.get("external_ids") or {}).get("imdb_id"),
        "credits": credits[:60],
    }


def person_detail(person_id, force=False):
    key = "person_detail_%s" % person_id
    if not force:
        cached = cache_get(key, 86400)
        if cached is not None:
            return cached
    payload = norm_person(_raw_person(person_id))
    cache_put(key, payload)
    return payload
