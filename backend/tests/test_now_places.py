"""Tests for the /now point-conditions and /places endpoints (mobile app APIs)."""


def test_now_at_a_point(client):
    resp = client.get("/api/v1/now", params={"lat": 30.2672, "lon": -97.7431})
    assert resp.status_code == 200
    d = resp.json()
    assert 20 <= d["temp_c"] <= 50
    assert -0.2 <= d["ndvi"] <= 0.9
    assert 0 <= d["shadow_pct"] <= 100
    assert 0 <= d["canopy_pct"] <= 100
    assert 0 <= d["shade_pct"] <= 100
    assert 0 <= d["comfort"] <= 100
    assert "altitude_deg" in d["sun"]
    assert d["sources"]["temperature"].startswith("snapshot")


def test_now_at_night_zero_shadow(client):
    night = client.get("/api/v1/now", params={
        "lat": 30.2672, "lon": -97.7431, "timestamp": "2024-06-21T03:00:00-05:00"})
    assert night.status_code == 200
    assert night.json()["shadow_pct"] == 0.0
    assert night.json()["sun"]["is_daytime"] is False


def test_now_water_is_coolest(client):
    lake = client.get("/api/v1/now", params={"lat": 30.2604, "lon": -97.7430}).json()
    street = client.get("/api/v1/now", params={"lat": 30.2674, "lon": -97.7425}).json()
    assert lake["temp_c"] < street["temp_c"]


def test_now_outside_bbox(client):
    resp = client.get("/api/v1/now", params={"lat": 30.40, "lon": -97.90})
    assert resp.status_code == 422
    bad_ts = client.get("/api/v1/now", params={
        "lat": 30.2672, "lon": -97.7431, "timestamp": "garbage"})
    assert bad_ts.status_code == 422


def test_places_listing(client):
    resp = client.get("/api/v1/places")
    assert resp.status_code == 200
    places = resp.json()["places"]
    assert len(places) >= 12
    ids = [p["id"] for p in places]
    assert len(ids) == len(set(ids))
    for p in places:
        assert -97.755 <= p["lon"] <= -97.730
        assert 30.260 <= p["lat"] <= 30.278
        assert p["kind"] in {"landmark", "plaza", "district", "trail", "park", "campus", "intersection"}
    names = {p["name"] for p in places}
    assert "Texas State Capitol" in names
    assert "Lady Bird Lake Trail @ Congress" in names
