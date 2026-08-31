"""Crowdsourced hazard reports (persistent layer)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Hazard(Base):
    __tablename__ = "hazards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[int] = mapped_column(Integer, default=3)
    note: Mapped[str] = mapped_column(Text, default="")
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    reporter: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    def to_dict(self) -> dict:
        created = self.created_at if self.created_at.tzinfo else self.created_at.replace(tzinfo=timezone.utc)
        age_h = max(0.0, (datetime.now(timezone.utc) - created).total_seconds() / 3600.0)
        return {
            "id": self.id,
            "category": self.category,
            "severity": self.severity,
            "note": self.note,
            "lat": self.lat,
            "lon": self.lon,
            "reporter": self.reporter,
            "status": self.status,
            "created_at": created.isoformat(),
            "age_hours": round(age_h, 3),
        }
