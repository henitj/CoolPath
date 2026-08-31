"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.constants import HAZARD_CATEGORIES

HazardCategory = Literal[
    "broken_sidewalk", "extreme_sun", "unlit_area",
    "construction", "blocked_path", "flooding", "other",
]


class RouteRequest(BaseModel):
    origin: tuple[float, float] = Field(..., description="(lon, lat) in EPSG:4326")
    destination: tuple[float, float] = Field(..., description="(lon, lat) in EPSG:4326")
    profile: Literal["fastest", "cool", "safe"] = "cool"
    timestamp: datetime | None = Field(
        None, description="Shadow computation instant; defaults to now (America/Chicago)."
    )
    include_baseline: bool = Field(True, description="Also return the fastest-path baseline route.")

    @field_validator("origin", "destination")
    @classmethod
    def _sane_coords(cls, v: tuple[float, float]) -> tuple[float, float]:
        lon, lat = v
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("coordinates must be (lon, lat) in EPSG:4326")
        return v


class HazardCreate(BaseModel):
    category: HazardCategory
    lat: float
    lon: float
    severity: int = Field(3, ge=1, le=5)
    note: str = Field("", max_length=280)
    reporter: str | None = Field(None, max_length=64)


class HazardRead(HazardCreate):
    id: int
    status: str
    created_at: datetime
    age_hours: float
    label: str
    color: str
    weight: float


class HazardOut(HazardRead):
    pass
