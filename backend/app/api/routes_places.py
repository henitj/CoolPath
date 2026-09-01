"""Destination search for the map and the mobile destination picker.

The bundled graph deliberately keeps CoolPath useful when the network is
unavailable.  In addition to curated downtown destinations, search exposes
real pedestrian-network intersections and accepts pasted latitude/longitude
coordinates.  That gives the web map a dependable, no-key-required place
search instead of a decorative text box.
"""
from __future__ import annotations

import re
from itertools import combinations

import httpx
from fastapi import APIRouter, Query, Request
from shapely.geometry import Polygon

from app.core.geo_utils import in_bbox

router = APIRouter(prefix="/places")

# Hand-curated points of interest (lon, lat, kind, blurb)
CURATED = [
    ("texas-state-capitol", "Texas State Capitol", -97.7369, 30.2747, "landmark",
     "Shaded grounds, grand lawns and view corridors"),
    ("frost-bank-tower", "Frost Bank Tower Plaza", -97.7417, 30.2688, "plaza",
     "Downtown core — hot midday, tall shadows late afternoon"),
    ("the-austonian", "The Austonian", -97.7442, 30.2647, "landmark", "2nd Street District tower"),
    ("rainey-street", "Rainey Street District", -97.7358, 30.2638, "district",
     "Bungalow bars under mature pecan trees"),
    ("lady-bird-lake-trail-congress", "Lady Bird Lake Trail @ Congress", -97.7425, 30.2613, "trail",
     "Lakefront loop — water breeze keeps it coolest"),
    ("waterloo-park", "Waterloo Park", -97.7355, 30.2723, "park",
     "12-acre downtown park with canopy and lawn"),
    ("republic-square", "Republic Square", -97.7462, 30.2654, "park",
     "Historic square with elm canopy"),
    ("brush-square", "Brush Square", -97.7389, 30.2654, "park", "Small square by the convention center"),
    ("2nd-street-district", "2nd Street District", -97.7462, 30.2645, "district",
     "Shops and patios between City Hall and the lake"),
    ("6th-street", "Sixth Street (Entertainment)", -97.7395, 30.2674, "district",
     "Historic strip — brick pavers, little canopy"),
    ("shoal-creek-trail-9th", "Shoal Creek Trail @ 9th St", -97.7521, 30.2700, "trail",
     "Riparian corridor, gravel, shaded most of the day"),
    ("butler-metro-park", "Butler Metro Park (North Shore)", -97.7495, 30.2608, "park",
     "Lakeside park at the Palmer Events Center"),
    ("ut-austin-west-mall", "UT Austin West Mall", -97.7450, 30.2776, "campus",
     "Campus edge of the map — oaks and breezeways"),
    ("congress-6th", "Congress Ave & 6th St", -97.7425, 30.2674, "intersection",
     "The symbolic center of downtown"),
]

_COORD_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")
_WORD_RE = re.compile(r"[a-z0-9]+")


def _curated_places(state) -> list[dict]:
    """Return all offline destinations, including named snapshot parks."""
    bbox = state.settings.bbox_tuple
    out = [
        {"id": pid, "name": name, "lon": lon, "lat": lat, "kind": kind, "blurb": blurb}
        for pid, name, lon, lat, kind, blurb in CURATED
        if in_bbox(lon, lat, bbox)
    ]
    # Add snapshot parks as natural destinations.
    for feat in state.layers()["parks"].get("features", []):
        props = feat.get("properties", {})
        name = props.get("name")
        if not name or any(p["name"] == name for p in out):
            continue
        try:
            poly = Polygon(feat["geometry"]["coordinates"][0])
        except Exception:
            continue
        center = poly.centroid
        if in_bbox(center.x, center.y, bbox):
            out.append({
                "id": f"park-{len(out)}",
                "name": name,
                "lon": round(center.x, 6),
                "lat": round(center.y, 6),
                "kind": "park",
                "blurb": "Green space — typically the coolest walking nearby",
            })
    return out


def _intersection_places(state) -> list[dict]:
    """Build searchable street intersections from the active pedestrian graph."""
    cache_key = "places:intersections"
    cached = state.cache.get_object(cache_key)
    if cached is not None:
        return cached

    graph = state.bundle.graph
    seen: set[str] = set()
    results: list[dict] = []
    for node_id, attrs in graph.nodes(data=True):
        names = sorted({
            str(data.get("name", "")).strip()
            for _, _, data in graph.edges(node_id, data=True)
            if str(data.get("name", "")).strip()
        })
        if len(names) < 2:
            continue
        for first, second in combinations(names, 2):
            # A label is enough as a stable de-duplication key because each
            # named pair normally meets once in this small downtown network.
            label = f"{first} & {second}"
            key = label.casefold()
            if key in seen:
                continue
            seen.add(key)
            results.append({
                "id": f"intersection-{node_id}-{len(results)}",
                "name": label,
                "lon": round(float(attrs["x"]), 6),
                "lat": round(float(attrs["y"]), 6),
                "kind": "intersection",
                "blurb": "Pedestrian-network intersection",
            })

    state.cache.set_object(cache_key, results, ttl_s=3600)
    return results


