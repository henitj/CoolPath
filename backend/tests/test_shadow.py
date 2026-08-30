"""Shadow projection service tests."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from shapely.geometry import LineString

CDT = ZoneInfo("America/Chicago")


def _shadow_union(client, when):
    frame = client.app.state.coolpath.shadow.frame_at(when)
    return frame


def test_daytime_shadow_union(client):
    noon = datetime(2024, 8, 15, 13, 30, tzinfo=CDT)
    frame = _shadow_union(client, noon)
    assert frame.solar.is_daytime
    assert not frame.union.is_empty
    assert frame.feature_count == len(client.app.state.coolpath.bundle.buildings)


def test_night_shadows_empty(client):
    night = datetime(2024, 8, 15, 2, 0, tzinfo=CDT)
    frame = _shadow_union(client, night)
    assert not frame.solar.is_daytime
    assert frame.union.is_empty


def test_winter_morning_shadows_longer_than_summer_noon(client):
    winter_am = datetime(2024, 12, 21, 8, 30, tzinfo=CDT)
    summer_noon = datetime(2024, 6, 21, 13, 30, tzinfo=CDT)
    w = _shadow_union(client, winter_am).union.area
    s = _shadow_union(client, summer_noon).union.area
    assert w > s * 1.5, (w, s)  # low winter sun casts much longer shadows


def test_shade_fractions_respond_to_time_of_day(client):
    from app.core.geo_utils import haversine_m

    graph = client.app.state.coolpath.bundle.graph
    # pick a longish E-W edge on Congress Ave
    edge = next(
        (u, v, d) for u, v, d in graph.edges(data=True)
        if d.get("name") == "Congress Ave"
        and abs(graph.nodes[u]["y"] - 30.2674) < 1e-6
    )
    line = LineString([(graph.nodes[edge[0]]["x"], graph.nodes[edge[0]]["y"]),
                       (graph.nodes[edge[1]]["x"], graph.nodes[edge[1]]["y"])])
    assert haversine_m(*line.coords[0], *line.coords[1]) > 20
    morning = client.app.state.coolpath.shadow.shade_fractions(
        line, datetime(2024, 12, 21, 8, 0, tzinfo=CDT))
    noon = client.app.state.coolpath.shadow.shade_fractions(
        line, datetime(2024, 12, 21, 13, 30, tzinfo=CDT))
    # December: long morning shadows vs short noon shadows -> fractions differ
    assert morning[0] != noon[0]


def test_shadow_geojson_structure(client):
    when = datetime(2024, 6, 21, 14, 0, tzinfo=CDT)
    gj = client.app.state.coolpath.shadow.shadow_geojson(when)
    assert gj["type"] == "Feature"
    assert gj["properties"]["is_daytime"] is True
    assert gj["geometry"]["type"] in {"Polygon", "MultiPolygon"}
    night = client.app.state.coolpath.shadow.shadow_geojson(
        datetime(2024, 6, 21, 3, 0, tzinfo=CDT))
    assert night["geometry"] is None
