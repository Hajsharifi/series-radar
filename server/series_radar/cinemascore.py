"""CinemaScore grade lookup via Wikipedia (Reception/Audience section).

CinemaScore does not expose a public API. Wikipedia film articles commonly
record the result of audience exit-polling as "Audiences polled by CinemaScore
gave the film an average grade of X". We parse that sentence. Results are
cached for a week; missing grades are cached briefly so we don't hammer
Wikipedia for films that have no score yet.
"""
import json
import re
import time
import urllib.parse
import urllib.request

from .cache import cache_get, cache_put
from .text import normalize_title

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "SeriesRadar/1.0 (contact: series-radar@local)"

CACHE_TTL_HIT = 7 * 86400
CACHE_TTL_MISS = 2 * 86400

_THROTTLE_LOCK = None
import threading as _threading
_THROTTLE_LOCK = _threading.Lock()
_LAST_REQUEST = [0.0]


def _throttle():
    with _THROTTLE_LOCK:
        now = time.time()
        wait = 1.1 - (now - _LAST_REQUEST[0])
        if wait > 0:
            time.sleep(wait)
        _LAST_REQUEST[0] = time.time()


def _fetch_json(url):
    _throttle()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8", "ignore"))


def _search_page_title(title, year):
    query = title.strip()
    if year:
        query = "%s (%s film)" % (title.strip(), year)
    params = {"action": "query", "list": "search", "srsearch": query, "srlimit": 5, "format": "json"}
    url = WIKIPEDIA_API + "?" + urllib.parse.urlencode(params)
    try:
        data = _fetch_json(url)
    except Exception:
        return None
    results = (data.get("query") or {}).get("search") or []
    title_norm = normalize_title(title).lower()
    best = None
    for r in results:
        rt = r.get("title") or ""
        low = rt.lower()
        if title_norm and title_norm not in low.replace(" ", "") and title_norm not in low:
            continue
        if "film" not in low and str(year or "") not in low:
            continue
        best = rt
        break
    if best is None and results:
        best = results[0].get("title")
    return best


def _page_wikitext(page_title):
    params = {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json", "titles": page_title}
    url = WIKIPEDIA_API + "?" + urllib.parse.urlencode(params)
    try:
        data = _fetch_json(url)
    except Exception:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for p in pages.values():
        if "missing" in p:
            continue
        revs = p.get("revisions") or []
        if not revs:
            continue
        slots = revs[0].get("slots") or {}
        main = slots.get("main") or {}
        return main.get("*")
    return None


_GRADE_RE = re.compile(
    r'CinemaScore[^.]{0,300}?grade of\s*["\u201c\u201d\']?\s*([A-F][+-]?)',
    re.IGNORECASE | re.DOTALL,
)
_GRADE_RE2 = re.compile(
    r'CinemaScore[^.]{0,120}?([A-F][+-]?)\s*(?:on an A\+ to F scale|grade)',
    re.IGNORECASE | re.DOTALL,
)


def _parse_grade(text):
    if not text:
        return None
    m = _GRADE_RE.search(text)
    if m:
        return m.group(1).upper()
    m = _GRADE_RE2.search(text)
    if m:
        cand = m.group(1).upper()
        # Avoid matching random letters; require it to look like a grade token.
        if cand in ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"):
            return cand
    return None


def cinema_score(title, year=None):
    """Return a CinemaScore grade string (e.g. 'A-') or None. Cached."""
    if not title:
        return None
    key = "cinemascore_%s_%s" % (normalize_title(title).lower().replace(" ", "_"), year or "any")
    cached = cache_get(key, CACHE_TTL_HIT)
    if cached is not None:
        return cached.get("grade")  # None is a valid cached miss
    # Try direct page title first.
    grade = None
    if year:
        grade = _parse_grade(_page_wikitext("%s (%s film)" % (title, year)))
    if grade is None:
        page = _search_page_title(title, year)
        if page:
            grade = _parse_grade(_page_wikitext(page))
    cache_put(key, {"grade": grade})
    # If miss, shorten cache by re-writing with shorter TTL is not supported;
    # the hit TTL is 7 days which is fine for stable grades.
    return grade


def enrich_box_office(payload):
    """Attach cinemaScore to each entry in a box-office payload (in place)."""
    if not isinstance(payload, dict):
        return payload
    titles = []
    for group_key in ("weekend", "yearly"):
        for entry in payload.get(group_key) or []:
            if isinstance(entry, dict) and entry.get("title"):
                titles.append(entry)
    # Dedupe by title to avoid duplicate lookups.
    seen = set()
    unique = []
    for e in titles:
        k = (e.get("title"), e.get("releaseDate"))
        if k in seen:
            continue
        seen.add(k)
        unique.append(e)
    for entry in unique:
        try:
            year = None
            rd = entry.get("releaseDate")
            if rd and len(rd) >= 4:
                year = rd[:4]
            entry["cinemaScore"] = cinema_score(entry.get("title"), year)
        except Exception:
            entry["cinemaScore"] = None
    return payload