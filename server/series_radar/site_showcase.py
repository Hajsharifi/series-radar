"""Site showcase: newest/popular posters from the download source homepage.

The download source (myf2ms.top) renders a slider of new/popular movies and
series on its homepage. We scrape it every 6 hours and expose the poster list
so the app can mirror exactly what the source is promoting. Fail-open: on a
fetch/parse error we return the last cached list.
"""
import html as htmlmod
import re
import threading
import time

from .cache import cache_get, cache_put
from .http import fetch_text

SOURCE = "https://www.myf2ms.top"
CACHE_KEY = "site_showcase_v1"
TTL = 6 * 3600

_WARMER = None
_LOCK = threading.Lock()


def _parse(html_text):
    if not html_text:
        return []
    slides = re.findall(r'<div class="splide__slide">(.*?)</div></div>', html_text, re.S)
    seen = set()
    out = []
    for slide in slides:
        img = re.search(r'<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"', slide)
        link = re.search(r'<a href="([^"]+)" class="stretched-link"[^>]*>\s*<h2[^>]*>(.*?)</h2>', slide, re.S)
        if not img or not link:
            continue
        poster = htmlmod.unescape(img.group(1)).strip()
        alt = htmlmod.unescape(img.group(2)).strip()
        url = htmlmod.unescape(link.group(1)).strip()
        title = htmlmod.unescape(re.sub(r"<[^>]+>", "", link.group(2))).strip()
        if not poster or not url or url in seen:
            continue
        seen.add(url)
        if "سریال" in alt or "فصل" in alt:
            kind = "series"
        elif "فیلم" in alt or "انیمیشن" in alt:
            kind = "movie"
        else:
            kind = "unknown"
        out.append({"posterUrl": poster, "title": title, "url": url, "kind": kind, "alt": alt})
    return out


def fetch_showcase(refresh=False):
    cached = None if refresh else cache_get(CACHE_KEY, TTL)
    if cached is not None:
        return cached
    try:
        html_text = fetch_text(SOURCE + "/", timeout=25)
        items = _parse(html_text)
        if items:
            cache_put(CACHE_KEY, items)
            return items
    except Exception:
        pass
    # Fall back to stale cache if present.
    stale = cache_get(CACHE_KEY, 30 * 86400)
    if stale is not None:
        return stale
    return []


def start_warmer():
    global _WARMER
    with _LOCK:
        if _WARMER is not None and _WARMER.is_alive():
            return _WARMER
        def loop():
            time.sleep(15)
            while True:
                try:
                    fetch_showcase(refresh=True)
                except Exception:
                    pass
                time.sleep(TTL)
        _WARMER = threading.Thread(target=loop, name="site-showcase-warmer", daemon=True)
        _WARMER.start()
        return _WARMER
