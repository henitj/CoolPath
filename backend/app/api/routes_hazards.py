"""Crowdsourced hazard reporting API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.constants import HAZARD_CATEGORIES
from app.core.geo_utils import in_bbox, point_distance_bbox_norm
from app.models.schemas import HazardCreate, HazardRead
from app.services.hazard_service import HazardService

router = APIRouter(prefix="/hazards")


def get_hazard_service(request: Request) -> HazardService:
    return request.app.state.coolpath.hazards


def get_session(request: Request) -> Session:
    db = request.app.state.coolpath_db
    session = db.session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _to_read(hazard) -> dict:
    data = hazard.to_dict()
    meta = HAZARD_CATEGORIES.get(hazard.category, {"label": "Other", "color": "#94a3b8", "weight": 0.4})
    data.update({"label": meta["label"], "color": meta["color"], "weight": meta["weight"]})
    return data


@router.post("", response_model=HazardRead, status_code=201)
def report_hazard(payload: HazardCreate, request: Request,
                  session: Session = Depends(get_session)) -> dict:
    state = request.app.state.coolpath
    bbox = state.settings.bbox_tuple
    if not in_bbox(payload.lon, payload.lat, bbox, pad_deg=0.006):
        distance_out = point_distance_bbox_norm(payload.lon, payload.lat, bbox)
        raise HTTPException(
            status_code=422,
            detail=f"report is ~{distance_out:.0f} m outside the Downtown Austin study area",
        )
    hazard = state.hazards.create(session, payload)
    return _to_read(hazard)


@router.get("")
def list_hazards(request: Request,
                 session: Session = Depends(get_session),
                 bbox: str | None = Query(None, description="minlon,minlat,maxlon,maxlat"),
                 category: str | None = None,
                 active_only: bool = True,
                 limit: int = Query(500, ge=1, le=2000)) -> dict:
    state = request.app.state.coolpath
    parsed_bbox = None
    if bbox:
        try:
            parts = [float(p) for p in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError
            parsed_bbox = tuple(parts)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="bbox must be minlon,minlat,maxlon,maxlat") from exc
    hazards = state.hazards.list(session, bbox=parsed_bbox, category=category,
                                 active_only=active_only, limit=limit)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                "properties": _to_read(h),
            }
            for h in hazards
        ],
        "count": len(hazards),
    }


@router.get("/categories")
def categories() -> dict:
    return {"categories": [{"id": k, **v} for k, v in HAZARD_CATEGORIES.items()]}


@router.get("/{hazard_id}")
def get_hazard(hazard_id: int, request: Request,
               session: Session = Depends(get_session)) -> dict:
    hazard = request.app.state.coolpath.hazards.get(session, hazard_id)
    if hazard is None:
        raise HTTPException(status_code=404, detail="hazard not found")
    return {"type": "Feature",
            "geometry": {"type": "Point", "coordinates": [hazard.lon, hazard.lat]},
            "properties": _to_read(hazard)}


@router.delete("/{hazard_id}", status_code=200)
def delete_hazard(hazard_id: int, request: Request,
                  session: Session = Depends(get_session)) -> dict:
    deleted = request.app.state.coolpath.hazards.delete(session, hazard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="hazard not found")
    return {"deleted": hazard_id}
