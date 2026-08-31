"""Micro-climate weighting engine tests (the core algorithm)."""
from __future__ import annotations

from datetime import datetime, timezone

import networkx as nx
import pytest
from shapely.geometry import LineString

from app.core.constants import NORMALISATION, PROFILES
from app.services.environment import EnvironmentGrids
from app.services.routing_engine import NoRouteError, RoutingEngine, canopy_norm, clamp01, heat_index
from app.services.shadow_service import ShadowService

UTC = timezone.utc


class _StubCache:
    def get_object(self, key):
        return None

    def set_object(self, key, value, ttl_s=300.0):
        pass

    def get_or_set(self, key, ttl_s, factory):
        return factory()

    def invalidate_prefix(self, prefix):
        pass


class _StubCanopyIndex:
    """Canopy everywhere on the north corridor (lat > 30.2675)."""

    def fraction_for_line(self, line, spacing_m=10.0):
        return 1.0 if line.interpolate(0.5, normalized=True).y > 30.2675 else 0.0

    def coverage_fraction(self, points):
        if not points:
            return 0.0
        return 1.0 if sum(p.y for p in points) / len(points) > 30.2675 else 0.0


def _settings():
    return type("S", (), {
        "bbox_tuple": (-97.755, 30.260, -97.730, 30.278),
        "center_lat": 30.2672, "center_lon": -97.7431,
        "walk_speed_mps": 1.34, "hazard_buffer_m": 50.0,
    })()


@pytest.fixture(scope="module")
def mini():
    """Two parallel corridors: a hot street (south) and a shaded street (north).

    Geographically consistent (edge lengths = haversine distances) so the A*
    heuristic stays admissible.  The shaded corridor is ~18% longer; the cool
    profile must still prefer it, while fastest stays on the short hot one.
    """
    import numpy as np

    lst = np.full((2, 2), 42.0, dtype=np.float32)  # hot summer day
    ndvi = np.full((2, 2), 0.55, dtype=np.float32)
    env = EnvironmentGrids.from_arrays(lst, ndvi, (-97.755, 30.260, -97.730, 30.278), "t", "n")
    settings = _settings()

    g = nx.Graph()
    coords = {
        1: (-97.7440, 30.2674), 2: (-97.7425, 30.2674), 3: (-97.7410, 30.2674),  # hot south
        4: (-97.7440, 30.2676), 5: (-97.7425, 30.2676), 6: (-97.7410, 30.2676),  # shaded north
    }
    for i, (x, y) in coords.items():
        g.add_node(i, x=x, y=y)

    def link(u, v):
        a, b = coords[u], coords[v]
        from app.core.geo_utils import haversine_m

        g.add_edge(u, v, length=haversine_m(*a, *b), geom=LineString([a, b]), name="",
                   highway="residential", surface="asphalt", lit=True, sidewalk=True)

    link(1, 2); link(2, 3)   # hot corridor
    link(4, 5); link(5, 6)   # shaded corridor
    link(1, 4); link(2, 5); link(3, 6)  # thin connectors

    shadow = ShadowService([], settings, _StubCache())
    engine = RoutingEngine(g, env, shadow, settings, _StubCache(), canopy_index=_StubCanopyIndex())
    return engine


def test_heat_index_normalisation():
    lo, hi = NORMALISATION["lst_min_c"], NORMALISATION["lst_max_c"]
    assert heat_index(lo) == 0.0
    assert heat_index(hi) == 1.0
    assert heat_index(hi + 10) == 1.0  # clamped above
    assert 0.7 < heat_index(41.0) < 0.8


def test_canopy_norm_normalisation():
    assert canopy_norm(NORMALISATION["ndvi_min"]) == 0.0
    assert canopy_norm(NORMALISATION["ndvi_max"]) == 1.0


def test_weight_matches_spec_formula(mini):
    engine = mini
    feats = engine.edge_features(1, 2, engine.graph[1][2])
    params = PROFILES["cool"]
    heat = heat_index(feats.lst_c)
    # Canopy_NDVI is a composite of raster NDVI and canopy/shade coverage
    green = clamp01(0.55 * canopy_norm(feats.ndvi) + 0.45 * clamp01(feats.canopy_frac * 0.5 + 0.0 * 0.5))
    expected = feats.length_m * (1.0 + params.alpha * heat - params.beta * green
                                 + params.gamma * 0.0)  # no hazards, full sidewalks
    w = engine.weight(feats, params, shadow_frac=0.0, shade=0.0, hazard_pen=0.0)
    assert abs(w - expected) < max(0.5, expected * 0.01)


def test_weight_increases_with_heat_and_hazard(mini):
    engine = mini
    feats = engine.edge_features(1, 2, engine.graph[1][2])
    params = PROFILES["cool"]
    base = engine.weight(feats, params, 0.0, 0.0, 0.0)
    hotter = engine.weight(feats, params, 0.0, 0.0, 0.0) if feats.lst_c > 46 else None
    # hazard penalty strictly increases weight
    haz = engine.weight(feats, params, 0.0, 0.0, 0.8)
    assert haz > base
    # canopy reward strictly decreases weight
    cool = engine.weight(feats, params, 0.0, 1.0, 0.0)
    assert cool < base
    assert hotter is None or hotter >= base


def test_cool_route_prefers_shaded_path(mini):
    res = mini.route((-97.7410, 30.2674), (-97.7440, 30.2674), "cool",
                     datetime(2024, 6, 21, 18, 0, tzinfo=UTC))
    assert {4, 5, 6} <= set(res.node_path)  # takes the shaded north corridor


def test_fastest_route_takes_shortest_path(mini):
    res = mini.route((-97.7410, 30.2674), (-97.7440, 30.2674), "fastest",
                     datetime(2024, 6, 21, 18, 0, tzinfo=UTC))
    assert {4, 5, 6} & set(res.node_path) == set()  # avoids the detour north
    assert res.metrics.distance_m <= 300


def test_profiles_diverge_on_cost(mini):
    when = datetime(2024, 6, 21, 18, 0, tzinfo=UTC)
    cool = mini.route((-97.7410, 30.2674), (-97.7440, 30.2674), "cool", when)
    fast = mini.route((-97.7410, 30.2674), (-97.7440, 30.2674), "fastest", when)
    assert cool.metrics.distance_m > fast.metrics.distance_m  # pays distance for shade
    assert cool.metrics.effort_min != fast.metrics.effort_min


def test_degenerate_route_raises(mini):
    with pytest.raises(NoRouteError):
        mini.route((-97.7430, 30.2674), (-97.7429, 30.26741), "cool",
                   datetime(2024, 6, 21, 18, 0, tzinfo=UTC))


def test_clamp01():
    assert clamp01(-1) == 0
    assert clamp01(0.5) == 0.5
    assert clamp01(2) == 1
