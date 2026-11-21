"""Optional Rust implementation of the Film2Media page parser.

The crate at ``server/rust/downloads-parser-rs`` is compiled into the
``series_radar_downloads_rs`` package (see ``server/build-native.sh``). It is
optional on purpose: when the compiled package is missing or cannot be
imported, ``series_radar.downloads`` keeps using the pure-Python parser.

Set ``SERIES_RADAR_PARSER=python`` to force the Python parser, or
``SERIES_RADAR_PARSER=rust`` to make a missing native module an error.
``SERIES_RADAR_NATIVE_DIR`` points at a custom location for the package.
"""

import importlib
import os
import sys
import threading

_PACKAGE = "series_radar_downloads_rs"
_LOCK = threading.Lock()
_module = None
_loaded = False
_origin = None


def _candidates():
    override = os.environ.get("SERIES_RADAR_NATIVE_DIR")
    if override:
        yield override
    here = os.path.dirname(os.path.abspath(__file__))
    server_root = os.path.dirname(here)
    # Deployed layout: /opt/series-radar-api/series_radar_downloads_rs
    yield os.path.join(server_root, _PACKAGE)
    # Development layout: server/rust/downloads-parser-rs/python
    yield os.path.join(server_root, "rust", "downloads-parser-rs", "python")


def load():
    """Return the native module, or ``None`` when it is unavailable."""
    global _module, _loaded, _origin
    with _LOCK:
        if _loaded:
            return _module
        _loaded = True
        mode = os.environ.get("SERIES_RADAR_PARSER", "").strip().lower()
        if mode in ("python", "off", "0"):
            _origin = "python (forced)"
            return None
        for path in _candidates():
            if os.path.isdir(path) and path not in sys.path:
                sys.path.insert(0, path)
        try:
            _module = importlib.import_module(_PACKAGE)
        except Exception as error:  # noqa: BLE001 - any import failure means fallback
            if mode in ("rust", "native", "1"):
                raise
            _origin = "python (%s)" % error
            return None
        _origin = "rust"
        return _module


def origin():
    """Human-readable description of the parser selected at import time."""
    load()
    return _origin or "python"
