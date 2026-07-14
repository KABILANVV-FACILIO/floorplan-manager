import { createVibe } from '@facilio/vibe-sdk';

const devMode = import.meta.env.VITE_DEV_MODE === 'true';
const devServerURL = import.meta.env.VITE_VIBE_SERVER_URL as string | undefined;

if (devMode && !devServerURL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[vibe] VITE_DEV_MODE is true but VITE_VIBE_SERVER_URL is not set in .env.local — falling back to window.location.origin.'
  );
}

export const vibe = createVibe(devMode && devServerURL ? { serverURL: devServerURL } : undefined);

export const isDevMode = devMode;
