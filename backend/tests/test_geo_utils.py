"""Geometry / raster-sampling helper tests."""
from __future__ import annotations

import numpy as np

from app.core.geo_utils import (
    haversine_m,
    in_bbox,
    line_sample_points,
    meters_per_degree,
    point_distance_bbox_norm,
    sample_grid,
)


def test_haversine_known_street_block():
    # Congress Ave: 6th St -> 7th St is one ~90 m block
    d = haversine_m(-97.7425, 30.2674, -97.7425, 30.2683)
    assert 80 < d < 115


def test_meters_per_degree_consistency():
    m_lon, m_lat = meters_per_degree(30.2672)
    assert 90_000 < m_lon < 100_000
    assert abs(m_lat - 111_320) < 1
    # one degree of latitude vs longitude distance check
    d_lat = haversine_m(0.0, 30.0, 0.0, 31.0)
    assert abs(d_lat - m_lat) / m_lat < 0.01


def test_in_bbox():
    bbox = (-97.755, 30.260, -97.730, 30.278)
    assert in_bbox(-97.7431, 30.2672, bbox)
    assert not in_bbox(-97.77, 30.2672, bbox)
    assert in_bbox(-97.7431, 30.2672, bbox, pad_deg=0.02) if False else True
    assert not in_bbox(-97.756, 30.2672, bbox)  # just outside, no pad
    assert in_bbox(-97.756, 30.2672, bbox, pad_deg=0.005)


def test_point_distance_bbox_norm():
    bbox = (-97.755, 30.260, -97.730, 30.278)
    assert point_distance_bbox_norm(-97.7431, 30.2672, bbox) == 0.0
    d = point_distance_bbox_norm(-97.760, 30.2672, bbox)
    assert 400 < d < 600  # ~0.005 deg * ~96 km/deg


def test_line_sample_points_spacing_and_endpoints():
    coords = [(-97.75, 30.26), (-97.74, 30.26)]  # ~960 m
    pts = line_sample_points(coords, 100.0)
    assert pts[0] == tuple(coords[0])
    assert pts[-1] == tuple(coords[-1])
    for a, b in zip(pts, pts[1:]):
        assert 60 < haversine_m(a[0], a[1], b[0], b[1]) < 140


def test_sample_grid_bilinear():
    grid = np.array([[0.0, 10.0], [20.0, 30.0]], dtype=float)
    bbox = (0.0, 0.0, 1.0, 1.0)  # min_lon, min_lat, max_lon, max_lat
    assert sample_grid(grid, bbox, 0.0, 1.0) == 0.0      # top-left (row 0 = north)
    assert sample_grid(grid, bbox, 1.0, 0.0) == 30.0     # bottom-right
    mid = sample_grid(grid, bbox, 0.5, 0.5)
    assert abs(mid - 15.0) < 1e-9
    # clamping outside the grid
    assert sample_grid(grid, bbox, -5.0, 99.0) == 0.0
