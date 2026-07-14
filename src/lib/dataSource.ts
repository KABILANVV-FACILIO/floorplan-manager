import { vibe } from './vibe';
import { EMPLOYEES, PORTFOLIO, seedAssignments, seedBookings, seedUnits } from './mockData';
import { FacilioApiDataSource } from './facilioApiDataSource';
import type { Assignments, Booking, Employee, Site, Unit } from './types';

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
  getUnits(floorId: string): Promise<Unit[]>;
  saveUnits(floorId: string, units: Unit[]): Promise<void>;
  getAssignments(floorId: string): Promise<Assignments>;
  assignUnit(unitId: string, employeeId: string): Promise<void>;
  vacateUnit(unitId: string): Promise<void>;
  getBookings(floorId: string, date: string): Promise<Booking[]>;
  createBooking(input: Omit<Booking, 'id'>): Promise<Booking>;
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
 * READ-ONLY tier by design: writes fall through to the db/mock tiers. (saveUnits is
 * called on every micro-edit with the full unit list — pushing that through
 * create-space would mint duplicate real records each edit.) No confirmed
 * booking/assignment/employee actions either, so those throw to fall through too.
 */
export class ConnectorDataSource implements FloorplanDataSource {
  readonly name = 'facilio-cmms';

  async getPortfolio(): Promise<Site[]> {
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
  }

  async getEmployees(): Promise<Employee[]> {
    // No confirmed employee-listing action on this connection yet.
    throw new Error('facilio-cmms: employee directory not wired');
  }

  async getUnits(floorId: string): Promise<Unit[]> {
    // Real Facilio floor ids are numeric; slug ids (RCU import, demo floors)
    // belong to the mock tier — throw so the composite falls through instead
    // of this tier answering [] and masking the seeded units.
    if (!/^\d+$/.test(floorId)) {
      throw new Error('facilio-cmms: not an org floor id');
    }
    const res = await vibe.executeAction('facilio-cmms', 'list-spaces', {
      filters: `floor=${floorId}`,
      page_size: 200,
      expand: 'spaceCategory',
      select: 'id,name,floor,spaceCategory,area,maxOccupancy',
    });
    return mapCmmsSpacesToUnits(res, floorId);
  }

  async saveUnits(): Promise<void> {
    throw new Error('facilio-cmms: read-only tier — unit writes persist on the db/mock tiers');
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
}

type CmmsRow = Record<string, unknown>;

function cmmsRows(res: unknown): CmmsRow[] {
  const data = (res as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as CmmsRow[]) : [];
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

/**
 * Real spaces of ONE floor (server-filtered) → sidebar-listed room units. Space
 * records carry no plan geometry, so they get a point placeholder and are NOT
 * drawn on the canvas (room renderers are poly-guarded) — deliberately not
 * synthesized into fake positions.
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
      return {
        id: String(s.id),
        type: 'room' as const,
        label: typeof s.name === 'string' && s.name ? s.name : `Space ${s.id}`,
        secondary: [category, occupancy].filter(Boolean).join(' · ') || undefined,
        room: null,
        geom: { kind: 'point' as const, x: 0, y: 0 },
        floor: floorId,
        plan: 'custom' as const,
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

  getPortfolio(): Promise<Site[]> {
    return this.call('getPortfolio', {});
  }
  getEmployees(): Promise<Employee[]> {
    return this.call('getEmployees', {});
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
}

// The Facilio CMMS connector tier only works when a `facilio-cmms` connection is actually
// configured for the app; otherwise its `vibe.executeAction` calls 404. It's opt-in via
// VITE_USE_CONNECTORS so a deployed app without that connection goes straight to the vibe-db
// tier (the working fallback) instead of spraying connector 404s. Flip it on once the
// connection exists to get the documented connector-first → vibe-db order.
const useConnectors = import.meta.env.VITE_USE_CONNECTORS === 'true';

/**
 * Default tier order — the SAME everywhere: real `@facilio/api` → connectors (only when
 * VITE_USE_CONNECTORS is on) → the app's own Vibe DB (the `floorplanApi` function) → mock.
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
   * Portfolio is a UNION across tiers, not first-wins: the connected org's
   * real tree and the seeded test data (RCU import on the mock tier) should
   * coexist in the picker. Tier order decides precedence on id clashes; a
   * tier that errors or returns nothing just contributes nothing.
   */
  async getPortfolio(): Promise<Site[]> {
    const merged: Site[] = [];
    const seen = new Set<string>();
    let lastErr: unknown;
    for (const tier of this.tiers) {
      try {
        const sites = await tier.getPortfolio();
        for (const site of sites) {
          if (!seen.has(site.id)) {
            seen.add(site.id);
            merged.push(site);
          }
        }
      } catch (err) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.debug(`[dataSource] getPortfolio unavailable on "${tier.name}", merging remaining tiers`, err);
      }
    }
    if (merged.length === 0) throw lastErr ?? new Error('no portfolio available');
    return merged;
  }
  getEmployees() {
    return this.run('getEmployees');
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
}

export const dataSource: FloorplanDataSource = new CompositeDataSource();
