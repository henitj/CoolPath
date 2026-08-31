# Data directory layout

* `snapshot/` — **versioned offline bundle** (committed): deterministic Downtown Austin model
  produced by `backend/scripts/build_snapshot.py --seed 42`.
  Regenerate any time; the app only uses it when live sources (Planetary Computer, Austin open
  data, Overpass) are unreachable, per the ingestion fallback hierarchy in the README.
* `coolpath.db` — runtime SQLite database for hazard reports (gitignored).
* `live/` — cached live satellite grids captured by successful refreshes (gitignored).
