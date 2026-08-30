"""Dynamic building-shadow projection onto the street network.

Given a timestamp we compute the solar position (pysolar/NOAA), then project
every building footprint into a shadow polygon of length ``h / tan(elevation)``
along the anti-solar bearing.  Shadow unions are cached per minute.
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from shapely.affinity import translate
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import unary_union
from shapely.prepared import prep

from app.core.cache import Cache
from app.core.config import Settings
from app.core.geo_utils import M_PER_DEG_LAT, line_sample_points
from app.services.solar import SolarPosition, solar_position

logger = logging.getLogger(__name__)

LonLat = tuple[float, float]
UTC = timezone.utc


@dataclass
class Building:
    poly: Polygon
    height_m: float
    props: dict


@dataclass
class ShadowFrame:
    solar: SolarPosition
    union: object  # shapely geometry (Polygon / MultiPolygon / empty)
    feature_count: int


class ShadowService:
    def __init__(self, buildings: list[Building], settings: Settings, cache: Cache) -> None:
        self.buildings = buildings
        self.settings = settings
        self.cache = cache
        self._bbox_polygon = self._bbox_poly()
        self._canopy_index = None  # optionally injected by AppState

    # ------------------------------------------------------------------ public
    def frame_at(self, when: datetime) -> ShadowFrame:
        """Shadow union for the minute-bucketed timestamp (cached)."""
        aware = self._aware(when)
        key = f"shadow:{aware.astimezone(UTC).strftime('%Y%m%dT%H%M')}"
        cached = self.cache.get_object(key)
        if cached is not None:
            return cached
        frame = self._compute(aware)
        self.cache.set_object(key, frame, ttl_s=3600)
        return frame

    def solar_at(self, when: datetime) -> SolarPosition:
        return solar_position(self._aware(when), self.settings.center_lat, self.settings.center_lon)

    def shade_fractions(self, geometry: LineString, when: datetime, spacing_m: float = 8.0) -> tuple[float, float]:
        """Return (building_shadow_fraction, canopy_fraction) along a line.

        Canopy coverage is static (tree positions); shadow coverage depends on
        the timestamp.  Sample points every ``spacing_m`` for stable metrics.
        """
        pts: list[Point] = [Point(p) for p in line_sample_points(list(geometry.coords), spacing_m)]
        shadow_frac = self.coverage_fraction(pts, when)
        canopy_frac = 0.0
        canopy_index = self._canopy_index
        if canopy_index is not None and len(pts):
            canopy_frac = canopy_index.coverage_fraction(pts)
        return shadow_frac, canopy_frac

    def coverage_fraction(self, points: Sequence[Point], when: datetime) -> float:
        frame = self.frame_at(when)
        if not len(points):
            return 0.0
        if frame.union is None or frame.union.is_empty:
            return 0.0
        prepared = prep(frame.union)
        return sum(1 for p in points if prepared.contains(p)) / len(points)

    def shadow_geojson(self, when: datetime) -> dict:
        frame = self.frame_at(when)
        return {
            "type": "Feature",
            "properties": {
                "timestamp": frame.solar.timestamp.isoformat(),
                "altitude_deg": round(frame.solar.altitude_deg, 2),
                "azimuth_deg": round(frame.solar.azimuth_deg, 2),
                "is_daytime": frame.solar.is_daytime,
                "building_count": frame.feature_count,
                "source": "building-height-shadow-projection",
            },
            "geometry": mapping(frame.union) if (frame.union is not None and not frame.union.is_empty) else None,
        }

    # ----------------------------------------------------------------- private
    def _compute(self, aware: datetime) -> ShadowFrame:
        solar = self.solar_at(aware)
        empty = Polygon()
        if not solar.is_daytime:
            return ShadowFrame(solar, empty, 0)
        alt_rad = math.radians(max(solar.altitude_deg, 1.0))
        bearing = math.radians(solar.shadow_bearing_deg)
        m_lon = M_PER_DEG_LAT * math.cos(math.radians(self.settings.center_lat))
        shadow_geoms: list[Polygon] = []
        for b in self.buildings:
            length = b.height_m / math.tan(alt_rad)
            dx = math.sin(bearing) * length / m_lon
            dy = math.cos(bearing) * length / M_PER_DEG_LAT
            # union(footprint, displaced footprint) == swept shadow of a rectangle
            shadow_geoms.append(b.poly.union(translate(b.poly, dx, dy)))
        if not shadow_geoms:
            return ShadowFrame(solar, empty, 0)
        union = unary_union(shadow_geoms).intersection(self._bbox_polygon)
        union = union.simplify(0.00002, preserve_topology=True)
        return ShadowFrame(solar, union, len(shadow_geoms))

    def _bbox_poly(self) -> Polygon:
        min_lon, min_lat, max_lon, max_lat = self.settings.bbox_tuple
        return Polygon(
            [(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat)]
        )

    def _aware(self, when: datetime) -> datetime:
        return when if when.tzinfo else when.replace(tzinfo=UTC)


def load_buildings_from_geojson(path: Path) -> list[Building]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    buildings: list[Building] = []
    for feat in data.get("features", []):
        geom = feat.get("geometry")
        if not geom or geom.get("type") != "Polygon":
            continue
        rings = geom["coordinates"]
        poly = Polygon(rings[0], rings[1:] if len(rings) > 1 else None)
        if poly.is_empty or poly.area <= 0:
            continue
        props = feat.get("properties", {})
        buildings.append(Building(poly=poly, height_m=float(props.get("height_m", 10.0)), props=props))
    return buildings
