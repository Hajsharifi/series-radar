"""Tiny thread-safe counters exposed by /api/metrics."""

import threading
import time

STARTED_AT = time.time()
REQUEST_COUNT = 0
ERROR_COUNT = 0
METRICS_LOCK = threading.Lock()


def inc_request():
    global REQUEST_COUNT
    with METRICS_LOCK:
        REQUEST_COUNT += 1


def inc_error():
    global ERROR_COUNT
    with METRICS_LOCK:
        ERROR_COUNT += 1


def snapshot(cache_files=0, cache_bytes=0):
    with METRICS_LOCK:
        return {
            "ok": True,
            "uptimeSeconds": int(time.time() - STARTED_AT),
            "requests": REQUEST_COUNT,
            "errors": ERROR_COUNT,
            "cacheFiles": cache_files,
            "cacheBytes": cache_bytes,
        }
