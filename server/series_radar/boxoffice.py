"""Box Office Mojo scraping and TMDB enrichment."""

import concurrent.futures
import datetime as dt
import re

from .cache import cache_get, cache_put
from .config import BOM
from .http import fetch_text
from .text import normalize_title, parse_money, strip_tags
from .cinemascore import enrich_box_office
from .tmdb import movie_detail, tmdb_search


def bom_rows(html):
    rows = []
    for chunk in html.split("</tr>")[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", chunk, flags=re.S)
        if cells:
            rows.append(cells)
    return rows


def bom_latest_weekend():
    html = fetch_text(BOM + "/weekend/")
    for cells in bom_rows(html):
        joined = " ".join(cells)
        link = re.search(r'href="(/weekend/\d{4}W\d+/)', joined)
        if not link:
            continue
        gross = parse_money(strip_tags(cells[1])) if len(cells) > 1 else None
        if gross is None:
            continue
        return link.group(1), strip_tags(cells[0])
    return None, None


def bom_weekend_table(path):
    html = fetch_text(BOM + path)
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 9:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title_html = cells[2]
        title = strip_tags(title_html)
        link = re.search(r'href="(/release/[^"?]+)', title_html)
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "releasePath": link.group(1) if link else None,
                "weekendGross": parse_money(strip_tags(cells[3])),
                "theaters": parse_money(strip_tags(cells[5])) if len(cells) > 5 else None,
                "domestic": parse_money(strip_tags(cells[8])) if len(cells) > 8 else None,
                "weeks": parse_money(strip_tags(cells[9])) if len(cells) > 9 else None,
                "distributor": strip_tags(cells[10]) if len(cells) > 10 else None,
            }
        )
    return entries


def bom_year_world(year):
    html = fetch_text(BOM + "/year/world/%s/" % year)
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 7:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title_html = cells[1]
        title = strip_tags(title_html)
        if not title or title == "-":
            continue
        link = re.search(r'href="(/releasegroup/[^"?]+)', title_html)
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "releasePath": link.group(1) if link else None,
                "worldwide": parse_money(strip_tags(cells[2])),
                "domestic": parse_money(strip_tags(cells[3])),
                "international": parse_money(strip_tags(cells[5])),
            }
        )
    return entries


def bom_alltime_world():
    html = fetch_text(BOM + "/alltime/world/")
    entries = []
    for cells in bom_rows(html):
        if len(cells) < 4:
            continue
        rank = strip_tags(cells[0])
        if not rank.isdigit():
            continue
        title = strip_tags(cells[1])
        if not title:
            continue
        entries.append(
            {
                "rank": int(rank),
                "title": title,
                "worldwide": parse_money(strip_tags(cells[2])),
                "domestic": parse_money(strip_tags(cells[3])),
                "international": parse_money(strip_tags(cells[4])) if len(cells) > 4 else None,
            }
        )
    return entries


def box_office(year=None, force=False):
    year = year or str(dt.date.today().year)
    key = "boxoffice_" + year
    cached = None if force else cache_get(key, 3 * 3600)
    if cached is not None:
        return cached

    weekend_path, weekend_label = bom_latest_weekend()
    weekend = bom_weekend_table(weekend_path) if weekend_path else []
    yearly = bom_year_world(year) if year.isdigit() else bom_alltime_world()
    year_map = {normalize_title(item["title"]): item for item in yearly}

    combined = []
    seen = set()
    for item in weekend[:10]:
        key_title = normalize_title(item["title"])
        match = year_map.get(key_title) or {}
        item["worldwide"] = match.get("worldwide")
        item["international"] = match.get("international")
        combined.append(item)
        seen.add(key_title)
    for item in yearly[:20]:
        key_title = normalize_title(item["title"])
        if key_title in seen:
            continue
        entry = dict(item)
        entry.update({"weekendGross": None, "theaters": None, "weeks": None, "distributor": None})
        combined.append(entry)
        seen.add(key_title)

    def enrich(entry):
        search_year = year if year.isdigit() else None
        match = tmdb_search(entry["title"], search_year)
        if not match:
            match = tmdb_search(entry["title"], None)
        if match:
            entry.update(
                {
                    "id": match.get("id"),
                    "posterPath": match.get("posterPath"),
                    "rating": match.get("rating"),
                    "releaseDate": match.get("releaseDate"),
                    "tmdbOverview": match.get("overview"),
                }
            )
            try:
                detail = movie_detail(match["id"])
                entry["budget"] = detail.get("budget") or None
                entry["revenue"] = detail.get("revenue") or None
                entry["genres"] = detail.get("genres") or []
            except Exception:
                entry["budget"] = None
        return entry

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        combined = list(pool.map(enrich, combined))

    cheap = [item for item in combined if item.get("weekendGross") is not None]
    cheap.sort(key=lambda item: item.get("rank") or 999)
    yearly_out = [item for item in combined if item.get("weekendGross") is None]
    yearly_out.sort(key=lambda item: item.get("worldwide") or 0, reverse=True)

    payload = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat() + "Z",
        "source": "Box Office Mojo",
        "year": year,
        "weekendLabel": weekend_label,
        "weekend": cheap,
        "yearly": yearly_out,
    }
    try:
        enrich_box_office(payload)
    except Exception:
        pass
    cache_put(key, payload)
    return payload
