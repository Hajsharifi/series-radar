"""Film2Media download-link adapter.

The client sends only stable keys (``movie:<tmdbId>`` /
``series:<tmdb|tvmaze>:<id>``). This module resolves the metadata, finds the
matching page on www.myf2ms.top, parses its download boxes and returns a
cacheable, normalised payload. A source or network failure is reported as
``status: "error"`` so neither the UI nor the background worker treats it as
"no link available".
"""

import datetime as dt
import hashlib
import html as htmlmod
import json
import re
import sys
import concurrent.futures
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import fastparse
from .cache import cache_get, cache_put
from .config import UA
from .http import fetch_json, tmdb_get

SOURCE = "https://www.myf2ms.top"
SOURCE_UA = UA + " SeriesRadar/1.0"
TIMEOUT = 18
MAX_KEYS = 40
CACHE_PREFIX = "dl:v1:"
CACHE_FOUND = 1800
CACHE_NONE = 900
MIN_INTERVAL = 0.7

_HTTP_LOCK = threading.Lock()
_LAST_REQUEST = 0.0

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
MEDIA_EXT = re.compile(r"\.(mkv|mp4|mov|avi|webm|m4v|ts)(\?|$)", re.I)
SEASON_EPISODE = re.compile(r"(?:^|[^a-z0-9])[sS](\d{1,2})[eE](\d{1,3})(?:[^0-9]|$)")


class SourceError(Exception):
    """Network/source-side failure — must never be cached as 'none'."""


# ---------------------------------------------------------------------------
# Keys, fingerprints and small helpers
# ---------------------------------------------------------------------------

def parse_key(key):
    """Return a stable spec for a client key, or None when it is malformed."""
    if not isinstance(key, str):
        return None
    parts = key.strip().split(":")
    if len(parts) == 2 and parts[0] == "movie" and parts[1].isdigit():
        return {"kind": "movie", "source": "tmdb", "id": int(parts[1])}
    if (len(parts) == 3 and parts[0] == "series"
            and parts[1] in ("tmdb", "tvmaze") and parts[2].isdigit()):
        return {"kind": "series", "source": parts[1], "id": int(parts[2])}
    return None


def fingerprint(url):
    """Stable id for a link: volatile ``?v=`` tokens are deliberately dropped."""
    parsed = urllib.parse.urlsplit(url or "")
    clean = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    return hashlib.sha1(clean.encode("utf-8")).hexdigest()[:16]


def group_id(*parts):
    raw = "|".join(str(part or "") for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def is_cinema_rip_quality(quality):
    """Low-quality cinema-screen rips (HDTS / پرده سینما) the user does not want."""
    if not quality:
        return False
    q = str(quality).lower()
    return ("hdts" in q or "پرده" in q or "camrip" in q
            or q.strip() in ("cam", "ts", "telesync"))


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _clean_text(fragment):
    text = re.sub(r"<[^>]+>", " ", fragment or "")
    text = htmlmod.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _slug(text):
    text = htmlmod.unescape(text or "").lower()
    text = re.sub(r"[^a-z0-9]{1,}", "-", text)
    return text.strip("-")


def _tokens(text):
    return set(part for part in _slug(text).split("-") if len(part) > 1)


def _label_value(fragment, label):
    pattern = re.compile(
        r"<span[^>]*>\s*" + re.escape(label) + r"\s*:?\s*</span>(.*?)(?=<div|</div>|$)",
        re.S | re.I,
    )
    match = pattern.search(fragment or "")
    if not match:
        return ""
    value = re.sub(r"<[^>]+>", " ", match.group(1))
    value = htmlmod.unescape(value)
    value = re.sub(r"\s+", " ", value).strip(" :\u00a0")
    return "" if value in ("—", "-", "&mdash;") else value


# ---------------------------------------------------------------------------
# Minimal HTML access — balanced element extraction, no third-party deps
# ---------------------------------------------------------------------------

def _element_matches(html, tag):
    return list(re.finditer(r"<" + tag + r"\b([^>]*)>", html, re.I))


def _close_after(html, start, tag):
    """Find the index just after the closing tag matching the one at *start*."""
    depth = 0
    token = re.compile(r"<\s*(/?)\s*" + tag + r"\b[^>]*>", re.I)
    for match in token.finditer(html, start):
        if match.group(1):
            depth -= 1
            # The outer opening tag is consumed before this scan; its matching
            # close is the one that takes the counter below zero.
            if depth < 0:
                return match.end()
        elif not match.group(0).rstrip().endswith("/") and tag not in VOID_TAGS:
            depth += 1
    return -1


def elements(html, tag, class_name=None):
    """Return ``(start, end, outer_html, inner_html)`` for matching elements."""
    found = []
    for match in _element_matches(html, tag):
        attrs = match.group(1)
        if class_name:
            classes = re.search(r"class\s*=\s*[\"']([^\"']*)[\"']", attrs, re.I)
            if not classes or not re.search(r"\b" + re.escape(class_name) + r"\b", classes.group(1)):
                continue
        end = _close_after(html, match.end(), tag)
        if end < 0:
            continue
        found.append((match.start(), end, html[match.start():end], html[match.end():end]))
    return found


def _attr(tag_html, name):
    match = re.search(r"\b" + re.escape(name) + r"\s*=\s*([\"'])(.*?)\1", tag_html, re.S | re.I)
    return htmlmod.unescape(match.group(2)) if match else ""


def _first_tag(html, tag, class_name=None):
    found = elements(html, tag, class_name)
    return found[0] if found else None


def _is_media_url(url):
    if not url or url.startswith("#") or "playit=" in url or "require-login" in url:
        return False
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.netloc or "").lower()
    if any(bad in host for bad in ("subzone", "myf2ms.top")):
        return False
    return bool(MEDIA_EXT.search(parsed.path)) or "abrtech.top" in host or "mehracdn.com" in host


