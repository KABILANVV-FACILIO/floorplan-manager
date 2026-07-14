/**
 * Seeds the RCU demo dataset (scripts/rcu-seed.json, from gen-rcu-data.mjs)
 * into the app's Vibe DB through the deployed floorplanApi function:
 *
 *   - seedData        → portfolio / employees / assignments blobs
 *   - saveUnits       → per floor, so it MERGES with app_data.units and
 *                       user-placed floors survive re-seeding
 *
 * Employees/assignments include the small built-in demo set (Berlin floor)
 * so its assignment chips keep resolving once the DB tier outranks mock.
 *
 * Usage: node scripts/seed-vibe-db.mjs   (needs `vibe login` + the app link)
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const seed = JSON.parse(readFileSync(new URL('./rcu-seed.json', import.meta.url), 'utf8'));

const DEMO_EMPLOYEES = [
  { id: 'e1', name: 'Amrithya', dept: 'Operations' },
  { id: 'e2', name: 'Jonas Weber', dept: 'Engineering' },
  { id: 'e3', name: 'Maria Silva', dept: 'Finance' },
  { id: 'e4', name: 'Anna Schmidt', dept: 'HR' },
  { id: 'e5', name: 'David Chen', dept: 'Engineering' },
  { id: 'e6', name: 'Lena Hoffmann', dept: 'Operations' },
  { id: 'e7', name: 'Tom Becker', dept: 'Engineering' },
  { id: 'e8', name: 'Sofia Rossi', dept: 'Finance' },
  { id: 'e9', name: 'Mark Janssen', dept: 'Operations' },
  { id: 'e10', name: 'Emma Fischer', dept: 'Engineering' },
  { id: 'e11', name: 'Lukas Braun', dept: 'HR' },
  { id: 'e12', name: 'Nina Keller', dept: 'Operations' },
  { id: 'e13', name: 'Omar Haddad', dept: 'Engineering' },
  { id: 'e14', name: 'Julia Wagner', dept: 'Finance' },
];
const DEMO_ASSIGNMENTS = { ws1: 'e1', ws2: 'e2', ws4: 'e3', ws7: 'e4', ws9: 'e5', ws13: 'e6', ws17: 'e7', ws21: 'e8' };

/**
 * The built-in Berlin demo floor (hqA3), ported from mockData.seedUnits().
 * Needed here because the vibe-db tier answers getUnits for EVERY floor once
 * deployed (empty is a legitimate per-floor answer, no fall-through to mock)
 * — without seeding it the demo floor would come up blank.
 */
