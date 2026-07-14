import { vibe } from './vibe';
import type { Perms } from './types';
import type { AppState } from '../state/types';

/**
 * The app's persisted settings, stored as a single multi-line JSON string.
 *
 * Where it lives:
 *  - Deployed (VITE_DEV_MODE=false): the Vibe DB, via the app's `floorplanApi`
 *    function (`getSettings` / `saveSettings`). The whole config travels as ONE
 *    stringified JSON blob (a `config` text column) — no per-field schema — so the
 *    function stays a trivial key/value upsert and new settings need no migration.
 *  - Local/dev: localStorage, so `npm run dev` and the mock tier persist too.
 *
 * A localStorage copy is always written as well, so a deployed app still has an
 * instant local cache and degrades gracefully if the function call fails.
 */
export interface SettingsConfig {
  perms?: Perms;
  moduleColors?: Record<string, string>;
  slotGranularity?: number;
  bookingModule?: 'space' | 'facility';
}

const LS_KEY = 'facilio_floorplan_settings_v1';
const FN_NAME = 'floorplanApi';
const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

/** Extract the persisted slice of app state. */
export function settingsFromState(state: AppState): SettingsConfig {
  return {
    perms: state.perms,
    moduleColors: state.moduleColors,
    slotGranularity: state.slotGranularity,
    bookingModule: state.bookingModule,
  };
}

/** Serialize to the multi-line JSON string that gets stored. */
export function serializeSettings(cfg: SettingsConfig): string {
  return JSON.stringify(cfg, null, 2);
}

export async function loadSettings(): Promise<SettingsConfig | null> {
  // Deployed: read the JSON blob back from the Vibe DB.
  if (!isDevMode) {
    try {
      const res = await vibe.executeFunction<{ config?: string } | string | null>(FN_NAME, 'getSettings', {});
      const raw = typeof res === 'string' ? res : res?.config;
      if (raw) return JSON.parse(raw) as SettingsConfig;
    } catch {
      /* fall through to the local cache */
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SettingsConfig) : null;
  } catch {
    return null;
  }
}

export async function saveSettings(cfg: SettingsConfig): Promise<void> {
  const json = serializeSettings(cfg);
  // Always keep the local cache in sync.
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* ignore quota/serialization errors */
  }
  // Deployed: persist the blob to the Vibe DB (best-effort — the local copy still stands).
  if (!isDevMode) {
    try {
      await vibe.executeFunction(FN_NAME, 'saveSettings', { config: json });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[settings] vibe-db save failed; kept local copy only', err);
    }
  }
}
