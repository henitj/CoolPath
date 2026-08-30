"""Environment rasters: LST + NDVI sanity against known land cover."""
from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def environment(client):
    return client.app.state.coolpath.environment


def test_ranges(environment):
    lo, hi = environment.lst_range
    assert 22 <= lo < hi <= 50
    nlo, nhi = environment.ndvi_range
    assert -0.2 <= nlo < nhi <= 0.9


def test_water_is_coolest(environment):
    lake = environment.lst_at(-97.7430, 30.2604)   # Lady Bird Lake sliver
    road = environment.lst_at(-97.7425, 30.2674)   # Congress & 6th intersection
    assert lake < road - 3.0, (lake, road)


def test_canopy_greener_than_road(environment):
    park_ndvi = environment.ndvi_at(-97.7355, 30.2723)   # Waterloo Park
    road_ndvi = environment.ndvi_at(-97.7306, 30.2700)   # I-35 frontage
    assert park_ndvi > road_ndvi + 0.05


def test_sampling_is_smooth(environment):
    a = environment.lst_at(-97.7431, 30.2672)
    b = environment.lst_at(-97.7435, 30.2676)
    assert abs(a - b) < 3.0


def test_sources_tracked(environment):
    assert "snapshot" in environment.source_lst
    assert "snapshot" in environment.source_ndvi
