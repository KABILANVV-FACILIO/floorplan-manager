import { vibe } from './vibe';
import { EMPLOYEES, PORTFOLIO, seedAssignments, seedBookings, seedUnits } from './mockData';
import { DEMO_ASSETS } from './assets';
import type { Asset } from './assets';
import { mirrorThroughCache } from './moduleCache';
import { FacilioApiDataSource } from './facilioApiDataSource';
import type { Assignments, Booking, Employee, PlanId, Site, Unit, UnitType } from './types';

/**
 * Data access contract for the Floorplan Manager. Every method is backed by a tiered
 * fallback (see CompositeDataSource), the same chain in dev and deployed: @facilio/api
 * (real backend, only active when configured) -> Facilio CMMS connector (opt-in) -> this
 * app's own Vibe db -> local mock/localStorage (see defaultTiers()). Callers never see
 * which tier answered.
 */
export interface FloorplanDataSource {
  readonly name: string;
  getPortfolio(): Promise<Site[]>;
  getEmployees(): Promise<Employee[]>;
  /** Catalog of assets that can be dropped onto a plan (Edit mode asset picker). */
  getAssets(): Promise<Asset[]>;
  getUnits(floorId: string): Promise<Unit[]>;
  saveUnits(floorId: string, units: Unit[]): Promise<void>;
  /**
   * Mint a genuinely-new record (desk/locker/parking/room). On the connector tier this is a real
   * facilio-iwms write via the module's dedicated action (create-desks / create-lockers / …) — the
   * org's IWMS gets the record — and the returned Unit carries the authoritative server id. Lower
   * tiers (vibe-db/mock) just echo the unit back with its local id so a runtime-less/dev session
   * still works; the on-plan position is persisted separately by the caller via saveUnits (records
   * hold no floorplan geometry). Amenities (assets/markers) are NOT IWMS records and are rejected
   * by the connector tier.
   */
  createUnit(loc: CreateSpaceLoc, unit: Unit): Promise<Unit>;
  getAssignments(floorId: string): Promise<Assignments>;
  assignUnit(unitId: string, employeeId: string): Promise<void>;
  vacateUnit(unitId: string): Promise<void>;
  getBookings(floorId: string, date: string): Promise<Booking[]>;
  createBooking(input: Omit<Booking, 'id'>): Promise<Booking>;
  cancelBooking(id: string): Promise<void>;
  /**
   * Optional fast path: everything a floor load needs in ONE backend
   * round-trip. `file` is the stored floorplan-file JSON string (see
   * floorplanFileStore) or null. Tiers without it are skipped by the
   * composite; callers must be prepared to fall back to the per-call path.
   */
  getFloorData?(floorId: string, date: string, planId: string): Promise<FloorBundle>;
}

export interface FloorBundle {
  units: Unit[];
  assignments: Assignments;
  bookings: Booking[];
  file: string | null;
}

/** Where a new space is being created — its floor, plus the enclosing building/site so the
 *  connector's create-space (which requires `site`) can be satisfied. Resolved by the caller
 *  from the portfolio tree. */
export interface CreateSpaceLoc {
  siteId: string | null;
  buildingId: string | null;
  floorId: string;
}

/** This app's unit type → the dedicated facilio-iwms module create action. Each IWMS module has its
 *  own create endpoint (V5 /api/v5/desks, /lockers, …), so a desk is created with create-desks, a
 *  locker with create-lockers, etc. Amenities (assets/markers) aren't IWMS records → null. */
function iwmsCreateAction(type: UnitType): string | null {
  switch (type) {
    case 'workstation':
      return 'create-desks';
    case 'locker':
      return 'create-lockers';
    case 'parking':
      return 'create-parkings';
    case 'room':
      return 'create-rooms';
    default:
      return null;
  }
}

const LS_KEY = 'facilio_floorplan_proto_v2';

interface PersistedShape {
  units: Unit[];
  assignments: Assignments;
  bookings: Booking[];
}

function loadPersisted(): PersistedShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedShape) : null;
  } catch {
    return null;
  }
}

function savePersisted(next: Partial<PersistedShape>) {
  try {
    const cur = loadPersisted() || { units: seedUnits(), assignments: seedAssignments(), bookings: [] };
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...next }));
  } catch {
    /* ignore quota/serialization errors */
  }
}

