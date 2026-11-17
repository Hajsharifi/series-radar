"""File-backed JSON cache with pruning."""

import json
import os
import re
import time

from .config import CACHE_DIR, CACHE_MAX_AGE

LAST_PRUNE = 0.0


def cache_path(key):
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", key)
    return os.path.join(CACHE_DIR, safe + ".json")


def cache_get(key, ttl):
    try:
        with open(cache_path(key), "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if time.time() - payload.get("at", 0) <= ttl:
            return payload.get("data")
    except Exception:
        pass
    return None


def cache_put(key, data):
    path = cache_path(key)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump({"at": time.time(), "data": data}, handle, ensure_ascii=False)
    os.replace(temp, path)
    prune_cache()


def cache_stats():
    files = 0
    size = 0
    try:
        for entry in os.scandir(CACHE_DIR):
            try:
                if entry.is_file() and entry.name.endswith(".json"):
                    files += 1
                    size += entry.stat().st_size
            except OSError:
                pass
    except OSError:
        pass
    return files, size


def prune_cache(force=False):
    """Delete stale cache files. Runs on startup and at most hourly."""
    global LAST_PRUNE
    now = time.time()
    if not force and now - LAST_PRUNE < 3600:
        return 0
    LAST_PRUNE = now
    removed = 0
    try:
        for name in os.listdir(CACHE_DIR):
            if not name.endswith(".json"):
                continue
            path = os.path.join(CACHE_DIR, name)
            try:
                if now - os.path.getmtime(path) > CACHE_MAX_AGE:
                    os.remove(path)
                    removed += 1
            except OSError:
                pass
    except OSError:
        pass
    return removed
