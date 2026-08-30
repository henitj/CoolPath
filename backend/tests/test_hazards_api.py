"""Hazard REST API end-to-end tests."""
from __future__ import annotations


def test_report_and_fetch_hazard(client):
    resp = client.post("/api/v1/hazards", json={
        "category": "broken_sidewalk", "lat": 30.2670, "lon": -97.7440,
        "severity": 4, "note": "Cracked slabs near curb ramp", "reporter": "tester",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] > 0
    assert data["label"] == "Broken Sidewalk"
    assert data["color"] == "#f97316"
    assert 0 <= data["age_hours"] < 1

    got = client.get(f"/api/v1/hazards/{data['id']}")
    assert got.status_code == 200
    assert got.json()["properties"]["note"].startswith("Cracked")


def test_list_hazards_bbox_and_category(client):
    client.post("/api/v1/hazards", json={"category": "construction", "lat": 30.2650, "lon": -97.7470, "severity": 3})
    client.post("/api/v1/hazards", json={"category": "extreme_sun", "lat": 30.2720, "lon": -97.7350, "severity": 2})

    all_west = client.get("/api/v1/hazards", params={"bbox": "-97.755,30.264,-97.743,30.268"})
    assert all_west.status_code == 200
    assert all_west.json()["count"] == 1
    assert all_west.json()["features"][0]["properties"]["category"] == "construction"

    by_cat = client.get("/api/v1/hazards", params={"category": "extreme_sun"})
    assert by_cat.json()["count"] == 1
    assert by_cat.json()["features"][0]["geometry"]["coordinates"] == [-97.7350, 30.2720]

    everything = client.get("/api/v1/hazards")
    assert everything.json()["count"] == 2


def test_hazard_validation_errors(client):
    bad_category = client.post("/api/v1/hazards", json={
        "category": "alien_invasion", "lat": 30.26, "lon": -97.74})
    assert bad_category.status_code == 422

    bad_severity = client.post("/api/v1/hazards", json={
        "category": "construction", "lat": 30.26, "lon": -97.74, "severity": 9})
    assert bad_severity.status_code == 422

    outside = client.post("/api/v1/hazards", json={
        "category": "construction", "lat": 30.40, "lon": -97.90})
    assert outside.status_code == 422
    assert "outside" in outside.json()["detail"]


def test_delete_hazard(client):
    created = client.post("/api/v1/hazards", json={
        "category": "flooding", "lat": 30.2630, "lon": -97.7410, "severity": 3}).json()
    assert client.delete(f"/api/v1/hazards/{created['id']}").status_code == 200
    assert client.get(f"/api/v1/hazards/{created['id']}").status_code == 404
    assert client.delete(f"/api/v1/hazards/{created['id']}").status_code == 404


def test_categories_endpoint(client):
    resp = client.get("/api/v1/hazards/categories")
    cats = {c["id"] for c in resp.json()["categories"]}
    assert {"broken_sidewalk", "extreme_sun", "unlit_area", "construction"} <= cats


def test_hazard_immediately_penalises_route(client):
    od = {"origin": [-97.7410, 30.2674], "destination": [-97.7450, 30.2674], "profile": "safe"}
    before = client.post("/api/v1/route", json={**od} | {"include_baseline": False}).json()

    # severe hazard right on the destination block
    client.post("/api/v1/hazards", json={
        "category": "construction", "lat": 30.2674, "lon": -97.7430, "severity": 5})

    after = client.post("/api/v1/route", json={**od} | {"include_baseline": False}).json()
    m_before, m_after = before["properties"]["metrics"], after["properties"]["metrics"]
    # The engine either detours (longer distance) or eats the penalty (hazards
    # nearby, higher effort) - in both cases weighted cost can only increase.
    assert m_after["effort_min"] >= m_before["effort_min"] - 0.05
    assert m_after["hazard_count"] >= 1 or m_after["distance_m"] >= m_before["distance_m"] + 40
