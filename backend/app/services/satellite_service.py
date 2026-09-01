"""Satellite remote-sensing ingestion (Priority 1 in the data hierarchy).

* NDVI  <- Copernicus Sentinel-2 L2A (B04/B08) via the Planetary Computer STAC
* LST   <- USGS Landsat 8/9 Collection 2 Level-2 surface-temperature band

Both fetches are wrapped defensively: any failure (clouds, rate limits, no
network, missing optional dependencies) demotes the layer to the bundled
Austin snapshot grid (Priority 2) and the degradation is reported through
``/api/v1/satellite/status``.
"""
from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Sequence

import numpy as np

from app.core.config import Settings

logger = logging.getLogger(__name__)


class LiveFetchError(RuntimeError):
    pass


@dataclass
class SourceStatus:
    key: str
    name: str
    priority: int
    mode: str = "snapshot"          # "live" | "snapshot"
    detail: str = "bundled offline snapshot"
    checked_at: str | None = None
    latency_ms: int | None = None

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class SatelliteRegistry:
    sources: dict[str, SourceStatus] = field(default_factory=dict)

    def register(self, status: SourceStatus) -> None:
        self.sources[status.key] = status

    def snapshot_all(self) -> None:
        self.register(SourceStatus(key="sentinel2_ndvi", name="Copernicus Sentinel-2 NDVI (Planetary Computer)", priority=1))
        self.register(SourceStatus(key="landsat_lst", name="Landsat 8/9 Surface Temperature (Planetary Computer)", priority=1))
        self.register(SourceStatus(key="austin_canopy", name="City of Austin Tree Canopy (Socrata uj6p-2j9z)", priority=2))
        self.register(SourceStatus(key="osm_overpass", name="OpenStreetMap Pedestrian Network (Overpass)", priority=2))

    def as_list(self) -> list[dict]:
        return [s.as_dict() for s in sorted(self.sources.values(), key=lambda s: s.priority)]


# ---------------------------------------------------------------- live fetch
def _bbox_str(bbox: Sequence[float]) -> str:
    return ",".join(f"{v:.6f}" for v in bbox)


def fetch_ndvi_sentinel2(settings: Settings, size: int = 128) -> tuple[np.ndarray, dict]:
    """Sentinel-2 L2A NDVI for the bbox as a (size, size) ndarray in [-1, 1]."""
    try:
        import planetary_computer as pc
        import rasterio
        from pystac_client import Client
    except ImportError as exc:  # pragma: no cover
        raise LiveFetchError(f"satellite deps missing: {exc}") from exc

    catalog = Client.open(settings.pc_stac_url, modifier=pc.sign_inplace)
    end = datetime.now(timezone.utc)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=list(settings.bbox_tuple),
        datetime=(end - timedelta(days=30)).strftime("%Y-%m-%d") + "/" + end.strftime("%Y-%m-%d"),
        query={"eo:cloud_cover": {"lt": 25}},
        max_items=8,
    )
    items = list(search.items())
    if not items:
        raise LiveFetchError("no low-cloud Sentinel-2 scenes in the last 30 days")
    item = items[0]
    red_href, nir_href = item.assets["B04"].href, item.assets["B08"].href
    red = _read_bbox_band(red_href, settings.bbox_tuple, size, rasterio)
    nir = _read_bbox_band(nir_href, settings.bbox_tuple, size, rasterio)
    denom = nir + red
    ndvi = np.where(np.abs(denom) > 1e-6, (nir - red) / np.where(np.abs(denom) > 1e-6, denom, 1.0), 0.0)
    meta = {"item": item.id, "datetime": item.datetime.isoformat() if item.datetime else None,
            "cloud_cover": item.properties.get("eo:cloud_cover"), "constellation": "sentinel-2"}
    return np.clip(ndvi.astype("float32"), -1.0, 1.0), meta


def fetch_lst_landsat(settings: Settings, size: int = 128) -> tuple[np.ndarray, dict]:
    """Landsat 8/9 C2 L2 surface temperature (deg C) for the bbox."""
    try:
        import planetary_computer as pc
        import rasterio
        from pystac_client import Client
    except ImportError as exc:  # pragma: no cover
        raise LiveFetchError(f"satellite deps missing: {exc}") from exc

    catalog = Client.open(settings.pc_stac_url, modifier=pc.sign_inplace)
    end = datetime.now(timezone.utc)
    search = catalog.search(
        collections=["landsat-c2-l2"],
        bbox=list(settings.bbox_tuple),
        datetime=(end - timedelta(days=45)).strftime("%Y-%m-%d") + "/" + end.strftime("%Y-%m-%d"),
        query={"platform": {"in": ["landsat-8", "landsat-9"]}},
        max_items=12,
    )
    items = [it for it in search.items() if "lst" in it.assets]
    items.sort(key=lambda it: (it.properties.get("eo:cloud_cover") or 0))
    if not items:
        raise LiveFetchError("no usable Landsat LST scenes in the last 45 days")
    item = items[0]
    lst_kelvin = _read_bbox_band(item.assets["lst"].href, settings.bbox_tuple, size, rasterio)
    lst_c = lst_kelvin * 0.00341802 + 149.0 - 273.15
    meta = {"item": item.id, "datetime": item.datetime.isoformat() if item.datetime else None,
            "cloud_cover": item.properties.get("eo:cloud_cover"), "platform": item.properties.get("platform")}
    return lst_c.astype("float32"), meta


def _read_bbox_band(href: str, bbox: Sequence[float], size: int, rasterio) -> np.ndarray:
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    with rasterio.open(href) as src:
        with WarpedVRT(src, crs="EPSG:4326",
                       left=bbox[0], bottom=bbox[1], right=bbox[2], top=bbox[3],
                       width=size, height=size, resampling=Resampling.bilinear) as vrt:
            return vrt.read(1).astype("float32")


# ------------------------------------------------------------- orchestration
def refresh_satellite_layers(settings: Settings, registry: SatelliteRegistry,
                             data_dir: Path) -> dict:
    """Attempt live NDVI + LST refresh; persist whichever succeeds.

    Returns a report dict; never raises.
    """
    report: dict = {}
    for key, fetcher, label in (
        ("sentinel2_ndvi", fetch_ndvi_sentinel2, "ndvi"),
        ("landsat_lst", fetch_lst_landsat, "lst"),
    ):
        status = registry.sources.get(key)
        started = time.perf_counter()
        try:
            grid, meta = fetcher(settings)
            out = data_dir / "live"
            out.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(out / f"{label}_live.npz", grid=grid)
            (out / f"{label}_meta.json").write_text(__import__("json").dumps(meta, default=str))
            if status:
                status.mode = "live"
                status.detail = f"live: {meta.get('item', '')}"
                status.checked_at = datetime.now(timezone.utc).isoformat()
                status.latency_ms = int((time.perf_counter() - started) * 1000)
            report[key] = {"ok": True, "detail": meta}
        except Exception as exc:
            logger.info("Live %s fetch unavailable -> snapshot fallback: %s", label, exc)
            if status:
                status.mode = "snapshot"
                status.detail = f"fallback: {type(exc).__name__}: {str(exc)[:160]}"
                status.checked_at = datetime.now(timezone.utc).isoformat()
                status.latency_ms = int((time.perf_counter() - started) * 1000)
            report[key] = {"ok": False, "detail": str(exc)}
    return report
