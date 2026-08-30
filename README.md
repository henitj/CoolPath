# CoolPath 🌳 — Urban Micro-Climate & Walkability Mapper

**Shade-optimized, heat-aware and safety-aware pedestrian routing for Downtown Austin, TX.**

CoolPath weighs every street segment of the pedestrian graph by *how hot and how exposed it is
right now*: land-surface temperature from satellite thermal imagery, vegetation (NDVI) from
Copernicus Sentinel-2, **building shadows projected from the real solar position for any time of
day**, tree-canopy coverage, and crowdsourced hazard reports that re-score nearby routes within
seconds.

Bounding box (EPSG:4326): `[-97.755, 30.260, -97.730, 30.278]` · Center: `30.2672, -97.7431`

---

## ✨ Features

| | |
|---|---|
| 🛰️ **Satellite ingestion** | Sentinel-2 L2A (B04/B08 → NDVI) + Landsat 8/9 C2 L2 (surface temperature) via the Planetary Computer STAC API |
| 🌵 **Austin open data** | City of Austin tree canopy (Socrata `uj6p-2j9z`), UHI disparity layer, sidewalk network — with graceful hydration fallback |
| ☀️ **Dynamic shadows** | pysolar/NOAA solar azimuth + elevation → building-height shadow polygons cached per minute; slider scrubbs the sun from 5 a.m. to 9 p.m. |
| 🧮 **Micro-climate weighting** | `W = dist · (1 + α·HeatIndex − β·CanopyNDVI + γ·HazardPenalty + Accessibility)` per edge, per profile |
| ⚠️ **Crowdsourced hazards** | `POST/GET/DELETE /api/v1/hazards` — reports penalise a 50 m buffer instantly, then decay exponentially (48 h half-life, 7-day expiry) |
| 🗺️ **3 routing profiles** | Fastest (A*) · Cool & Shaded · Safe & Accessible — every response carries a fastest-path baseline + metric deltas |
| 🖥️ **Dual-layer map UI** | MapLibre GL: heat grid, canopy, buildings, live shadow overlay, hazard pins, route comparison panel, hazard reporting drawer |

## 🚀 Quickstart

### Docker (recommended)

```bash
docker compose up --build
# web app  → http://localhost:8080
# API docs → http://localhost:8000/docs
```

Optional production database (PostGIS):

```bash
docker compose --profile postgis up
# then set COOLPATH_DATABASE_URL=postgresql+psycopg2://coolpath:coolpath@postgres:5432/coolpath
```

### Local development

```bash
# backend (Python 3.11+)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# frontend (Node 18+)
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api → :8000)
```

The API works standalone (curl / Swagger UI at `/docs`) without the frontend.

## 🏗️ Architecture

