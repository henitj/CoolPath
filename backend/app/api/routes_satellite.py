"""Satellite ingestion status + manual refresh (shows fallback hierarchy)."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/satellite")


@router.get("/status")
def status(request: Request) -> dict:
    return request.app.state.coolpath.status_payload()


@router.post("/refresh")
def refresh(request: Request,
            include_osm: bool | None = Query(None, description="Also rebuild the network from Overpass")) -> dict:
    state = request.app.state.coolpath
    return state.refresh_live_data(include_osm=include_osm)
