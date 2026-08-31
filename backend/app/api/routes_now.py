"""Micro-climate conditions at an arbitrary point (used by the mobile app's
"Near me" card and map tap-readouts)."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request
from shapely.geometry import Point

from app.core.geo_utils import in_bbox, point_distance_bbox_norm
from app.services.conditions import (
    comfort_score,
    combine_shade,
    sample_points_around,
)

router = APIRouter()


@router.get("/now")
def conditions_now(request: Request,
                   lat: float = Query(..., ge=-90, le=90),
                   lon: float = Query(..., ge=-180, le=180),
                   timestamp: str | None = Query(None, description="ISO instant for the shadow state")) -> dict:
    state = request.app.state.coolpath
    bbox = state.settings.bbox_tuple
    if not in_bbox(lon, lat, bbox, pad_deg=0.006):
        outside = point_distance_bbox_norm(lon, lat, bbox)
        raise HTTPException(status_code=422, detail=f"~{outside:.0f} m outside the Downtown Austin study area")

    tz = ZoneInfo(state.settings.timezone)
    if timestamp:
        try:
            when = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(tz)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid ISO timestamp") from exc
    else:
        when = datetime.now(tz)

    env = state.environment
    temp_c = env.lst_at(lon, lat)
    ndvi = env.ndvi_at(lon, lat)
    pts = [Point(p) for p in sample_points_around(lon, lat)]
    shadow_frac = state.shadow.coverage_fraction(pts, when)
    canopy_index = getattr(state, "canopy_index", None)
    canopy_frac = canopy_index.coverage_fraction(pts) if canopy_index is not None else 0.0
    shade = combine_shade(shadow_frac, canopy_frac)
    solar = state.shadow.solar_at(when)

    return {
        "lat": lat,
        "lon": lon,
        "timestamp": when.isoformat(),
        "temp_c": round(temp_c, 1),
        "ndvi": round(ndvi, 3),
        "shadow_pct": round(100.0 * shadow_frac, 1),
        "canopy_pct": round(100.0 * canopy_frac, 1),
        "shade_pct": round(100.0 * shade, 1),
        "comfort": round(comfort_score(temp_c, shade, ndvi), 0),
        "sun": {
            "altitude_deg": round(solar.altitude_deg, 1),
            "azimuth_deg": round(solar.azimuth_deg, 1),
            "is_daytime": solar.is_daytime,
        },
        "sources": {"temperature": env.source_lst, "vegetation": env.source_ndvi},
    }