def _coordinate_result(query: str, bbox) -> dict | None:
    """Parse either ``lat, lon`` or ``lon, lat`` pasted into the search box."""
    values = [float(v) for v in _COORD_RE.findall(query)]
    if len(values) != 2:
        return None
    first, second = values
    if abs(first) <= 90 and abs(second) <= 180:
        lat, lon = first, second
    elif abs(first) <= 180 and abs(second) <= 90:
        lon, lat = first, second
    else:
        return None
    if not in_bbox(lon, lat, bbox, pad_deg=0.006):
        return None
    return {
        "id": f"coordinates-{lon:.6f}-{lat:.6f}",
        "name": f"Pinned coordinates ({lat:.5f}, {lon:.5f})",
        "lon": round(lon, 6),
        "lat": round(lat, 6),
        "kind": "intersection",
        "blurb": "Coordinates in the Downtown Austin coverage area",
    }


def _score(place: dict, query: str, words: list[str]) -> int:
    name = str(place["name"]).casefold()
    haystack = " ".join((name, str(place.get("kind", "")), str(place.get("blurb", "")))).casefold()
    if name == query:
        return 500
    if name.startswith(query):
        return 350
    if query in name:
        return 280
    # Match words rather than arbitrary substrings. In particular, a search
    # for "6th" must not rank "16th St & Congress" above the actual corner.
    name_words = set(_WORD_RE.findall(name))
    haystack_words = set(_WORD_RE.findall(haystack))
    name_matches = sum(word in name_words for word in words)
    matches = sum(word in haystack_words for word in words)
    if words and name_matches == len(words):
        return 250
    return (matches * 80) if words and matches == len(words) else matches * 10


def _geocode_if_needed(state, query: str, limit: int) -> list[dict]:
    """Use a narrowly bounded, keyless geocoder as a graceful fallback.

    We never use it for normal offline catalogue/intersection matches and we
    keep every result inside the app's routeable Downtown Austin bbox. This
    means a slow or blocked third-party service can never break the map's own
    search, while addresses such as a shop or venue not in the snapshot still
    work on an open network.
    """
    if state.settings.offline_mode:
        return []
    cache_key = f"places:geocode:{query}"
    cached = state.cache.get_object(cache_key)
    if cached is not None:
        return cached[:limit]

    min_lon, min_lat, max_lon, max_lat = state.settings.bbox_tuple
    try:
        response = httpx.get(
            state.settings.geocoder_url,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": min(limit, 8),
                "bounded": 1,
                "viewbox": f"{min_lon},{max_lat},{max_lon},{min_lat}",
                "countrycodes": "us",
            },
            headers={"User-Agent": "CoolPath/1.0 (Downtown Austin walking map)"},
            timeout=state.settings.geocoder_timeout_s,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        payload = []

    results: list[dict] = []
    if isinstance(payload, list):
        for item in payload:
            try:
                lon, lat = float(item["lon"]), float(item["lat"])
            except (KeyError, TypeError, ValueError):
                continue
            if not in_bbox(lon, lat, state.settings.bbox_tuple, pad_deg=0.006):
                continue
            display_name = str(item.get("display_name", "Downtown Austin location"))
            first, _, rest = display_name.partition(",")
            osm_type = str(item.get("osm_type", "place"))
            osm_id = str(item.get("osm_id", len(results)))
            results.append({
                "id": f"geocode-{osm_type}-{osm_id}",
                "name": first.strip() or "Downtown Austin location",
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "kind": "place",
                "blurb": rest.lstrip().strip() or "Geocoded downtown destination",
            })
    # Cache successes and failures so search remains fast and polite to the
    # public geocoder when someone edits a query repeatedly.
    state.cache.set_object(cache_key, results, ttl_s=900)
    return results[:limit]


@router.get("/search")
def search_places(
    request: Request,
    q: str = Query(..., min_length=1, max_length=120, description="Place, street, intersection, or coordinates"),
    limit: int = Query(8, ge=1, le=20),
) -> dict:
    """Find offline-ready destinations and intersections within the study area."""
    state = request.app.state.coolpath
    query = q.strip().casefold()
    if not query:
        return {"places": [], "source": "offline-search"}

    coordinate = _coordinate_result(query, state.settings.bbox_tuple)
    words = _WORD_RE.findall(query)
    candidates = _curated_places(state) + _intersection_places(state)
    ranked = [
        (score, place)
        for place in candidates
        if (score := _score(place, query, words)) > 0
    ]
    ranked.sort(key=lambda item: (-item[0], item[1]["name"]))
    places = [place for _, place in ranked[:limit]]
    source = "offline-search"
    if coordinate is not None:
        places = [coordinate, *[place for place in places if place["id"] != coordinate["id"]]][:limit]
    elif not places:
        places = _geocode_if_needed(state, q.strip(), limit)
        if places:
            source = "geocoder-fallback"
    return {"places": places, "source": source}


@router.get("")
def places(request: Request) -> dict:
    return {"places": _curated_places(request.app.state.coolpath)}
