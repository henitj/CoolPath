"""Domain constants: routing profiles, hazard taxonomy, weight parameters.

The micro-climate weight formula implemented by the routing engine is::

    Weight = Distance * (1 + alpha*Heat_Index - beta*Canopy_NDVI + gamma*Hazard_Penalty + Accessibility)

with per-profile parameter sets below.  ``Accessibility`` bundles sidewalk
presence, lighting and surface-quality penalties (dominant in the
``safe`` profile).
"""
from __future__ import annotations

from dataclasses import dataclass

# Study area: Downtown Austin, TX (EPSG:4326)
BBOX = (-97.755, 30.260, -97.730, 30.278)
CENTER = (30.2672, -97.7431)  # (lat, lon)

NORMALISATION = {
    # Surface temperature band used to map LST -> [0, 1] heat index
    "lst_min_c": 26.0,
    "lst_max_c": 46.0,
    # NDVI band mapped to [0, 1] canopy score
    "ndvi_min": -0.10,
    "ndvi_max": 0.80,
}


@dataclass(frozen=True)
class WeightParams:
    profile: str
    label: str
    description: str
    alpha: float  # heat penalty
    beta: float  # canopy/shade reward
    gamma: float  # crowdsourced hazard penalty
    sidewalk_penalty: float
    unlit_penalty: float
    rough_surface_penalty: float


PROFILES: dict[str, WeightParams] = {
    "fastest": WeightParams(
        profile="fastest",
        label="Fastest Path",
        description="Standard shortest-distance A* route. Minimal micro-climate weighting.",
        alpha=0.00, beta=0.00, gamma=0.25,
        sidewalk_penalty=0.10, unlit_penalty=0.00, rough_surface_penalty=0.05,
    ),
    "cool": WeightParams(
        profile="cool",
        label="Cool & Shaded",
        description="Prioritises tree canopy, building shadow coverage and low land-surface temperature.",
        alpha=0.90, beta=0.70, gamma=1.20,
        sidewalk_penalty=0.10, unlit_penalty=0.05, rough_surface_penalty=0.05,
    ),
    "safe": WeightParams(
        profile="safe",
        label="Safe & Accessible",
        description="Penalises crowdsourced hazards, missing sidewalks, unlit segments and rough surfaces.",
        alpha=0.25, beta=0.15, gamma=2.00,
        sidewalk_penalty=0.60, unlit_penalty=0.45, rough_surface_penalty=0.30,
    ),
}

ROUGH_SURFACES = {"gravel", "dirt", "ground", "grass", "sand", "mud", "unpaved"}

HAZARD_CATEGORIES: dict[str, dict] = {
    "broken_sidewalk": {"label": "Broken Sidewalk", "color": "#f97316", "weight": 0.60},
    "extreme_sun": {"label": "No Shade / Extreme Sun", "color": "#facc15", "weight": 0.50},
    "unlit_area": {"label": "Unlit Area", "color": "#a78bfa", "weight": 0.55},
    "construction": {"label": "Construction", "color": "#60a5fa", "weight": 0.70},
    "blocked_path": {"label": "Blocked Path", "color": "#f472b6", "weight": 0.80},
    "flooding": {"label": "Flooding / Standing Water", "color": "#22d3ee", "weight": 0.85},
    "other": {"label": "Other", "color": "#94a3b8", "weight": 0.40},
}

ROUTE_COLORS = {"fastest": "#9ca3af", "cool": "#22d3ee", "safe": "#34d399"}
