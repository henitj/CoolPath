"""Application state: wires the network, environment rasters, shadow engine,
hazard service and routing engine together, and owns layer caches plus the
data-source registry that tracks the live/snapshot fallback hierarchy."""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

from app.core.cache import Cache
from app.core.config import Settings
from app.services import austin_service, satellite_service
from app.services.environment import EnvironmentGrids
from app.services.hazard_service import HazardService
from app.services.osm_service import NetworkBundle, load_snapshot_network
from app.services.routing_engine import RoutingEngine
from app.services.shadow_service import ShadowService

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    settings: Settings
    cache: Cache
    data_dir: Path
    registry: satellite_service.SatelliteRegistry = field(
        default_factory=satellite_service.SatelliteRegistry
    )
    bundle: NetworkBundle | None = None
    environment: EnvironmentGrids | None = None
    shadow: ShadowService | None = None
    engine: RoutingEngine | None = None
    hazards: HazardService | None = None
    canopy_union: object | None = None
    _layers: dict = field(default_factory=dict)
    _refresh_lock: threading.Lock = field(default_factory=threading.Lock)

    # ------------------------------------------------------------------ build
    @classmethod
    def build(cls, settings: Settings, cache: Cache, data_dir: Path) -> "AppState":
        state = cls(settings=settings, cache=cache, data_dir=data_dir)
        state.registry.snapshot_all()
        state.environment = EnvironmentGrids.load_snapshot(data_dir, settings.bbox_tuple)
        # Prefer live satellite grids captured by a previous refresh.
        state._adopt_live_grids_if_present()
        state.hazards = HazardService(settings, cache)
        state._load_network(load_snapshot_network(settings))
        return state

    def bind_db(self, hazard_service: HazardService) -> None:
        self.hazards = hazard_service

    def _load_network(self, bundle: NetworkBundle) -> None:
        self.bundle = bundle
        self.shadow = ShadowService(bundle.buildings, self.settings, self.cache)
        self.canopy_index = self._build_canopy_index()
        self.engine = RoutingEngine(
            bundle.graph, self.environment, self.shadow, self.settings, self.cache,
            canopy_index=self.canopy_index,
        )
        if self.hazards is not None:
            self.engine.bind_hazard_service(self.hazards)
        self._layers = {}  # invalidate layer caches on network swap
        self.cache.invalidate_prefix("places:")
        self.cache.invalidate_prefix("conditions:")

    def _build_canopy_index(self):
        from app.services.canopy_index import CanopyIndex

        canopy_fc = self.layers()["canopy"]
        polygons = []
        for feat in canopy_fc.get("features", []):
            try:
                polygons.append(Polygon(feat["geometry"]["coordinates"][0]))
            except Exception:
                continue
        return CanopyIndex(polygons)

    def _adopt_live_grids_if_present(self) -> None:
        live_dir = self.data_dir / "live"
        lst_path, ndvi_path = live_dir / "lst_live.npz", live_dir / "ndvi_live.npz"
        lst, ndvi = None, None
        if lst_path.exists():
            try:
                lst = np.load(lst_path)["grid"]
                status = self.registry.sources.get("landsat_lst")
                if status:
                    status.mode, status.detail = "live", "live: cached Landsat LST grid"
            except Exception:
                pass
        if ndvi_path.exists():
            try:
                ndvi = np.load(ndvi_path)["grid"]
                status = self.registry.sources.get("sentinel2_ndvi")
                if status:
                    status.mode, status.detail = "live", "live: cached Sentinel-2 NDVI grid"
            except Exception:
                pass
        if lst is None and ndvi is None:
            return
        snap = EnvironmentGrids.load_snapshot(self.data_dir, self.settings.bbox_tuple)
        self.environment = EnvironmentGrids.from_arrays(
            lst if lst is not None else snap.lst_c,
            ndvi if ndvi is not None else snap.ndvi,
            self.settings.bbox_tuple,
            source_lst="live:landsat-c2-l2" if lst is not None else snap.source_lst,
            source_ndvi="live:sentinel-2-l2a" if ndvi is not None else snap.source_ndvi,
            meta={"live": True, "adopted_at": datetime.now(timezone.utc).isoformat()},
        )

    # ----------------------------------------------------------------- layers
    def layers(self) -> dict:
        if self._layers:
            return self._layers
        data_dir = self.data_dir / "snapshot"
        layers = {
            "buildings": _read_geojson(data_dir / "buildings.geojson"),
            "canopy": _read_geojson(data_dir / "canopy.geojson"),
            "water": _read_geojson(data_dir / "water.geojson"),
            "parks": _read_geojson(data_dir / "parks.geojson"),
        }
        layers["canopy"].setdefault("properties", {})
        layers["canopy"]["properties"] = {"source": "austin-canopy-hydration"}
        layers["heat"] = self._heat_grid_fc()
        self._layers = layers
        return layers

    def _heat_grid_fc(self, step: int = 3) -> dict:
        env = self.environment
        min_lon, min_lat, max_lon, max_lat = self.settings.bbox_tuple
        h, w = env.lst_c.shape
        dh, dw = env.lst_c.shape[0] // (h // step), env.lst_c.shape[1] // (w // step)
        feats = []
        lst_min, lst_max = env.lst_range
        for row in range(0, h - 1, dh):
            for col in range(0, w - 1, dw):
                cell = env.lst_c[row:row + dh, col:col + dw]
                ndvi_cell = env.ndvi[row:row + dh, col:col + dw]
                lst = float(np.nanmean(cell))
                ndvi = float(np.nanmean(ndvi_cell))
                y0 = max_lat - (row / (h - 1)) * (max_lat - min_lat)
                y1 = max_lat - (min(row + dh, h - 1) / (h - 1)) * (max_lat - min_lat)
                x0 = min_lon + (col / (w - 1)) * (max_lon - min_lon)
                x1 = min_lon + (min(col + dw, w - 1) / (w - 1)) * (max_lon - min_lon)
                feats.append({
                    "type": "Feature",
                    "properties": {
                        "lst_c": round(lst, 2),
                        "ndvi": round(ndvi, 3),
                        "warmth": round((lst - lst_min) / max(1e-6, lst_max - lst_min), 3),
                    },
                    "geometry": {"type": "Polygon", "coordinates": [[
                        [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
                    ]]},
                })
        return {
            "type": "FeatureCollection",
            "features": feats,
            "properties": {
                "lst_range_c": [round(lst_min, 1), round(lst_max, 1)],
                "resolution_m": None,
                "source": env.source_lst,
            },
        }

    def network_stats(self) -> dict:
        graph = self.bundle.graph
        lengths = [d["length"] for _, _, d in graph.edges(data=True)]
        return {
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
            "total_km": round(sum(lengths) / 1000.0, 2),
            "avg_edge_m": round(sum(lengths) / max(1, len(lengths)), 1),
            "source": self.bundle.source,
            "detail": self.bundle.detail,
            "buildings": len(self.bundle.buildings),
            "bbox": list(self.settings.bbox_tuple),
            "center": [self.settings.center_lat, self.settings.center_lon],
        }

    # --------------------------------------------------------------- refresh
    def refresh_live_data(self, include_osm: bool | None = None) -> dict:
        """Attempt the live half of the ingestion hierarchy. Never raises."""
        with self._refresh_lock:
            include_osm = self.settings.live_refresh_osm if include_osm is None else include_osm
            report: dict = {"checked_at": datetime.now(timezone.utc).isoformat()}
            if self.settings.offline_mode:
                report["mode"] = "offline"
                report["satellite"] = {}
                report["austin"] = {}
                report["osm"] = {"ok": False, "detail": "offline mode enabled"}
                return report
            report["satellite"] = satellite_service.refresh_satellite_layers(
                self.settings, self.registry, self.data_dir
            )
            report["austin"] = austin_service.refresh_austin_layers(self.settings)
            for key, ok in (
                ("sentinel2_ndvi", report["satellite"].get("sentinel2_ndvi", {}).get("ok")),
                ("landsat_lst", report["satellite"].get("landsat_lst", {}).get("ok")),
            ):
                if ok:
                    self._adopt_live_grids_if_present()
                    self._layers = {}
                    self.cache.invalidate_prefix("shadow:")
            if report["austin"].get("austin_canopy", {}).get("ok"):
                status = self.registry.sources.get("austin_canopy")
                if status:
                    status.mode = "live"
                    status.detail = "live: Socrata canopy features"
                    status.checked_at = report["checked_at"]
            else:
                status = self.registry.sources.get("austin_canopy")
                if status:
                    status.mode = "snapshot"
                    status.detail = "fallback: " + str(report["austin"].get("austin_canopy", {}).get("detail", ""))[:120]
                    status.checked_at = report["checked_at"]
            if include_osm:
                try:
                    from app.services.osm_service import fetch_overpass_network

                    bundle = fetch_overpass_network(self.settings)
                    self._load_network(bundle)
                    status = self.registry.sources.get("osm_overpass")
                    if status:
                        status.mode = "live"
                        status.detail = bundle.detail
                        status.checked_at = report["checked_at"]
                    report["osm"] = {"ok": True, "detail": bundle.detail}
                except Exception as exc:
                    status = self.registry.sources.get("osm_overpass")
                    if status:
                        status.mode = "snapshot"
                        status.detail = "fallback: " + str(exc)[:120]
                        status.checked_at = report["checked_at"]
                    report["osm"] = {"ok": False, "detail": str(exc)}
            else:
                status = self.registry.sources.get("osm_overpass")
                if status and status.mode != "live":
                    status.checked_at = report["checked_at"]
                report["osm"] = {"ok": None, "detail": "not attempted (disabled)"}
            report["mode"] = "live" if any(
                s.mode == "live" for s in self.registry.sources.values()
            ) else "snapshot"
            return report

    def status_payload(self) -> dict:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "offline" if self.settings.offline_mode else (
                "live" if any(s.mode == "live" for s in self.registry.sources.values()) else "snapshot"
            ),
            "sources": self.registry.as_list(),
            "environment_sources": {
                "lst": self.environment.source_lst if self.environment else "snapshot",
                "ndvi": self.environment.source_ndvi if self.environment else "snapshot",
            },
            "fallback_chain": [
                "1. Copernicus Sentinel-2 (NDVI) + NASA/USGS Landsat 8/9 (LST) via Planetary Computer STAC",
                "2. City of Austin Open Data (tree canopy uj6p-2j9z, UHI disparity, sidewalks)",
                "3. Bundled offline snapshot for Downtown Austin (deterministic, always available)",
            ],
        }


def _read_geojson(path: Path) -> dict:
    import json

    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