function demoUnits() {
  const ws = [
    [0.083, 0.115, 'Büro 1'], [0.083, 0.16, 'Büro 1'], [0.083, 0.205, 'Büro 1'],
    [0.125, 0.115, 'Büro 1'], [0.125, 0.16, 'Büro 1'], [0.125, 0.205, 'Büro 1'],
    [0.318, 0.115, 'Büro 2'], [0.318, 0.16, 'Büro 2'], [0.318, 0.205, 'Büro 2'],
    [0.362, 0.115, 'Büro 2'], [0.362, 0.16, 'Büro 2'], [0.362, 0.205, 'Büro 2'],
    [0.655, 0.125, 'Büro 4'], [0.655, 0.175, 'Büro 4'], [0.702, 0.125, 'Büro 4'], [0.702, 0.175, 'Büro 4'],
    [0.838, 0.79, 'Büro 9'], [0.838, 0.865, 'Büro 9'], [0.926, 0.79, 'Büro 9'], [0.926, 0.865, 'Büro 9'],
    [0.7, 0.79, 'Büro 10'], [0.7, 0.865, 'Büro 10'],
    [0.075, 0.79, 'Büro 12'], [0.075, 0.865, 'Büro 12'],
  ];
  const seatTypes = [
    'Sit-stand · dual monitor',
    'Fixed · single monitor',
    'Window seat · sit-stand',
    'Standard · docking',
    'Corner · dual monitor',
    'Standard · single monitor',
  ];
  const units = ws.map(([x, y, room], i) => ({
    id: 'ws' + (i + 1),
    type: 'workstation',
    label: 'WS-' + String(i + 1).padStart(2, '0'),
    secondary: seatTypes[i % seatTypes.length],
    room,
    geom: { kind: 'point', x, y },
    floor: 'hqA3',
    plan: 'workstation',
    deskType: i % 4 === 3 ? (i % 8 === 7 ? 'HOTEL' : 'HOT') : 'ASSIGNED',
  }));
  for (let i = 0; i < 8; i++) {
    units.push({
      id: 'lk' + (i + 1),
      type: 'locker',
      label: 'L-' + String(i + 1).padStart(2, '0'),
      room: 'Flur',
      geom: { kind: 'point', x: 0.058 + i * 0.0135, y: 0.343 },
      floor: 'hqA3',
      plan: 'locker',
    });
  }
  units.push(
    { id: 'rm1', type: 'room', label: 'Konferenzraum 1', room: null, geom: { kind: 'poly', pts: [[0.492, 0.735], [0.618, 0.735], [0.618, 0.955], [0.492, 0.955]] }, floor: 'hqA3', plan: 'custom' },
    { id: 'rm2', type: 'room', label: 'Konferenzraum 2', room: null, geom: { kind: 'poly', pts: [[0.148, 0.7], [0.385, 0.7], [0.385, 0.955], [0.148, 0.955]] }, floor: 'hqA3', plan: 'custom' },
    { id: 'rm3', type: 'room', label: 'Ruheraum', room: null, geom: { kind: 'poly', pts: [[0.033, 0.36], [0.155, 0.36], [0.155, 0.44], [0.033, 0.44]] }, floor: 'hqA3', plan: 'custom' },
  );
  const pk = [[0.44, 0.6], [0.47, 0.6], [0.5, 0.6], [0.44, 0.66], [0.47, 0.66], [0.5, 0.66]];
  pk.forEach(([x, y], i) => {
    units.push({
      id: 'pk' + (i + 1),
      type: 'parking',
      label: 'P-' + String(i + 1).padStart(2, '0'),
      room: null,
      geom: { kind: 'point', x, y },
      floor: 'hqA3',
      plan: 'parking',
    });
  });
  return units;
}

function run(handler, args) {
  const out = execFileSync('vibe', ['function', 'run', 'floorplanApi', handler, '--args', JSON.stringify(args)], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const trimmed = out.trim();
  if (/error|failed/i.test(trimmed) && !/"ok"\s*:\s*true/.test(trimmed)) {
    throw new Error(`${handler}: ${trimmed.slice(0, 400)}`);
  }
  return trimmed;
}

// 1. blob datasets in one call (small enough for a single CLI arg)
console.log('seeding portfolio / employees / assignments…');
run('seedData', {
  data: JSON.stringify({
    portfolio: seed.portfolio,
    employees: [...DEMO_EMPLOYEES, ...seed.employees],
    assignments: { ...DEMO_ASSIGNMENTS, ...seed.assignments },
  }),
});

// 2. units per floor — merge semantics, and each call stays well under arg limits
const byFloor = new Map();
for (const u of [...seed.units, ...demoUnits()]) {
  if (!byFloor.has(u.floor)) byFloor.set(u.floor, []);
  byFloor.get(u.floor).push(u);
}
let i = 0;
for (const [floorId, units] of byFloor) {
  i += 1;
  console.log(`saveUnits ${i}/${byFloor.size}: ${floorId} (${units.length} units)`);
  run('saveUnits', { floorId, units: JSON.stringify(units) });
}

console.log(
  `done: ${seed.portfolio.length} sites, ${byFloor.size} floors, ${seed.units.length} units, ` +
    `${DEMO_EMPLOYEES.length + seed.employees.length} employees, ` +
    `${Object.keys(seed.assignments).length + Object.keys(DEMO_ASSIGNMENTS).length} assignments → Vibe DB`,
);
