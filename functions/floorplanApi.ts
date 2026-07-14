// Vibe Studio Function backing the iwmsfloorplan app's data layer.
//
// Everything is stored as JSON-string blobs in two key/value tables (created via
// `vibe db import`, since the app DB role is DML-only):
//   - app_settings(key,value):    the settings config blob (getSettings/saveSettings)
//   - app_data(key,value):        portfolio | employees | units | assignments | bookings
//   - floorplan_files(key,value): uploaded floorplan file per floor+plan, so a deployed
//                                 app reloads it after refresh (getFloorplanFile/saveFloorplanFile)
//
// The client's VibeDbDataSource calls these handlers via
// vibe.executeFunction('floorplanApi', <handler>, args). Studio Function params
// may only be number/string, so array/object payloads travel as JSON strings.
//
// Deploy:  vibe fn update floorplanApi --code functions/floorplanApi.ts
//          vibe fn build floorplanApi
//          vibe fn run floorplanApi seedData --args '{"data":"<seed json>"}'   (once)
import StudioFunctions, { StudioDatabase } from '@facilio/studio-functions';

const server = new StudioFunctions({ name: 'floorplanApi' });

function connect() {
  return new StudioDatabase({
    userName: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.SCHEMA,
  });
}

function getKV(db, table, key) {
  const { rows } = db.query(`select value from ${table} where key = $1`, [key]);
  return rows[0]?.value ?? null;
}
function setKV(db, table, key, value) {
  const updated = db.query(`update ${table} set value = $1 where key = $2`, [value, key]);
  if (!updated.rowCount) db.query(`insert into ${table} (key, value) values ($1, $2)`, [key, value]);
}
function parse(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}
function floorUnitIds(units, floorId) {
  const set = {};
  for (const u of units) if (u.floor === floorId) set[u.id] = true;
  return set;
}

// ---- settings (single JSON blob) ----
const SETTINGS_KEY = 'config';
server.addHandler({
  name: 'getSettings',
  description: "The app's saved settings config JSON string (or null).",
  parameters: {},
  execute: async () => {
    const db = connect();
    return { config: getKV(db, 'app_settings', SETTINGS_KEY) };
  },
});
server.addHandler({
  name: 'saveSettings',
  description: "Upsert the app's settings config (a JSON string blob).",
  parameters: { config: { description: 'Settings config as a JSON string', type: 'string' } },
  execute: async (args) => {
    setKV(connect(), 'app_settings', SETTINGS_KEY, args.config ?? '');
    return { ok: true };
  },
});

// ---- portfolio / employees (read-only datasets) ----
server.addHandler({
  name: 'getPortfolio',
  description: 'Site/building/floor tree.',
  parameters: {},
  execute: async () => parse(getKV(connect(), 'app_data', 'portfolio'), []),
});
server.addHandler({
  name: 'getEmployees',
  description: 'Employee directory.',
  parameters: {},
  execute: async () => parse(getKV(connect(), 'app_data', 'employees'), []),
});

// ---- units (placed desks/rooms/lockers/parking), per floor ----
server.addHandler({
  name: 'getUnits',
  description: 'Units on a floor.',
  parameters: { floorId: { description: 'Floor id', type: 'string' } },
  execute: async (args) => {
    const all = parse(getKV(connect(), 'app_data', 'units'), []);
    return all.filter((u) => u.floor === args.floorId);
  },
});
server.addHandler({
  name: 'saveUnits',
  description: "Replace a floor's units.",
  parameters: {
    floorId: { description: 'Floor id', type: 'string' },
    units: { description: "This floor's units as a JSON array string", type: 'string' },
  },
  execute: async (args) => {
    const db = connect();
    const all = parse(getKV(db, 'app_data', 'units'), []);
    const others = all.filter((u) => u.floor !== args.floorId);
    const next = others.concat(parse(args.units, []));
    setKV(db, 'app_data', 'units', JSON.stringify(next));
    return { ok: true };
  },
});

