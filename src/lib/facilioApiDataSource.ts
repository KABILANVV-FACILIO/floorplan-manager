import { facilioApi, isFacilioApiConfigured } from './facilioApi';
import { getInstance } from '@facilio/api';
import type { FloorplanDataSource } from './dataSource';
import type { Assignments, Booking, Employee, Site, Unit } from './types';

/**
 * Real Facilio backend tier via @facilio/api (generic V3 module CRUD: `v3/modules/{moduleName}`).
 *
 * Scope, deliberately: portfolio (site/building/floor) and the employee directory map cleanly
 * onto plain module records, so those are wired for real. Units/assignments/bookings are NOT
 * wired here — a desk/room/locker/parkingstall record has no on-plan position of its own; that
 * lives in separate `floorplanmarker` (Point) / `floorplanmarkedzone` (Polygon) records, joined
 * by `markerModuleId`/`recordId`, with `geometry` as a stringified GeoJSON blob whose exact shape
 * (and whether it's plan-pixel or georeferenced lng/lat) needs verifying against a live org before
 * it's safe to render. Guessing that mapping wrong would silently misplace markers rather than
 * fail loudly, which is worse than falling through to the next tier — so those methods throw,
 * exactly like the stubs in ConnectorDataSource, and CompositeDataSource falls through to the
 * app db / mock tier for them.
 */
export class FacilioApiDataSource implements FloorplanDataSource {
  readonly name = 'facilio-api';

  private assertConfigured() {
    if (!isFacilioApiConfigured) throw new Error('facilio-api: not configured (VITE_DEV_MODE / base URL / token)');
  }

  async getPortfolio(): Promise<Site[]> {
    this.assertConfigured();
    const [sitesRes, buildingsRes, floorsRes, plansRes] = await Promise.all([
      facilioApi.fetchAll('site'),
      facilioApi.fetchAll('building'),
      facilioApi.fetchAll('floor'),
      facilioApi.fetchAll('indoorfloorplan').catch(() => ({ list: [] as any[] })),
    ]);
    const err = sitesRes.error || buildingsRes.error || floorsRes.error;
    if (err) {
      throw new Error(`facilio-api: portfolio fetch failed (${err.code ?? '?'} ${err.message ?? ''})`.trim());
    }
    const sites = sitesRes.list ?? [];
    const buildings = buildingsRes.list ?? [];
    const floors = floorsRes.list ?? [];
    const plannedFloorIds = new Set((plansRes.list ?? []).map((p: any) => String(lookupId(p, 'floor'))));

    return sites.map((s: any) => ({
      id: String(s.id),
      name: s.name,
      buildings: buildings
        .filter((b: any) => String(lookupId(b, 'site')) === String(s.id))
        .map((b: any) => ({
          id: String(b.id),
          name: b.name,
          floors: floors
            .filter((f: any) => String(lookupId(f, 'building')) === String(b.id))
            .map((f: any) => ({
              id: String(f.id),
              name: f.name,
              hasPlan: plannedFloorIds.has(String(f.id)),
            })),
        })),
    }));
  }

  async getEmployees(): Promise<Employee[]> {
    this.assertConfigured();
    const res = await facilioApi.fetchAll('employee');
    if (res.error) throw new Error(`facilio-api: employee fetch failed (${res.error.code ?? '?'} ${res.error.message ?? ''})`.trim());
    return (res.list ?? []).map((e: any) => ({
      id: String(e.id),
      name: e.name,
      dept: e.department?.name ?? e.departmentName ?? '',
    }));
  }

  async getUnits(_floorId: string): Promise<Unit[]> {
    throw new Error('facilio-api: unit placement (floorplanmarker/floorplanmarkedzone geometry) not wired — needs schema verification against a live org');
  }
  async saveUnits(): Promise<void> {
    throw new Error('facilio-api: unit placement not wired');
  }
  async getAssignments(): Promise<Assignments> {
    throw new Error('facilio-api: assignments (Moves-derived) not wired');
  }
  async assignUnit(): Promise<void> {
    throw new Error('facilio-api: assignment writes go through Moves — not wired');
  }
  async vacateUnit(): Promise<void> {
    throw new Error('facilio-api: assignment writes go through Moves — not wired');
  }
  async getBookings(): Promise<Booking[]> {
    throw new Error('facilio-api: spacebooking not wired');
  }
  async createBooking(): Promise<Booking> {
    throw new Error('facilio-api: spacebooking not wired');
  }
}

/** Best-effort lookup-field id extraction: tries `{key}.id`, `{key}Id`, then the raw field. */
function lookupId(record: any, key: string): unknown {
  return record?.[key]?.id ?? record?.[`${key}Id`] ?? record?.[key];
}

export interface FloorplanFileUploadResult {
  fileId: number;
  previewUrl: string;
  /** False when the fileId couldn't be attached to an `indoorfloorplan` record (e.g. `floorId` isn't a real floor id) — the upload+preview still succeeded. */
  attachedToFloorPlan: boolean;
  attachError?: string;
}

/**
 * Uploads a floorplan source file (image/PDF/DXF/whatever) to Facilio's real file storage
 * (`POST v3/modules/data/files`, multipart, returns `{attachments: {filename: fileId}}`),
 * then attaches that `fileId` to the floor's `indoorfloorplan` record (creating one if the
 * floor doesn't have one yet). Also fetches the uploaded bytes back via
 * `GET v2/files/preview/{fileId}?fetchOriginal=true` and returns an object URL — that endpoint
 * returns raw bytes rather than @facilio/api's `{code,data}` JSON envelope, so it's fetched via
 * the raw axios instance (`getInstance()`) rather than `API.get`, which would misparse it.
 *
 * The attach step is best-effort and non-fatal: `@facilio/api` returns `{error}` rather than
 * throwing on a failed request, so it's checked explicitly rather than trusted to reject —
 * a bad `floorId` (e.g. one that doesn't correspond to a real floor record) fails the attach
 * without discarding the (real, working) uploaded file/preview.
 */
export async function uploadFloorplanFile(floorId: string, file: File): Promise<FloorplanFileUploadResult> {
  if (!isFacilioApiConfigured) throw new Error('facilio-api: not configured');

  const uploadRes = await facilioApi.uploadFiles([file]);
  if (uploadRes.error || !uploadRes.ids?.length) {
    throw new Error(uploadRes.error?.message || 'facilio-api: file upload failed');
  }
  const fileId = Number(uploadRes.ids[0]);

  const axiosInstance = getInstance();
  const previewRes = await axiosInstance.get(`v2/files/preview/${fileId}`, {
    params: { fetchOriginal: true },
    responseType: 'blob',
  });
  const previewUrl = URL.createObjectURL(previewRes.data);

  let attachedToFloorPlan = false;
  let attachError: string | undefined;
  try {
    const existingPlans = await facilioApi.fetchAll('indoorfloorplan');
    if (existingPlans.error) throw new Error(existingPlans.error.message || `code ${existingPlans.error.code}`);
    const existing = (existingPlans.list ?? []).find((p: any) => String(lookupId(p, 'floor')) === String(floorId));
    const attachRes = existing
      ? await facilioApi.updateRecord('indoorfloorplan', { id: existing.id, fileId })
      : await facilioApi.createRecord('indoorfloorplan', { floor: floorId, fileId, name: file.name });
    if (attachRes.error) throw new Error(attachRes.error.message || `code ${attachRes.error.code}`);
    attachedToFloorPlan = true;
  } catch (err) {
    attachError = (err as Error).message || 'attach failed';
  }

  return { fileId, previewUrl, attachedToFloorPlan, attachError };
}
