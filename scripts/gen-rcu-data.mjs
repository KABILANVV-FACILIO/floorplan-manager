/**
 * Generates src/lib/rcuData.ts from an RCU occupancy export
 * (Id, Asset Name, Site, Buildings, Floors, Space, Description, Occupied,
 * Occupied By, Mobile, Employee-ID, Email, Client, Category).
 *
 * The CSV has no plan coordinates, so desks are laid out deterministically:
 * each Space becomes a rectangular room cluster packed across the plan, with
 * its desks on a grid inside — good-enough geometry for test data, and the
 * room polygons give containment + visual structure on an imageless floor.
 *
 * Usage: node scripts/gen-rcu-data.mjs "/path/to/RCU-Corporate Occupancy..csv"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: node scripts/gen-rcu-data.mjs <csv>');
  process.exit(1);
}

// The export contains Windows-1252 bytes (names) — utf8-decode and fall back
// per-file if replacement characters show up.
const buf = readFileSync(csvPath);
let text = buf.toString('utf8');
if (text.includes('�')) text = buf.toString('latin1');

/** Minimal CSV parser with quoted-field support. */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

const rows = parseCsv(text);
const header = rows.shift().map((h) => h.trim());
const col = (name) => {
  const i = header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
  if (i === -1) throw new Error(`column not found: ${name}`);
  return i;
};
const C = {
  id: col('Id'),
  asset: col('Facilio Asset ID Name'),
  site: col('Site'),
  building: col('Buildings'),
  floor: col('Floors'),
  space: col('Space'),
  desc: col('Asset Description'),
  occupied: col('Occupied'),
  occupiedBy: col('Occupied By'),
  empId: col('Employee - ID'),
  email: col('Email'),
  client: col('Client'),
};

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';

/** "Site_Building_First Floor" → "First Floor"; plain values pass through. */
const lastSegment = (s) => {
  const parts = s.split('_').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : s.trim();
};

// site -> building -> floor -> space -> records
const tree = new Map();
let skipped = 0;
for (const r of rows) {
  const site = (r[C.site] ?? '').trim();
  const asset = (r[C.asset] ?? '').trim();
  if (!site || !asset) {
    skipped++;
    continue;
  }
  const building = lastSegment((r[C.building] ?? '').trim() || 'Main Building');
  const floor = lastSegment((r[C.floor] ?? '').trim() || 'Ground Floor');
  const space = (r[C.space] ?? '').trim() || 'General';
  if (!tree.has(site)) tree.set(site, new Map());
  const bmap = tree.get(site);
  if (!bmap.has(building)) bmap.set(building, new Map());
  const fmap = bmap.get(building);
  if (!fmap.has(floor)) fmap.set(floor, new Map());
  const smap = fmap.get(floor);
  if (!smap.has(space)) smap.set(space, []);
  smap.get(space).push(r);
}

const employeesById = new Map();
function employeeFor(r) {
  const name = (r[C.occupiedBy] ?? '').trim();
  if (!name) return null;
  const empKey = (r[C.empId] ?? '').trim() || (r[C.email] ?? '').trim().toLowerCase() || slug(name);
  const id = `rcu-e-${slug(String(empKey))}`;
  if (!employeesById.has(id)) {
    employeesById.set(id, { id, name, dept: (r[C.client] ?? '').trim() || 'RCU' });
  }
  return id;
}

const sites = [];
const units = [];
const assignments = {};
let floorsWithUnits = 0;

