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
}

/**
 * Facilio CMMS connector tier, via `vibe.executeAction('facilio-cmms', <action>, payload)`.
 * Only the space/floor/building graph has a confirmed action surface today
 * (facilio-cmms.list-spaces / list-floors / list-buildings / create-space / update-space).
 * There is no confirmed booking/assignment action, so those methods intentionally throw —
 * letting CompositeDataSource fall through to the db tier — rather than guessing a slug.
 */
export class ConnectorDataSource implements FloorplanDataSource {
  readonly name = 'facilio-cmms';

  async getPortfolio(): Promise<Site[]> {
    const [buildingsRes, floorsRes] = await Promise.all([
      vibe.executeAction('facilio-cmms', 'list-buildings', { page_size: 200 }),
      vibe.executeAction('facilio-cmms', 'list-floors', { page_size: 200, expand: 'building,site' }),
    ]);
    return buildFromCmmsGraph(buildingsRes, floorsRes);
  }

  async getEmployees(): Promise<Employee[]> {
    // No confirmed employee-listing action on this connection yet.
    throw new Error('facilio-cmms: employee directory not wired');
  }

  async getUnits(floorId: string): Promise<Unit[]> {
    const res = await vibe.executeAction('facilio-cmms', 'list-spaces', {
      filters: `floor=${floorId}`,
      page_size: 200,
    });
    return mapCmmsSpacesToUnits(res, floorId);
  }

  async saveUnits(_floorId: string, units: Unit[]): Promise<void> {
    await Promise.all(
      units.map((u) =>
        vibe.executeAction('facilio-cmms', 'create-space', {
          space: { name: u.label, site: undefined, floor: u.floor, spaceCategory: u.type },
        })
      )
    );
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

function buildFromCmmsGraph(_buildingsRes: unknown, _floorsRes: unknown): Site[] {
  // TODO: once `facilio-cmms.list-buildings` / `list-floors` response shapes are confirmed
  // against a live connection, map them into Site[] here. Until then, treat as unavailable
  // so CompositeDataSource falls through.
  throw new Error('facilio-cmms: portfolio mapping not implemented');
}

function mapCmmsSpacesToUnits(_res: unknown, _floorId: string): Unit[] {
  throw new Error('facilio-cmms: space mapping not implemented');
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

  getPortfolio() {
    return this.run('getPortfolio');
  }
  getEmployees() {
    return this.run('getEmployees');
  }
  getUnits(floorId: string) {
    return this.run('getUnits', floorId);
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