def _links(fragment, preferred_label=""):
    """Collect direct download anchors, de-duplicating the player icon copy."""
    by_url = {}
    for _, _, outer, inner in elements(fragment, "a"):
        tag = outer[:outer.find(">") + 1]
        href = _attr(tag, "href")
        candidates = []
        if _is_media_url(href):
            candidates.append(href)
        onclick = _attr(tag, "onclick")
        for quoted in re.findall(r"handleDownloadClick\(\s*['\"]([^'\"]+)['\"]", onclick, re.I):
            if _is_media_url(quoted):
                candidates.append(quoted)
        if not candidates:
            continue
        label = _clean_text(inner) or preferred_label
        for url in candidates:
            ident = fingerprint(url)
            old = by_url.get(ident)
            if old is None or (not old["label"] and label):
                by_url[ident] = {
                    "id": ident,
                    "url": url,
                    "label": label or "دانلود",
                    "filename": urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]),
                }
    return list(by_url.values())


def _link_meta(links):
    for link in links:
        match = SEASON_EPISODE.search(link["filename"])
        if match:
            return int(match.group(1)), int(match.group(2))
    return None, None


# ---------------------------------------------------------------------------
# Page parsers
# ---------------------------------------------------------------------------

def parse_movie_page(page_html):
    """Parse a movie page into quality/variant groups with direct links.
    Deduplicates groups/links and guards against nested structures.
    Keeps all items (same quality with different encoders/notes are preserved)."""
    groups = []
    processed_group_ids = set()
    for _, _, outer, block in elements(page_html, "div", "download-list"):
        title = _first_tag(block, "p", "title")
        label = _clean_text(title[3]) if title else "دانلود"
        kind = ""
        first_tag = re.search(r"<div\b[^>]*>", outer)
        classes = _attr(first_tag.group(0), "class").lower() if first_tag else ""
        for candidate in ("dubbled", "hardsub", "softsub"):
            if candidate in classes:
                kind = candidate
                break
        group_id_key = group_id(kind, label, "movie")
        if group_id_key in processed_group_ids:
            continue
        processed_group_ids.add(group_id_key)
        
        items = []
        for _, _, _, li in elements(block, "li"):
            quality = _label_value(li, "کیفیت")
            if not quality:
                continue
            if is_cinema_rip_quality(quality):
                continue
            
            links = _links(li, "دانلود مستقیم")
            if not links:
                continue
            # Deduplicate links only
            unique_links = []
            seen_link_ids = set()
            for link in links:
                if link["id"] not in seen_link_ids:
                    unique_links.append(link)
                    seen_link_ids.add(link["id"])
            
            encoder = _label_value(li, "انکودر")
            items.append({
                "id": group_id(kind, quality, encoder or "unknown", "movie"),
                "quality": quality,
                "encoder": encoder,
                "note": _label_value(li, "توضیحات"),
                "size": _label_value(li, "میانگین حجم"),
                "links": unique_links,
            })
        if items:
            groups.append({
                "id": group_id_key,
                "label": label,
                "kind": kind,
                "items": items,
            })
    return groups


