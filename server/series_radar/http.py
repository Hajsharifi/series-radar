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


def localized_collection(path, base_params, cache_ttl=1800, cache_key_extra="", max_pages=1):
    """Fetch a TMDB list in fa-IR, filling missing text from en-US by id.
    
    If max_pages > 1, fetches multiple pages and merges results. The combined
    payload keeps the structure of the first page and extends results."""
    if max_pages <= 1:
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

    # Multi-page fetch
    all_fa_results = []
    all_en_results = []
    total_pages = 1
    for page in range(1, max_pages + 1):
        params = dict(base_params)
        params["page"] = page
        params["language"] = "fa-IR"
        fa_page = tmdb_get(path, params, cache_ttl, cache_key_extra=f"fa_{cache_key_extra}_p{page}")
        all_fa_results.extend(fa_page.get("results") or [])
        if page == 1:
            total_pages = fa_page.get("total_pages") or 1
        try:
            params["language"] = "en-US"
            en_page = tmdb_get(path, params, cache_ttl, cache_key_extra=f"en_{cache_key_extra}_p{page}")
            all_en_results.extend(en_page.get("results") or [])
        except Exception:
            pass
    en_by_id = {item.get("id"): item for item in all_en_results}
    merged = []
    for item in all_fa_results:
        fallback = en_by_id.get(item.get("id")) or {}
        if not (item.get("title") or item.get("name")):
            item["title"] = fallback.get("title") or fallback.get("name")
        if not (item.get("original_title") or item.get("original_name")):
            item["original_title"] = fallback.get("original_title") or fallback.get("original_name")
        if not item.get("overview"):
            item["overview"] = fallback.get("overview")
        merged.append(item)
    payload = dict(fa_page)  # use last page's metadata
    payload["results"] = merged
    payload["total_pages"] = total_pages
    return payload
