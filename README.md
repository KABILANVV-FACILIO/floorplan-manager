# Floorplan Manager

A React + Vite implementation of the "Floorplan Manager" design prototype (`.design-src/Floorplan Manager.dc.html`), built as a Facilio **vibe app**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or next free port)
npm run build       # outputs dist/, with index.html at the root (vibe app requirement)
npm run typecheck
```

## `.env.local` setup

Copy `.env.local.example` to `.env.local` (gitignored — never commit it) and fill in what you need. Full reference:

```bash
# Dev mode: when true, the app points the Vibe SDK at VITE_VIBE_SERVER_URL instead of
# window.location.origin, so `npm run dev` (localhost) can talk to a real deployed
# Vibe backend (preview or production) for auth + connector/db calls. It also switches
# the data-layer tier order — see "Data layer" below.
VITE_DEV_MODE=true
VITE_VIBE_SERVER_URL=https://your-app.vibe.facilio.com

# @facilio/api: only used when VITE_DEV_MODE=true and both of these are set. Sends
# VITE_FACILIO_TOKEN as a Bearer Authorization header to VITE_FACILIO_API_BASE_URL
# (a Facilio org's REST API, including the /api prefix — e.g. https://your-org.facilio.com/api
# or http://localhost:8080/api for a local instance) so real site/building/floor/employee
# data can be fetched, and floorplan file uploads can be attached to a real floor. The
# token is often short-lived — if calls start 401ing, generate a fresh one.
VITE_FACILIO_API_BASE_URL=https://your-org.facilio.com/api
VITE_FACILIO_TOKEN=
```

Without any of this, the app runs fully offline against the mock data layer (see below) — no backend required.

## Data layer

`src/lib/dataSource.ts` tries a tiered list of `FloorplanDataSource` implementations per call, falling through on failure. The tier order itself differs by mode (`defaultTiers()` in `dataSource.ts`):

- **In dev mode** (`VITE_DEV_MODE=true`, i.e. `npm run dev`): `@facilio/api` → mock. The Vibe-runtime-backed tiers are skipped entirely — a plain `npm run dev` session has no `/api/runtime/*` endpoints to answer them (that only exists once deployed), so trying them just adds noisy failed round-trips.
- **Otherwise** (a deployed vibe app): `@facilio/api` → Facilio CMMS connector → this app's own Vibe DB → mock.

Tiers:

1. **`@facilio/api`** (`src/lib/facilioApiDataSource.ts`, generic V3 module CRUD via `v3/modules/{moduleName}`, bearer-token authenticated) — real `site`/`building`/`floor`/`employee` records, and the real floorplan file-upload path (see below). Deliberately **not** wired for units/assignments/bookings: a desk/room/locker/parking-stall record has no on-plan position of its own — that lives in separate `floorplanmarker`/`floorplanmarkedzone` records whose exact geometry schema (plan-pixel vs. georeferenced lng/lat) needs verifying against a live org before it's safe to render. Guessing that wrong would silently misplace markers, which is worse than falling through — so those methods throw on purpose.
2. **Facilio CMMS connector** (`facilio-cmms.list-sites` / `list-buildings` / `list-floors` / `list-spaces`, via `vibe.executeAction` → `/api/runtime/connections/*`) — **the portfolio source** (site/building/floor tree) plus per-floor spaces, when a connection is active. Enabled via `VITE_USE_CONNECTORS` (on in `.env.production`). Same booking/assignment gap as above.
3. **This app's own Vibe DB** (`vibe.executeFunction('floorplanApi', ...)` → `/api/runtime/functions/*`) — units/assignments/bookings/employees (the app-specific data the connector doesn't wire), once `vibe db create` + a deployed `floorplanApi` function exist. Throws until that's set up. **Does not serve the portfolio** — that comes from the CMMS connector above, not a KV blob copied into this app (`VibeDbDataSource.getPortfolio` throws to stay out of the portfolio union).
4. **Mock / localStorage** — always succeeds; seeds the same demo data as the original prototype (24 desks, 8 lockers, 3 rooms, 6 parking stalls on "HQ Berlin > Building A > Floor 3").

### Floorplan file uploads

"Upload floorplan" always renders the file client-side first (image directly, PDF via pdf.js, DWG/DXF via `@mlightcad/cad-simple-viewer`) so it works fully offline. When `@facilio/api` is configured, it *additionally* uploads the original file for real via `POST v3/modules/data/files` (returns a real `fileId`), reads it back via `GET v2/files/preview/{fileId}?fetchOriginal=true` (fetched with the raw authenticated axios instance, not `API.get` — that endpoint returns raw bytes, not `@facilio/api`'s usual `{code,data}` JSON envelope), and attaches the `fileId` to the current floor's `indoorfloorplan` record (creating one if none exists). That attach step is best-effort: `@facilio/api` returns `{error}` rather than throwing on a failed request, so it's checked explicitly, and a failure (e.g. the current floor id isn't a real floor — see below) surfaces as a toast rather than a silently-overclaimed success.

## Deploying

Not run automatically. When ready:

```bash
vibe login
vibe app create --name floorplan-manager
npm run build
vibe deploy
```

## Floorplan Editor (edit mode)

Edit mode implements the "Floorplan Editor" design (`.design-src/Floorplan Editor.dc.html`):

- **Edit view panel** with **Tools | Markers** tabs: a live active-tool banner (name + hint), a
  "Work with units" grid (Select `V` / Room / Scale), and an "Add to plan" grid (Desk, Locker,
  Parking — drag onto the plan or click to arm; Asset opens the asset list).
- **Marker library** (Markers tab): 9 built-ins (stairs, elevator, restroom, fire extinguisher,
  first aid, fire exit, printer, pantry, reception) plus **custom markers** (name, 1–2 char chip
  label, optional image URL, color) created inline and persisted via settings
  (`customMarkers`). Markers drag onto the plan or click-to-arm, and render as colored chips.
- **Available to place** tray (Location panel): unplaced records drag onto the plan **or
  click-to-arm** ("Click map" pill) and place on the next canvas click.
- **Replace semantics**: dropping a record (tray drag or an on-canvas marker drag) onto an
  existing marker of the same type gives the dragged record that exact spot; the old record
  moves back to "Available to place" (green ring shows the drop target).
- **Inspector card**: single selection (label, desk type, room, area, delete) or marquee
  multi-selection ("N selected", Delete N). Deleting keeps records — they return to the tray.
- Dark **save bar** (`N unsaved changes · Discard · Save changes`), Shift+drag marquee,
  `V`/`Esc`/`Delete` shortcuts.

Deliberately not ported from the design prototype: the mock Facilio top-bar chrome (the app
gets real chrome from the connected-app host when embedded), and the "empty desk slot"
(`filled: false`) markers — a placeholder-slot concept with no counterpart in the real
floorplanmarker data model yet.

## Known simplifications vs. the original prototype

- **Floorplan background image**: the original referenced a rendered raster PNG that wasn't available to this rebuild (it exceeded the design-tool's file-size cap). Replaced with a generated SVG architectural schematic (`src/components/canvas/FloorplanBackground.tsx`) that follows the same desk/room layout — actually crisper at high zoom than a raster would be. Users can upload a real plan (PNG/JPG/PDF/DWG/DXF) via "Upload floorplan", which replaces it per-floor.
- **DWG/DXF upload**: rendered fully client-side via `@mlightcad/cad-simple-viewer` (MIT-licensed, WASM-backed CAD parser — no external conversion service). This is a heavier, best-effort integration I couldn't interactively test against a real DWG file; it degrades gracefully to an error message if parsing fails. Its DWG parser worker is ~13MB, lazy-loaded only when a DWG/DXF is actually selected.
- **Settings → module color overrides**: not persisted (matches the original prototype's behavior — resets on reload). Permissions and slot-granularity are persisted via the data layer's mock tier.
- **Vestigial features from the original were intentionally dropped**, not ported: a dead third panel, unwired mobile pan/zoom/pinch, a computed-but-unrendered mobile tooltip, and role/permission enforcement that in the original was cosmetic only (toggles in Settings didn't actually gate anything). If real permission enforcement is wanted, `state.perms` + `state.role` are already modeled and just need to gate the relevant actions/buttons.
- **Floor id mismatch when `@facilio/api` is configured**: the app's default floor (`state.floorId`, hardcoded to the mock seed's `'hqA3'`) won't exist in a real org's portfolio, so the canvas shows "No floorplan yet" for it even though the Location panel's spaces list still shows the 41 mock units (those come from the mock tier, keyed to `'hqA3'`, independently of the real portfolio tree). This also means uploading a floorplan while on that floor uploads the file for real but can't attach it to a real `indoorfloorplan` record (the toast says so rather than overclaiming success). Not fixed yet — the fix is to auto-select a real floor from the loaded portfolio when `@facilio/api` answers `getPortfolio()`, at the cost of losing the mock demo data's richness for that floor (mock units are only seeded for `'hqA3'`).
