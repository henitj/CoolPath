"""Curated destinations for the mobile destination picker."""
from __future__ import annotations

from fastapi import APIRouter, Request
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


@router.get("")
def places(request: Request) -> dict:
    state = request.app.state.coolpath
    bbox = state.settings.bbox_tuple
    out = [
        {"id": pid, "name": name, "lon": lon, "lat": lat, "kind": kind, "blurb": blurb}
        for pid, name, lon, lat, kind, blurb in CURATED
        if in_bbox(lon, lat, bbox)
    ]
    # add snapshot parks as natural destinations
    for feat in state.layers()["parks"].get("features", []):
        props = feat.get("properties", {})
        name = props.get("name")
        if not name or any(p["name"] == name for p in out):
            continue
        try:
            poly = Polygon(feat["geometry"]["coordinates"][0])
        except Exception:
            continue
        c = poly.centroid
        if in_bbox(c.x, c.y, bbox):
            out.append({"id": f"park-{len(out)}", "name": name, "lon": round(c.x, 6),
                        "lat": round(c.y, 6), "kind": "park",
                        "blurb": "Green space — typically the coolest walking nearby"})
    return {"places": out}
