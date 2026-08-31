"""Pedestrian network acquisition.

Priority 1: live OpenStreetMap via the Overpass API (streets + buildings +
heights for the study-area bbox).
Fallback  : bundled offline snapshot (``app/data/snapshot/graph.json``)
            generated deterministically for Downtown Austin so the app is
            fully functional without internet access.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import networkx as nx
from shapely.geometry import LineString, Polygon

from app.core.config import Settings
from app.core.geo_utils import haversine_m
from app.services.shadow_service import Building

logger = logging.getLogger(__name__)

WALKABLE_HIGHWAYS = {
    "primary", "secondary", "tertiary", "residential", "unclassified",
    "living_street", "pedestrian", "footway", "steps", "path", "cycleway",
    "track", "service",
}


@dataclass
class NetworkBundle:
    graph: nx.Graph
    buildings: list[Building]
    source: str
    detail: str = ""
    stats: dict = field(default_factory=dict)


class NetworkUnavailableError(RuntimeError):
    pass


# --------------------------------------------------------------------- live
def overpass_query(bbox: Sequence4) -> str:
    min_lon, min_lat, max_lon, max_lat = bbox
    bb = f"{min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f}"
    return (
        "[out:json][timeout:30];"
        f'(way["highway"]({bb});'
        f'way["building"]({bb}););'
        "out body geom qt;"
    )


def fetch_overpass_network(settings: Settings) -> NetworkBundle:
    """Download and build the pedestrian graph from OSM (raises on failure)."""
    bbox = settings.bbox_tuple
    resp = httpx.post(
        settings.overpass_url,
        data={"data": overpass_query(bbox)},
        timeout=max(settings.live_fetch_timeout_s, 20.0),
        headers={"User-Agent": "CoolPath/1.0 (walkability research)"},
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])
    return build_graph_from_overpass(elements, bbox, settings)


def build_graph_from_overpass(elements: list[dict], bbox, settings: Settings) -> NetworkBundle:
    graph = nx.Graph()
    buildings: list[Building] = []
    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {}) or {}
        coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        if tags.get("building"):
            if len(coords) >= 4 and coords[0] == coords[-1]:
                poly = Polygon(coords[:-1])
                if not poly.is_empty:
                    buildings.append(Building(poly=poly, height_m=parse_height(tags), props={
                        "name": tags.get("name", ""), "height_m": parse_height(tags),
                        "building": tags.get("building", "yes"),
                        "source": "osm",
                    }))
            continue
        highway = tags.get("highway", "")
        if highway not in WALKABLE_HIGHWAYS:
            continue
        attrs = {
            "name": tags.get("name", ""),
            "highway": highway,
            "surface": tags.get("surface", "asphalt"),
            "lit": tags.get("lit", "yes") not in {"no", "false"},
            "sidewalk": tags.get("sidewalk", "yes") not in {"no", "none", "separate"},
            "source": "osm",
        }
        for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
            if not (bbox[0] <= lon1 <= bbox[2] and bbox[1] <= lat1 <= bbox[3]):
                continue
            u = node_key(lat1, lon1)
            v = node_key(lat2, lon2)
            length = haversine_m(lon1, lat1, lon2, lat2)
            if length <= 0.5:
                continue
            for node_id, lat, lon in ((u, lat1, lon1), (v, lat2, lon2)):
                if not graph.has_node(node_id):
                    graph.add_node(node_id, x=lon, y=lat)
            data = dict(attrs)
            data["length"] = length
            data["geom"] = LineString([(lon1, lat1), (lon2, lat2)])
            if graph.has_edge(u, v) and graph[u][v].get("length", 9e9) <= length:
                continue
            graph.add_edge(u, v, **data)
    if graph.number_of_nodes() < 50:
        raise NetworkUnavailableError("Overpass returned an implausibly small network")
    return NetworkBundle(graph=graph, buildings=buildings, source="osm-overpass",
                         detail=f"{graph.number_of_nodes()} nodes from Overpass")


def node_key(lat: float, lon: float) -> int:
    return int(round(lat * 1e6)) * 10_000_000 + int(round(lon * 1e6)) % 10_000_000


def parse_height(tags: dict) -> float:
    raw = str(tags.get("height") or tags.get("building:levels") or "")
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", raw)
    if not m:
        return 10.0
    val = float(m.group(1))
    if "ft" in raw or "feet" in raw:
        val *= 0.3048
    if not tags.get("height") and "building:levels" in tags:  # levels -> metres
        val *= 3.2
    return max(3.0, min(val, 320.0))


# ----------------------------------------------------------------- snapshot
def load_snapshot_network(settings: Settings) -> NetworkBundle:
    import json

    data_dir = Path(__file__).resolve().parents[1] / "data"
    payload = json.loads((data_dir / "snapshot" / "graph.json").read_text(encoding="utf-8"))
    graph = nx.Graph()
    for node_id, (lon, lat) in payload["nodes"].items():
        graph.add_node(int(node_id), x=lon, y=lat)
    for edge in payload["edges"]:
        geom = LineString(edge["coords"])
        graph.add_edge(
            edge["u"], edge["v"],
            length=edge["length"], name=edge.get("name", ""), highway=edge.get("highway", "residential"),
            surface=edge.get("surface", "asphalt"), lit=edge.get("lit", True),
            sidewalk=edge.get("sidewalk", True), geom=geom, source="snapshot",
        )
    buildings = load_buildings(data_dir / "snapshot" / "buildings.geojson")
    return NetworkBundle(
        graph=graph, buildings=buildings, source="snapshot:downtown-austin",
        detail=f"{graph.number_of_nodes()} nodes / {graph.number_of_edges()} edges (bundled snapshot)",
    )


def load_buildings(path) -> list[Building]:
    """Buildings from a GeoJSON file (polygons + height_m property)."""
    import json

    buildings: list[Building] = []
    data = json.loads(Path(path).read_text(encoding="utf-8"))
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


Sequence4 = tuple[float, float, float, float]