_PERSIAN_SEASON = {
    "اول": 1, "اولین": 1, "دوم": 2, "دومین": 2, "سوم": 3, "سومین": 3,
    "چهارم": 4, "چهارمین": 4, "پنجم": 5, "پنجمین": 5,
    "ششم": 6, "هفتم": 7, "هشتم": 8, "نهم": 9, "دهم": 10,
}


def _season_from_label(label):
    match = re.search(r"فصل\s*(\d+|[^\s]+)", label or "")
    if not match:
        return None
    raw = match.group(1)
    if raw.isdigit():
        return int(raw)
    return _PERSIAN_SEASON.get(raw)


def parse_series_page(page_html):
    """Parse a series page into seasons, variants and per-episode links.
    Deduplicates groups/episodes/links and guards against nested structures.
    Keeps separate variants (dubbled/hardsub/softsub) for the same season."""
    seasons = []
    # Track processed season+variant combinations to avoid true duplicates
    # while allowing different variants (dubbled vs hardsub) for same season
    processed_season_variants = set()
    
    for _, _, season_outer, season_inner in elements(page_html, "div", "download-season"):
        box = re.search(r'data-bs-target\s*=\s*["\']#(season-dlbox\d+)', season_outer)
        heading = ""
        if box:
            heading_match = re.search(
                r"<button\b[^>]*data-bs-target\s*=\s*[\"']#" + re.escape(box.group(1))
                + r"[\"'][^>]*>(.*?)</button>", page_html, re.S | re.I)
            if heading_match:
                heading = _clean_text(heading_match.group(1))
        season_fallback = _season_from_label(heading)
        season_number = season_fallback or 0
        
        # We'll determine the variant kind from the first group
        # For now, process all download-season blocks; dedupe at group level
        
        groups = []
        processed_group_ids = set()
        
        for _, _, outer, block in elements(season_inner, "div", "download-list"):
            first_tag = re.search(r"<div\b[^>]*>", outer)
            classes = _attr(first_tag.group(0), "class").lower() if first_tag else ""
            kind = next((c for c in ("dubbled", "hardsub", "softsub") if c in classes), "")
            title = _first_tag(block, "p", "title")
            label = _clean_text(title[3]) if title else "دانلود"
            group_id_key = group_id(kind, label, "series", season_fallback)
            
            # Skip duplicate groups (same kind+label+season)
            if group_id_key in processed_group_ids:
                continue
            processed_group_ids.add(group_id_key)
            
            episodes = {}
            processed_ep_keys = set()
            
            for _, _, _, li in elements(block, "li"):
                quality = _label_value(li, "کیفیت")
                if not quality:
                    continue
                if is_cinema_rip_quality(quality):
                    continue
                # A quality variant has one row per episode inside
                # ``series-downloaditems``; a plain li holds its links directly.
                rows = []
                processed_row_starts = set()
                for _, _, _, row in elements(li, "div", "d-flex"):
                    # Guard against nested d-flex elements
                    row_start = row[:100] if isinstance(row, str) else str(row)[:100]
                    if row_start in processed_row_starts:
                        continue
                    if _links(row):
                        rows.append(row)
                        processed_row_starts.add(row_start)
                if not rows:
                    rows = [li]
                for row in rows:
                    links = _links(row)
                    if not links:
                        continue
                    season_no, episode_no = _link_meta(links)
                    if season_no is None:
                        season_no = season_fallback
                    if episode_no is None:
                        match = re.search(r"قسمت\s*(\d+)", _clean_text(row))
                        episode_no = int(match.group(1)) if match else 0
                    if season_no is None:
                        season_no = 0
                    key = (season_no, episode_no, quality)
                    
                    # Skip duplicate episodes
                    if key in processed_ep_keys:
                        # Still merge any new links
                        entry = episodes.get(key)
                        if entry:
                            for link in links:
                                if not any(old["id"] == link["id"] for old in entry["links"]):
                                    entry["links"].append(link)
                        continue
                    processed_ep_keys.add(key)
                    
                    entry = episodes.setdefault(key, {
                        "season": season_no,
                        "number": episode_no,
                        "label": "قسمت " + str(episode_no).zfill(2),
                        "quality": quality,
                        "encoder": _label_value(li, "انکودر"),
                        "size": _label_value(li, "میانگین حجم"),
                        "links": [],
                    })
                    for link in links:
                        if not any(old["id"] == link["id"] for old in entry["links"]):
                            entry["links"].append(link)
            if episodes:
                groups.append({
                    "id": group_id_key,
                    "label": label,
                    "kind": kind,
                    "quality": sorted({ep["quality"] for ep in episodes.values()}),
                    "episodes": [episodes[key] for key in sorted(episodes)],
                })
        if groups:
            # Use the first group's season number, or fallback
            number = None
            for group in groups:
                for episode in group["episodes"]:
                    if episode["season"]:
                        number = episode["season"]
                        break
                if number:
                    break
            if number is None:
                number = season_fallback
            
            # Create a composite key for this season variant (season + variant kind)
            # This allows multiple variants (dubbled/hardsub) for the same season
            variant_key = (number or 0, tuple(sorted(g["kind"] for g in groups)))
            if variant_key in processed_season_variants:
                # This exact combination of variants for this season already processed
                continue
            processed_season_variants.add(variant_key)
            
            seasons.append({
                "number": number or 0,
                "label": _clean_text(heading) or ("فصل " + str(number) if number else "فصل"),
                "groups": groups,
            })
    seasons.sort(key=lambda season: season["number"] or 0)
    return seasons


