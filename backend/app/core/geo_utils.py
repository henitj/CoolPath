"""Lightweight geodesic helpers (no external GIS runtime dependency)."""
from __future__ import annotations

import math
from typing import Iterable, Sequence

EARTH_R_M = 6_371_008.8
M_PER_DEG_LAT = 111_320.0

# type alias: points are (lon, lat) pairs
LonLat = tuple[float, float]


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


def meters_per_degree(lat: float) -> tuple[float, float]:
    """Approximate (meters per degree lon, meters per degree lat) at a latitude."""
    m_lon = M_PER_DEG_LAT * math.cos(math.radians(lat))
    return m_lon, M_PER_DEG_LAT


def in_bbox(lon: float, lat: float, bbox: Sequence[float], pad_deg: float = 0.0) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return (min_lon - pad_deg) <= lon <= (max_lon + pad_deg) and (min_lat - pad_deg) <= lat <= (max_lat + pad_deg)


def line_sample_points(coords: Sequence[LonLat], spacing_m: float) -> list[LonLat]:
    """Sample points along a polyline every ``spacing_m`` metres (endpoints included)."""
    pts: list[LonLat] = [tuple(coords[0])]  # type: ignore[list-item]
    carried = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        seg = haversine_m(lon1, lat1, lon2, lat2)
        if seg <= 1e-9:
            continue
        m_lon, m_lat = meters_per_degree((lat1 + lat2) / 2)
        remaining = seg - carried
        d = spacing_m
        while d <= remaining:
            t = (carried + d) / seg
            pts.append((lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t))
            d += spacing_m
        carried = (carried + seg) % spacing_m
    last = tuple(coords[-1])  # type: ignore[list-item]
    if haversine_m(pts[-1][0], pts[-1][1], last[0], last[1]) > 1.0:
        pts.append(last)
    return pts


def sample_grid(grid, bbox: Sequence[float], lon: float, lat: float) -> float:
    """Bilinear sample of a 2-D ndarray spanning ``bbox`` (row 0 = north)."""

    min_lon, min_lat, max_lon, max_lat = bbox
    h, w = grid.shape
    fx = (lon - min_lon) / max(1e-12, (max_lon - min_lon)) * (w - 1)
    fy = (max_lat - lat) / max(1e-12, (max_lat - min_lat)) * (h - 1)
    fx = min(max(fx, 0.0), w - 1.0)
    fy = min(max(fy, 0.0), h - 1.0)
    x0, y0 = int(fx), int(fy)
    x1, y1 = min(x0 + 1, w - 1), min(y0 + 1, h - 1)
    tx, ty = fx - x0, fy - y0
    return float(
        grid[y0, x0] * (1 - tx) * (1 - ty)
        + grid[y0, x1] * tx * (1 - ty)
        + grid[y1, x0] * (1 - tx) * ty
        + grid[y1, x1] * tx * ty
    )


def bbox_polygon_geojson(bbox: Sequence[float]) -> dict:
    min_lon, min_lat, max_lon, max_lat = bbox
    ring = [
        [min_lon, min_lat], [max_lon, min_lat], [max_lon, max_lat],
        [min_lon, max_lat], [min_lon, min_lat],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def point_distance_bbox_norm(lon: float, lat: float, bbox: Sequence[float]) -> float:
    """0 if inside, else distance in metres to the bbox edge (for validation msgs)."""
    if in_bbox(lon, lat, bbox):
        return 0.0
    min_lon, min_lat, max_lon, max_lat = bbox
    dlon, dlat = meters_per_degree(lat)
    dx = max(min_lon - lon, 0.0, lon - max_lon) * dlon
    dy = max(min_lat - lat, 0.0, lat - max_lat) * dlat
    return math.hypot(dx, dy)


def iter_pairs(seq: Sequence) -> Iterable:
    for i in range(len(seq) - 1):
        yield seq[i], seq[i + 1]
