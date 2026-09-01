"""POST /api/v1/route end-to-end tests."""
from __future__ import annotations

OD = {"origin": [-97.7470, 30.2650], "destination": [-97.7380, 30.2700]}


def test_all_profiles_return_valid_routes(client):
    for profile in ("fastest", "cool", "safe"):
        resp = client.post("/api/v1/route", json={**OD, "profile": profile})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        geom = data["geometry"]
        assert geom["type"] == "LineString"
        assert len(geom["coordinates"]) >= 2
        # stay inside the study bbox
        for lon, lat in geom["coordinates"]:
            assert -97.756 <= lon <= -97.729
            assert 30.259 <= lat <= 30.279
        metrics = data["properties"]["metrics"]
        for key in ("distance_m", "est_walk_min", "avg_temp_c", "shade_pct",
                    "canopy_pct", "shadow_pct", "hazard_count", "comfort_score"):
            assert key in metrics
        assert metrics["distance_m"] > 100


def test_cool_route_includes_baseline_and_comparison(client):
    resp = client.post("/api/v1/route", json={**OD, "profile": "cool"})
    data = resp.json()
    assert data["baseline"] is not None
    assert data["baseline"]["properties"]["profile"] == "fastest"
    cmp = data["comparison"]
    assert set(cmp) == {"distance_delta_m", "distance_delta_pct", "temp_delta_c",
                        "max_temp_delta_c", "shade_delta_pct", "comfort_delta",
                        "hazard_delta", "effort_delta_min"}
    # distances should be in a sane ratio for downtown blocks
    assert -0.2 < cmp["distance_delta_pct"] < 1.0


def test_fastest_profile_has_no_baseline(client):
    resp = client.post("/api/v1/route", json={**OD, "profile": "fastest"})
    data = resp.json()
    assert data["baseline"] is None
    assert data["comparison"] is None


def test_route_scores_short_distinct_walks_that_share_one_node(client):
    # Nearby landmarks can snap to one sparse graph junction. They should get
    # a useful direct local-walk result rather than a misleading 404.
    origin = [-97.7470, 30.2650]
    destination = [-97.7462, 30.2645]
    resp = client.post("/api/v1/route", json={
        "origin": origin, "destination": destination, "profile": "cool",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["geometry"]["coordinates"] == [origin, destination]
    assert data["properties"]["metrics"]["distance_m"] > 10
    assert any("Short local walk" in warning for warning in data["properties"]["warnings"])


def test_route_uses_a_shared_component_for_disconnected_snapshot_islands(client):
    # Lady Bird Lake Trail is a valid curated destination but lives on a small
    # disconnected snapshot island. A route planner should gracefully snap to
    # the nearest connected walking network instead of returning a 404.
    origin = [-97.7369, 30.2747]  # Texas State Capitol
    destination = [-97.7425, 30.2613]  # Lady Bird Lake Trail @ Congress
    resp = client.post("/api/v1/route", json={
        "origin": origin, "destination": destination, "profile": "cool",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["geometry"]["coordinates"][0] == origin
    assert data["geometry"]["coordinates"][-1] == destination
    assert any("connected pedestrian network" in warning for warning in data["properties"]["warnings"])


def test_route_rejects_outside_bbox(client):
    resp = client.post("/api/v1/route", json={"origin": [-97.90, 30.26], "destination": [-97.74, 30.27]})
    assert resp.status_code == 422
    assert "study area" in resp.json()["detail"]


def test_route_rejects_unknown_profile(client):
    resp = client.post("/api/v1/route", json={**OD, "profile": "skateboard"})
    assert resp.status_code == 422


def test_route_same_point_rejected(client):
    resp = client.post("/api/v1/route", json={
        "origin": [-97.7431, 30.2672], "destination": [-97.74305, 30.26721],
        "profile": "cool"})
    assert resp.status_code in (404, 422)


def test_route_with_explicit_timestamp(client):
    # night vs midday shadows must change the shadow share of the metrics
    night = client.post("/api/v1/route", json={
        **OD, "profile": "cool", "timestamp": "2024-06-21T03:30:00-05:00"}).json()
    midday = client.post("/api/v1/route", json={
        **OD, "profile": "cool", "timestamp": "2024-06-21T13:30:00-05:00"}).json()
    assert night["properties"]["metrics"]["shadow_pct"] == 0.0
    assert midday["properties"]["metrics"]["shadow_pct"] >= 0.0


def test_route_meta_and_profiles(client):
    meta = client.get("/api/v1/meta").json()
    assert meta["bbox"] == [-97.755, 30.260, -97.730, 30.278]
    assert {p["id"] for p in meta["profiles"]} == {"fastest", "cool", "safe"}
    formula = meta["weight_formula"]
    assert "alpha" in formula and "HeatIndex" in formula


def test_route_includes_ordered_street_directions_and_preference_echo(client):
    resp = client.post("/api/v1/route", json={
        **OD,
        "profile": "cool",
        "avoid_red_paths": True,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    steps = data["properties"]["steps"]
    assert len(steps) >= 2
    assert steps[0]["maneuver"] == "depart"
    assert steps[-1]["maneuver"] == "arrive"
    assert steps[-1]["coordinate_index"] == len(data["geometry"]["coordinates"]) - 1
    assert all("instruction" in step and step["coordinate_index"] >= 0 for step in steps)
    assert data["properties"]["routing_preferences"] == {"avoid_red_paths": True}