/**
 * Guaranteed-to-succeed tier: seeds from the prototype's mock data, persists edits to
 * localStorage so a demo/dev session survives reloads. This is the final fallback and
 * also what powers `npm run dev` with no backend at all.
 */
export class MockDataSource implements FloorplanDataSource {
  readonly name = 'mock';

  async getPortfolio(): Promise<Site[]> {
    return PORTFOLIO;
  }

  async getEmployees(): Promise<Employee[]> {
    return EMPLOYEES;
  }

  async getAssets(): Promise<Asset[]> {
    return DEMO_ASSETS;
  }

  async getUnits(floorId: string): Promise<Unit[]> {
    const saved = loadPersisted();
    const units = saved?.units ?? seedUnits();
    return units.filter((u) => u.floor === floorId);
  }

  async saveUnits(floorId: string, units: Unit[]): Promise<void> {
    const saved = loadPersisted();
    const others = (saved?.units ?? seedUnits()).filter((u) => u.floor !== floorId);
    savePersisted({ units: [...others, ...units] });
  }
  // No backend to create against — the record lives entirely in localStorage, persisted with its
  // position by the caller's saveUnits. Just echo the unit back with its local id.
  async createUnit(_loc: CreateSpaceLoc, unit: Unit): Promise<Unit> {
    return unit;
  }

  async getAssignments(floorId: string): Promise<Assignments> {
    const saved = loadPersisted();
    const all = saved?.assignments ?? seedAssignments();
    const units = await this.getUnits(floorId);
    const ids = new Set(units.map((u) => u.id));
    return Object.fromEntries(Object.entries(all).filter(([unitId]) => ids.has(unitId)));
  }

  async assignUnit(unitId: string, employeeId: string): Promise<void> {
    const saved = loadPersisted();
    const assignments = { ...(saved?.assignments ?? seedAssignments()), [unitId]: employeeId };
    savePersisted({ assignments });
  }

  async vacateUnit(unitId: string): Promise<void> {
    const saved = loadPersisted();
    const assignments = { ...(saved?.assignments ?? seedAssignments()) };
    delete assignments[unitId];
    savePersisted({ assignments });
  }

  async getBookings(floorId: string, date: string): Promise<Booking[]> {
    const saved = loadPersisted();
    const bookings = saved?.bookings ?? seedBookings(date);
    const units = await this.getUnits(floorId);
    const ids = new Set(units.map((u) => u.id));
    return bookings.filter((b) => ids.has(b.unitId) && b.date === date);
  }

  async createBooking(input: Omit<Booking, 'id'>): Promise<Booking> {
    const saved = loadPersisted();
    const bookings = saved?.bookings ?? seedBookings(input.date);
    const booking: Booking = { ...input, id: 'b' + Date.now() };
    savePersisted({ bookings: [...bookings, booking] });
    return booking;
  }

  async cancelBooking(id: string): Promise<void> {
    const saved = loadPersisted();
    if (!saved?.bookings) return;
    savePersisted({ bookings: saved.bookings.filter((b) => b.id !== id) });
  }

  async getFloorData(floorId: string, date: string): Promise<FloorBundle> {
    const [units, assignments, bookings] = await Promise.all([
      this.getUnits(floorId),
      this.getAssignments(floorId),
      this.getBookings(floorId, date),
    ]);
    return { units, assignments, bookings, file: null };
  }
}

/**
 * Facilio CMMS connector tier, via `vibe.executeAction('facilio-cmms', <action>, payload)`.
 * Response shapes confirmed against a live connection (2026-07): every list action
 * returns `{ pagination, data: [...], success }`, expanded lookups arrive as nested
 * records ({id, name, ...}), unexpanded ones as bare `{id}` objects, and
 * `filters: "floor=<id>"` server-scopes list-spaces to that one floor.
 *
 * READS the org's real data via the confirmed list actions: sites/buildings/floors/spaces
 * (portfolio + per-floor units), `list-employees` (people directory), `list-assets` (Edit-mode
 * asset catalog). Assignment/booking actions aren't exposed by the connector, so those still
 * throw to fall through. Writes also fall through: saveUnits is called on every micro-edit with
 * the full unit list, and pushing that through create-space would mint duplicate real records.
 * (The connector additionally supports list-work-orders / list-tenants — ready to wire when the
 * asset→maintenance and tenant features land.)
 *
 * MIRROR CACHE: every read here goes through `mirrorThroughCache` (see lib/moduleCache), which
 * keeps a copy of each module in the app's vibe-db equal to the API — rewriting it only when the
 * data changed — and serves that copy when the connector is unreachable. The desks/lockers/etc.
 * modules from the separate `facilio-iwms` connector will flow through the same helper once that
 * connector is wired.
 */
