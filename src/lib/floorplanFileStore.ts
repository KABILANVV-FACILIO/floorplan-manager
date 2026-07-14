import { vibe } from './vibe';

/**
 * Persistence for an uploaded floorplan source file (image, or a rasterized snapshot of a
 * PDF/CAD file), so a DEPLOYED app can reload it after a refresh.
 *
 * Why this exists: in dev the real `@facilio/api` `indoorfloorplan` record is the source of
 * truth — `uploadFloorplanFile` attaches the `fileId` to it and `fetchFloorplanImage` reads it
 * back. In prod there's no configured `@facilio/api`, so the uploaded preview only lived in
 * memory (`state.floorImages`) and vanished on refresh. Here we store the renderable bytes (a
 * data URL) in the app's own Vibe DB, keyed by floor+plan, via the `floorplanApi` function's
 * `getFloorplanFile` / `saveFloorplanFile` handlers (backed by the `floorplan_files` table).
 *
 * Connector upgrade path (per product intent): once the file-upload + indoorfloorplan actions
 * are confirmed on the app's connection, `persistFloorplanFile` should first upload the file to
 * get a real `fileId` and attach it to the `indoorfloorplan` record via connectors, keeping the
 * Vibe DB copy only as the fallback when no `indoorfloorplan` id is available. The Vibe DB store
 * below is deliberately the guaranteed tier so persistence works regardless.
 *
 * Deployed only: gated on `!isDevMode` so a plain `npm run dev` session (no runtime function)
 * doesn't emit failing round-trips.
 */
const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
const FN_NAME = 'floorplanApi';

export interface StoredFloorplanFile {
  /** A renderable data URL — a plain image, or a rasterized snapshot of a PDF/CAD source. */
  dataUrl: string;
  /** Real Facilio file id when a connector/@facilio upload succeeded (informational for now). */
  fileId?: number | null;
  name?: string;
  mime?: string;
}

/** Reads a previously-uploaded floorplan file for a floor+plan back from the Vibe DB. */
export async function loadFloorplanFile(floorId: string, planId: string): Promise<StoredFloorplanFile | null> {
  if (isDevMode) return null;
  try {
    const res = await vibe.executeFunction<{ file?: string } | string | null>(FN_NAME, 'getFloorplanFile', {
      floorId,
      planId,
    });
    const raw = typeof res === 'string' ? res : res?.file;
    return raw ? (JSON.parse(raw) as StoredFloorplanFile) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[floorplanFile] vibe-db load failed', err);
    return null;
  }
}

/**
 * Floor ids that have at least one stored floorplan file — keys only, no blobs. Lets the
 * portfolio tree stop showing "no plan" for floors whose upload lives in the Vibe DB.
 */
export async function listFloorplanFloorIds(): Promise<string[]> {
  if (isDevMode) return [];
  try {
    const res = await vibe.executeFunction<{ keys?: string[] }>(FN_NAME, 'listFloorplanFiles', {});
    const keys = res?.keys ?? [];
    return [...new Set(keys.map((k) => k.split('::')[0]).filter(Boolean))];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[floorplanFile] vibe-db list failed', err);
    return [];
  }
}

/**
 * Persists an uploaded floorplan file so the deployed app reloads it after a refresh.
 * Best-effort: a failure is swallowed (the in-memory preview still shows for this session).
 */
export async function persistFloorplanFile(floorId: string, planId: string, file: StoredFloorplanFile): Promise<void> {
  if (isDevMode) return;
  try {
    await vibe.executeFunction(FN_NAME, 'saveFloorplanFile', { floorId, planId, file: JSON.stringify(file) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[floorplanFile] vibe-db save failed; kept in-memory preview only', err);
  }
}
