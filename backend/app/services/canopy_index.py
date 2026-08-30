"""Spatial index over tree-canopy polygons.

Route edges are scored by the fraction of sample points within a small
tolerance (default 3 m) of a canopy polygon - modelling the fact that mature
street trees overhang the sidewalk and curb lane.  An STRtree with
``query_nearest`` keeps this fast for every edge in the graph.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np
from shapely.geometry import Point
from shapely.strtree import STRtree

M_PER_DEG_LAT = 111_320.0


class CanopyIndex:
    def __init__(self, polygons: Sequence, tolerance_m: float = 3.0) -> None:
        self.polygons = list(polygons)
        self.tree = STRtree(self.polygons) if self.polygons else None
        self.tolerance_deg_lat = tolerance_m / M_PER_DEG_LAT

    @property
    def is_empty(self) -> bool:
        return not self.polygons

    def coverage_fraction(self, points: Sequence[Point]) -> float:
        """Fraction of points within ``tolerance_m`` of any canopy polygon."""
        if self.tree is None or not len(points):
            return 0.0
        hits = 0
        for p in points:
            _idx, dist = self.tree.query_nearest(p, return_distance=True)
            if float(np.min(dist)) <= self.tolerance_deg_lat:
                hits += 1
        return hits / len(points)

    def fraction_for_line(self, line, spacing_m: float = 10.0) -> float:
        from app.core.geo_utils import line_sample_points

        pts = [Point(c) for c in line_sample_points(list(line.coords), spacing_m)]
        return self.coverage_fraction(pts)
