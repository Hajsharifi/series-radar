"""Tiny thread-safe counters exposed by /api/metrics."""

import threading
import time

STARTED_AT = time.time()
REQUEST_COUNT = 0
ERROR_COUNT = 0
METRICS_LOCK = threading.Lock()

# Bounded per-route counters so cardinality stays small (ids are normalized).
_ROUTE_COUNTS = {}
_ROUTE_ERRORS = {}
_ROUTE_LATENCY_SUM_MS = {}
_ROUTE_LATENCY_COUNT = {}
_MAX_ROUTES = 64


def _normalize_path(path):
    # Collapse numeric path segments to {id} so /api/tv/123 and /api/tv/456
    # share one series.
    parts = []
    for part in (path or "").split("/"):
        if part.isdigit():
            parts.append("{id}")
        else:
            parts.append(part)
    return "/".join(parts)


def inc_request(path=None):
    global REQUEST_COUNT
    with METRICS_LOCK:
        REQUEST_COUNT += 1
        if path:
            key = _normalize_path(path)
            if key not in _ROUTE_COUNTS and len(_ROUTE_COUNTS) >= _MAX_ROUTES:
                key = "other"
            _ROUTE_COUNTS[key] = _ROUTE_COUNTS.get(key, 0) + 1


def inc_error(path=None):
    global ERROR_COUNT
    with METRICS_LOCK:
        ERROR_COUNT += 1
        if path:
            key = _normalize_path(path)
            if key not in _ROUTE_ERRORS and len(_ROUTE_ERRORS) >= _MAX_ROUTES:
                key = "other"
            _ROUTE_ERRORS[key] = _ROUTE_ERRORS.get(key, 0) + 1


def observe_latency(path, duration_ms):
    with METRICS_LOCK:
        key = _normalize_path(path) if path else "unknown"
        if key not in _ROUTE_LATENCY_SUM_MS and len(_ROUTE_LATENCY_SUM_MS) >= _MAX_ROUTES:
            key = "other"
        _ROUTE_LATENCY_SUM_MS[key] = _ROUTE_LATENCY_SUM_MS.get(key, 0) + float(duration_ms)
        _ROUTE_LATENCY_COUNT[key] = _ROUTE_LATENCY_COUNT.get(key, 0) + 1


def snapshot(cache_files=0, cache_bytes=0):
    with METRICS_LOCK:
        by_route = {}
        for key in _ROUTE_COUNTS:
            count = _ROUTE_COUNTS.get(key, 0)
            errors = _ROUTE_ERRORS.get(key, 0)
            lat_count = _ROUTE_LATENCY_COUNT.get(key, 0)
            lat_sum = _ROUTE_LATENCY_SUM_MS.get(key, 0.0)
            by_route[key] = {
                "requests": count,
                "errors": errors,
                "avgLatencyMs": round(lat_sum / lat_count, 2) if lat_count else 0.0,
            }
        return {
            "ok": True,
            "uptimeSeconds": int(time.time() - STARTED_AT),
            "requests": REQUEST_COUNT,
            "errors": ERROR_COUNT,
            "cacheFiles": cache_files,
            "cacheBytes": cache_bytes,
            "byRoute": by_route,
        }