for (const [siteName, bmap] of [...tree.entries()].sort((a, b) => b[1].size - a[1].size)) {
  const siteId = `rcu-s-${slug(siteName)}`;
  const site = { id: siteId, name: siteName, buildings: [] };
  for (const [bName, fmap] of [...bmap.entries()].sort()) {
    const bId = `${siteId}-b-${slug(bName)}`;
    const building = { id: bId, name: bName, floors: [] };
    for (const [fName, smap] of [...fmap.entries()].sort()) {
      const fId = `${bId}-f-${slug(fName)}`;
      building.floors.push({
        id: fId,
        name: fName,
        hasPlan: true,
        plans: [
          { id: 'workstation', name: 'Workstations' },
          { id: 'custom', name: 'Custom' },
        ],
      });
      floorsWithUnits++;

      // --- deterministic cluster layout for this floor ---
      const spaces = [...smap.entries()].sort((a, b) => b[1].length - a[1].length);
      const M = 0.05; // outer margin
      const GX = 0.025;
      const GY = 0.04;
      const CELL_W = 0.034;
      const CELL_H = 0.05;
      const PAD = 0.014; // room padding around the desk grid
      const TITLE = 0.02; // headroom inside the room for its label

      const clusters = spaces.map(([spaceName, records]) => {
        const n = records.length;
        const cols = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(n * 1.6))));
        const rowsN = Math.ceil(n / cols);
        return { spaceName, records, cols, rowsN, w: cols * CELL_W + PAD * 2, h: rowsN * CELL_H + PAD * 2 + TITLE };
      });

      // greedy row packing
      let x = M;
      let y = M;
      let rowH = 0;
      const placed = [];
      for (const c of clusters) {
        if (x + c.w > 1 - M && x > M) {
          x = M;
          y += rowH + GY;
          rowH = 0;
        }
        placed.push({ ...c, x, y });
        x += c.w + GX;
        rowH = Math.max(rowH, c.h);
      }
      const totalH = y + rowH + M;
      // squash vertically if the packing overflows the plan
      const yScale = totalH > 1 ? (1 - 2 * M) / (totalH - 2 * M) : 1;

      for (const c of placed) {
        const cy = M + (c.y - M) * yScale;
        const ch = c.h * yScale;
        const room = {
          id: `${fId}-room-${slug(c.spaceName)}`,
          type: 'room',
          label: c.spaceName,
          room: null,
          geom: {
            kind: 'poly',
            pts: [
              [c.x, cy],
              [c.x + c.w, cy],
              [c.x + c.w, cy + ch],
              [c.x, cy + ch],
            ].map(([px, py]) => [round(px), round(py)]),
          },
          floor: fId,
          plan: 'custom',
        };
        units.push(room);

        c.records.forEach((r, i) => {
          const colI = i % c.cols;
          const rowI = Math.floor(i / c.cols);
          const ux = c.x + PAD + CELL_W / 2 + colI * CELL_W;
          const uy = cy + PAD + TITLE + (CELL_H / 2 + rowI * CELL_H) * yScale;
          const unitId = `rcu-${String(r[C.id]).trim() || slug(r[C.asset])}`;
          units.push({
            id: unitId,
            type: 'workstation',
            label: (r[C.asset] ?? '').trim(),
            secondary: (r[C.desc] ?? '').trim() || undefined,
            room: c.spaceName,
            geom: { kind: 'point', x: round(ux), y: round(uy) },
            floor: fId,
            plan: 'workstation',
            deskType: 'ASSIGNED',
          });
          if ((r[C.occupied] ?? '').trim().toLowerCase() === 'yes') {
            const empId = employeeFor(r);
            if (empId) assignments[unitId] = empId;
          }
        });
      }
    }
    site.buildings.push(building);
  }
  sites.push(site);
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}

// Emitted as a seed JSON for scripts/seed-vibe-db.mjs (NOT bundled into the
// app): the demo dataset lives in the Vibe DB's app_data blobs, served by the
// floorplanApi function's getPortfolio/getUnits/... handlers.
const out = {
  source: `RCU-Corporate Occupancy export (${rows.length} rows, ${skipped} skipped)`,
  portfolio: sites,
  employees: [...employeesById.values()],
  units,
  assignments,
};

writeFileSync(new URL('./rcu-seed.json', import.meta.url), JSON.stringify(out));

const desks = units.filter((u) => u.type === 'workstation').length;
const roomsN = units.filter((u) => u.type === 'room').length;
console.log(
  `rcuData.ts written: ${sites.length} sites, ${floorsWithUnits} floors, ${roomsN} spaces, ${desks} desks, ` +
    `${employeesById.size} employees, ${Object.keys(assignments).length} assignments (${skipped} rows skipped)`,
);
