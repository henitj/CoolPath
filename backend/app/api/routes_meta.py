"""Health + metadata endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.core.constants import HAZARD_CATEGORIES, NORMALISATION, PROFILES

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/meta")
def meta(request: Request) -> dict:
    state = request.app.state.coolpath
    settings = state.settings
    return {
        "name": "CoolPath",
        "tagline": "Micro-climate & walkability routing for Downtown Austin",
        "version": settings.version,
        "bbox": list(settings.bbox_tuple),
        "center": {"lat": settings.center_lat, "lon": settings.center_lon},
        "timezone": settings.timezone,
        "profiles": [
            {"id": p.profile, "label": p.label, "description": p.description,
             "alpha": p.alpha, "beta": p.beta, "gamma": p.gamma}
            for p in PROFILES.values()
        ],
        "hazard_categories": [
            {"id": k, **v} for k, v in HAZARD_CATEGORIES.items()
        ],
        "weight_formula": "W = dist * (1 + alpha*HeatIndex - beta*CanopyNDVI + gamma*HazardPenalty + Accessibility)",
        "normalisation": NORMALISATION,
        "walk_speed_mps": settings.walk_speed_mps,
        "hazard_buffer_m": settings.hazard_buffer_m,
    }
