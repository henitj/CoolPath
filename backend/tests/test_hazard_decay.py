"""Crowdsourced hazard decay model tests (50 m buffer, temporal decay)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from shapely.geometry import LineString
from sqlalchemy import update

from app.models.hazard import Hazard
from app.models.schemas import HazardCreate

CDT = ZoneInfo("America/Chicago")
UTC = timezone.utc


def _make(service, db, lon=-97.7425, lat=30.2674, severity=5, category="blocked_path"):
    return service.create(db, HazardCreate(
        category=category, lat=lat, lon=lon, severity=severity, note="test"))


def _db(client):
    session = client.app.state.coolpath_db.session()
    try:
        yield session
        session.commit()
    finally:
        session.close()


def test_fresh_hazard_penalises_nearby_edge(client):
    state = client.app.state.coolpath
    service = state.hazards
    session = next(_db(client))
    _make(service, session)

    # Congress Ave block between 6th and 7th passes directly through the hazard
    line = LineString([(-97.7425, 30.2674), (-97.7425, 30.2683)])
    penalties = service.penalty_for_lines([line])
    assert penalties[0] > 0.7  # severe, fresh, on top of the edge


def test_no_penalty_beyond_50m_buffer(client):
    state = client.app.state.coolpath
    service = state.hazards
    session = next(_db(client))
    _make(service, session, lon=-97.7425, lat=30.2674)

    # ~0.002 deg lon away ≈ 190 m east
    far_line = LineString([(-97.7403, 30.2674), (-97.7402, 30.2674)])
    penalties = service.penalty_for_lines([far_line])
    assert penalties[0] == 0.0


def test_spatial_falloff_is_monotonic(client):
    state = client.app.state.coolpath
    service = state.hazards
    session = next(_db(client))
    _make(service, session, lon=-97.7425, lat=30.2674)

    at_5m = LineString([(-97.74245, 30.2674), (-97.7424, 30.2674)])
    at_30m = LineString([(-97.7422, 30.2674), (-97.7421, 30.2674)])
    p = service.penalty_for_lines([at_5m, at_30m])
    assert p[0] > p[1] > 0


def test_temporal_decay_halves_after_half_life(client):
    state = client.app.state.coolpath
    service = state.hazards
    db = client.app.state.coolpath_db
    session = next(_db(client))
    hazard = _make(service, session)

    line = LineString([(-97.7425, 30.2674), (-97.7425, 30.2683)])
    fresh = service.penalty_for_lines([line])[0]

    # age the report by one half-life (48 h)
    with db.engine.begin() as conn:
        conn.execute(update(Hazard).where(Hazard.id == hazard.id)
                     .values(created_at=datetime.now(UTC) - timedelta(hours=48)))
    service.cache.invalidate_prefix("hazards:")
    aged = service.penalty_for_lines([line])[0]
    assert 0 < aged < fresh * 0.45  # exp(-1) ≈ 0.368 (plus spatial factor)


def test_expired_hazards_are_inactive(client):
    state = client.app.state.coolpath
    service = state.hazards
    db = client.app.state.coolpath_db
    session = next(_db(client))
    hazard = _make(service, session)

    with db.engine.begin() as conn:
        conn.execute(update(Hazard).where(Hazard.id == hazard.id)
                     .values(created_at=datetime.now(UTC) - timedelta(hours=200)))
    service.cache.invalidate_prefix("hazards:")
    line = LineString([(-97.7425, 30.2674), (-97.7425, 30.2683)])
    assert service.penalty_for_lines([line])[0] == 0.0
    session2 = next(_db(client))
    assert service.list(session2, active_only=True) == []
