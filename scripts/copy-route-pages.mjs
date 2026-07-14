// Publishes a copy of dist/index.html at each SPA route path (dist/bookings/index.html, ...).
//
// Why: the vibe static host has NO SPA fallback — any path without a real file 404s (verified
// live: GET /bookings -> 404 while / -> 200). Clean path routes (/bookings, /people, /settings)
// therefore only survive a hard refresh / deep link if each one IS a real file. index.html
// references its assets absolutely (/assets/...), so a copy nested one directory deep loads
// identically. Run by `npm run build` after vite build; keep in sync with src/lib/routes.ts.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROUTES = ['bookings', 'people', 'settings'];

const dist = path.resolve(process.cwd(), 'dist');
const indexHtml = await fs.readFile(path.join(dist, 'index.html'));
for (const route of ROUTES) {
  const dir = path.join(dist, route);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), indexHtml);
}
console.log(`[copy-route-pages] published index.html at: ${ROUTES.map((r) => '/' + r).join(', ')}`);
