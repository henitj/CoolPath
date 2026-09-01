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

import networkx as nx
import numpy as np
from shapely.geometry import LineString, Point, mapping

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
        self._components = [tuple(component) for component in nx.connected_components(graph)]

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
        return self._distance_to_node(lon, lat, node)

    def _distance_to_node(self, lon: float, lat: float, node: int) -> float:
        attrs = self.graph.nodes[node]
        return haversine_m(lon, lat, attrs["x"], attrs["y"])

    def _nearest_in_nodes(self, lon: float, lat: float, nodes: tuple[int, ...]) -> tuple[int, float]:
        """Nearest node in a connected component, plus its metre distance."""
        node = min(
            nodes,
            key=lambda candidate: (
                (self.graph.nodes[candidate]["x"] - lon) ** 2
                + (self.graph.nodes[candidate]["y"] - lat) ** 2
            ),
        )
        return node, self._distance_to_node(lon, lat, node)

    def _nearest_connected_pair(
        self, origin: LonLat, destination: LonLat
    ) -> tuple[int, int, float, float] | None:
        """Find the least-surprising pair of nodes with a path between them.

        Real pedestrian data has small disconnected islands (a trail, a plaza,
        or an incomplete OSM way). A normal nearest-node snap can therefore
        make an otherwise valid pair of map pins fail with ``NoPath``. When
        that happens, select the closest *shared* connected component instead
        of abandoning the user's route request.
        """
        best: tuple[float, int, int, float, float] | None = None
        for component in self._components:
            if len(component) < 2:
                continue
            origin_node, origin_distance = self._nearest_in_nodes(*origin, component)
            dest_node, dest_distance = self._nearest_in_nodes(*destination, component)
            score = origin_distance + dest_distance
            if best is None or score < best[0]:
                best = (score, origin_node, dest_node, origin_distance, dest_distance)
        if best is None:
            return None
        _, origin_node, dest_node, origin_distance, dest_distance = best
        return origin_node, dest_node, origin_distance, dest_distance

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
        snap_o = self._distance_to_node(*origin, origin_node)
        snap_d = self._distance_to_node(*destination, dest_node)
        warnings: list[str] = []

        if not nx.has_path(self.graph, origin_node, dest_node):
            connected_pair = self._nearest_connected_pair(origin, destination)
            if connected_pair is None:
                raise NoRouteError("no connected pedestrian network is available")
            origin_node, dest_node, snap_o, snap_d = connected_pair
            warnings.append("Using the nearest connected pedestrian network for this route")

        if origin_node == dest_node:
            direct_distance = haversine_m(*origin, *destination)
            # Identical (or nearly identical) points have no useful route, but
            # two distinct landmarks can easily share a sparse snapshot node.
            # Return a scored local segment rather than making the planner look
            # broken for a one-block walk.
            if direct_distance < 10.0:
                raise NoRouteError("origin and destination are too close together to route")
            warnings.append("Short local walk — both points share the nearest mapped street node")
            return self._local_route(origin, destination, profile, when, warnings)

        if snap_o > 120:
            warnings.append(f"origin snapped {snap_o:.0f} m to the nearest node")
        if snap_d > 120:
            warnings.append(f"destination snapped {snap_d:.0f} m to the nearest node")

        # Keep penalties keyed by graph edge.  The former implementation
        # accidentally looked them up by ``enumerate`` index here, even though
        # ``_edge_hazard_penalties`` returns ``(u, v)`` keys.  That meant a
        # reported hazard appeared in route metrics but could not influence
        # A*'s edge costs (and therefore could never trigger a detour).
        penalties = self._edge_hazard_penalties(when)
        penalty_by_edge: dict[tuple[int, int], float] = {
            (u, v): penalties.get((u, v), penalties.get((v, u), 0.0))
            for u, v, _ in self.graph.edges(data=True)
        }

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

        network_coords: list[LonLat] = [
            (self.graph.nodes[n]["x"], self.graph.nodes[n]["y"])
            for n in node_path
        ]
        # Preserve the exact points people selected in the returned line. The
        # graph nodes still drive A*, but drawing only snapped nodes made a
        # route appear to stop short of a selected landmark or GPS pin.
        coords: list[LonLat] = list(network_coords)
        if snap_o > 0.5:
            coords.insert(0, origin)
        if snap_d > 0.5:
            coords.append(destination)

        metrics, samples = self._metrics_for_path(node_path, params, when)
        connector_m = snap_o + snap_d
        if connector_m > 0.5:
            # Include the small walk from/to the nearest pedestrian edge in
            # distance and time so the visible line and headline figures agree.
            connector_min = connector_m / self.settings.walk_speed_mps / 60.0
            metrics.distance_m += connector_m
            metrics.est_walk_min += connector_min
            metrics.effort_min += connector_min
        return RouteResult(profile=profile, coords=coords, metrics=metrics,
                           node_path=node_path, samples=samples, warnings=warnings)

    def _local_route(
        self,
        origin: LonLat,
        destination: LonLat,
        profile: str,
        when: datetime,
        warnings: list[str],
    ) -> RouteResult:
        """Score a short direct walk when both stops share one graph node."""
        params = PROFILES[profile]
        geometry = LineString([origin, destination])
        midpoint = geometry.interpolate(0.5, normalized=True)
        canopy_frac = self.canopy_index.fraction_for_line(geometry) if self.canopy_index is not None else 0.0
        feats = EdgeFeatures(
            length_m=haversine_m(*origin, *destination),
            geom=geometry,
            lst_c=self.environment.lst_at(midpoint.x, midpoint.y),
            ndvi=self.environment.ndvi_at(midpoint.x, midpoint.y),
            canopy_frac=canopy_frac,
            sidewalk=True,
            lit=True,
            rough_surface=False,
            highway="footway",
            name="Local walk",
        )
        shadow_frac, shade = self.shade_components(feats, when)
        service = getattr(self, "_hazard_service", None)
        hazard_penalty = 0.0
        hazards_near: list[dict] = []
        if service is not None:
            hazard_penalty = service.penalty_for_lines([geometry], when).get(0, 0.0)
            hazards_near = service.hazards_near_line(geometry, when)

        points = [Point(point) for point in line_sample_points(list(geometry.coords), 10.0)]
        temps = [self.environment.lst_at(point.x, point.y) for point in points]
        ndvis = [self.environment.ndvi_at(point.x, point.y) for point in points]
        weighted_length = self.weight(feats, params, shadow_frac, shade, hazard_penalty)
        avg_temp = sum(temps) / len(temps) if temps else feats.lst_c
        avg_ndvi = sum(ndvis) / len(ndvis) if ndvis else feats.ndvi
        comfort = 100.0 * clamp01(
            0.45 * (1.0 - heat_index(avg_temp))
            + 0.45 * shade
            + 0.10 * canopy_norm(avg_ndvi)
            - 0.05 * len(hazards_near)
        )
        metrics = RouteMetrics(
            distance_m=feats.length_m,
            est_walk_min=feats.length_m / self.settings.walk_speed_mps / 60.0,
            effort_min=weighted_length / self.settings.walk_speed_mps / 60.0,
            avg_temp_c=avg_temp,
            max_temp_c=max(temps) if temps else feats.lst_c,
            avg_ndvi=avg_ndvi,
            canopy_pct=100.0 * canopy_frac,
            shadow_pct=100.0 * shadow_frac,
            shade_pct=100.0 * shade,
            hazard_count=len(hazards_near),
            comfort_score=comfort,
        )
        samples = {
            "temp_c": [round(value, 2) for value in temps],
            "ndvi": [round(value, 3) for value in ndvis],
            "shade": [round(shade, 2)] * len(points),
        }
        return RouteResult(
            profile=profile,
            coords=[origin, destination],
            metrics=metrics,
            samples=samples,
            warnings=warnings,
        )

    def road_conditions(self, when: datetime) -> dict:
        """Return a live, map-ready condition score for every walkable edge.

        ``quality`` is deliberately independent of whichever route profile a
        person has selected: it answers the at-a-glance question people ask of
        a map — *is this block pleasant and safe to walk right now?*  It blends
        surface heat, vegetation and live building shade with active hazard
        reports and basic pedestrian accessibility data.  The response is
        cached for a short period and invalidated as soon as a hazard is
        reported, so the road colours react without a page reload.
        """
        minute = when.astimezone(timezone.utc).strftime("%Y%m%dT%H%M")
        key = f"conditions:roads:{minute}"
        cached = self.cache.get_object(key)
        if cached is not None:
            return cached

        penalties = self._edge_hazard_penalties(when)
        features: list[dict] = []
        for u, v, data in self.graph.edges(data=True):
            feats = self.edge_features(u, v, data)
            shadow_frac, shade = self.shade_components(feats, when)
            hazard_penalty = penalties.get((u, v), penalties.get((v, u), 0.0))
            quality = self._condition_quality(feats, shade, hazard_penalty)
            features.append({
                "type": "Feature",
                "geometry": mapping(feats.geom),
                "properties": {
                    "name": feats.name or "Walkable street",
                    "quality": round(quality, 1),
                    "status": self._condition_label(quality),
                    "color": self._condition_color(quality),
                    "temp_c": round(feats.lst_c, 1),
                    "shade_pct": round(100.0 * shade, 1),
                    "shadow_pct": round(100.0 * shadow_frac, 1),
                    "hazard_penalty": round(hazard_penalty, 3),
                    "sidewalk": feats.sidewalk,
                    "lit": feats.lit,
                },
            })

        result = {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "timestamp": when.isoformat(),
                "description": "Live walking conditions: green is cooler and safer; red needs care.",
                "scale": {"excellent": "80-100", "good": "60-79", "caution": "40-59", "poor": "0-39"},
            },
        }
        # A short cache protects the map while allowing changing shadows and
        # new reports to feel immediate. HazardService invalidates this key.
        self.cache.set_object(key, result, ttl_s=30.0)
        return result

    @staticmethod
    def _condition_quality(feats: EdgeFeatures, shade: float, hazard_penalty: float) -> float:
        """Score an edge from 0 (avoid) to 100 (comfortable right now)."""
        heat = heat_index(feats.lst_c)
        greenery = clamp01(
            0.55 * canopy_norm(feats.ndvi)
            + 0.45 * clamp01((feats.canopy_frac * 0.5) + (shade * 0.5))
        )
        access_risk = (
            (0.60 if not feats.sidewalk else 0.0)
            + (0.25 if not feats.lit else 0.0)
            + (0.15 if feats.rough_surface else 0.0)
        )
        risk = clamp01(
            0.56 * heat
            + 0.24 * (1.0 - greenery)
            + 0.15 * clamp01(hazard_penalty)
            + 0.05 * min(1.0, access_risk)
        )
        return 100.0 * (1.0 - risk)

    @staticmethod
    def _condition_label(quality: float) -> str:
        if quality >= 80:
            return "Excellent"
        if quality >= 60:
            return "Good"
        if quality >= 40:
            return "Use care"
        return "Poor"

    @staticmethod
    def _condition_color(quality: float) -> str:
        if quality >= 80:
            return "#15803d"
        if quality >= 60:
            return "#65a30d"
        if quality >= 40:
            return "#f59e0b"
        return "#dc2626"

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
        # ``penalty_for_lines`` deliberately keys its output by line index;
        # convert it explicitly instead of relying on dict insertion order.
        result = {
            (u, v): penalties.get(index, 0.0)
            for index, (u, v, _) in enumerate(edges)
        }
        self.cache.set_object(key, result, ttl_s=15.0)
        return result

    def bind_hazard_service(self, service) -> None:
        self._hazard_service = service


class NoRouteError(RuntimeError):
    pass
