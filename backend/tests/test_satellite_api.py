"""Satellite ingestion status + graceful fallback tests (offline CI mode)."""
from __future__ import annotations


def test_status_reports_full_hierarchy(client):
    status = client.get("/api/v1/satellite/status").json()
    assert status["mode"] == "offline"
    keys = {s["key"] for s in status["sources"]}
    assert {"sentinel2_ndvi", "landsat_lst", "austin_canopy", "osm_overpass"} <= keys
    for src in status["sources"]:
        assert src["mode"] in {"live", "snapshot"}
        assert src["priority"] in {1, 2}
    assert len(status["fallback_chain"]) == 3
    assert "Sentinel-2" in status["fallback_chain"][0]
    assert "Landsat" in status["fallback_chain"][0]
    assert status["environment_sources"]["lst"].startswith("snapshot")


def test_refresh_in_offline_mode_degrades_gracefully(client):
    resp = client.post("/api/v1/satellite/refresh")
    assert resp.status_code == 200
    report = resp.json()
    assert report["mode"] == "offline"
    assert report["satellite"] == {}
    assert report["osm"]["ok"] is False


def test_app_stays_queryable_after_refresh(client):
    client.post("/api/v1/satellite/refresh")
    resp = client.post("/api/v1/route", json={
        "origin": [-97.7470, 30.2650], "destination": [-97.7380, 30.2700],
        "profile": "cool"})
    assert resp.status_code == 200