export class ConnectorDataSource implements FloorplanDataSource {
  readonly name = 'facilio-cmms';

  // Every connector read below flows through the vibe-db mirror cache (mirrorThroughCache):
  // the API stays the source of truth, the vibe-db copy is rewritten only when the data changed,
  // and a stale mirror is served if the connector is unreachable. The raw fetch+map is the inner
  // function; caching is transparent to callers.

  getPortfolio(): Promise<Site[]> {
    return mirrorThroughCache('portfolio', async () => {
      const [sitesRes, buildingsRes, floorsRes] = await Promise.all([
        vibe.executeAction('facilio-cmms', 'list-sites', { page_size: 200, select: 'id,name' }),
        vibe.executeAction('facilio-cmms', 'list-buildings', { page_size: 200, expand: 'site', select: 'id,name,site' }),
        vibe.executeAction('facilio-cmms', 'list-floors', {
          page_size: 200,
          expand: 'building,site',
          select: 'id,name,building,site,floorlevel',
        }),
      ]);
      return buildFromCmmsGraph(sitesRes, buildingsRes, floorsRes);
    });
  }

  getEmployees(): Promise<Employee[]> {
    return mirrorThroughCache('employees', async () => {
      // `list-employees` — the org's people directory. Lookup fields (department) return raw ids
      // unless expanded, so hydrate it; a record may still have no department, which is fine.
      const res = await vibe.executeAction('facilio-cmms', 'list-employees', {
        page_size: 200,
        expand: 'department',
        select: 'id,name,email,department,designation',
      });
      return mapCmmsEmployees(res);
    });
  }

  getAssets(): Promise<Asset[]> {
    return mirrorThroughCache('assets', async () => {
      // `list-assets` — the org's asset/equipment catalog (Edit-mode asset picker). `category` is a
      // plain string; `space` is an expanded {id,name} used as the row's location line.
      const res = await vibe.executeAction('facilio-cmms', 'list-assets', {
        page_size: 200,
        expand: 'category,space',
        select: 'id,name,category,space',
      });
      return mapCmmsAssets(res);
    });
  }

  getUnits(floorId: string): Promise<Unit[]> {
    // Real Facilio floor ids are numeric; slug ids (RCU import, demo floors) belong to the mock
    // tier — throw so the composite falls through instead of this tier answering [] and masking
    // the seeded units. (The throw happens before any cache I/O.)
    if (!/^\d+$/.test(floorId)) {
      return Promise.reject(new Error('facilio-cmms: not an org floor id'));
    }
    return mirrorThroughCache(`units:${floorId}`, async () => {
      const res = await vibe.executeAction('facilio-cmms', 'list-spaces', {
        filters: `floor=${floorId}`,
        page_size: 200,
        expand: 'spaceCategory',
        select: 'id,name,floor,spaceCategory,area,maxOccupancy',
      });
      return mapCmmsSpacesToUnits(res, floorId);
    });
  }

  async saveUnits(): Promise<void> {
    // Bulk position saves stay off the connector: saveUnits fires on every micro-edit with the
    // FULL unit list, and replaying that through create/update-space would churn (or duplicate)
    // real records. On-plan geometry lives in the vibe-db overlay; only genuine record creation
    // (createUnit) and single-record edits belong on the connector.
    throw new Error('facilio-cmms: bulk unit writes persist on the db/mock tiers');
  }

