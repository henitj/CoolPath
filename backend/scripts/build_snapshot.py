"""Build the offline Downtown-Austin snapshot used as the final fallback
in CoolPath's data-ingestion hierarchy.

The snapshot is a *deterministic approximation* of downtown Austin's urban
fabric (named street grid digitised from public records, landmark towers,
parks, Lady Bird Lake / Shoal Creek, street-tree canopy) so that the full
product works with zero network access - CI, air-gapped demos, tests.

Live sources (Overpass, Planetary Computer, Austin Open Data) always take
priority when reachable; this bundle is the graceful-degradation layer.

Usage:
    python scripts/build_snapshot.py [--seed 42]
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import unary_union

REPO_BACKEND = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_BACKEND / "app" / "data" / "snapshot"

BBOX = (-97.755, 30.260, -97.730, 30.278)
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = BBOX
CENTER_LAT = 30.2672
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = M_PER_DEG_LAT * math.cos(math.radians(CENTER_LAT))

# --------------------------------------------------------------------- streets
# (lon, name, class) west -> east - downtown Austin avenues
NS_STREETS = [
    (-97.7532, "West Ave", "residential"),
    (-97.7504, "Nueces St", "residential"),
    (-97.7493, "Rio Grande St", "residential"),
    (-97.7478, "Lavaca St", "secondary"),
    (-97.7468, "Guadalupe St", "secondary"),
    (-97.7456, "San Antonio St", "residential"),
    (-97.7447, "Colorado St", "residential"),
    (-97.7438, "Brazos St", "secondary"),
    (-97.7425, "Congress Ave", "primary"),
    (-97.7394, "Trinity St", "residential"),
    (-97.7366, "Red River St", "secondary"),
    (-97.7358, "Rainey St", "residential"),
    (-97.7348, "Sabine St", "residential"),
    (-97.7338, "Neches St", "residential"),
    (-97.7327, "San Jacinto Blvd", "secondary"),
    (-97.7306, "I-35 Frontage Rd", "primary"),
]
RAINey_RANGE = (30.2620, 30.2666)  # Rainey St only runs from Cesar Chavez to 5th

# (lat, name, class) south -> north - the numbered grid + boulevards
EW_STREETS = [
    (30.2620, "Cesar Chavez St", "primary"),
    (30.2640, "2nd St", "residential"),
    (30.2648, "3rd St", "residential"),
    (30.2657, "4th St", "secondary"),
    (30.2666, "5th St", "secondary"),
    (30.2674, "6th St", "secondary"),
    (30.2683, "7th St", "secondary"),
    (30.2691, "8th St", "residential"),
    (30.2700, "9th St", "residential"),
    (30.2708, "10th St", "residential"),
    (30.2717, "11th St", "secondary"),
    (30.2726, "12th St", "secondary"),
    (30.2734, "13th St", "residential"),
    (30.2743, "14th St", "residential"),
    (30.2752, "15th St", "secondary"),
    (30.2760, "16th St", "residential"),
    (30.2768, "18th St", "residential"),
    (30.2777, "Martin Luther King Jr Blvd", "primary"),
]

PARKS = [
    {"name": "Republic Square", "bbox": (-97.7467, 30.2650, -97.7457, 30.2658), "canopy": 0.55},
    {"name": "Wooldridge Park", "bbox": (-97.7477, 30.2701, -97.7469, 30.2709), "canopy": 0.80},
    {"name": "Brush Square", "bbox": (-97.7393, 30.2650, -97.7384, 30.2658), "canopy": 0.45},
    {"name": "Waterloo Park", "bbox": (-97.7368, 30.2713, -97.7341, 30.2733), "canopy": 0.72},
    {"name": "Texas Capitol Grounds", "bbox": (-97.7390, 30.2738, -97.7350, 30.2762), "canopy": 0.42},
    {"name": "Butler Metro Park (North Shore)", "bbox": (-97.7510, 30.2602, -97.7480, 30.2614), "canopy": 0.50},
    {"name": "UT Austin West Mall", "bbox": (-97.7470, 30.2772, -97.7430, 30.2780), "canopy": 0.45},
]

SHOAL_CREEK_PATH = [
    (-97.7526, 30.2598), (-97.7521, 30.2630), (-97.7524, 30.2662), (-97.7520, 30.2695),
    (-97.7523, 30.2728), (-97.7518, 30.2755), (-97.7512, 30.2780),
]

LAKE_SHORELINE = [  # Lady Bird Lake north shoreline (west -> east)
    (-97.7550, 30.26100), (-97.7500, 30.26115), (-97.7450, 30.26095), (-97.7400, 30.26125),
    (-97.7350, 30.26105), (-97.7300, 30.26130),
]

# landmark towers: (lon, lat, height_m, name)
LANDMARKS = [
    (-97.7442, 30.2647, 210, "The Austonian"),
    (-97.7416, 30.2669, 157, "Frost Bank Tower"),
    (-97.7420, 30.2645, 125, "JW Marriott Austin"),
    (-97.7512, 30.2655, 176, "The Independent"),
    (-97.7394, 30.2629, 137, "Four Seasons Residences"),
    (-97.7457, 30.2646, 123, "W Austin Hotel & Residences"),
    (-97.7390, 30.2636, 100, "Austin Proper Hotel"),
    (-97.7502, 30.2652, 168, "360 Condominiums"),
    (-97.7430, 30.2671, 96, "The Dominion"),
]
CAPITOL_RECT = (-97.7374, 30.2742, -97.7365, 30.2752)  # lon1, lat1, lon2, lat2


def m2deg() -> tuple[float, float]:
    return 1.0 / M_PER_DEG_LON, 1.0 / M_PER_DEG_LAT


def circle_lonlat(lon: float, lat: float, radius_m: float, segments: int = 12) -> Polygon:
    dlon, dlat = m2deg()
    pts = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        pts.append((lon + radius_m * math.cos(a) / M_PER_DEG_LON,
                    lat + radius_m * math.sin(a) / M_PER_DEG_LAT))
    pts.append(pts[0])
    return Polygon(pts)


def haversine(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(a))


def build_graph(rng: random.Random):
    nodes: dict[tuple[float, float], int] = {}
    edges: list[dict] = []

    def node_id(lon: float, lat: float) -> int:
        key = (round(lon, 7), round(lat, 7))
        if key not in nodes:
            nodes[key] = len(nodes)
        return nodes[key]

    def add_edge(lon1, lat1, lon2, lat2, name, highway, surface, lit, sidewalk):
        u, v = node_id(lon1, lat1), node_id(lon2, lat2)
        if u == v:
            return
        edges.append({
            "u": u, "v": v,
            "length": round(haversine(lon1, lat1, lon2, lat2), 2),
            "name": name, "highway": highway, "surface": surface,
            "lit": lit, "sidewalk": sidewalk,
            "coords": [[round(lon1, 7), round(lat1, 7)], [round(lon2, 7), round(lat2, 7)]],
        })

    ns_active = []
    for lon, name, klass in NS_STREETS:
        lo, hi = MIN_LAT, MAX_LAT
        if name == "Rainey St":
            lo, hi = RAINey_RANGE
        ns_active.append((lon, name, klass, lo, hi))

    ew_active = list(EW_STREETS)

    # grid edges: N-S streets split at every E-W crossing
    for lon, name, klass, lo, hi in ns_active:
        crossings = [(lat, ew_name, ew_klass) for lat, ew_name, ew_klass in ew_active if lo <= lat <= hi]
        crossings.sort()
        highway = {"primary": "primary", "secondary": "secondary"}.get(klass, "residential")
        for (lat1, _, _), (lat2, _, _) in zip(crossings, crossings[1:]):
            add_edge(lon, lat1, lon, lat2, name, highway, "asphalt", True, True)
        if crossings:
            add_edge(lon, lo, lon, crossings[0][0], name, highway, "asphalt", True, True)
            add_edge(lon, crossings[-1][0], lon, hi, name, highway, "asphalt", True, True)

    # E-W streets split at every N-S crossing
    for lat, name, klass in ew_active:
        crossings = sorted([(lon, ns_name) for lon, ns_name, ns_klass, lo, hi in ns_active
                            if lo <= lat <= hi])
        highway = {"primary": "primary", "secondary": "secondary"}.get(klass, "residential")
        for (lon1, _), (lon2, _) in zip(crossings, crossings[1:]):
            surface = "asphalt"
            if name == "6th St" and -97.7425 <= (lon1 + lon2) / 2 <= -97.7366:
                surface = "paving_stones"  # Entertainment district brickwork
            add_edge(lon1, lat, lon2, lat, name, highway, surface, True, True)
        if crossings:
            add_edge(MIN_LON, lat, crossings[0][0], lat, name, highway, "asphalt", True, True)
            add_edge(crossings[-1][0], lat, MAX_LON, lat, name, highway, "asphalt", True, True)

    # Lady Bird Lake hike & bike trail
    trail_pts = []
    for i, (lon, lat) in enumerate(LAKE_SHORELINE):
        for t in np.linspace(0, 1, 6)[:-1]:
            lon2 = LAKE_SHORELINE[i + 1][0] if i + 1 < len(LAKE_SHORELINE) else lon
            lat2 = LAKE_SHORELINE[i + 1][1] if i + 1 < len(LAKE_SHORELINE) else lat
            trail_pts.append((lon + (lon2 - lon) * t, lat + (lat2 - lat) * t + 0.00045 * math.sin(i * 2.1 + t * 3)))
    trail_pts.append(LAKE_SHORELINE[-1])
    for (lon1, lat1), (lon2, lat2) in zip(trail_pts, trail_pts[1:]):
        add_edge(lon1, lat1, lon2, lat2, "Lady Bird Lake Trail", "footway", "concrete", True, False)
    # connect trail to the grid at both ends
    for end_pt in (trail_pts[0], trail_pts[-1]):
        best = min(
            (((lon, lat), haversine(end_pt[0], end_pt[1], lon, lat)) for (lon, lat) in nodes),
            key=lambda kv: kv[1],
        )
        if best[1] < 400:
            add_edge(end_pt[0], end_pt[1], best[0][0], best[0][1], "Trail Connector", "footway", "concrete", True, False)

    # Shoal Creek trail (both banks)
    for side, offset in (("east", 14), ("west", -14)):
        dlon = offset / M_PER_DEG_LON
        bank = [(lon + dlon, lat) for lon, lat in SHOAL_CREEK_PATH]
        for (lon1, lat1), (lon2, lat2) in zip(bank, bank[1:]):
            add_edge(lon1, lat1, lon2, lat2, "Shoal Creek Trail", "footway", "gravel", False, False)
        if side == "east":
            # spurs connecting the creek trail to the street grid
            for lat in (30.2657, 30.2700, 30.2752):
                pt = (SHOAL_CREEK_PATH[2][0] + dlon, lat)
                nearest = min(
                    (((lon, la), haversine(pt[0], pt[1], lon, la)) for (lon, la) in nodes
                     if abs(la - lat) < 0.0004),
                    key=lambda kv: kv[1], default=None,
                )
                if nearest and nearest[1] < 350:
                    add_edge(pt[0], pt[1], nearest[0][0], nearest[0][1], "Creek Access", "footway", "concrete", False, False)

    nodes_out = {str(i): [round(lon, 7), round(lat, 7)] for (lon, lat), i in nodes.items()}
    return nodes_out, edges


def block_rects():
    """Iterator over (lon1, lat1, lon2, lat2) blocks of the street grid."""
    ns_lons = sorted(set([lon for lon, *_ in NS_STREETS] + [MIN_LON, MAX_LON]))
    ew_lats = sorted(set([lat for lat, *_ in EW_STREETS] + [MIN_LAT, MAX_LAT]))
    for lon1, lon2 in zip(ns_lons, ns_lons[1:]):
        for lat1, lat2 in zip(ew_lats, ew_lats[1:]):
            yield lon1, lat1, lon2, lat2


def zone_for(lon: float, lat: float) -> tuple[str, tuple[float, float]]:
    if lat > 30.2770:
        return "campus", (15, 35)
    if 30.2738 <= lat <= 30.2765 and -97.7392 <= lon <= -97.7348:
        return "civic", (12, 28)
    if lon >= -97.7360 and lat <= 30.2655:
        return "rainey", (25, 58)
    if lat <= 30.2650 and -97.7470 <= lon <= -97.7390:
        return "warehouse", (9, 20)
    if 30.2670 <= lat <= 30.2682 and -97.7420 <= lon <= -97.7350:
        return "entertainment", (11, 24)
    if -97.7460 <= lon <= -97.7390 and 30.2630 <= lat <= 30.2705:
        return "core", (18, 55)
    return "residential", (8, 16)


def in_parks_or_water(lon: float, lat: float, exclusions) -> bool:
    p = Point(lon, lat)
    return any(poly.contains(p) for poly in exclusions)


def build_buildings(rng: random.Random, exclusions):
    features = []

    def push(lon1, lat1, lon2, lat2, height, name="", btype="yes", skip_exclusion=False):
        poly = Polygon([(lon1, lat1), (lon2, lat1), (lon2, lat2), (lon1, lat2), (lon1, lat1)])
        if poly.is_empty or not poly.is_valid:
            return
        cx, cy = poly.centroid.x, poly.centroid.y
        if not skip_exclusion and in_parks_or_water(cx, cy, exclusions):
            return
        features.append({
            "type": "Feature",
            "properties": {"height_m": round(height, 1), "name": name, "building": btype, "source": "snapshot"},
            "geometry": mapping(poly),
        })

    # landmark towers snapped into their block interior
    blocks = list(block_rects())
    for lon, lat, height, name in LANDMARKS:
        for b in blocks:
            if b[0] < lon < b[2] and b[1] < lat < b[3]:
                inset_x = 0.00018
                inset_y = 0.00020
                cx = min(max(lon, b[0] + inset_x + 0.0001), b[2] - inset_x - 0.0001)
                cy = min(max(lat, b[1] + inset_y + 0.0001), b[3] - inset_y - 0.0001)
                push(cx - inset_x, cy - inset_y, cx + inset_x, cy + inset_y, height, name, "tower")
                break

    # Texas State Capitol
    push(*CAPITOL_RECT, 94.0, "Texas State Capitol", "civic", skip_exclusion=True)

    for idx, (lon1, lat1, lon2, lat2) in enumerate(blocks):
        inset_x, inset_y = 0.00016, 0.00016
        bx1, by1, bx2, by2 = lon1 + inset_x, lat1 + inset_y, lon2 - inset_x, lat2 - inset_y
        if bx2 - bx1 < 0.0002 or by2 - by1 < 0.0002:
            continue
        cx, cy = (bx1 + bx2) / 2, (by1 + by2) / 2
        if in_parks_or_water(cx, cy, exclusions):
            continue
        zone, (hmin, hmax) = zone_for(cx, cy)
        cols = 2 if (bx2 - bx1) > 0.0012 else 1
        rows = 2 if (by2 - by1) > 0.0009 else 1
        if cols * rows == 1:
            lots = [(bx1, by1, bx2, by2)]
        else:
            lots = []
            mx = (bx1 + bx2) / 2
            my = (by1 + by2) / 2
            lots = [
                (bx1, by1, mx, my), (mx, by1, bx2, my),
                (bx1, my, mx, by2), (mx, my, bx2, by2),
            ][: cols * rows]
        for li, (lx1, ly1, lx2, ly2) in enumerate(lots):
            if rng.random() < 0.12:  # some lots stay open (parking/plazas)
                continue
            pad = 0.35 + 0.25 * rng.random()
            fx1 = lx1 + (lx2 - lx1) * pad * 0.3
            fx2 = lx2 - (lx2 - lx1) * pad * 0.3
            fy1 = ly1 + (ly2 - ly1) * pad * 0.3
            fy2 = ly2 - (ly2 - ly1) * pad * 0.3
            if fx2 - fx1 < 0.00006 or fy2 - fy1 < 0.00006:
                continue
            height = rng.uniform(hmin, hmax)
            push(fx1, fy1, fx2, fy2, height, "", zone)
    return features


def build_water():
    features = []
    shoreline = [(lon, lat) for lon, lat in LAKE_SHORELINE]
    lower = [(lon, MIN_LAT - 0.002) for lon, _ in reversed(shoreline)]
    lake = Polygon(shoreline + lower)
    features.append({
        "type": "Feature",
        "properties": {"name": "Lady Bird Lake", "waterway": "river", "source": "snapshot"},
        "geometry": mapping(lake),
    })
    dlon = 8.0 / M_PER_DEG_LON
    left = [(lon - dlon, lat) for lon, lat in SHOAL_CREEK_PATH]
    right = [(lon + dlon, lat) for lon, lat in reversed(SHOAL_CREEK_PATH)]
    creek = Polygon(left + right)
    features.append({
        "type": "Feature",
        "properties": {"name": "Shoal Creek", "waterway": "stream", "source": "snapshot"},
        "geometry": mapping(creek),
    })
    return features, lake, creek


def build_canopy(rng: random.Random, parks_polys, lake, creek):
    features = []

    def add_tree(lon, lat, radius, kind):
        features.append({
            "type": "Feature",
            "properties": {"kind": kind, "radius_m": round(radius, 1), "source": "snapshot"},
            "geometry": mapping(circle_lonlat(lon, lat, radius, segments=10)),
        })

    canopy_p = 0.42 if True else 0

    # street trees along every grid edge
    nodes, edges = build_graph(random.Random(1))
    for edge in edges:
        klass = edge["highway"]
        if klass == "footway":
            p, spacing, rmax = 0.5, 16.0, 6.5
        elif klass == "primary":
            p, spacing, rmax = 0.25, 20.0, 6.0
        elif klass == "secondary":
            p, spacing, rmax = 0.35, 18.0, 6.5
        else:
            p, spacing, rmax = 0.45, 16.0, 8.0
        (lon1, lat1), (lon2, lat2) = edge["coords"]
        length = haversine(lon1, lat1, lon2, lat2)
        n = max(2, int(length / spacing))
        for i in range(1, n):
            t = i / n
            if rng.random() > p:
                continue
            lon = lon1 + (lon2 - lon1) * t
            lat = lat1 + (lat2 - lat1) * t
            # perpendicular offset into the planting strip (crowns overhang)
            off = rng.uniform(4.5, 7.5) * (1 if rng.random() < 0.5 else -1)
            dlon = off / M_PER_DEG_LON
            dlat = off / M_PER_DEG_LAT
            add_tree(lon + dlon, lat + dlat, rng.uniform(4.5, rmax), "street")

    # park canopy
    for (poly, meta) in parks_polys:
        minx, miny, maxx, maxy = poly.bounds
        density = meta["canopy"]
        n_side = int(math.sqrt(max(4, poly.area / (M_PER_DEG_LON * M_PER_DEG_LAT) / 250)))
        n_side = max(n_side, 3)
        for i in range(n_side):
            for j in range(n_side):
                tx = minx + (maxx - minx) * (i + 0.5) / n_side
                ty = miny + (maxy - miny) * (j + 0.5) / n_side
                if poly.contains(Point(tx, ty)) and rng.random() < density:
                    add_tree(tx, ty, rng.uniform(4.5, 8.5), "park")

    # Capitol tree rows
    cx1, cy1, cx2, cy2 = CAPITOL_RECT
    for k in range(-4, 5):
        add_tree(cx1 - 0.0006, cy1 + k * 0.00035, rng.uniform(5, 7), "park")
        add_tree(cx2 + 0.0006, cy1 + k * 0.00035, rng.uniform(5, 7), "park")

    # Shoal Creek riparian canopy
    for lon, lat in SHOAL_CREEK_PATH:
        for i in range(6):
            t = i / 6
            lon_i = lon + (0.0000 * t)
            lat_i = lat - 0.0025 + t * 0.005
            if rng.random() < 0.7 and MIN_LAT < lat_i < MAX_LAT:
                add_tree(lon_i + rng.uniform(-0.0004, 0.0004), lat_i, rng.uniform(4, 7), "riparian")

    # Butler park + lake trail trees
    for lon in np.arange(-97.7505, -97.7485, 0.0008):
        if rng.random() < 0.6:
            add_tree(float(lon) + rng.uniform(-0.0002, 0.0002), rng.uniform(30.2604, 30.2613),
                     rng.uniform(4, 6.5), "park")

    return features


def build_rasters(rng: random.Random, buildings, parks_polys, water_geoms, canopy_features):
    size = 96
    min_lon, min_lat, max_lon, max_lat = BBOX
    canopy_union = unary_union([Polygon(f["geometry"]["coordinates"][0]) for f in canopy_features])
    building_union = unary_union([
        Polygon(f["geometry"]["coordinates"][0]) for f in buildings
    ])
    road_union = unary_union([
        LineString(e["coords"]).buffer(9.0 / M_PER_DEG_LON) for e in build_graph(random.Random(1))[1]
    ])
    water_union = unary_union(water_geoms)
    park_union = unary_union([p for p, _ in parks_polys])

    from shapely.prepared import prep
    prep_canopy, prep_build = prep(canopy_union), prep(building_union)
    prep_road, prep_water, prep_park = prep(road_union), prep(water_union), prep(park_union)

    lst = np.zeros((size, size), dtype=np.float32)
    ndvi = np.zeros((size, size), dtype=np.float32)
    base_lst = {"water": 27.0, "park": 31.0, "canopy": 30.0, "building": 36.0, "road": 42.0, "ground": 39.5}
    base_ndvi = {"water": 0.02, "park": 0.55, "canopy": 0.68, "building": 0.12, "road": 0.07, "ground": 0.20}

    for row in range(size):
        lat = max_lat - (row + 0.5) / size * (max_lat - min_lat)
        for col in range(size):
            lon = min_lon + (col + 0.5) / size * (max_lon - min_lon)
            fracs = {k: 0.0 for k in base_lst}
            for si in (-0.25, 0.25):
                for sj in (-0.25, 0.25):
                    slon = lon + si / size * (max_lon - min_lon)
                    slat = lat + sj / size * (max_lat - min_lat)
                    p = Point(slon, slat)
                    if prep_water.contains(p):
                        key = "water"
                    elif prep_park.contains(p):
                        key = "park"
                    elif prep_canopy.contains(p):
                        key = "canopy"
                    elif prep_build.contains(p):
                        key = "building"
                    elif prep_road.contains(p):
                        key = "road"
                    else:
                        key = "ground"
                    fracs[key] += 0.25
            # urban-core intensity bonus (denser blocks run hotter)
            core_bonus = 1.4 if zone_for(lon, lat)[0] == "core" else 0.0
            lst[row, col] = sum(fracs[k] * base_lst[k] for k in fracs) + core_bonus + rng.gauss(0, 0.5)
            ndvi[row, col] = sum(fracs[k] * base_ndvi[k] for k in fracs) + rng.gauss(0, 0.025)

    np.clip(lst, 25.0, 48.0, out=lst)
    np.clip(ndvi, -0.15, 0.85, out=ndvi)
    return lst, ndvi


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    rng = random.Random(args.seed)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    parks_polys = []
    for meta in PARKS:
        lon1, lat1, lon2, lat2 = meta["bbox"]
        parks_polys.append((Polygon([(lon1, lat1), (lon2, lat1), (lon2, lat2), (lon1, lat2), (lon1, lat1)]), meta))
    parks_features = [
        {"type": "Feature",
         "properties": {"name": meta["name"], "kind": "park", "source": "snapshot"},
         "geometry": mapping(poly)}
        for poly, meta in parks_polys
    ]

    water_features, lake, creek = build_water()
    exclusions = [lake, creek] + [p for p, _ in parks_polys]

    buildings = build_buildings(rng, exclusions)
    canopy = build_canopy(rng, parks_polys, lake, creek)
    lst, ndvi = build_rasters(rng, buildings, parks_polys, [lake, creek], canopy)

    nodes, edges = build_graph(rng)

    (DATA_DIR / "graph.json").write_text(json.dumps({"nodes": nodes, "edges": edges}))
    for name, features in (
        ("buildings", buildings), ("canopy", canopy), ("water", water_features), ("parks", parks_features),
    ):
        (DATA_DIR / f"{name}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    np.savez_compressed(DATA_DIR / "environment.npz", lst=lst, ndvi=ndvi)

    meta = {
        "bbox": list(BBOX),
        "center": [CENTER_LAT, -97.7431],
        "seed": args.seed,
        "provenance": (
            "Deterministic offline approximation of downtown Austin's urban fabric "
            "(named street grid, landmark towers, parks, Lady Bird Lake / Shoal Creek, "
            "street-tree canopy, land-cover-derived LST & NDVI rasters). "
            "Generated by scripts/build_snapshot.py - live satellite and open-data "
            "sources override these layers whenever reachable."
        ),
        "counts": {
            "nodes": len(nodes), "edges": len(edges), "buildings": len(buildings),
            "canopy_polygons": len(canopy),
        },
        "environment": {
            "shape": list(lst.shape),
            "lst_c_range": [float(lst.min()), float(lst.max())],
            "ndvi_range": [float(ndvi.min()), float(ndvi.max())],
            "model": "land-cover-weighted summer-afternoon composite",
        },
    }
    (DATA_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta["counts"], indent=2))
    print("environment:", meta["environment"])
    print(f"snapshot written to {DATA_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
