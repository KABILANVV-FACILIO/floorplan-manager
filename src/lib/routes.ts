import type { AppState } from '../state/types';

/**
 * Hash routes for the bottom-nav views: #/ (map), #/bookings, #/people, #/settings.
 *
 * Each view is a real route — refresh lands back on the same tab, browser back/forward walk the
 * tabs, and the URL is shareable. Hash-based (not path-based) on purpose: the vibe static host's
 * behavior for deep-linked paths like /bookings is unverified (a refresh there could 404 or
 * bounce through the auth redirect and lose the path), while a hash always loads index.html and
 * survives every hop. The sync lives in FloorplanContext: state.activeView is the single source
 * of truth, mirrored to the hash on change, and hashchange (back/forward, manual edits) is
 * dispatched back into state.
 */
export type AppView = AppState['activeView'];

const HASH_BY_VIEW: Record<AppView, string> = {
  map: '#/',
  bookings: '#/bookings',
  people: '#/people',
  settings: '#/settings',
};

const VIEW_BY_PATH: Record<string, AppView> = {
  '/': 'map',
  '/bookings': 'bookings',
  '/people': 'people',
  '/settings': 'settings',
};

export function hashForView(view: AppView): string {
  return HASH_BY_VIEW[view] ?? '#/';
}

/** Unknown/empty hashes resolve to the map so a bad link degrades to the default view. */
export function viewFromHash(hash: string): AppView {
  const path = (hash || '').replace(/^#/, '') || '/';
  return VIEW_BY_PATH[path] ?? 'map';
}