  /**
   * Create ONE real record via the dedicated facilio-iwms module action (create-desks /
   * create-lockers / create-parkings / create-rooms) — the write the app was missing: a new
   * desk/locker/parking/room becomes an actual IWMS record, not just a vibe-db blob. Reads still
   * come from facilio-cmms; only this write targets the IWMS connector. V5 create convention wraps
   * the fields under `data`; the response's data.id is the authoritative id. Throws (→ local tier)
   * when the connector isn't reachable/authorized, so the app still works.
   */
  async createUnit(loc: CreateSpaceLoc, unit: Unit): Promise<Unit> {
    const action = iwmsCreateAction(unit.type);
    if (!action) {
      throw new Error(`facilio-iwms: ${unit.type} is not an IWMS record type`);
    }
    if (!/^\d+$/.test(loc.floorId)) {
      throw new Error('facilio-iwms: not an org floor id');
    }
    const data: Record<string, unknown> = { name: unit.label, floor: Number(loc.floorId) };
    if (loc.buildingId && /^\d+$/.test(loc.buildingId)) data.building = Number(loc.buildingId);
    if (loc.siteId && /^\d+$/.test(loc.siteId)) data.site = Number(loc.siteId);
    const res = await vibe.executeAction('facilio-iwms', action, { data });
    const id = createdSpaceId(res);
    if (!id) throw new Error(`facilio-iwms: ${action} returned no id`);
    return { ...unit, id, unplaced: false };
  }

  async getAssignments(): Promise<Assignments> {
    throw new Error('facilio-cmms: assignment records not wired');
  }
  async assignUnit(): Promise<void> {
    throw new Error('facilio-cmms: assignment records not wired');
  }
  async vacateUnit(): Promise<void> {
    throw new Error('facilio-cmms: assignment records not wired');
  }
  async getBookings(): Promise<Booking[]> {
    throw new Error('facilio-cmms: booking records not wired');
  }
  async createBooking(): Promise<Booking> {
    throw new Error('facilio-cmms: booking records not wired');
  }
  async cancelBooking(): Promise<void> {
    throw new Error('facilio-cmms: booking records not wired');
  }
}

type CmmsRow = Record<string, unknown>;

function cmmsRows(res: unknown): CmmsRow[] {
  const data = (res as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as CmmsRow[]) : [];
}

/** Pull the new record's id out of a create-space response, tolerating the shapes the connector
 *  may return: {data:[{id}]}, {data:{id}}, or a bare {id}. */
function createdSpaceId(res: unknown): string | null {
  const r = res as { data?: unknown; id?: unknown } | null;
  const d = r?.data ?? r;
  if (Array.isArray(d)) {
    const first = d[0] as { id?: unknown } | undefined;
    return first?.id != null ? String(first.id) : null;
  }
  const id = (d as { id?: unknown } | null)?.id ?? r?.id;
  return id != null ? String(id) : null;
}

function lookupId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return String(v);
  const id = (v as { id?: unknown }).id;
  return id == null ? null : String(id);
}

