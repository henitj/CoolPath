"""Shared pytest fixtures.

Tests always run against the bundled offline snapshot (no network access is
required or attempted) with a throwaway SQLite database.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ["COOLPATH_OFFLINE_MODE"] = "1"
os.environ["COOLPATH_LIVE_REFRESH_ON_STARTUP"] = "0"
os.environ["COOLPATH_DATABASE_URL"] = f"sqlite:///{BACKEND_DIR / 'data' / 'test-coolpath.db'}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def app():
    return create_app()


@pytest.fixture(scope="session")
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_hazard_table(client):
    """Truncate hazards + invalidate caches after every test for isolation."""
    yield
    from sqlalchemy import delete

    from app.models.hazard import Hazard

    db = client.app.state.coolpath_db
    with db.engine.begin() as conn:
        conn.execute(delete(Hazard))
    client.app.state.coolpath.cache.invalidate_prefix("hazards:")


@pytest.fixture()
def bbox():
    return (-97.755, 30.260, -97.730, 30.278)