# ---------------------------------------------------------------------------
# Optional Rust parser (identical output, faster on large pages)
# ---------------------------------------------------------------------------

_parse_series_page_python = parse_series_page
_parse_movie_page_python = parse_movie_page
native_parser = fastparse.load()


_GLOBAL_NATIVE = object()


def _native_call(native_name, python_fn, native_module=_GLOBAL_NATIVE):
    module = native_parser if native_module is _GLOBAL_NATIVE else native_module
    native = getattr(module, native_name, None) if module else None
    if native is None:
        return python_fn

    def call(*args, **kwargs):
        try:
            return native(*args, **kwargs)
        except Exception as error:  # noqa: BLE001 - never lose a parse to the fast path
            print(
                "[series-radar] native %s failed (%s); using the Python parser"
                % (native_name, error),
                file=sys.stderr,
            )
            return python_fn(*args, **kwargs)

    call.__name__ = python_fn.__name__
    call.__doc__ = python_fn.__doc__
    return call


parse_series_page = _native_call("parse_series_page", _parse_series_page_python)
parse_movie_page = _native_call("parse_movie_page", _parse_movie_page_python)
print("[series-radar] download parser: %s" % fastparse.origin(), file=sys.stderr)


# ---------------------------------------------------------------------------
# Source HTTP with a small courtesy delay and ETag revalidation
# ---------------------------------------------------------------------------

def _throttled():
    global _LAST_REQUEST
    with _HTTP_LOCK:
        wait = MIN_INTERVAL - (time.monotonic() - _LAST_REQUEST)
        if wait > 0:
            time.sleep(wait)
        _LAST_REQUEST = time.monotonic()


def _get(url, headers=None, timeout=TIMEOUT):
    _throttled()
    request = urllib.request.Request(url, headers=dict(headers or {}, **{"User-Agent": SOURCE_UA}))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return error.code, dict(error.headers.items()), b""
        raise SourceError("source HTTP %s" % error.code) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise SourceError("source unreachable: %s" % error) from error


def fetch_page(url, refresh=False):
    """Fetch a Film2Media page, using a cached body on a 304 response."""
    key = "f2m:html:" + hashlib.sha1(url.encode("utf-8")).hexdigest()
    cached = cache_get(key, CACHE_FOUND)
    headers = {"Accept": "text/html,application/xhtml+xml", "Accept-Language": "fa-IR,en;q=0.8"}
    if cached and not refresh and cached.get("etag"):
        headers["If-None-Match"] = cached["etag"]
    status, response_headers, body = _get(url, headers)
    if status == 304 and cached:
        return cached["html"]
    if status != 200:
        if cached and status == 404:
            return cached["html"]
        if status == 404:
            return ""
        raise SourceError("page HTTP %s" % status)
    page = body.decode("utf-8", "ignore")
    cache_put(key, {
        "html": page,
        "etag": response_headers.get("ETag") or response_headers.get("etag") or "",
    })
    return page


