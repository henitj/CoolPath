"""CoolPath API entrypoint.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes_hazards, routes_layers, routes_meta, routes_route, routes_satellite
from app.core.app_state import AppState
from app.core.cache import Cache
from app.core.config import Settings, get_settings
from app.core.db import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("coolpath")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    cache = Cache(settings.redis_url)
    db = Database(settings)
    data_dir = Path(__file__).resolve().parent / "data"
    state = AppState.build(settings, cache, data_dir)
    db.create_all()
    state.hazards.bind_session_factory(db.session_factory)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.live_refresh_on_startup and not settings.offline_mode:
            thread = threading.Thread(
                target=_safe_refresh, args=(state,), name="coolpath-live-refresh", daemon=True
            )
            thread.start()
        yield

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "Micro-climate & walkability routing for Downtown Austin. "
            "CoolPath weights the pedestrian graph by land-surface temperature, "
            "tree canopy / NDVI, projected building shadows and crowdsourced hazards."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.coolpath = state
    app.state.coolpath_db = db

    api = APIRouter(prefix="/api/v1")
    api.include_router(routes_meta.router)
    api.include_router(routes_route.router)
    api.include_router(routes_hazards.router)
    api.include_router(routes_layers.router)
    api.include_router(routes_satellite.router)
    app.include_router(api)
    return app


def _safe_refresh(state: AppState) -> None:
    try:
        report = state.refresh_live_data()
        logger.info("Startup live-data refresh finished: mode=%s", report.get("mode"))
    except Exception:  # pragma: no cover - never break startup
        logger.exception("Startup live-data refresh failed; snapshot data in use")


app = create_app()
