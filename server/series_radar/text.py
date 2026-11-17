"""Text normalization, fuzzy matching and Persian translation."""

import difflib
import json
import os
import re
import unicodedata

from .cache import cache_get, cache_put
from .config import BASE_DIR


def strip_tags(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = value.replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    return re.sub(r"\s+", " ", value).strip()


def parse_money(value):
    if value is None:
        return None
    cleaned = value.replace("$", "").replace(",", "").strip()
    if cleaned in ("", "-", "--"):
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def normalize_title(value):
    value = (value or "").lower().replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_fa(value):
    """Normalize Persian/Arabic text so typos and Arabic script variants match."""
    text = (value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = (text.replace("ي", "ی").replace("ئ", "ی").replace("ك", "ک")
                .replace("ۀ", "ه").replace("ة", "ه").replace("ؤ", "و")
                .replace("ـ", "").replace("\u200c", "").replace("\u200d", ""))
    text = re.sub(r"[\u064b-\u065f\u0670]", "", text)
    text = re.sub(r"[^0-9a-z\u0600-\u06ff]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fuzzy_score(query, *candidates):
    """Similarity in 0..1 against one or more candidate titles."""
    q = normalize_fa(query)
    if not q:
        return 0.0
    q_compact = q.replace(" ", "")
    best = 0.0
    for candidate in candidates:
        n = normalize_fa(candidate)
        if not n:
            continue
        compact = n.replace(" ", "")
        if q == n or q_compact == compact:
            best = max(best, 1.0)
        elif n.startswith(q) or compact.startswith(q_compact):
            best = max(best, 0.9)
        elif q in n or q_compact in compact:
            best = max(best, 0.85)
        else:
            best = max(best, difflib.SequenceMatcher(None, q_compact, compact).ratio())
    return round(best, 3)


def translate_fa_to_en(text):
    """Persian -> English via cached googletrans. Never raises."""
    text = (text or "").strip()
    if not text:
        return ""
    key = "fa2en_" + text
    cached = cache_get(key, 30 * 86400)
    if cached:
        return cached
    try:
        from googletrans import Translator
        result = Translator().translate(text, src="fa", dest="en")
        translated = (result.text or "").strip()
    except Exception:
        translated = ""
    if translated:
        cache_put(key, translated)
    return translated


def load_translation_cache():
    global _translation_cache
    cache_file = os.path.join(TRANSLATION_CACHE_DIR, "cache.json")
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            _translation_cache = json.load(f)
    except Exception:
        _translation_cache = {}


def save_translation_cache():
    cache_file = os.path.join(TRANSLATION_CACHE_DIR, "cache.json")
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(_translation_cache, f, ensure_ascii=False)
    except Exception:
        pass


def translate_to_persian(text):
    """Translate English text to Persian with caching."""
    if not text or not text.strip():
        return text
    text = text.strip()
    # Check cache
    if text in _translation_cache:
        return _translation_cache[text]
    # Translate using googletrans
    try:
        from googletrans import Translator
        translator = Translator()
        result = translator.translate(text, src='en', dest='fa')
        persian = result.text if result.text else text
    except Exception:
        persian = text
    # Cache and save
    _translation_cache[text] = persian
    save_translation_cache()
    return persian


def enrich_with_persian(items, text_field="overview"):
    """Add Persian translation for a text field in a list of items."""
    if not _translation_cache:
        load_translation_cache()
    for item in items:
        text = item.get(text_field)
        if text:
            item[text_field + "_fa"] = translate_to_persian(text)
    return items
