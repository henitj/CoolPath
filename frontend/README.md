# CoolPath frontend

MapLibre + React + Vite web client for the CoolPath routing API.

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
