"""Application settings (12-factor, env-driven).

Every field can be overridden with a ``COOLPATH_`` prefixed environment
variable, e.g. ``COOLPATH_DATABASE_URL``, ``COOLPATH_OFFLINE_MODE``.
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="COOLPATH_", env_file=".env", extra="ignore")

    app_name: str = "CoolPath API"
    version: str = "1.0.0"

    # ------------------------------------------------------------------ data
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'coolpath.db').as_posix()}"
    redis_url: str | None = None

    # -------------------------------------------------------------- behaviour
    # When True every live network fetch is skipped and the bundled offline
    # snapshot is served instead (used by CI and unit tests).
    offline_mode: bool = False
    # Attempt a background refresh of live sources on application startup.
    live_refresh_on_startup: bool = True
    live_refresh_osm: bool = False
    live_fetch_timeout_s: float = 8.0

    # ------------------------------------------------------------- study area
    # Downtown Austin, TX  (EPSG:4326)  min_lon, min_lat, max_lon, max_lat
    bbox: str = "-97.755,30.260,-97.730,30.278"
    center_lat: float = 30.2672
    center_lon: float = -97.7431
    timezone: str = "America/Chicago"

    # ---------------------------------------------------------------- routing
    walk_speed_mps: float = 1.34
    hazard_buffer_m: float = 50.0
    hazard_half_life_h: float = 48.0
    hazard_max_age_h: float = 168.0

    # ------------------------------------------------------------ live sources
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    pc_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    # City of Austin Open Data portal (Socrata) - Urban Tree Canopy dataset.
    austin_canopy_url: str = "https://data.austintexas.gov/resource/uj6p-2j9z.geojson?$limit=2000"
    # Optional ArcGIS REST endpoint for the Summer 2024 Urban Heat Island
    # disparity layer (left blank -> snapshot layer is used).
    austin_uhi_url: str = ""

    cors_origins: str = "*"

    # ---------------------------------------------------------------- helpers
    @property
    def bbox_tuple(self) -> tuple[float, float, float, float]:
        parts = [float(p) for p in self.bbox.split(",")]
        return parts[0], parts[1], parts[2], parts[3]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    return Settings()
