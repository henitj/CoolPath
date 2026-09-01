# CoolPath frontend

MapLibre + React + Vite map-first directions client for the CoolPath routing API.

The home screen is a full-map, Google Maps-style walking planner: search a Downtown Austin destination or intersection, use browser GPS, or drop map pins. It automatically scores the selected route and colours every walkable road from green (more comfortable) to red (use care). The bottom-left hazard button submits reports that immediately refresh the road overlay and route recommendation.

## Run it

From the repository root:

```bash
npm install
npm run dev
```

Vite listens on `http://localhost:5173` and proxies `/api` to the FastAPI
backend on `http://localhost:8000`.

## Useful commands

```bash
npm run build       # type-check + production build
npm run lint        # oxlint
npm run typecheck   # TypeScript project build
npm test            # vitest
```