function lookupName(v: unknown): string | null {
  const name = (v as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name ? name : null;
}

/** A CMMS field that may arrive as a plain string, an expanded {name} lookup, or absent. */
function stringOrLookupName(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  return lookupName(v);
}

/** `list-employees` rows → the app's Employee directory ({id, name, dept}). */
function mapCmmsEmployees(res: unknown): Employee[] {
  return cmmsRows(res).map((e) => ({
    id: String(e.id),
    name: (typeof e.name === 'string' && e.name) || (typeof e.email === 'string' && e.email) || `Employee ${e.id}`,
    dept: stringOrLookupName(e.department) ?? (typeof e.designation === 'string' ? e.designation : '') ?? '',
  }));
}

/** `list-assets` rows → the Edit-mode asset catalog. `space` (expanded) is the location line. */
function mapCmmsAssets(res: unknown): Asset[] {
  return cmmsRows(res).map((a) => {
    const category = stringOrLookupName(a.category) ?? 'Asset';
    const space = lookupName(a.space);
    return {
      id: String(a.id),
      name: (typeof a.name === 'string' && a.name) || `Asset ${a.id}`,
      category,
      detail: space ?? category,
    };
  });
}

/** sites + buildings(expand site) + floors(expand building,site) → the portfolio tree. */
function buildFromCmmsGraph(sitesRes: unknown, buildingsRes: unknown, floorsRes: unknown): Site[] {
  const sitesById = new Map<string, Site>();
  const ensureSite = (id: string | null, name: string | null): Site => {
    const key = id ?? 'unknown';
    let site = sitesById.get(key);
    if (!site) {
      site = { id: key, name: name ?? 'Portfolio', buildings: [] };
      sitesById.set(key, site);
    } else if (name && site.name === 'Portfolio') {
      site.name = name;
    }
    return site;
  };

  for (const s of cmmsRows(sitesRes)) {
    const id = lookupId(s.id);
    if (id) ensureSite(id, typeof s.name === 'string' ? s.name : null);
  }

  const buildingsById = new Map<string, { id: string; name: string; floors: Site['buildings'][number]['floors'] }>();
  const ensureBuilding = (id: string | null, name: string | null, siteRef: unknown) => {
    if (!id) return null;
    let b = buildingsById.get(id);
    if (!b) {
      b = { id, name: name ?? `Building ${id}`, floors: [] };
      buildingsById.set(id, b);
      ensureSite(lookupId(siteRef), lookupName(siteRef)).buildings.push(b);
    } else if (name && b.name.startsWith('Building ')) {
      b.name = name;
    }
    return b;
  };

  for (const b of cmmsRows(buildingsRes)) {
    ensureBuilding(lookupId(b.id), typeof b.name === 'string' ? b.name : null, b.site);
  }

  const floors = cmmsRows(floorsRes)
    .map((f) => ({
      id: lookupId(f.id),
      name: typeof f.name === 'string' ? f.name : `Floor ${lookupId(f.id)}`,
      level: typeof f.floorlevel === 'number' ? f.floorlevel : Number.MAX_SAFE_INTEGER,
      building: f.building,
      site: f.site,
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  for (const f of floors) {
    if (!f.id) continue;
    const building =
      ensureBuilding(lookupId(f.building), lookupName(f.building), f.site) ??
      ensureBuilding('unassigned', 'Unassigned', f.site);
    building?.floors.push({ id: f.id, name: f.name });
  }

  // drop empty shells the tree can't navigate into
  const sites = [...sitesById.values()];
  for (const site of sites) site.buildings = site.buildings.filter((b) => b.floors.length > 0);
  return sites.filter((s) => s.buildings.length > 0);
}

/** Facilio spaceCategory → this app's unit type + plan. Desks, lockers and parking stalls are
 *  their own modules on the plan; anything else is a room. */
function unitTypeFromSpaceCategory(category: string | null): { type: UnitType; plan: PlanId } {
  const c = (category ?? '').toLowerCase();
  if (/\b(desk|workstation|seat|hot ?desk)\b/.test(c)) return { type: 'workstation', plan: 'workstation' };
  if (c.includes('locker')) return { type: 'locker', plan: 'locker' };
  if (c.includes('parking')) return { type: 'parking', plan: 'parking' };
  return { type: 'room', plan: 'custom' };
}

/**
 * Real spaces of ONE floor (server-filtered) → sidebar-listed units, classified by their
 * spaceCategory (Desk → desk, Locker → locker, Parking Stall → parking, else room) so a desk
 * reads as a desk, not "room". Space records carry NO plan position (that lives in
 * floorplanmarker / the facilio-iwms path), so each is flagged `unplaced`: listed in the sidebar
 * with its real type but not drawn on the canvas — deliberately not synthesized into fake (0,0)
 * positions that would stack every marker in the corner.
 */
function mapCmmsSpacesToUnits(res: unknown, floorId: string): Unit[] {
  return cmmsRows(res)
    .filter((s) => {
      const f = lookupId(s.floor);
      return f == null || f === floorId; // trust but verify the server-side floor scope
    })
    .map((s) => {
      const category = lookupName(s.spaceCategory);
      const occupancy = typeof s.maxOccupancy === 'number' && s.maxOccupancy > 0 ? `seats ${s.maxOccupancy}` : null;
      const { type, plan } = unitTypeFromSpaceCategory(category);
      return {
        id: String(s.id),
        type,
        label: typeof s.name === 'string' && s.name ? s.name : `Space ${s.id}`,
        secondary: [category, occupancy].filter(Boolean).join(' · ') || undefined,
        room: null,
        geom: { kind: 'point' as const, x: 0, y: 0 },
        unplaced: true,
        floor: floorId,
        plan,
      };
    });
}

/**
 * This app's own Vibe database tier (Postgres addon + WASM function), reached via
 * `vibe.executeFunction`. Requires `vibe db create` and a deployed `floorplanApi`
 * function — both are deploy-time steps intentionally NOT run automatically. Until
 * that function exists, every call throws so CompositeDataSource falls through to mock.
 */
export class VibeDbDataSource implements FloorplanDataSource {
  readonly name = 'vibe-db';

  private async call<T>(handler: string, args: Record<string, unknown>): Promise<T> {
    return vibe.executeFunction('floorplanApi', handler, args) as Promise<T>;
  }

  /**
   * Portfolio is intentionally NOT served from the app's own vibe-db: the site/building/floor
   * tree is the org's live data, sourced from the Facilio CMMS connector
   * (ConnectorDataSource, list-sites/-buildings/-floors) instead of a KV blob copied into this
   * app. Throwing keeps the vibe-db out of the portfolio union so the connector (then mock) is
   * the source. The vibe-db still owns app-specific data the connector doesn't wire — units,
   * assignments, bookings, employees.
   */
  getPortfolio(): Promise<Site[]> {
    return Promise.reject(new Error('vibe-db: portfolio comes from the CMMS connector, not the app db'));
  }
  getEmployees(): Promise<Employee[]> {
    return this.call('getEmployees', {});
  }
  getAssets(): Promise<Asset[]> {
    // Assets are org data — sourced from the CMMS connector, not this app's db.
    return Promise.reject(new Error('vibe-db: assets come from the CMMS connector'));
  }
  getFloorData(floorId: string, date: string, planId: string): Promise<FloorBundle> {
    return this.call('getFloorData', { floorId, date, planId });
  }
  getUnits(floorId: string): Promise<Unit[]> {
    return this.call('getUnits', { floorId });
  }
  saveUnits(floorId: string, units: Unit[]): Promise<void> {
    // Studio Function params must be number/string — arrays/objects travel as JSON strings.
    return this.call('saveUnits', { floorId, units: JSON.stringify(units) });
  }
  // The vibe-db is the fallback owner of a record when the connector can't create it (dev, or an
  // unreachable connector): keep the local id and let the caller's saveUnits persist it with its
  // position into the units blob.
  async createUnit(_loc: CreateSpaceLoc, unit: Unit): Promise<Unit> {
    return unit;
  }
  getAssignments(floorId: string): Promise<Assignments> {
    return this.call('getAssignments', { floorId });
  }
  assignUnit(unitId: string, employeeId: string): Promise<void> {
    return this.call('assignUnit', { unitId, employeeId });
  }
  vacateUnit(unitId: string): Promise<void> {
    return this.call('vacateUnit', { unitId });
  }
  getBookings(floorId: string, date: string): Promise<Booking[]> {
    return this.call('getBookings', { floorId, date });
  }
  createBooking(input: Omit<Booking, 'id'>): Promise<Booking> {
    return this.call('createBooking', { booking: JSON.stringify(input) });
  }
  cancelBooking(id: string): Promise<void> {
    return this.call('cancelBooking', { bookingId: id });
  }
}

// The Facilio CMMS connector tier only works when a `facilio-cmms` connection is actually
// configured for the app; otherwise its `vibe.executeAction` calls 404. It's opt-in via
// VITE_USE_CONNECTORS (on in .env.production) so the deployed app sources its portfolio from
// the connector API; a session without that connection has its connector calls 404 and falls
// through (to mock for portfolio, since the vibe-db no longer serves it).
const useConnectors = import.meta.env.VITE_USE_CONNECTORS === 'true';

/**
 * Default tier order — the SAME everywhere: real `@facilio/api` → connectors (only when
 * VITE_USE_CONNECTORS is on) → the app's own Vibe DB (the `floorplanApi` function) → mock.
 *
 * Portfolio specifically is sourced from the connector, not the vibe-db: the tree is the org's
 * live data (see VibeDbDataSource.getPortfolio, which throws so it stays out of the portfolio
 * union). The vibe-db still serves the app-specific data the connector doesn't wire — units,
 * assignments, bookings, employees.
 *
 * The Vibe DB tier used to be dev-excluded (a plain `npm run dev` session has no runtime, so
 * its calls just 404), but that meant users/space data was api-or-mock only in dev: when the
 * real api had nothing to render, the vibe-db copy was never consulted. Now it's always in the
 * chain — in a runtime-less dev session it fails fast (one debug line) and falls to mock,
 * exactly as before; wherever the runtime IS reachable it serves as the real fallback.
 */
function defaultTiers(): FloorplanDataSource[] {
  const tiers: FloorplanDataSource[] = [new FacilioApiDataSource()];
  if (useConnectors) tiers.push(new ConnectorDataSource());
  tiers.push(new VibeDbDataSource(), new MockDataSource());
  return tiers;
}

/** Tries each tier in order for every call; first to resolve wins, logging which did. */
export class CompositeDataSource implements FloorplanDataSource {
  readonly name = 'composite';
  private tiers: FloorplanDataSource[];

  constructor(tiers: FloorplanDataSource[] = defaultTiers()) {
    this.tiers = tiers;
  }

  private async run<K extends keyof FloorplanDataSource>(
    method: K,
    ...args: FloorplanDataSource[K] extends (...a: infer A) => any ? A : never
  ): Promise<any> {
    let lastErr: unknown;
    for (const tier of this.tiers) {
      try {
        // @ts-expect-error - dynamic dispatch across the shared interface
        const result = await tier[method](...args);
        // Empty portfolio/employees counts as a MISS, not an answer: the whole app is built on
        // those two datasets, and an empty-but-successful response from a higher tier (e.g. the
        // real employee fetch coming back [] for a permission-limited user) would otherwise mask
        // real data sitting in a lower tier (vibe-db/mock). NOT applied to per-floor data
        // (units/bookings/assignments), where empty is a legitimate answer — falling through
        // there would paint mock markers over a genuinely empty real floor.
        if ((method === 'getPortfolio' || method === 'getEmployees') && Array.isArray(result) && result.length === 0) {
          throw new Error(`${tier.name}: ${String(method)} returned no records`);
        }
        return result;
      } catch (err) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.debug(`[dataSource] ${String(method)} unavailable on "${tier.name}", falling back`, err);
      }
    }
    throw lastErr;
  }

  /**
   * Portfolio is first-non-empty-wins (NOT a union): the org's real tree — from the CMMS
   * connector (or @facilio/api) — is authoritative and must stand ALONE. It used to be unioned
   * with the mock demo sites (HQ Berlin, …), which mixed hardcoded data into a real org's picker;
   * that mixing is gone. `run()` already treats an empty portfolio as a miss and falls through,
   * so the first tier with real sites wins and mock only answers when every real tier is
   * empty/unavailable (offline dev with no backend).
   */
  getPortfolio(): Promise<Site[]> {
    return this.run('getPortfolio');
  }
  getEmployees() {
    return this.run('getEmployees');
  }
  getAssets() {
    return this.run('getAssets');
  }
  getUnits(floorId: string) {
    return this.run('getUnits', floorId);
  }
  /** Fast path across tiers that implement it; callers fall back to the per-call path on throw. */
  async getFloorData(floorId: string, date: string, planId: string): Promise<FloorBundle> {
    let lastErr: unknown = new Error('no tier implements getFloorData');
    for (const tier of this.tiers) {
      if (!tier.getFloorData) continue;
      try {
        return await tier.getFloorData(floorId, date, planId);
      } catch (err) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.debug(`[dataSource] getFloorData unavailable on "${tier.name}", falling back`, err);
      }
    }
    throw lastErr;
  }
  saveUnits(floorId: string, units: Unit[]) {
    return this.run('saveUnits', floorId, units);
  }
  /**
   * Connector-first by tier order: the CMMS `create-space` write wins when reachable (real record
   * + server id), and only falls through to the vibe-db/mock local echo when it isn't. This is
   * what makes a new desk/locker/parking actually hit the connector instead of just the app db.
   */
  createUnit(loc: CreateSpaceLoc, unit: Unit) {
    return this.run('createUnit', loc, unit) as Promise<Unit>;
  }
  getAssignments(floorId: string) {
    return this.run('getAssignments', floorId);
  }
  assignUnit(unitId: string, employeeId: string) {
    return this.run('assignUnit', unitId, employeeId);
  }
  vacateUnit(unitId: string) {
    return this.run('vacateUnit', unitId);
  }
  getBookings(floorId: string, date: string) {
    return this.run('getBookings', floorId, date);
  }
  createBooking(input: Omit<Booking, 'id'>) {
    return this.run('createBooking', input);
  }
  cancelBooking(id: string) {
    return this.run('cancelBooking', id);
  }
}

export const dataSource: FloorplanDataSource = new CompositeDataSource();