// ---- assignments (unitId -> employeeId) ----
server.addHandler({
  name: 'getAssignments',
  description: 'Assignments for units on a floor.',
  parameters: { floorId: { description: 'Floor id', type: 'string' } },
  execute: async (args) => {
    const db = connect();
    const assignments = parse(getKV(db, 'app_data', 'assignments'), {});
    const units = parse(getKV(db, 'app_data', 'units'), []);
    const onFloor = floorUnitIds(units, args.floorId);
    const out = {};
    for (const unitId of Object.keys(assignments)) if (onFloor[unitId]) out[unitId] = assignments[unitId];
    return out;
  },
});
server.addHandler({
  name: 'assignUnit',
  description: 'Assign an employee to a unit.',
  parameters: {
    unitId: { description: 'Unit id', type: 'string' },
    employeeId: { description: 'Employee id', type: 'string' },
  },
  execute: async (args) => {
    const db = connect();
    const assignments = parse(getKV(db, 'app_data', 'assignments'), {});
    assignments[args.unitId] = args.employeeId;
    setKV(db, 'app_data', 'assignments', JSON.stringify(assignments));
    return { ok: true };
  },
});
server.addHandler({
  name: 'vacateUnit',
  description: 'Clear a unit assignment.',
  parameters: { unitId: { description: 'Unit id', type: 'string' } },
  execute: async (args) => {
    const db = connect();
    const assignments = parse(getKV(db, 'app_data', 'assignments'), {});
    delete assignments[args.unitId];
    setKV(db, 'app_data', 'assignments', JSON.stringify(assignments));
    return { ok: true };
  },
});

// ---- bookings ----
server.addHandler({
  name: 'getBookings',
  description: 'Bookings for a floor + date.',
  parameters: {
    floorId: { description: 'Floor id', type: 'string' },
    date: { description: 'ISO date (YYYY-MM-DD)', type: 'string' },
  },
  execute: async (args) => {
    const db = connect();
    const bookings = parse(getKV(db, 'app_data', 'bookings'), []);
    const units = parse(getKV(db, 'app_data', 'units'), []);
    const onFloor = floorUnitIds(units, args.floorId);
    return bookings.filter((b) => onFloor[b.unitId] && b.date === args.date);
  },
});
server.addHandler({
  name: 'createBooking',
  description: 'Append a booking. Stores the FULL booking object as given (JSON string of {unitId,date,start,end,by,purpose,module,name,description,host,reservedBy,noOfAttendees,internalAttendees,externalAttendees}).',
  parameters: { booking: { description: 'Full booking object as a JSON string', type: 'string' } },
  execute: async (args) => {
    const db = connect();
    const input = parse(args.booking, null);
    if (!input) throw new Error('invalid booking payload');
    const booking = Object.assign({ id: 'b' + Date.now() + Math.floor(Math.random() * 1000) }, input);
    const bookings = parse(getKV(db, 'app_data', 'bookings'), []);
    bookings.push(booking);
    setKV(db, 'app_data', 'bookings', JSON.stringify(bookings));
    return booking;
  },
});

// ---- floorplan source files (uploaded image / PDF·CAD render), per floor+plan ----
// Stored in a SEPARATE table `floorplan_files(key,value)` so a large renderable blob
// (a data URL) never bloats the app_data row that getUnits/getBookings read on every
// floor load. Key is `${floorId}::${planId}`; value is a JSON string of
// {dataUrl, fileId?, name?, mime?}. Persisting the renderable bytes here is what lets a
// deployed app reload an uploaded floorplan after a refresh (there's no real
// @facilio/api indoorfloorplan record to fetch it back from in prod).
function fileKey(floorId, planId) {
  return String(floorId) + '::' + String(planId);
}
server.addHandler({
  name: 'getFloorplanFile',
  description: "A floor+plan's stored floorplan file as a JSON string of {dataUrl,fileId,name,mime}, or null.",
  parameters: {
    floorId: { description: 'Floor id', type: 'string' },
    planId: { description: 'Plan type id (workstation|locker|parking)', type: 'string' },
  },
  execute: async (args) => {
    const db = connect();
    return { file: getKV(db, 'floorplan_files', fileKey(args.floorId, args.planId)) };
  },
});
server.addHandler({
  name: 'saveFloorplanFile',
  description: 'Upsert a floor+plan floorplan file (JSON string of {dataUrl,fileId,name,mime}).',
  parameters: {
    floorId: { description: 'Floor id', type: 'string' },
    planId: { description: 'Plan type id (workstation|locker|parking)', type: 'string' },
    file: { description: 'File payload as a JSON string', type: 'string' },
  },
  execute: async (args) => {
    setKV(connect(), 'floorplan_files', fileKey(args.floorId, args.planId), args.file ?? '');
    return { ok: true };
  },
});

// ---- one-time seed of the demo dataset ----
server.addHandler({
  name: 'seedData',
  description: 'Seed portfolio/employees/units/assignments/bookings from one JSON payload.',
  parameters: { data: { description: 'JSON of {portfolio,employees,units,assignments,bookings}', type: 'string' } },
  execute: async (args) => {
    const db = connect();
    const d = parse(args.data, {});
    const wrote = [];
    for (const key of ['portfolio', 'employees', 'units', 'assignments', 'bookings']) {
      if (d[key] !== undefined) {
        setKV(db, 'app_data', key, JSON.stringify(d[key]));
        wrote.push(key);
      }
    }
    return { ok: true, wrote };
  },
});

server.execute();
