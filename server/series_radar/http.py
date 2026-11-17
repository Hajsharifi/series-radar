"""Low-level HTTP helpers and TMDB list access."""

import json
import re
import urllib.parse
import urllib.request

from .cache import cache_get, cache_put
from .config import TMDB, TMDB_TOKEN, UA


def fetch_json(url, headers=None, timeout=35):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", "ignore"))


def fetch_text(url, timeout=35):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "ignore")


def tmdb_get(path, params=None, cache_ttl=1800, cache_key_extra=""):
    query = dict(params or {})
    key = "tmdb_" + path.strip("/").replace("/", "_") + "_" + cache_key_extra
    if not cache_key_extra:
        key += "_" + re.sub(r"[^a-zA-Z0-9_.-]", "_", urllib.parse.urlencode(sorted(query.items())))[:120]
    cached = cache_get(key, cache_ttl)
    if cached is not None:
        return cached
    url = TMDB + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = fetch_json(url, headers={"Authorization": "Bearer " + TMDB_TOKEN, "Accept": "application/json"})
    cache_put(key, data)
    return data


def localized_collection(path, base_params, cache_ttl=1800, cache_key_extra=""):
    """Fetch a TMDB list in fa-IR, filling missing text from en-US by id."""
    fa_params = dict(base_params)
    fa_params["language"] = "fa-IR"
    en_params = dict(base_params)
    en_params["language"] = "en-US"
    fa = tmdb_get(path, fa_params, cache_ttl, cache_key_extra="fa_" + cache_key_extra)
    en = {}
    try:
        en = tmdb_get(path, en_params, cache_ttl, cache_key_extra="en_" + cache_key_extra)
    except Exception:
        pass
    en_by_id = {item.get("id"): item for item in (en.get("results") or [])}
    merged = []
    for item in (fa.get("results") or []):
        fallback = en_by_id.get(item.get("id")) or {}
        if not (item.get("title") or item.get("name")):
            item["title"] = fallback.get("title") or fallback.get("name")
        if not (item.get("original_title") or item.get("original_name")):
            item["original_title"] = fallback.get("original_title") or fallback.get("original_name")
        if not item.get("overview"):
            item["overview"] = fallback.get("overview")
        merged.append(item)
    payload = dict(fa)
    payload["results"] = merged
    return payload
