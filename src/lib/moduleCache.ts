import { vibe } from './vibe';

/**
 * A read-through mirror cache of the Facilio connector API, persisted in the app's vibe-db
 * (via the `floorplanApi` function's getCache/putCache handlers).
 *
 * Goal (per product ask): the vibe-db copy of each connector module should equal the API, and we
 * should only write to the db when the API data actually changed. So on every read we fetch the
 * connector, hash the result, and rewrite the mirror ONLY when the hash differs from the stored
 * one. When the connector is unreachable we serve the last mirror instead — the cache doubles as
 * an offline/latency fallback. All cache I/O is best-effort: if the `floorplanApi` function isn't
 * reachable (e.g. `npm run dev` with no runtime), it degrades to a plain pass-through of the API
 * data, so nothing breaks — there's just no mirroring until deployed.
 */

interface CacheEnvelope<T> {
  /** Hash of `records` at sync time — the change-detection key. */
  hash: string;
  records: T[];
  /** epoch ms of the last write (for debugging / future TTLs). */
  syncedAt: number;
}

/** Order-sensitive djb2 hash of a record set — matches only when the API payload is identical. */
function hashRecords(records: unknown[]): string {
  const s = JSON.stringify(records);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + s.length;
}

async function readMirror<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const res = await vibe.executeFunction<{ value?: string | null } | null>('floorplanApi', 'getCache', { key });
  const raw = res?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function writeMirror<T>(key: string, env: CacheEnvelope<T>): Promise<void> {
  await vibe.executeFunction('floorplanApi', 'putCache', { key, value: JSON.stringify(env) });
}

/**
 * Fetch a connector module through the vibe-db mirror.
 *
 * - Reads the mirror and fetches the API concurrently.
 * - API returned data → rewrite the mirror IFF its hash changed (db := api), then return the API data.
 * - API unreachable/errored → return the last mirror if we have one.
 * - Empty API result never overwrites a populated mirror (guards against a transient or
 *   permission-limited blank response wiping the cache); it's returned only when there's no mirror.
 *
 * @param key   stable cache key, e.g. `employees`, `assets`, `units:<floorId>`.
 * @param fetchFromApi  the raw connector fetch (throws when the connector is unavailable).
 */
export async function mirrorThroughCache<T>(key: string, fetchFromApi: () => Promise<T[]>): Promise<T[]> {
  const mirrorP = readMirror<T>(key).catch(() => null);

  let fresh: T[] | null = null;
  try {
    fresh = await fetchFromApi();
  } catch {
    fresh = null;
  }

  if (fresh && fresh.length > 0) {
    const hash = hashRecords(fresh);
    const mirror = await mirrorP;
    if (!mirror || mirror.hash !== hash) {
      // The only write path — and only when the API actually differs from the mirror.
      void writeMirror(key, { hash, records: fresh, syncedAt: Date.now() }).catch(() => {});
    }
    return fresh;
  }

  // API empty or unreachable: fall back to the mirror.
  const mirror = await mirrorP;
  if (mirror && mirror.records.length > 0) return mirror.records;
  if (fresh) return fresh; // API genuinely returned [] and there's no mirror
  throw new Error(`mirrorThroughCache(${key}): connector unavailable and no cached copy`);
}

/**
 * Drop every mirrored connector module from the vibe-db (portfolio, employees, assets,
 * units:*). Reads keep working — each still fetches the connector fresh — but the stale
 * offline fallback is gone, so the next read of every module rebuilds its mirror from the
 * live API. Returns the number of cache rows removed (0 when the runtime is unreachable,
 * e.g. a plain `npm run dev` session). Best-effort: never throws.
 */
export async function clearMirrorCache(): Promise<number> {
  try {
    const res = await vibe.executeFunction<{ removed?: number } | null>('floorplanApi', 'clearCache', {});
    return res?.removed ?? 0;
  } catch {
    return 0;
  }
}
