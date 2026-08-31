"""Solar position + shadow geometry tests (pysolar + NOAA fallback)."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.solar import _noaa_solar_position, shadow_length_m, solar_position

AUSTIN = (30.2672, -97.7431)
CDT = ZoneInfo("America/Chicago")


def test_summer_afternoon_position():
    when = datetime(2024, 6, 21, 13, 30, tzinfo=CDT)  # ~15 min before solar noon
    solar = solar_position(when, *AUSTIN)
    assert abs(solar.altitude_deg - 83.1) < 1.5
    assert abs(solar.azimuth_deg - 174.4) < 2.5  # due-south, marginally east
    assert solar.is_daytime


def test_winter_noon_position():
    when = datetime(2024, 12, 21, 12, 0, tzinfo=ZoneInfo("America/Chicago"))
    solar = solar_position(when, *AUSTIN)
    assert abs(solar.altitude_deg - 35.9) < 1.5
    assert 160 < solar.azimuth_deg < 185


def test_night_negative_altitude():
    when = datetime(2024, 6, 21, 3, 0, tzinfo=CDT)  # 3 AM local
    solar = solar_position(when, *AUSTIN)
    assert solar.altitude_deg < 0
    assert not solar.is_daytime


def test_shadow_bearing_is_antiparallel_to_azimuth():
    when = datetime(2024, 10, 15, 16, 0, tzinfo=CDT)  # afternoon, sun in the west
    solar = solar_position(when, *AUSTIN)
    assert 215 < solar.azimuth_deg < 270  # SW-W (mid-afternoon October)
    assert 35 < solar.shadow_bearing_deg < 90  # shadows point SE-NE


def test_noaa_fallback_matches_pysolar():
    samples = [
        datetime(2024, 3, 20, 18, 0, tzinfo=timezone.utc),
        datetime(2024, 6, 21, 13, 30, tzinfo=CDT).astimezone(timezone.utc),
        datetime(2024, 12, 21, 18, 0, tzinfo=timezone.utc),
        datetime(2024, 9, 22, 1, 0, tzinfo=timezone.utc),  # night
    ]
    for when in samples:
        pysolar = solar_position(when, *AUSTIN)
        alt, az = _noaa_solar_position(when.astimezone(timezone.utc), *AUSTIN)
        assert abs(pysolar.altitude_deg - alt) < 0.8, (when, pysolar, alt)
        delta_az = abs((pysolar.azimuth_deg - az + 180) % 360 - 180)
        assert delta_az < 1.2, (when, pysolar.azimuth_deg, az)


def test_shadow_length_geometry():
    # 100 m pole at 30 deg elevation -> ~173 m shadow
    assert abs(shadow_length_m(100.0, 30.0) - 100.0 / math.tan(math.radians(30.0))) < 0.5
    assert shadow_length_m(50.0, 0.0) is None  # sun on the horizon/night


def test_naive_datetime_treated_as_utc():
    solar = solar_position(datetime(2024, 6, 21, 18, 30), *AUSTIN)
    solar_utc = solar_position(datetime(2024, 6, 21, 18, 30, tzinfo=timezone.utc), *AUSTIN)
    assert abs(solar.altitude_deg - solar_utc.altitude_deg) < 1e-6
