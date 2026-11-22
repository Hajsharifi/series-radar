#!/usr/bin/env python3
"""Series Radar API entry point.

The implementation is split into the ``series_radar`` package. This shim keeps
the systemd ExecStart path and older imports stable.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from series_radar.cache import *  # noqa: F401,F403
from series_radar.airdates import *  # noqa: F401,F403
from series_radar.boxoffice import *  # noqa: F401,F403
from series_radar.catalog import *  # noqa: F401,F403
from series_radar.config import *  # noqa: F401,F403
from series_radar.handler import Handler, main  # noqa: F401
from series_radar.http import *  # noqa: F401,F403
from series_radar.omdb import *  # noqa: F401,F403
from series_radar.text import *  # noqa: F401,F403
from series_radar.tmdb import *  # noqa: F401,F403

if __name__ == "__main__":
    main()