```
┌─────────────────────────────  Frontend (React + TS + Vite + Tailwind)  ─────────────────────────┐
│  MapView (MapLibre GL)   RoutingPanel   MetricsPanel   HazardDrawer   TimeSlider  StatusBar     │
└──────────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                           │ /api/v1  (JSON / GeoJSON)
┌──────────────────────────────────────────▼──────────────────────────────────────────────────────┐
│  FastAPI  ·  api/  route · hazards · layers · satellite · meta                                  │
│────────────────────────────  services/  ────────────────────────────────────────────────────────│
│  satellite_service ─┐   Sentinel-2 NDVI + Landsat LST (Planetary Computer, lazy imports)       │
│  austin_service   ──┤   Socrata tree canopy (uj6p-2j9z) + ArcGIS UHI disparity                  │
│  osm_service      ──┤   Overpass pedestrian graph + building heights                            │
│        ⤷ fallback →  📦 bundled offline snapshot (deterministic Downtown Austin model)          │
│  solar.py (pysolar + NOAA fallback) → shadow_service (per-minute shadow unions, cached)         │
│  environment.py (LST/NDVI bilinear sampling) → canopy_index (STRtree) → routing_engine          │
│  hazard_service (SQLAlchemy; 50 m buffer + 48 h exponential decay)                              │
│─────────────────────────────────────────────────────────────────────────────────────────────────│
│  SQLAlchemy → SQLite (default) / PostgreSQL+PostGIS  ·  Redis cache (optional)                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data ingestion fallback hierarchy

| Priority | Source | Used for | Failure mode |
|---|---|---|---|
| 1 | Copernicus **Sentinel-2 L2A** (≤25 % cloud, last 30 d) | NDVI → canopy score | → snapshot NDVI grid |
| 1 | **Landsat 8/9 C2 L2** thermal (`ST_B10`) | LST → heat index | → snapshot LST grid |
| 2 | City of Austin **Socrata** `uj6p-2j9z` | tree-canopy polygons | → snapshot canopy |
| 2 | Austin ArcGIS UHI disparity layer (optional URL) | heat context | → snapshot heat grid |
| 2 | **OpenStreetMap Overpass** | pedestrian graph, building heights | → snapshot graph |
| 3 | **Bundled snapshot** (`backend/app/data/snapshot/`) | everything | always available |

The active branch is reported per-layer by `GET /api/v1/satellite/status` and surfaced as chips in
the UI (`⟳ refresh live data` re-runs the hierarchy on demand — a daemon thread also runs it on
startup). In this sandboxed environment outbound geo APIs are firewalled, so the app demonstrably
runs fully on the snapshot layer; on an open network the live sources take over automatically.

> **Snapshot provenance** — the offline bundle is a *deterministic approximation* of downtown
> Austin's urban fabric (named street grid, landmark towers with real heights, parks, Lady Bird
> Lake & Shoal Creek, street-tree canopy, land-cover-derived LST/NDVI rasters) generated by
> [`backend/scripts/build_snapshot.py`](backend/scripts/build_snapshot.py) (seed 42) so the whole
> product is reproducible offline and in CI. See `backend/app/data/snapshot/meta.json`.

## 🧮 The routing model

For every graph edge `e`:

```
HeatIndex(e)   = clip((LST(e) − 26°C) / (46°C − 26°C), 0, 1)          # Landsat raster, bilinear
CanopyNDVI(e)  = 0.55·clip(NDVI(e)) + 0.45·shade(e, t)                # raster + canopy STRtree + shadows
HazardPen(e)   = Σ_h sev(h)·exp(−age/48 h)·(1 − d/50 m)   (clipped)   # crowdsourced reports
Accessibility  = missing-sidewalk + unlit + rough-surface penalties   # OSM tags

Weight(e, t) = length(e) · (1 + α·HeatIndex − β·CanopyNDVI + γ·HazardPen + Accessibility)
```

| Profile | α (heat) | β (canopy) | γ (hazard) | Extras |
|---|---|---|---|---|
| `fastest` | 0.00 | 0.00 | 0.25 | — |
| `cool` | 0.90 | 0.70 | 1.20 | — |
| `safe` | 0.25 | 0.15 | 2.00 | sidewalk 0.60 · unlit 0.45 · surface 0.30 |

Routes are computed with A* (haversine heuristic, admissible w.r.t. the 0.25 weight floor).
Every response carries sampled exposure series (`temp_c`, `shade`, `ndvi`) and a **comparison
against the fastest baseline**: distance delta, average/max surface temperature, % of the route
under canopy or shadow, comfort score.

Shadow geometry: `shadow_len = height / tan(elevation)`, cast along the anti-solar bearing from
every building footprint; per-minute unions are cached (in-process TTL + optional Redis).

## 🔌 API reference (excerpt)

```bash
# Cool & shaded route (compare vs fastest baseline)
curl -s localhost:8000/api/v1/route -H 'content-type: application/json' -d '{
  "origin": [-97.7470, 30.2653], "destination": [-97.7355, 30.2725],
  "profile": "cool",
  "timestamp": "2026-08-30T15:00:00-05:00"          # optional → shadows at 3 pm CT
}' | jq '.properties.metrics, .comparison'

# Report a hazard (immediately re-scores routes within 50 m)
curl -s localhost:8000/api/v1/hazards -H 'content-type: application/json' -d '{
  "category": "broken_sidewalk", "lat": 30.2674, "lon": -97.7425,
  "severity": 4, "note": "Cracked slabs at the curb ramp"
}'

# Hazards in a bounding box
curl -s "localhost:8000/api/v1/hazards?bbox=-97.755,30.260,-97.730,30.278"

# Building shadows at a specific instant (solar alt/az included)
curl -s "localhost:8000/api/v1/layers/shadows?timestamp=2026-08-30T14:00:00-05:00"

