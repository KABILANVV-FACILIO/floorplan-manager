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
