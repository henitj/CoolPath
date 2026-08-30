"""City of Austin Open Data ingestion (Priority 2 / hydration fallback).

* Tree canopy:  Socrata dataset ``uj6p-2j9z`` (data.austintexas.gov)
* Urban Heat Island disparity:  ArcGIS Hub FeatureServer (optional URL)

On failure the bundled Austin snapshot layers are served instead; the data
source registry always reports which branch of the hierarchy is active.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from shapely.geometry import shape

from app.core.config import Settings

logger = logging.getLogger(__name__)


class AustinDataUnavailable(RuntimeError):
    pass


def fetch_canopy_geojson(settings: Settings, limit: int = 2000) -> dict:
    """Tree-canopy polygons clipped to the study bbox from Socrata."""
    min_lon, min_lat, max_lon, max_lat = settings.bbox_tuple
    separator = "&" if "?" in settings.austin_canopy_url else "?"
    url = (
        f"{settings.austin_canopy_url}{separator}"
        f"$where=within_box(geolocation_column,{min_lat},{min_lon},{max_lat},{max_lon})"
        f"&$limit={limit}"
    )
    resp = httpx.get(url, timeout=settings.live_fetch_timeout_s,
                     headers={"User-Agent": "CoolPath/1.0"})
    resp.raise_for_status()
    payload = resp.json()
    features = payload.get("features", [])
    if not features:
        raise AustinDataUnavailable("Socrata returned no canopy features for the bbox")
    # validate geometries and keep a bounded payload
    clean = []
    for feat in features:
        geom = feat.get("geometry")
        if not geom:
            continue
        try:
            shp = shape(geom)
            if shp.is_empty:
                continue
        except Exception:
            continue
        clean.append(feat)
    return {"type": "FeatureCollection", "features": clean,
            "source": "austin-socrata-uj6p-2j9z",
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def fetch_uhi_grid(settings: Settings) -> dict:
    """Optional ArcGIS UHI disparity layer -> geojson features."""
    if not settings.austin_uhi_url:
        raise AustinDataUnavailable("no ArcGIS UHI endpoint configured")
    min_lon, min_lat, max_lon, max_lat = settings.bbox_tuple
    params = {
        "where": "1=1",
        "geometry": f"{min_lon},{min_lat},{max_lon},{max_lat}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "outFields": "*",
        "outSR": 4326,
        "f": "geojson",
    }
    resp = httpx.get(settings.austin_uhi_url, params=params,
                     timeout=settings.live_fetch_timeout_s,
                     headers={"User-Agent": "CoolPath/1.0"})
    resp.raise_for_status()
    payload = resp.json()
    if not payload.get("features"):
        raise AustinDataUnavailable("ArcGIS UHI layer returned no features")
    return payload


def refresh_austin_layers(settings: Settings) -> dict:
    report = {"austin_canopy": {"ok": False, "detail": ""}}
    try:
        canopy = fetch_canopy_geojson(settings)
        report["austin_canopy"] = {"ok": True, "detail": f"{len(canopy['features'])} canopy features"}
    except Exception as exc:
        report["austin_canopy"] = {"ok": False, "detail": str(exc)[:200]}
    return report