# Map layers + network stats + ingestion status
curl -s localhost:8000/api/v1/layers/heat | jq '.properties'
curl -s localhost:8000/api/v1/layers/network/stats
curl -s localhost:8000/api/v1/satellite/status | jq '.mode, .sources'
```

Full OpenAPI docs: `http://localhost:8000/docs`.

### Endpoint map

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/route` | Multi-profile routing + baseline comparison |
| `GET` | `/api/v1/route/profiles` | Profile parameter sets |
| `POST/GET` | `/api/v1/hazards` | Report / query hazards (bbox, category, active) |
| `GET/DELETE` | `/api/v1/hazards/{id}` | Fetch / remove a report |
| `GET` | `/api/v1/hazards/categories` | Hazard taxonomy |
| `GET` | `/api/v1/layers/{buildings,canopy,water,parks,heat}` | Map layers (GeoJSON) |
| `GET` | `/api/v1/layers/shadows?timestamp=` | Shadow polygons + solar position |
| `GET` | `/api/v1/layers/network/stats` | Graph stats |
| `GET/POST` | `/api/v1/satellite/status|refresh` | Ingestion hierarchy status / manual refresh |
| `GET` | `/api/v1/meta`, `/api/v1/health` | Metadata, health |

## 🧪 Tests

```bash
cd backend && python -m pytest tests/ -q          # 59 tests: solar, shadows, weights,
                                                  # hazard decay, routing, all REST endpoints
cd frontend && npx vitest run                     # formatting/compare/timezone utilities
```

Backend tests run fully offline against the snapshot (no network needed) with a throwaway SQLite
DB. Highlights: solar position validated against pysolar/NOAA reference values (≤0.8°), shadow
length ∝ `1/tan(elevation)`, cool-vs-fastest profile divergence on a geo-consistent two-corridor
graph, 50 m hazard buffer falloff + 48 h half-life decay, and end-to-end route/hazard flows.

## 📁 Repository layout

```
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (route, hazards, layers, satellite, meta)
│   │   ├── core/           # config (pydantic-settings), db, cache, app_state
│   │   ├── models/         # SQLAlchemy ORM + pydantic schemas
│   │   ├── services/       # satellite, austin open data, osm, solar, shadows,
│   │   │                   # environment rasters, canopy index, hazards, routing engine
│   │   ├── data/snapshot/  # offline Downtown Austin bundle (generated, versioned)
│   │   └── main.py
│   ├── scripts/build_snapshot.py
│   ├── tests/              # pytest suite (offline, deterministic)
│   ├── requirements.txt    # core runtime
│   ├── requirements-live.txt  # optional live-satellite extras (rasterio, pystac-client, …)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/     # MapView, RoutingPanel, MetricsPanel, HazardDrawer, …
│   │   ├── hooks/          # useGeolocation, useHazards, useRoute, useShadows, useSatelliteStatus
│   │   ├── services/       # api client (src/api/client.ts)
│   │   └── utils/          # formatting, comparison rows, Austin-time helpers (+ vitest tests)
│   ├── package.json
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml      # frontend + backend + redis (+ optional postgis profile)
└── docs/ci-workflow.yml    # GitHub Actions CI (move to .github/workflows/ to enable)
```

## ⚙️ Configuration (env vars, prefix `COOLPATH_`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | SQLite `backend/data/coolpath.db` | any SQLAlchemy URL (PostGIS supported) |
| `REDIS_URL` | – (in-process cache) | Redis for dynamic caches |
| `OFFLINE_MODE` | `false` | skip all live fetches (CI) |
| `LIVE_REFRESH_ON_STARTUP` | `true` | background live-source refresh |
| `OVERPASS_URL` / `PC_STAC_URL` / `AUSTIN_CANOPY_URL` | Planetary Computer / data.austintexas.gov | live endpoints |
| `BBOX` | Austin bbox | study area |
| `WALK_SPEED_MPS` | `1.34` | walk-time estimate |
| `HAZARD_BUFFER_M` / `HAZARD_HALF_LIFE_H` | `50` / `48` | hazard decay model |

## 🗺️ Roadmap

- Deck.gl 3-D buildings + shadow volume rendering
- ORS/Valhalla isochrone overlays ("how far can I walk in the shade?")
- Tree-planting opportunity scorer (high LST × low NDVI × high pedestrian demand)
- Passive crowdsourcing from fitness-app traces

---

*Built as a production-shaped reference implementation: typed end-to-end, tested, containerised,
and honest about where every byte of geodata came from.*