def _search(kind, query, refresh=False):
    query = (query or "").strip()
    if len(query) < 3:
        return []
    endpoint = "series" if kind == "series" else "posts"
    url = SOURCE + "/wp-json/wp/v2/" + endpoint + "?" + urllib.parse.urlencode({
        "search": query, "per_page": 8,
        "_fields": "id,link,title,date",
    })
    key = "f2m:search:" + endpoint + ":" + hashlib.sha1(query.lower().encode("utf-8")).hexdigest()
    if not refresh:
        cached = cache_get(key, CACHE_FOUND)
        if cached is not None:
            return cached
    status, _, body = _get(url)
    if status != 200:
        if status == 404:
            return []
        raise SourceError("search HTTP %s" % status)
    try:
        data = json.loads(body.decode("utf-8", "ignore"))
    except ValueError as error:
        raise SourceError("invalid search response") from error
    results = []
    for item in data if isinstance(data, list) else []:
        link = item.get("link") or ""
        title = _clean_text((item.get("title") or {}).get("rendered", ""))
        if link:
            results.append({"url": link, "title": title})
    cache_put(key, results)
    return results


def _search_html(kind, query, refresh=False):
    """Fallback for pages the REST search does not expose."""
    url = SOURCE + ("/series/" if kind == "series" else "/") + "?" + urllib.parse.urlencode({"s": query})
    key = "f2m:htmlsearch:" + kind + ":" + hashlib.sha1(query.lower().encode("utf-8")).hexdigest()
    if not refresh:
        cached = cache_get(key, CACHE_FOUND)
        if cached is not None:
            return cached
    status, _, body = _get(url)
    if status != 200:
        return []
    page = body.decode("utf-8", "ignore")
    pattern = (r'href=["\'](https://www\.myf2ms\.top/series/[^"\'#?]+/)["\']'
               if kind == "series" else
               r'href=["\'](https://www\.myf2ms\.top/\d+/[^"\'#?]+/)["\']')
    results = []
    seen = set()
    for match in re.finditer(pattern, page, re.I):
        link = htmlmod.unescape(match.group(1))
        if link in seen:
            continue
        seen.add(link)
        results.append({"url": link, "title": ""})
        if len(results) >= 8:
            break
    cache_put(key, results)
    return results


# ---------------------------------------------------------------------------
# Metadata resolution and matching
# ---------------------------------------------------------------------------

def metadata(spec, refresh=False):
    if spec["kind"] == "movie":
        data = tmdb_get("/movie/%d" % spec["id"], {"language": "en-US"},
                        cache_ttl=86400, cache_key_extra="dl")
        return {
            "title": data.get("title") or "",
            "original": data.get("original_title") or "",
            "year": (data.get("release_date") or "")[:4],
        }
    if spec["source"] == "tmdb":
        data = tmdb_get("/tv/%d" % spec["id"], {"language": "en-US"},
                        cache_ttl=86400, cache_key_extra="dl")
        return {
            "title": data.get("name") or "",
            "original": data.get("original_name") or "",
            "year": (data.get("first_air_date") or "")[:4],
        }
    raise SourceError("tvmaze source is no longer supported; migrate to tmdb")


def _matches_movie(candidate, names, year):
    parts = [part for part in urllib.parse.urlsplit(candidate["url"]).path.split("/") if part]
    slug = parts[-1] if parts else ""
    slug_year = re.search(r"(19|20)\d{2}", slug)
    if year and slug_year and slug_year.group(0) != year:
        return False
    text = htmlmod.unescape(candidate.get("title") or "") + " " + slug
    haystack = _tokens(text)
    for name in names:
        needles = _tokens(name)
        if not needles:
            continue
        if needles & haystack and len((needles & haystack)) / len(needles) >= 0.75:
            return True
    return False


def _matches_series(candidate, names):
    path = urllib.parse.urlsplit(candidate["url"]).path
    parts = [part for part in path.split("/") if part]
    slug = parts[-1] if parts else ""
    text = htmlmod.unescape(candidate.get("title") or "") + " " + slug.replace("-", " ")
    haystack = _tokens(text)
    for name in names:
        needles = _tokens(name)
        if not needles:
            continue
        overlap = needles & haystack
        if overlap and len(overlap) / len(needles) >= 0.7:
            return True
    return False


