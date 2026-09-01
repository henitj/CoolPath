"""Map layer endpoints: buildings, canopy, water, parks, heat grid, shadows."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/layers")

_VALID = {"buildings", "canopy", "water", "parks", "heat"}


# NOTE: specific routes must be declared before the "/{layer}" catch-all.
@router.get("/shadows")
def shadows(request: Request,
            timestamp: str | None = Query(None, description="ISO timestamp (defaults to now)")) -> dict:
    state = request.app.state.coolpath
    tz = ZoneInfo(state.settings.timezone)
    if timestamp:
        try:
            when = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid ISO timestamp") from exc
    else:
        when = datetime.now(tz)
    return state.shadow.shadow_geojson(when)


@router.get("/network/stats")
def network_stats(request: Request) -> dict:
    return request.app.state.coolpath.network_stats()


@router.get("/road-conditions")
def road_conditions(
    request: Request,
    timestamp: str | None = Query(None, description="ISO timestamp (defaults to now)"),
) -> dict:
    """Colour-ready conditions for each walkable road segment.

    This is intentionally a separate overlay from the heat grid: it combines
    the current shade frame, surface temperature, canopy, accessibility data
    and active hazard reports into a single 0–100 walking-quality score.
    """
    state = request.app.state.coolpath
    tz = ZoneInfo(state.settings.timezone)
    if timestamp:
        try:
            when = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid ISO timestamp") from exc
        if when.tzinfo is None:
            when = when.replace(tzinfo=tz)
        else:
            when = when.astimezone(tz)
    else:
        when = datetime.now(tz)
    return state.engine.road_conditions(when)


@router.get("/{layer}")
def get_layer(layer: str, request: Request) -> dict:
    state = request.app.state.coolpath
    if layer not in _VALID:
        raise HTTPException(status_code=404, detail=f"unknown layer '{layer}'")
    fc = state.layers()[layer]
    return {**fc, "bbox": list(state.settings.bbox_tuple)}
