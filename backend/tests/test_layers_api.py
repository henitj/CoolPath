"""Layer endpoints + network stats tests."""
from __future__ import annotations


def test_heat_grid_layer(client):
    fc = client.get("/api/v1/layers/heat").json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) >= 900
    lo, hi = fc["properties"]["lst_range_c"]
    for feat in fc["features"][:50]:
        p = feat["properties"]
        assert lo - 1 <= p["lst_c"] <= hi + 1
        assert 0 <= p["warmth"] <= 1
        assert -0.3 <= p["ndvi"] <= 0.9


def test_static_layers(client):
    buildings = client.get("/api/v1/layers/buildings").json()
    assert len(buildings["features"]) >= 200
    heights = [f["properties"]["height_m"] for f in buildings["features"]]
    assert max(heights) > 80  # landmark towers / Capitol
    names = {f["properties"]["name"] for f in buildings["features"] if f["properties"]["name"]}
    assert "The Austonian" in names and "Texas State Capitol" in names

    canopy = client.get("/api/v1/layers/canopy").json()
    assert len(canopy["features"]) >= 800

    water = client.get("/api/v1/layers/water").json()
    water_names = {f["properties"]["name"] for f in water["features"]}
    assert {"Lady Bird Lake", "Shoal Creek"} <= water_names

    parks = client.get("/api/v1/layers/parks").json()
    park_names = {f["properties"]["name"] for f in parks["features"]}
    assert {"Republic Square", "Wooldridge Park", "Waterloo Park"} <= park_names


def test_unknown_layer_404(client):
    assert client.get("/api/v1/layers/volcanoes").status_code == 404


def test_shadows_layer(client):
    dec_noon = client.get("/api/v1/layers/shadows",
                          params={"timestamp": "2024-12-21T18:00:00Z"}).json()
    assert 30 < dec_noon["properties"]["altitude_deg"] < 42
    assert dec_noon["geometry"]["type"] in {"Polygon", "MultiPolygon"}
    night = client.get("/api/v1/layers/shadows",
                       params={"timestamp": "2024-12-21T04:00:00Z"}).json()
    assert night["properties"]["is_daytime"] is False
    assert night["geometry"] is None
    bad = client.get("/api/v1/layers/shadows", params={"timestamp": "not-a-date"})
    assert bad.status_code == 422
    # default (now) works too
    assert client.get("/api/v1/layers/shadows").status_code == 200


def test_network_stats(client):
    stats = client.get("/api/v1/layers/network/stats").json()
    assert stats["nodes"] >= 300
    assert stats["edges"] >= 500
    assert 50 < stats["total_km"] < 200
    assert stats["source"].startswith("snapshot")
    assert stats["buildings"] >= 200
    assert stats["bbox"] == [-97.755, 30.260, -97.730, 30.278]
