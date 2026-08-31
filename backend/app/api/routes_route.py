"""POST /api/v1/route - multi-criteria pedestrian routing."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from zoneinfo import ZoneInfo

from app.core.constants import PROFILES, ROUTE_COLORS
from app.core.geo_utils import in_bbox, point_distance_bbox_norm
from app.models.schemas import RouteRequest
from app.services.routing_engine import NoRouteError

logger = logging.getLogger(__name__)
router = APIRouter()


def _route_feature(result, profile: str) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [[round(c[0], 6), round(c[1], 6)] for c in result.coords]},
        "properties": {
            "profile": profile,
            "label": PROFILES[profile].label,
            "color": ROUTE_COLORS[profile],
            "metrics": result.metrics.as_dict(),
        },
    }


@router.post("/route")
def compute_route(body: RouteRequest, request: Request) -> dict:
    state = request.app.state.coolpath
    settings = state.settings
    bbox = settings.bbox_tuple

    for name, (lon, lat) in (("origin", body.origin), ("destination", body.destination)):
        if not in_bbox(lon, lat, bbox, pad_deg=0.006):
            distance_out = point_distance_bbox_norm(lon, lat, bbox)
            raise HTTPException(
                status_code=422,
                detail=f"{name} is outside the Downtown Austin study area by ~{distance_out:.0f} m",
            )

    tz = ZoneInfo(settings.timezone)
    when = body.timestamp.astimezone(tz) if body.timestamp else datetime.now(tz)

    try:
        result = state.engine.route(body.origin, body.destination, body.profile, when)
    except NoRouteError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    response = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [[round(c[0], 6), round(c[1], 6)] for c in result.coords]},
        "properties": {
            "profile": body.profile,
            "label": PROFILES[body.profile].label,
            "color": ROUTE_COLORS[body.profile],
            "timestamp": when.isoformat(),
            "metrics": result.metrics.as_dict(),
            "samples": result.samples,
            "warnings": result.warnings,
        },
        "comparison": None,
        "baseline": None,
    }

    if body.include_baseline and body.profile != "fastest":
        try:
            baseline = state.engine.route(body.origin, body.destination, "fastest", when)
            response["baseline"] = _route_feature(baseline, "fastest")
            response["comparison"] = _comparison(result.metrics, baseline.metrics)
        except NoRouteError:  # pragma: no cover
            logger.warning("baseline routing failed; returning primary route only")

    return response


def _comparison(chosen, baseline) -> dict:
    return {
        "distance_delta_m": round(chosen.distance_m - baseline.distance_m, 1),
        "distance_delta_pct": round(100.0 * (chosen.distance_m - baseline.distance_m) / max(1.0, baseline.distance_m), 1),
        "temp_delta_c": round(chosen.avg_temp_c - baseline.avg_temp_c, 2),
        "max_temp_delta_c": round(chosen.max_temp_c - baseline.max_temp_c, 2),
        "shade_delta_pct": round(chosen.shade_pct - baseline.shade_pct, 1),
        "comfort_delta": round(chosen.comfort_score - baseline.comfort_score, 1),
        "hazard_delta": chosen.hazard_count - baseline.hazard_count,
        "effort_delta_min": round(chosen.effort_min - baseline.effort_min, 1),
    }


@router.get("/route/profiles")
def profiles() -> dict:
    return {"profiles": [p.asdict() if hasattr(p, 'asdict') else vars(p) for p in PROFILES.values()]}
