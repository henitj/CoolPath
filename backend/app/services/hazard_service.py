"""Crowdsourced hazard layer: persistence, spatial decay, route scoring.

A freshly reported hazard penalises nearby street edges immediately::

    penalty(edge) = min(1, sum_h  sev_norm(h) * temporal_decay(h) * spatial_decay(h))

* spatial decay  : linear falloff to zero at ``hazard_buffer_m`` (50 m default)
* temporal decay : exponential with ``hazard_half_life_h`` (48 h default);
                   reports auto-expire after ``hazard_max_age_h`` (7 days)
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cache import Cache
from app.core.config import Settings
from app.core.constants import HAZARD_CATEGORIES
from app.core.geo_utils import M_PER_DEG_LAT
from app.models.hazard import Hazard
from app.models.schemas import HazardCreate


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class HazardService:
    def __init__(self, settings: Settings, cache: Cache) -> None:
        self.settings = settings
        self.cache = cache
        self._penalty_cache_ttl = 15.0  # seconds; keeps routes responsive but fresh

    # ------------------------------------------------------------------- CRUD
    def create(self, db: Session, payload: HazardCreate) -> Hazard:
        hazard = Hazard(
            category=payload.category,
            severity=payload.severity,
            note=payload.note,
            lat=payload.lat,
            lon=payload.lon,
            reporter=payload.reporter,
            status="active",
        )
        db.add(hazard)
        db.commit()
        db.refresh(hazard)
        self.cache.invalidate_prefix("hazards:")
        # The map's live road-colour overlay is derived from the same hazard
        # penalties as routing. Clear it too so a submitted report is visible
        # (and can influence route choice) on the very next request.
        self.cache.invalidate_prefix("conditions:")
        return hazard

    def get(self, db: Session, hazard_id: int) -> Hazard | None:
        return db.get(Hazard, hazard_id)

    def list(self, db: Session, bbox: Sequence[float] | None = None,
             category: str | None = None, active_only: bool = True,
             limit: int = 500) -> list[Hazard]:
        stmt = select(Hazard).order_by(Hazard.created_at.desc()).limit(limit)
        hazards = list(db.scalars(stmt))
        out = []
        for h in hazards:
            if active_only and h.status != "active":
                continue
            if active_only and self._age_hours(h) > self.settings.hazard_max_age_h:
                continue
            if category and h.category != category:
                continue
            if bbox:
                min_lon, min_lat, max_lon, max_lat = bbox
                if not (min_lon <= h.lon <= max_lon and min_lat <= h.lat <= max_lat):
                    continue
            out.append(h)
        return out

    def delete(self, db: Session, hazard_id: int) -> bool:
        hazard = db.get(Hazard, hazard_id)
        if hazard is None:
            return False
        db.delete(hazard)
        db.commit()
        self.cache.invalidate_prefix("hazards:")
        self.cache.invalidate_prefix("conditions:")
        return True

    # ---------------------------------------------------------------- scoring
    def penalty_for_lines(self, lines: Sequence, when: datetime | None = None) -> dict[int, float]:
        """Hazard penalty for each shapely line, keyed by index.

        Fresh severe reports near an edge push the penalty towards 1.0
        immediately; effects decay spatially (50 m) and temporally (48 h).
        """
        now = when or _utcnow()
        active = self._active_reports(now)
        if not active:
            return {i: 0.0 for i in range(len(lines))}
        penalties: dict[int, float] = {}
        buffer = self.settings.hazard_buffer_m
        for idx, line in enumerate(lines):
            total = 0.0
            for hazard, decay, sev_norm in active:
                distance = _point_line_distance_m(hazard.lon, hazard.lat, line)
                if distance >= buffer:
                    continue
                spatial = 1.0 - (distance / buffer)
                total += sev_norm * decay * spatial
                if total >= 1.0:
                    total = 1.0
                    break
            penalties[idx] = round(total, 4)
        return penalties

    def hazards_near_line(self, line, when: datetime | None = None) -> list[dict]:
        now = when or _utcnow()
        buffer = self.settings.hazard_buffer_m
        near = []
        for hazard, decay, sev_norm in self._active_reports(now):
            distance = _point_line_distance_m(hazard.lon, hazard.lat, line)
            if distance <= buffer:
                near.append({"id": hazard.id, "category": hazard.category,
                             "distance_m": round(distance, 1),
                             "decay": round(decay, 3)})
        return sorted(near, key=lambda x: x["distance_m"])

    # ---------------------------------------------------------------- private
    def _active_reports(self, now: datetime) -> list[tuple[Hazard, float, float]]:
        cache_key = "hazards:active"
        cached = self.cache.get_object(cache_key)
        if cached is not None:
            return cached
        max_age = self.settings.hazard_max_age_h
        active: list[tuple[Hazard, float, float]] = []
        session = self._db_session_factory()
        try:
            rows = list(session.scalars(select(Hazard).where(Hazard.status == "active")))
            for h in rows:
                age_h = self._age_hours(h, now)
                if age_h > max_age:
                    continue
                decay = math.exp(-age_h / self.settings.hazard_half_life_h)
                sev_norm = h.severity / 5.0
                weight = HAZARD_CATEGORIES.get(h.category, {}).get("weight", 0.5)
                active.append((h, decay, min(1.0, sev_norm * weight * 1.4)))
        finally:
            session.close()
        self.cache.set_object(cache_key, active, self._penalty_cache_ttl)
        return active

    def bind_session_factory(self, session_factory) -> None:
        self._session_factory = session_factory

    def _db_session_factory(self):
        factory = getattr(self, "_session_factory", None)
        if factory is None:  # pragma: no cover - defensive
            raise RuntimeError("HazardService has no session factory bound")
        return factory()

    @staticmethod
    def _age_hours(hazard: Hazard, now: datetime | None = None) -> float:
        created = hazard.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return max(0.0, ((now or _utcnow()) - created).total_seconds() / 3600.0)


def _point_line_distance_m(lon: float, lat: float, line) -> float:
    """Distance from a WGS84 point to a shapely LineString, in metres.

    Projects both to a local equirectangular frame centred on the line for
    accuracy at city scale.
    """
    import math as _math

    from shapely.geometry import Point
    from shapely.ops import transform

    lat0 = line.bounds[1] + (line.bounds[3] - line.bounds[1]) / 2
    m_lon = M_PER_DEG_LAT * _math.cos(_math.radians(lat0))
    scale_x = m_lon
    scale_y = M_PER_DEG_LAT

    def to_local(geom):
        return transform(lambda x, y, z=None: (x * scale_x, y * scale_y), geom)

    line_m = to_local(line)
    point_m = Point(lon * scale_x, lat * scale_y)
    return float(point_m.distance(line_m))
