"""Environmental raster layers: Land Surface Temperature (LST) and NDVI.

Loads either a live satellite-derived grid (see ``satellite_service``) or the
bundled offline snapshot, and exposes bilinear sampling used by the routing
engine to score every pedestrian edge.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import numpy as np

from app.core.geo_utils import sample_grid


@dataclass
class EnvironmentGrids:
    lst_c: np.ndarray            # land surface temperature, degrees Celsius
    ndvi: np.ndarray             # normalised difference vegetation index
    bbox: Sequence[float]        # min_lon, min_lat, max_lon, max_lat
    source_lst: str = "snapshot"
    source_ndvi: str = "snapshot"
    meta: dict = field(default_factory=dict)

    # ------------------------------------------------------------------ probes
    def lst_at(self, lon: float, lat: float) -> float:
        return float(sample_grid(self.lst_c, self.bbox, lon, lat))

    def ndvi_at(self, lon: float, lat: float) -> float:
        return float(sample_grid(self.ndvi, self.bbox, lon, lat))

    # ------------------------------------------------------------------ stats
    @property
    def lst_range(self) -> tuple[float, float]:
        return float(np.nanmin(self.lst_c)), float(np.nanmax(self.lst_c))

    @property
    def ndvi_range(self) -> tuple[float, float]:
        return float(np.nanmin(self.ndvi)), float(np.nanmax(self.ndvi))

    def mean_over_points(self, points: Sequence[Sequence[float]]) -> dict:
        if not points:
            return {"lst_c": 0.0, "ndvi": 0.0}
        lst = [self.lst_at(lon, lat) for lon, lat in points]
        ndvi = [self.ndvi_at(lon, lat) for lon, lat in points]
        return {"lst_c": sum(lst) / len(lst), "ndvi": sum(ndvi) / len(ndvi)}

    # ------------------------------------------------------------------ loaders
    @classmethod
    def from_arrays(cls, lst: np.ndarray, ndvi: np.ndarray, bbox: Sequence[float],
                    source_lst: str, source_ndvi: str, meta: dict | None = None) -> "EnvironmentGrids":
        return cls(lst_c=np.asarray(lst, dtype=np.float32),
                   ndvi=np.asarray(ndvi, dtype=np.float32),
                   bbox=tuple(bbox),  # type: ignore[arg-type]
                   source_lst=source_lst, source_ndvi=source_ndvi, meta=meta or {})

    @classmethod
    def load_snapshot(cls, data_dir: Path, bbox: Sequence[float]) -> "EnvironmentGrids":
        npz = np.load(Path(data_dir) / "snapshot" / "environment.npz")
        meta = {}
        meta_path = Path(data_dir) / "snapshot" / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
        return cls.from_arrays(
            npz["lst"], npz["ndvi"], bbox,
            source_lst="snapshot:austin-heat-model",
            source_ndvi="snapshot:austin-canopy-model",
            meta=meta.get("environment", {}),
        )
