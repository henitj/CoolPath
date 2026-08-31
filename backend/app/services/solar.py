"""Solar position (azimuth / elevation) for dynamic shadow projection.

Primary implementation uses ``pysolar`` (as specified by the product brief);
a self-contained NOAA Solar Calculator port is included as a fallback so the
shadow engine keeps working if pysolar is unavailable.

Conventions
-----------
* ``altitude_deg``  : elevation above the horizon (0-90, negative at night)
* ``azimuth_deg``   : clockwise from True North (0=N, 90=E, 180=S, 270=W)
* input timestamps must be timezone-aware (UTC preferred)
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

try:  # pragma: no cover - exercised implicitly
    import pysolar.solar as _pysolar
except Exception:  # pragma: no cover
    _pysolar = None
    logger.warning("pysolar unavailable - using built-in NOAA solar position")


@dataclass(frozen=True)
class SolarPosition:
    altitude_deg: float
    azimuth_deg: float
    timestamp: datetime

    @property
    def is_daytime(self) -> bool:
        return self.altitude_deg > 0.5

    @property
    def shadow_bearing_deg(self) -> float:
        """Compass bearing (clockwise from N) that shadows point towards."""
        return (self.azimuth_deg + 180.0) % 360.0


def solar_position(when: datetime, lat: float, lon: float) -> SolarPosition:
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when_utc = when.astimezone(timezone.utc)
    if _pysolar is not None:
        try:
            azimuth, altitude = _pysolar.get_position(lat, lon, when_utc)
            return SolarPosition(float(altitude), float(azimuth) % 360.0, when_utc)
        except Exception as exc:  # pragma: no cover
            logger.warning("pysolar failed (%s); using NOAA fallback", exc)
    altitude, azimuth = _noaa_solar_position(when_utc, lat, lon)
    return SolarPosition(altitude, azimuth % 360.0, when_utc)


def _noaa_solar_position(when_utc: datetime, lat: float, lon: float) -> tuple[float, float]:
    """NOAA Solar Calculator equations (degrees in/out).  Accuracy ~0.1 deg."""
    start = datetime(when_utc.year, 1, 1, tzinfo=timezone.utc)
    doy = (when_utc - start).total_seconds() / 86400.0  # fractional day of year
    g = math.radians(360.0 / 365.24) * doy
    eqtime = 229.18 * (
        0.000075
        + 0.001868 * math.cos(g)
        - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g)
        - 0.040849 * math.sin(2 * g)
    )  # minutes
    decl = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.001480 * math.sin(3 * g)
    )  # radians
    minutes = when_utc.hour * 60 + when_utc.minute + when_utc.second / 60.0
    time_offset = eqtime + 4.0 * lon
    tst = minutes + time_offset
    ha = math.radians(tst / 4.0 - 180.0)
    lat_r = math.radians(lat)
    cos_zen = math.sin(lat_r) * math.sin(decl) + math.cos(lat_r) * math.cos(decl) * math.cos(ha)
    cos_zen = max(-1.0, min(1.0, cos_zen))
    zenith = math.acos(cos_zen)
    altitude = 90.0 - math.degrees(zenith)
    az = math.atan2(
        math.sin(ha),
        math.cos(ha) * math.sin(lat_r) - math.tan(decl) * math.cos(lat_r),
    )
    azimuth = math.degrees(az) % 360.0
    # NOAA's atan2 form is measured from South -> convert to clockwise from North
    azimuth = (azimuth + 180.0) % 360.0
    return altitude, azimuth


def shadow_length_m(height_m: float, altitude_deg: float) -> float | None:
    """Ground length of a shadow cast by a vertical object, or None at night."""
    if altitude_deg <= 0.5:
        return None
    return height_m / math.tan(math.radians(altitude_deg))


def shadow_offset_m(height_m: float, solar: SolarPosition) -> float | None:
    return shadow_length_m(height_m, solar.altitude_deg)
