"""Micro-climate routing engine.

Implements the CoolPath edge-weighting model::

    Weight = Distance * (1 + alpha*Heat_Index - beta*Canopy_NDVI + gamma*Hazard_Penalty + Accessibility)

Layers feeding the weights:
  * Heat_Index   : Landsat LST raster (live or snapshot), bilinear per edge
  * Canopy_NDVI  : Sentinel-2 NDVI raster blended with tree-canopy coverage
  * Shadows      : pysolar solar position -> building shadow union per minute
  * Hazards      : crowdsourced reports, 50 m buffer with temporal decay

Three profiles: fastest (A*, distance), cool (shade/heat aware), safe
(accessibility + hazards).  All routes carry exposure metrics for the
comparison panel.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Sequence

import networkx as nx
import numpy as np
from shapely.geometry import LineString, Point

from app.core.cache import Cache
from app.core.config import Settings
from app.core.constants import NORMALISATION, PROFILES, ROUGH_SURFACES, WeightParams
from app.core.geo_utils import haversine_m, line_sample_points
from app.services.environment import EnvironmentGrids
from app.services.shadow_service import ShadowService

logger = logging.getLogger(__name__)

LonLat = tuple[float, float]


@dataclass
class EdgeFeatures:
    length_m: float
    geom: LineString
    lst_c: float
    ndvi: float
    canopy_frac: float
    sidewalk: bool
    lit: bool
    rough_surface: bool
    highway: str
    name: str


@dataclass
class RouteMetrics:
    distance_m: float
    est_walk_min: float
    effort_min: float
    avg_temp_c: float
    max_temp_c: float
    avg_ndvi: float
    canopy_pct: float
    shadow_pct: float
    shade_pct: float
    hazard_count: int
    comfort_score: float

    def as_dict(self) -> dict:
        return {
            "distance_m": round(self.distance_m, 1),
            "est_walk_min": round(self.est_walk_min, 1),
            "effort_min": round(self.effort_min, 1),
            "avg_temp_c": round(self.avg_temp_c, 1),
            "max_temp_c": round(self.max_temp_c, 1),
            "avg_ndvi": round(self.avg_ndvi, 3),
            "canopy_pct": round(self.canopy_pct, 1),
            "shadow_pct": round(self.shadow_pct, 1),
            "shade_pct": round(self.shade_pct, 1),
            "hazard_count": self.hazard_count,
            "comfort_score": round(self.comfort_score, 1),
        }


@dataclass
class RouteResult:
    profile: str
    coords: list[LonLat]
    metrics: RouteMetrics
    node_path: list[int] = field(default_factory=list)
    samples: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def heat_index(lst_c: float) -> float:
    lo, hi = NORMALISATION["lst_min_c"], NORMALISATION["lst_max_c"]
    return clamp01((lst_c - lo) / (hi - lo))


def canopy_norm(ndvi: float) -> float:
    lo, hi = NORMALISATION["ndvi_min"], NORMALISATION["ndvi_max"]
    return clamp01((ndvi - lo) / (hi - lo))


class RoutingEngine:
    def __init__(self, graph: nx.Graph, environment: EnvironmentGrids,
                 shadow: ShadowService, settings: Settings, cache: Cache,
                 canopy_index=None) -> None:
        self.graph = graph
        self.environment = environment
        self.shadow = shadow
        self.shadow._canopy_index = canopy_index
        self.canopy_index = canopy_index
        self.settings = settings
        self.cache = cache
        self.node_xy = np.array(
            [[graph.nodes[n]["x"], graph.nodes[n]["y"]] for n in graph.nodes], dtype=float
        )
        self.node_ids = list(graph.nodes)
        self._node_lons = np.radians(self.node_xy[:, 0])
        self._node_lats = np.radians(self.node_xy[:, 1])

    # --------------------------------------------------------------- snapping
    def nearest_node(self, lon: float, lat: float) -> int:
        """Nearest graph node using an equirectangular approximation."""
        lon_r, lat_r = math.radians(lon), math.radians(lat)
        x = (self._node_lons - lon_r) * math.cos(lat_r)
        y = self._node_lats - lat_r
        d2 = x * x + y * y
        return int(self.node_ids[int(np.argmin(d2))])

    def snap_distance_m(self, lon: float, lat: float) -> float:
        node = self.nearest_node(lon, lat)
        n = self.graph.nodes[node]
        return haversine_m(lon, lat, n["x"], n["y"])

    # ---------------------------------------------------------------- weights
    def edge_features(self, u: int, v: int, data: dict) -> EdgeFeatures:
        cached = data.get("_features")
        if cached is not None:
            return cached
        geom: LineString = data.get("geom") or LineString(
            [(self.graph.nodes[u]["x"], self.graph.nodes[u]["y"]),
             (self.graph.nodes[v]["x"], self.graph.nodes[v]["y"])]
        )
        midpoint = geom.interpolate(0.5, normalized=True)
        canopy_frac = 0.0
        if self.canopy_index is not None:
            canopy_frac = self.canopy_index.fraction_for_line(geom)
        feats = EdgeFeatures(
            length_m=float(data.get("length", geom.length * 111_320.0)),
            geom=geom,
            lst_c=self.environment.lst_at(midpoint.x, midpoint.y),
            ndvi=self.environment.ndvi_at(midpoint.x, midpoint.y),
            canopy_frac=canopy_frac,
            sidewalk=bool(data.get("sidewalk", True)),
            lit=bool(data.get("lit", True)),
            rough_surface=str(data.get("surface", "asphalt")).lower() in ROUGH_SURFACES,
            highway=str(data.get("highway", "residential")),
            name=str(data.get("name", "")),
        )
        data["_features"] = feats
        return feats

    def shade_components(self, feats: EdgeFeatures, when: datetime) -> tuple[float, float]:
        """(shadow_fraction, combined_shade) for an edge at ``when``."""
        shadow_frac, canopy_frac = self.shadow.shade_fractions(feats.geom, when)
        combined = clamp01(max(shadow_frac, canopy_frac) + 0.3 * min(shadow_frac, canopy_frac))
        return shadow_frac, combined

    def hazard_penalty(self, feats: EdgeFeatures, penalties: dict[int, float], key: int) -> float:
        return penalties.get(key, 0.0)

    def weight(self, feats: EdgeFeatures, params: WeightParams,
               shadow_frac: float, shade: float, hazard_pen: float) -> float:
        heat = heat_index(feats.lst_c)
        green = clamp01(0.55 * canopy_norm(feats.ndvi) + 0.45 * clamp01(
            (feats.canopy_frac * 0.5 + shade * 0.5)
        ))
        accessibility = (
            (0.0 if feats.sidewalk else params.sidewalk_penalty)
            + (0.0 if feats.lit else params.unlit_penalty)
            + (params.rough_surface_penalty if feats.rough_surface else 0.0)
        )
        factor = (
            1.0
            + params.alpha * heat
            - params.beta * green
            + params.gamma * hazard_pen
            + accessibility
        )
        factor = max(0.25, min(factor, 6.0))
        return feats.length_m * factor

    # ----------------------------------------------------------------- routing
    def route(self, origin: LonLat, destination: LonLat, profile: str,
              when: datetime) -> RouteResult:
        params = PROFILES[profile]
        origin_node = self.nearest_node(*origin)
        dest_node = self.nearest_node(*destination)
        warnings: list[str] = []
        if origin_node == dest_node:
            raise NoRouteError("origin and destination snap to the same network node")

        snap_o = self.snap_distance_m(*origin)
        snap_d = self.snap_distance_m(*destination)
        if snap_o > 120:
            warnings.append(f"origin snapped {snap_o:.0f} m to the nearest node")
        if snap_d > 120:
            warnings.append(f"destination snapped {snap_d:.0f} m to the nearest node")

        penalties = self._edge_hazard_penalties(when)
        penalty_by_edge: dict[tuple[int, int], float] = {}
        for idx, (u, v, data) in enumerate(self.graph.edges(data=True)):
            feats = self.edge_features(u, v, data)
            penalty_by_edge[(u, v)] = penalties.get(idx, 0.0)

        edge_shade_cache: dict[tuple[int, int], tuple[float, float, float]] = {}

        def cached_parts(u: int, v: int):
            key = (u, v) if (u, v) in penalty_by_edge else (v, u)
            if key not in edge_shade_cache:
                feats = self.edge_features(key[0], key[1], self.graph[key[0]][key[1]])
                shadow_frac, shade = self.shade_components(feats, when)
                edge_shade_cache[key] = (shadow_frac, shade, penalty_by_edge.get(key, 0.0))
            return edge_shade_cache[key]

        def weight_fn(u: int, v: int, data: dict) -> float:
            feats = self.edge_features(u, v, data)
            shadow_frac, shade, hazard_pen = cached_parts(u, v)
            return self.weight(feats, params, shadow_frac, shade, hazard_pen)

        def heuristic(u: int, v: int) -> float:
            return haversine_m(self.graph.nodes[u]["x"], self.graph.nodes[u]["y"],
                               self.graph.nodes[v]["x"], self.graph.nodes[v]["y"]) * 0.25

        try:
            node_path = nx.astar_path(self.graph, origin_node, dest_node,
                                      heuristic=heuristic, weight=weight_fn)
        except nx.NetworkXNoPath as exc:
            raise NoRouteError("no pedestrian path between the requested points") from exc

        coords: list[LonLat] = [(self.graph.nodes[n]["x"], self.graph.nodes[n]["y"]) for n in node_path]
        metrics, samples = self._metrics_for_path(node_path, params, when)
        return RouteResult(profile=profile, coords=coords, metrics=metrics,
                           node_path=node_path, samples=samples, warnings=warnings)

    def _metrics_for_path(self, node_path: list[int], params: WeightParams,
                          when: datetime) -> tuple[RouteMetrics, dict]:
        total_len = 0.0
        total_weighted = 0.0
        temps: list[float] = []
        shades: list[float] = []
        ndvis: list[float] = []
        canopy_hits = 0.0
        shadow_hits = 0.0
        sample_count = 0
        hazards_near: list[dict] = []
        penalties = self._edge_hazard_penalties(when)

        def penalty_for(u: int, v: int) -> float:
            return penalties.get((u, v), penalties.get((v, u), 0.0))

        for u, v in zip(node_path, node_path[1:]):
            data = self.graph.get_edge_data(u, v) or {}
            feats = self.edge_features(u, v, data)
            shadow_frac, shade = self.shade_components(feats, when)
            hazard_pen = penalty_for(u, v)

            weight = self.weight(feats, params, shadow_frac, shade, hazard_pen)
            total_len += feats.length_m
            total_weighted += weight
            pts = [Point(p) for p in line_sample_points(list(feats.geom.coords), 10.0)]
            for p in pts:
                temps.append(self.environment.lst_at(p.x, p.y))
                ndvis.append(self.environment.ndvi_at(p.x, p.y))
            in_shadow = self.shadow.coverage_fraction(pts, when)
            n = len(pts)
            shadow_hits += in_shadow * n
            canopy_hits += feats.canopy_frac * n
            shades.extend([max(shadow_frac, feats.canopy_frac)] * n)
            sample_count += n
            if hazard_pen > 0.01:
                hazards_near.append({"edge": f"{u}-{v}", "penalty": hazard_pen})

        if sample_count == 0:
            sample_count = 1
        avg_temp = sum(temps) / len(temps) if temps else 0.0
        max_temp = max(temps) if temps else 0.0
        avg_ndvi = sum(ndvis) / len(ndvis) if ndvis else 0.0
        canopy_pct = 100.0 * canopy_hits / sample_count
        shadow_pct = 100.0 * shadow_hits / sample_count
        shade_pct = min(100.0, canopy_pct + shadow_pct)
        avg_heat = heat_index(avg_temp)
        comfort = 100.0 * clamp01(
            0.45 * (1 - avg_heat) + 0.45 * (shade_pct / 100.0) + 0.10 * clamp01(avg_ndvi)
            - 0.05 * len(hazards_near)
        )
        metrics = RouteMetrics(
            distance_m=total_len,
            est_walk_min=total_len / self.settings.walk_speed_mps / 60.0,
            effort_min=total_weighted / self.settings.walk_speed_mps / 60.0,
            avg_temp_c=avg_temp,
            max_temp_c=max_temp,
            avg_ndvi=avg_ndvi,
            canopy_pct=canopy_pct,
            shadow_pct=shadow_pct,
            shade_pct=shade_pct,
            hazard_count=len(hazards_near),
            comfort_score=comfort,
        )
        samples = {
            "temp_c": [round(t, 2) for t in temps][:200],
            "ndvi": [round(v, 3) for v in ndvis][:200],
            "shade": [round(s, 2) for s in shades][:200],
        }
        return metrics, samples

    def _edge_hazard_penalties(self, when: datetime) -> dict[tuple[int, int], float]:
        """Per-edge hazard penalty keyed by (u, v)."""
        key = f"hazards:edge_penalties:{when.astimezone(timezone.utc).strftime('%Y%m%dT%H%M')}"
        cached = self.cache.get_object(key)
        if cached is not None:
            return cached
        service = getattr(self, "_hazard_service", None)
        if service is None:  # pragma: no cover - wiring issue
            return {}
        edges = list(self.graph.edges(data=True))
        lines = []
        for u, v, data in edges:
            feats = self.edge_features(u, v, data)
            lines.append(feats.geom)
        penalties = service.penalty_for_lines(lines, when)
        result = {(u, v): p for (u, v, _), p in zip(edges, penalties.values())}
        self.cache.set_object(key, result, ttl_s=15.0)
        return result

    def bind_hazard_service(self, service) -> None:
        self._hazard_service = service


class NoRouteError(RuntimeError):
    pass
