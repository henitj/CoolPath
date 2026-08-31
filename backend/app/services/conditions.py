"""Point-in-time micro-climate conditions.

Shared formulas used by both the routing engine (per edge) and the
``/now`` endpoint (per tap / user location), so the numbers a user sees
always match the numbers the router optimises for.
"""
from __future__ import annotations

import math
from typing import Sequence

from app.core.constants import NORMALISATION
from app.services.routing_engine import clamp01, heat_index

M_PER_DEG_LAT = 111_320.0


def canopy_norm(ndvi: float) -> float:
    lo, hi = NORMALISATION["ndvi_min"], NORMALISATION["ndvi_max"]
    return clamp01((ndvi - lo) / (hi - lo))


def combine_shade(shadow_frac: float, canopy_frac: float) -> float:
    """Combined shade score with a synergy bonus when both overlap."""
    return clamp01(max(shadow_frac, canopy_frac) + 0.3 * min(shadow_frac, canopy_frac))


def comfort_score(avg_temp_c: float, shade_frac: float, avg_ndvi: float,
                  hazard_count: int = 0) -> float:
    """0-100 walking comfort, identical to the route metric formula."""
    avg_heat = heat_index(avg_temp_c)
    return 100.0 * clamp01(
        0.45 * (1 - avg_heat) + 0.45 * shade_frac + 0.10 * canopy_norm(avg_ndvi)
        - 0.05 * hazard_count
    )


def sample_points_around(lon: float, lat: float, radius_m: float = 6.0) -> list[tuple[float, float]]:
    """3x3 sample grid around a point (covers ~12 m across at city scale)."""
    m_lon = M_PER_DEG_LAT * math.cos(math.radians(lat))
    dlon = radius_m / m_lon
    dlat = radius_m / M_PER_DEG_LAT
    pts: list[tuple[float, float]] = []
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            pts.append((lon + dlon * i, lat + dlat * j))
    return pts


def points_inside(bbox: Sequence[float], pts: Sequence[tuple[float, float]]) -> bool:
    return all(bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3] for lon, lat in pts)
