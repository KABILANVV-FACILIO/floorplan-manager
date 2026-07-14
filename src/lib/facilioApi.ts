import axios from 'axios';
import { API, setConfig, setInstance } from '@facilio/api';

const devMode = import.meta.env.VITE_DEV_MODE === 'true';
const baseURL = import.meta.env.VITE_FACILIO_API_BASE_URL;
const token = import.meta.env.VITE_FACILIO_TOKEN;

/** True only when dev mode is on and both the base URL and token are configured. */
export const isFacilioApiConfigured = devMode && !!baseURL && !!token;

if (isFacilioApiConfigured) {
  const instance = axios.create({ baseURL });
  instance.interceptors.request.use((config) => {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    return config;
  });
  setInstance(instance);
  setConfig({ _newV3: true, cacheTimeout: 0 });
} else if (devMode) {
  // eslint-disable-next-line no-console
  console.warn(
    '[facilioApi] VITE_DEV_MODE is true but VITE_FACILIO_API_BASE_URL / VITE_FACILIO_TOKEN are not both set — the Facilio API tier is disabled, falling back to the app db / mock tiers.'
  );
}

export { API as facilioApi };

/**
 * The bare web-app origin (e.g. `https://pre-app-stage2.facilio.in`), with the `/api` suffix
 * that `VITE_FACILIO_API_BASE_URL` normally carries stripped off. Some endpoints (the
 * `maintenance/api/...` FloorplanAction routes, the web app's own `goto/summary` pages) hang
 * directly off this origin rather than under the configured API baseURL, so callers building
 * an absolute URL for those need this instead of `baseURL`.
 */
export const apiOrigin: string | null = baseURL ? baseURL.replace(/\/api\/?$/, '') : null;

/**
 * Builds a link to a record's summary page in the real Facilio web app (e.g.
 * `https://pre-app-stage2.facilio.in/maintenance/goto/summary/employee/123`), matching the
 * `RECORD URL` convention documented on the CMMS actions.
 */
export function facilioRecordUrl(moduleName: string, id: string | number): string | null {
  if (!apiOrigin) return null;
  return `${apiOrigin}/maintenance/goto/summary/${moduleName}/${id}`;
}
