"""Small geodesy helpers (equirectangular approximation, good to <0.5% at Tokyo scale)."""

from __future__ import annotations

import math

_M_PER_DEG_LAT = 110_540.0
_M_PER_DEG_LON_EQ = 111_320.0


def distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    dx = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * _M_PER_DEG_LON_EQ
    dy = (lat2 - lat1) * _M_PER_DEG_LAT
    return math.hypot(dx, dy)