def _not_found(key, meta=None, reason="no-match"):
    payload = {"key": key, "status": "none", "checkedAt": _now(), "reason": reason}
    if meta:
        payload["query"] = [meta.get("title"), meta.get("original")]
    return payload


def resolve_key(key, refresh=False):
    spec = parse_key(key)
    if not spec:
        return _not_found(key, reason="invalid-key")
    try:
        meta = metadata(spec, refresh)
        names = []
        for value in (meta.get("original"), meta.get("title")):
            if value and value not in names:
                names.append(value)
        if not names:
            return _not_found(key, meta)
        candidates = []
        for name in names[:2]:
            for item in _search(spec["kind"], name, refresh):
                if item["url"] not in [old["url"] for old in candidates]:
                    candidates.append(item)
            if candidates:
                break
        if not candidates:
            for name in names[:2]:
                for item in _search_html(spec["kind"], name, refresh):
                    if item["url"] not in [old["url"] for old in candidates]:
                        candidates.append(item)
                if candidates:
                    break
        for candidate in candidates[:8]:
            if spec["kind"] == "movie":
                matched = _matches_movie(candidate, names, meta.get("year"))
            else:
                matched = _matches_series(candidate, names)
            if not matched:
                continue
            page = fetch_page(candidate["url"], refresh)
            if not page:
                continue
            if spec["kind"] == "movie":
                groups = parse_movie_page(page)
                if not groups:
                    continue
                return {
                    "key": key, "status": "found", "checkedAt": _now(),
                    "source": {"kind": "movie", "title": meta["title"] or meta["original"],
                               "url": candidate["url"]},
                    "groups": groups,
                }
            seasons = parse_series_page(page)
            if not seasons:
                continue
            return {
                "key": key, "status": "found", "checkedAt": _now(),
                "source": {"kind": "series", "title": meta["title"] or meta["original"],
                           "url": candidate["url"]},
                "seasons": seasons,
            }
        return _not_found(key, meta)
    except SourceError as error:
        return {"key": key, "status": "error", "checkedAt": _now(), "error": str(error)}
    except urllib.error.HTTPError as error:
        return {"key": key, "status": "error", "checkedAt": _now(),
                "error": "upstream HTTP %s" % error.code}
    except Exception as error:
        return {"key": key, "status": "error", "checkedAt": _now(), "error": str(error)}


DOWNLOAD_DEADLINE_SEC = 15.0


def match_downloads(keys, refresh=False):
    """Resolve up to MAX_KEYS stable keys, preferring the local cache.

    Resolution runs in a small thread pool so a slow key cannot block the
    whole batch; a global deadline turns the remaining keys into "pending"
    results instead of making the client wait (and abort) forever.
    """
    if not isinstance(keys, (list, tuple)):
        return []
    cleaned = [str(k).strip()[:120] for k in list(keys)[:MAX_KEYS]]
    cleaned = [k for k in cleaned if k]

    unique = []
    seen = set()
    for key in cleaned:
        if key in seen:
            continue
        seen.add(key)
        unique.append(key)

    deadline = time.monotonic() + DOWNLOAD_DEADLINE_SEC
    results_map = {}

    def resolve_one(key):
        if time.monotonic() > deadline:
            return key, {"key": key, "status": "pending", "checkedAt": _now()}
        cached = None if refresh else cache_get(CACHE_PREFIX + key, CACHE_FOUND)
        if cached is not None:
            ttl = CACHE_NONE if cached.get("status") == "none" else CACHE_FOUND
            if time.time() - cached.get("cachedAt", 0) <= ttl:
                return key, {k: v for k, v in cached.items() if k != "cachedAt"}
        payload = resolve_key(key, refresh)
        if payload.get("status") != "error":
            to_cache = dict(payload)
            to_cache["cachedAt"] = time.time()
            cache_put(CACHE_PREFIX + key, to_cache)
        return key, payload

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(resolve_one, key) for key in unique]
        for future in concurrent.futures.as_completed(futures):
            try:
                key, payload = future.result()
                results_map[key] = payload
            except Exception as error:
                pass

    for key in unique:
        if key not in results_map:
            results_map[key] = {"key": key, "status": "pending", "checkedAt": _now()}

    return [results_map[key] for key in cleaned]
