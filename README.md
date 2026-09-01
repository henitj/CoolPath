# CoolPath — Urban Micro-Climate & Walkability Mapper

**Shade-optimized, heat-aware and safety-aware pedestrian routing for Downtown Austin, TX.**

CoolPath weighs every street segment of the pedestrian graph by *how hot and how exposed it is
right now*: land-surface temperature from satellite thermal imagery, vegetation (NDVI) from
Copernicus Sentinel-2, **building shadows projected from the real solar position for any time of
day**, tree-canopy coverage, and crowdsourced hazard reports that re-score nearby routes within
seconds.

Bounding box (EPSG:4326): `[-97.755, 30.260, -97.730, 30.278]` · Center: `30.2672, -97.7431`

> **No API keys, no database setup, no sample-data download.** The backend ships a committed
> offline snapshot of Downtown Austin, so a fresh clone runs the whole product locally. Live
> satellite and open-data sources are used automatically when reachable, and fall back to the
> snapshot when they are not.

**Contents** · [Try it out](#try-it-out) · [Features](#features) · [Architecture](#architecture) ·
[Routing model](#the-routing-model) · [API reference](#api-reference-excerpt) ·
[Troubleshooting](#troubleshooting) · [Tests](#tests) · [Repo layout](#repository-layout) ·
[Configuration](#configuration-env-vars-prefix-coolpath_)

---

## Try it out

Pick whichever option matches your setup. Options A and B both give you the same web app; option C
adds the native phone app.

| Requirement | Version | Needed for |
|---|---|---|
| Python | **3.11+** | API (`backend/`) |
| Node.js + npm | **Node 20+** (npm 10+) | web app, mobile app, workspace scripts |
| Docker Engine 24+ with Compose v2 | – | option A only |
| Expo Go (App Store / Play Store) | SDK 54 | option C only |
| GPU / WebGL | any | MapLibre basemap rendering |

### 0 — Clone

```bash
git clone https://github.com/henitj/CoolPath.git
cd CoolPath

cp .env.example backend/.env   # optional — every setting already has a working default
```

Nothing else is required: no keys, no migrations, no data download. Note that the `.env` file is
loaded from the API's working directory, so it belongs in `backend/` (that is where `uvicorn` runs).

### A — Docker (one command, everything wired up)

```bash
docker compose up --build
```

| URL | What it is |
|---|---|
| http://localhost:8080 | the map app (nginx serves the built frontend and proxies `/api` → backend) |
| http://localhost:8000/docs | interactive Swagger UI for the routing API |
| http://localhost:8000/redoc | ReDoc alternative |

The first build pulls a Python 3.11 image (which installs the backend **plus** the optional
`requirements-live.txt` satellite extras) and a Node 20 image that type-checks and bundles the
frontend, so give it a few minutes; subsequent starts are near-instant. Stop with `Ctrl-C`, then
`docker compose down` (add `-v` to also drop the SQLite hazard data). CI validates option B's
commands directly rather than the images, so if an image build misbehaves, option B is the
reliable path.

Optional production database with spatial types:

```bash
docker compose --profile postgis up
# then set COOLPATH_DATABASE_URL=postgresql+psycopg2://coolpath:coolpath@postgres:5432/coolpath
# in docker-compose.yml's backend service
```

### B — Local development (two terminals)

This is the path to use if you want to edit code, or if Docker is unavailable.

```bash
# ── Terminal 1: the API ──────────────────────────────────────────────
cd backend
python3 -m venv .venv
source .venv/bin/activate                 # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
# → "Uvicorn running on http://127.0.0.1:8000"
# → "Startup live-data refresh finished: mode=snapshot" (or mode=live)

# ── Terminal 2: the web app (from the repository root) ──────────────
npm install                               # installs the frontend + mobile workspaces
npm run dev
# → "Local:   http://localhost:5173/"
```

Open **http://localhost:5173**. Vite listens on `5173` and proxies `/api` to the backend on `8000`,
so no frontend configuration is required. Keep the API running in the first terminal — if it isn't,
the app loads but every panel shows a fetch error.

<details>
<summary><b>Windows / PowerShell version of terminal 1</b></summary>

```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

If script activation is blocked: `Set-ExecutionPolicy -Scope Process RemoteSigned`.
</details>

**Sanity check the API from a third terminal:**

```bash
curl -s localhost:8000/api/v1/health          # {"status":"ok","time":"…"}
curl -s localhost:8000/api/v1/meta | head -c 200
open http://localhost:8000/docs               # Windows: start, Linux: xdg-open
```

### C — On your phone with Expo Go

`mobile/` is a native iOS/Android walking app pinned at **Expo SDK 54 / React Native 0.81** — the
SDK supported by the stock Expo Go client, so **no custom development build is needed**. It uses
`react-native-maps`, Expo Location, AsyncStorage and Expo vector icons only.

```bash
# Terminal 1 — the API must bind to 0.0.0.0 so the phone can reach it
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — from the repository root
npm install
npm run mobile          # prints a QR code in LAN mode
```

Open **Expo Go** and scan the QR code. The phone and the computer must be on the **same Wi-Fi
network**, and the computer's firewall must allow inbound TCP `8000`.

Other mobile entry points:

| Command | Does |
|---|---|
| `npm run mobile` | Expo Go, LAN mode (default) |
| `npm run mobile:web` | the same app in a browser via Metro (Expo's default web port, `8081`) |
| `npm run mobile:android` / `mobile:ios` | launch a locally installed emulator/simulator |
| `npm run mobile:tunnel` | Metro over a tunnel (JS only — the API is *not* tunneled) |
| `npm run mobile:doctor` | `expo-doctor` version validation (fetches the package on demand) |

Phone ↔ API behaviour:

- Expo's LAN manifest supplies the computer address, so the app automatically calls
  `http://<computer-LAN-IP>:8000`.
- **Profile → Server connection** shows the active address, tests it, and accepts a manual URL when
  LAN discovery is blocked.
- For `npm run mobile:tunnel`, configure a reachable HTTPS API with `EXPO_PUBLIC_API_URL` before
  starting, or paste that address in Profile.
- The app requests foreground location only. It continuously calibrates while open and is explicit
  that the bundled pedestrian data covers **Downtown Austin only**.

### What to try once it is running

1. **Search a destination.** The panel resolves 16 curated landmarks plus every mapped
   intersection — try `Congress & 6th`, `State Capitol`, `City Hall`, `Trinity bridge` — or paste
   coordinates (`30.2672,-97.7431`). Pin the map, or use the GPS button, for your start point.
   (On an open network, unmatched queries fall through to Nominatim.)
2. **Switch profiles.** Run the same trip as *Fastest*, *Cool & Shaded* and *Safe & Accessible* and
   read the comparison rows — every response is scored against the fastest baseline, so distance,
   temperature, shade, comfort and effort deltas appear side by side. Measured example: **Republic
   Square → Waterloo Park**, `cool` profile, 7:30 p.m. on 30 Aug — the shaded route costs the **same
   distance** (2 061 m, 25.6 min), adds **+13.8 points of shade**, drops the average surface
   temperature by **0.8 °C**, lifts comfort by **+8.6**, and adds **7.5 min** of effort-weighted
   time. Numbers move with the time slider, so scrub it and watch them change.
3. **Scrub the time slider** (5 a.m. → 9 p.m.) and watch building shadows move and the route change
   with the sun. Toggle *Shadows*, *Heat*, *Canopy*, *Buildings*, *Hazards* and *Road score* layers.
4. **Report a hazard** from the bottom-left button. The report penalises a 50 m buffer immediately —
   nearby roads redden and routes around them re-score within the same second, then decay with a
   48 h half-life.
5. **Break out of the browser.** `GET /api/v1/route` works standalone (see
   [API reference](#api-reference-excerpt)) — useful for scripts and for validating the model
   without the map.

### One-off housekeeping commands

```bash
npm run build           # type-check + production bundle → frontend/dist
npm run preview         # serve that bundle on :4173
npm run lint            # oxlint (frontend workspace)
npm run typecheck       # tsc across all workspaces
npm test                # frontend + mobile vitest suites

cd backend && .venv/bin/python -m pytest tests/ -q      # 72 offline API tests
.venv/bin/python scripts/build_snapshot.py --seed 42    # regenerate the offline snapshot
```

---

## Features

| | |
|---|---|
| **Satellite ingestion** | Sentinel-2 L2A (B04/B08 → NDVI) + Landsat 8/9 C2 L2 (surface temperature) via the Planetary Computer STAC API |
| **Austin open data** | City of Austin tree canopy (Socrata `uj6p-2j9z`), UHI disparity layer, sidewalk network — with graceful hydration fallback |
| **Dynamic shadows** | pysolar/NOAA solar azimuth + elevation → building-height shadow polygons cached per minute; slider scrubs the sun from 5 a.m. to 9 p.m. |
| **Micro-climate weighting** | `W = dist · (1 + α·HeatIndex − β·CanopyNDVI + γ·HazardPenalty + Accessibility)` per edge, per profile |
| **Crowdsourced hazards** | `POST/GET/DELETE /api/v1/hazards` — reports penalise a 50 m buffer instantly, then decay exponentially (48 h half-life, 7-day expiry) |
| **3 routing profiles** | Fastest (A*) · Cool & Shaded · Safe & Accessible — every response carries a fastest-path baseline + metric deltas |
| **Map-first directions UI** | Google Maps-style MapLibre screen: type/search a start and destination (or use device GPS / map pins), get an automatic route, see live green→red road conditions, and report hazards from the bottom-left button |

### Mobile experience

| Tab | What it does |
|---|---|
| **Map** | A real native MapKit/Google Maps canvas with light-green styling, live green/amber/red road-condition lines, searchable start and destination pickers, map-pin placement, walking ETA, and the bottom-left report control. |
| **Navigate** | A follow-your-position walking map with ordered street maneuvers, remaining ETA/distance, off-route rerouting, and an end-and-save action. |
| **Report** | GPS-gated, downtown-only condition reports that immediately affect nearby route costs. |
| **Profile** | Persisted cool/care/direct route preference, an avoid-poor-red-paths switch, GPS accuracy and coverage feedback, server connection controls, and saved walk history. |

The default **Cool route** optimizes the lowest walking opportunity cost by balancing shade and
distance. Enabling **Avoid poor red paths** first searches for a route with every red-condition
segment excluded; a red segment is used only when the mapped pedestrian graph has no clean
connection.

## Architecture

```
┌─────────────────────────────  Frontend (React + TS + Vite + Tailwind)  ─────────────────────────┐
│  MapView (MapLibre GL)   RoutingPanel   MetricsPanel   HazardDrawer   TimeSlider  StatusBar     │
└──────────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                           │ /api/v1  (JSON / GeoJSON)
┌──────────────────────────────────────────▼──────────────────────────────────────────────────────┐
│  FastAPI  ·  api/  route · hazards · layers · satellite · places · now · meta                   │
│────────────────────────────  services/  ────────────────────────────────────────────────────────│
│  satellite_service ─┐   Sentinel-2 NDVI + Landsat LST (Planetary Computer, lazy imports)       │
│  austin_service   ──┤   Socrata tree canopy (uj6p-2j9z) + ArcGIS UHI disparity                  │
│  osm_service      ──┤   Overpass pedestrian graph + building heights                            │
│        ⤷ fallback → bundled offline snapshot (deterministic Downtown Austin model)          │
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
the UI (`Refresh live data` re-runs the hierarchy on demand — a daemon thread also runs it on
startup). In restricted environments (CI, sandboxes, firewalled networks) outbound geo APIs are
unreachable, so the app demonstrably runs fully on the snapshot layer; on an open network the live
sources take over automatically. Set `COOLPATH_OFFLINE_MODE=true` to skip the attempts entirely and
make startup instant and deterministic.

> **Snapshot provenance** — the offline bundle is a *deterministic approximation* of downtown
> Austin's urban fabric (named street grid, landmark towers with real heights, parks, Lady Bird
> Lake & Shoal Creek, street-tree canopy, land-cover-derived LST/NDVI rasters) generated by
> [`backend/scripts/build_snapshot.py`](backend/scripts/build_snapshot.py) (seed 42) so the whole
> product is reproducible offline and in CI. See `backend/app/data/snapshot/meta.json`.

## The routing model

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

## API reference (excerpt)

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

# Micro-climate at a single point (temperature, shade %, comfort — the mobile "near me" card)
curl -s "localhost:8000/api/v1/now?lat=30.2672&lon=-97.7431"

# Building shadows at a specific instant (solar alt/az included)
curl -s "localhost:8000/api/v1/layers/shadows?timestamp=2026-08-30T14:00:00-05:00"

# Live road quality (0–100; green = cooler/safer, red = use care)
curl -s localhost:8000/api/v1/layers/road-conditions | jq '.features[0].properties'

# Offline-ready place and intersection search (also accepts lat,lon)
curl -s 'localhost:8000/api/v1/places/search?q=Congress%206th' | jq '.places[:3]'

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
| `GET` | `/api/v1/hazards/categories` | Hazard taxonomy (weights, colours) |
| `GET` | `/api/v1/layers/{buildings,canopy,water,parks,heat}` | Map layers (GeoJSON) |
| `GET` | `/api/v1/layers/road-conditions?timestamp=` | Live 0–100 per-road comfort/safety overlay (green → red) |
| `GET` | `/api/v1/layers/shadows?timestamp=` | Shadow polygons + solar position |
| `GET` | `/api/v1/layers/network/stats` | Graph stats |
| `GET` | `/api/v1/now?lat=&lon=&timestamp=` | Point conditions: `temp_c`, `ndvi`, shade/canopy %, comfort, sun |
| `GET` | `/api/v1/places` · `/api/v1/places/search?q=` | Curated destinations · place/intersection/coordinate search |
| `GET/POST` | `/api/v1/satellite/status` · `/refresh` | Ingestion hierarchy status / manual refresh |
| `GET` | `/api/v1/meta` · `/api/v1/health` | Metadata, health |

Every GeoJSON route response carries the sampled per-vertex exposure series plus the
`comparison` block; `timestamp` is accepted anywhere shadows matter and defaults to *now* in
`America/Chicago`.

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `ModuleNotFoundError: app` | Run uvicorn **from `backend/`** — `uvicorn app.main:app` resolves the package relative to the cwd. |
| `Address already in use: 8000` / `5173` | Something owns the port: `lsof -i :8000` (Windows: `netstat -ano \| findstr :8000`), or move it — `uvicorn app.main:app --port 8001` **and** the proxy target in `frontend/vite.config.ts` must change together. |
| App loads, panels say "fetch failed" / 502 | The API isn't running, or is on a different port than the Vite proxy target. Check `curl -s localhost:8000/api/v1/health`. |
| Startup log shows `→ snapshot fallback` | Expected on restricted networks: live Sentinel/Landsat/Austin/Overpass endpoints are unreachable and the deterministic snapshot takes over. The app is fully functional; use the `Refresh live data` button to retry. |
| Slow start / long timeout on boot | `COOLPATH_OFFLINE_MODE=true` skips every outbound fetch. |
| `pip install` fails on `geopandas`/`shapely` | Both need a recent pip and wheels for your platform: `python -m pip install -U pip wheel` first, or use Python 3.11/3.12 on a 64-bit OS. |
| `npm install` errors about workspaces | Install from the **repository root** (never `cd frontend && npm install`); the root `package.json` declares `frontend` and `mobile` as workspaces. Node must be ≥ 20: `node -v`. |
| Vite "blocked request / host not allowed" | `allowedHosts: true` is already set in `vite.config.ts`; if you override the config, keep it when serving from a tunnel or a LAN hostname. |
| Phone can't reach the API | The API must bind to `0.0.0.0`, not `127.0.0.1`; same Wi-Fi network; allow inbound TCP 8000 in the OS firewall. Corporate/VPN networks often block LAN peers — paste the URL under **Profile → Server connection**, or run the API somewhere public and set `EXPO_PUBLIC_API_URL`. |
| `npm run mobile` shows no QR code | It skips Expo's optional *online* dependency check, but a stale `node_modules` still breaks Metro: rerun `npm install` at the root after any `package.json` change. |
| `npm run mobile:doctor` wants to install a package | `expo-doctor` is not vendored in `mobile/devDependencies`, so `npx` fetches it on demand (needs network). |
| Hazards disappear | They expire by design: 48 h half-life, deleted at `COOLPATH_HAZARD_MAX_AGE_H` (168 h). Clear the DB entirely with `rm backend/data/coolpath.db`. |
| Map tiles don't move / blank canvas | WebGL disabled (some VMs, remote desktops) or a content blocker on the basemap host. The routing panels and API still work. |

## Tests

```bash
# backend — 72 tests, fully offline against the snapshot, throwaway SQLite DB
cd backend && source .venv/bin/activate && python -m pytest tests/ -q

# from the repository root
npm test                # frontend (9 vitest tests) + mobile (28 vitest tests)
npm run typecheck       # tsc across all workspaces
npm run lint            # oxlint (frontend workspace; config in frontend/.oxlintrc.json)
```

Highlights: solar position validated against pysolar/NOAA reference values (≤0.8°), shadow length
∝ `1/tan(elevation)`, cool-vs-fastest profile divergence on a geo-consistent two-corridor graph,
50 m hazard buffer falloff + 48 h half-life decay, point-condition and search endpoints, and
end-to-end route/hazard flows. `python -m pytest tests/ -v` lists them individually.

CI lives at [`docs/ci-workflow.yml`](docs/ci-workflow.yml) — move it to
`.github/workflows/ci.yml` to enable the backend + frontend pipelines (snapshot regeneration
determinism check, pytest, lint, typecheck, vitest, production build).

## Repository layout

```
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers: route, hazards, layers, satellite, places, now, meta
│   │   ├── core/           # config (pydantic-settings), db, cache, app_state, geo_utils, constants
│   │   ├── models/         # SQLAlchemy ORM + pydantic schemas
│   │   ├── services/       # satellite, austin open data, osm, solar, shadows, conditions,
│   │   │                   # environment rasters, canopy index, hazards, routing engine
│   │   ├── data/snapshot/  # offline Downtown Austin bundle (generated, versioned, committed)
│   │   └── main.py         # create_app(); `uvicorn app.main:app`
│   ├── scripts/build_snapshot.py   # deterministic generator (--seed 42)
│   ├── tests/              # pytest suite (offline, deterministic)
│   ├── requirements.txt    # core runtime (fastapi, uvicorn, sqlalchemy, networkx, shapely, …)
│   ├── requirements-dev.txt   # pytest
│   ├── requirements-live.txt  # optional live-satellite extras (rasterio, pystac-client, …)
│   └── Dockerfile          # python:3.11-slim, installs core + live extras, healthcheck
├── package.json            # npm workspace: one `npm install` covers frontend + mobile
├── frontend/
│   ├── src/
│   │   ├── api/             # api client (client.ts, relative `/api/v1` base)
│   │   ├── components/      # MapView, RoutingPanel, MetricsPanel, HazardDrawer, TimeSlider,
│   │   │                    # DirectionsPanel, RouteSummary, LayerToggles, Legend, StatusBar
│   │   ├── hooks/           # useGeolocation, useHazards, useRoute, useShadows,
│   │   │                    # useRoadConditions, useSatelliteStatus
│   │   └── utils/           # formatting, Austin-time helpers (+ vitest tests)
│   ├── vite.config.ts       # :5173, host 0.0.0.0, /api → 127.0.0.1:8000 proxy
│   ├── nginx.conf           # container mode: serves dist/, proxies /api → backend:8000
│   └── Dockerfile           # node:20 build → nginx:1.27
├── mobile/                 # Expo Go app (iOS/Android + web)
│   ├── App.tsx             # tab bar: Map · Navigate · Report · Profile
│   ├── src/screens/        # MapScreen, NavigationScreen, ReportScreen, ProfileScreen
│   │                       # (HomeScreen/RouteScreen/PlacesScreen/SettingsScreen are older
│   │                       #  alternates kept in-tree; they are not wired into the tab bar)
│   ├── src/components/     # ScoreDial, NearbyRadar, SunArc, MiniRouteMap, PlacePicker, …
│   ├── src/                # api.ts, state.tsx, url.ts, score.ts, navigation.ts, places.ts
│   ├── src/__tests__/      # vitest unit tests (28)
│   ├── scripts/start-expo-go.cjs  # resilient Expo Go launcher (LAN / tunnel / web)
│   └── app.json            # branding, splash, location permissions
├── docker-compose.yml      # frontend + backend + redis (+ optional postgis profile)
├── .env.example            # every COOLPATH_* knob, all optional
└── docs/ci-workflow.yml    # GitHub Actions CI (move to .github/workflows/ to enable)
```

## Configuration (env vars, prefix `COOLPATH_`)

No configuration is required to run the app; copy `.env.example` to `backend/.env` only if you want
to change something (the file is resolved relative to the API's working directory). Settings come
from the environment (or that `.env`) via `pydantic-settings`, so every entry below needs the
`COOLPATH_` prefix — e.g. `COOLPATH_DATABASE_URL=…`. A bare `REDIS_URL=` in an env file is ignored
for that reason; use `COOLPATH_REDIS_URL`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | SQLite `backend/data/coolpath.db` (auto-created) | any SQLAlchemy URL (PostGIS supported) |
| `REDIS_URL` | – (in-process TTL cache) | Redis for dynamic caches — must be `COOLPATH_REDIS_URL` to be picked up |
| `OFFLINE_MODE` | `false` | skip all live fetches (CI) |
| `LIVE_REFRESH_ON_STARTUP` | `true` | background live-source refresh |
| `LIVE_REFRESH_OSM` | `false` | also attempt a live Overpass graph fetch |
| `OVERPASS_URL` / `PC_STAC_URL` / `AUSTIN_CANOPY_URL` / `AUSTIN_UHI_URL` | Overpass / Planetary Computer / data.austintexas.gov | live endpoints |
| `GEOCODER_URL` / `GEOCODER_TIMEOUT_S` | Nominatim / `2.5` s | keyless address fallback for place search |
| `BBOX` / `CENTER_LAT` / `CENTER_LON` / `TIMEZONE` | Austin bbox | study area |
| `WALK_SPEED_MPS` | `1.34` | walk-time estimate |
| `HAZARD_BUFFER_M` / `HAZARD_HALF_LIFE_H` / `HAZARD_MAX_AGE_H` | `50` / `48` / `168` | hazard decay model |
| `LIVE_FETCH_TIMEOUT_S` | `8.0` | per-request ceiling for every live source |
| `CORS_ORIGINS` | `*` | comma-separated origin allowlist |

## Roadmap

- Deck.gl 3-D buildings + shadow volume rendering
- ORS/Valhalla isochrone overlays ("how far can I walk in the shade?")
- Tree-planting opportunity scorer (high LST × low NDVI × high pedestrian demand)
- Passive crowdsourcing from fitness-app traces
- CI enabled in-repo (`.github/workflows/`) + published demo deployment

---

*Built as a production-shaped reference implementation: typed end-to-end, tested, containerised,
and honest about where every byte of geodata came from.*
