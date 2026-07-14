export type UnitType = 'workstation' | 'locker' | 'parking' | 'room';
export type PlanId = 'workstation' | 'locker' | 'parking' | 'custom';
export type AppMode = 'assign' | 'book' | 'edit';
export type EditTool = 'select' | 'room' | 'workstation' | 'locker' | 'parking' | 'calibrate';
export type Role = 'admin' | 'manager' | 'employee';

export interface PointGeom {
  kind: 'point';
  /** Fraction (0-1) of the floorplan image width/height. */
  x: number;
  y: number;
}

export interface PolyGeom {
  kind: 'poly';
  /** Fractions (0-1) of the floorplan image width/height. */
  pts: [number, number][];
}

export type UnitGeom = PointGeom | PolyGeom;

export interface Unit {
  id: string;
  type: UnitType;
  label: string;
  secondary?: string;
  room: string | null;
  geom: UnitGeom;
  floor: string;
  plan: PlanId;
}

export interface Employee {
  id: string;
  name: string;
  dept: string;
}

export interface Booking {
  id: string;
  unitId: string;
  date: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
  by: string;
  purpose: string;
}

/** unitId -> employeeId */
export type Assignments = Record<string, string>;

export interface Floor {
  id: string;
  name: string;
  hasPlan?: boolean;
  plans?: { id: PlanId; name: string }[];
}

export interface Building {
  id: string;
  name: string;
  floors: Floor[];
}

export interface Site {
  id: string;
  name: string;
  buildings: Building[];
}

export interface PanelLayoutState {
  open: boolean;
  x: number | null;
  y: number | null;
}

export interface PanelsState {
  context: PanelLayoutState;
  portfolio: PanelLayoutState;
  details: PanelLayoutState;
}

export interface ViewTransform {
  tx: number;
  ty: number;
  z: number;
}

export const TYPE_META: Record<UnitType, { name: string; prefix: string }> = {
  workstation: { name: 'Desk', prefix: 'WS' },
  locker: { name: 'Locker', prefix: 'L' },
  parking: { name: 'Parking stall', prefix: 'P' },
  room: { name: 'Room', prefix: 'RM' },
};

export const ROLES: { id: Role; name: string }[] = [
  { id: 'admin', name: 'Admin' },
  { id: 'manager', name: 'Manager' },
  { id: 'employee', name: 'Employee' },
];

export type PermsAction = 'edit' | 'assign' | 'book';
export type Perms = Record<PermsAction, Role[]>;

export const DEFAULT_PERMS: Perms = {
  edit: ['admin'],
  assign: ['admin', 'manager'],
  book: ['admin', 'manager', 'employee'],
};

export const ACTIONS: { id: PermsAction; name: string; desc: string }[] = [
  { id: 'edit', name: 'Edit floorplan', desc: 'Draw rooms, place units, calibrate scale' },
  { id: 'assign', name: 'Assign desks & lockers', desc: 'Give a permanent desk or locker to a person' },
  { id: 'book', name: 'Book spaces', desc: 'Reserve hot desks, rooms, parking' },
];

export interface StateDef {
  key: string;
  label: string;
  desc: string;
  def: string;
}

export const STATE_SWATCHES = ['#29A01E', '#0059D6', '#3C229D', '#B61919', '#F59E0B', '#2ED1FF', '#607796'];

export const STATE_DEFS: Record<UnitType, StateDef[]> = {
  workstation: [
    { key: 'free', label: 'Free', desc: 'Assignable, no owner yet', def: '#29A01E' },
    { key: 'assigned', label: 'Assigned', desc: 'Has a permanent owner', def: '#0059D6' },
    { key: 'hot', label: 'Hot desk', desc: 'Bookable by anyone, per session', def: '#3C229D' },
    { key: 'booked', label: 'Booked', desc: 'Reserved for a time window', def: '#B61919' },
  ],
  locker: [
    { key: 'free', label: 'Free', desc: 'Available to assign', def: '#29A01E' },
    { key: 'assigned', label: 'Assigned', desc: 'Held by an employee', def: '#0059D6' },
  ],
  parking: [
    { key: 'free', label: 'Free', desc: 'Open stall', def: '#29A01E' },
    { key: 'booked', label: 'Booked', desc: 'Reserved for a time window', def: '#B61919' },
  ],
  room: [
    { key: 'available', label: 'Available', desc: 'Open to book', def: '#29A01E' },
    { key: 'booked', label: 'Booked', desc: 'Reserved for a time window', def: '#B61919' },
  ],
};

export interface OptDef {
  key: string;
  label: string;
  desc: string;
  def: boolean;
}

export const OPT_DEFS: Record<UnitType, OptDef[]> = {
  workstation: [
    { key: 'hotDesking', label: 'Allow hot-desking', desc: 'Let employees book unassigned desks by the hour', def: true },
    { key: 'autoRelease', label: 'Auto-release no-shows', desc: 'Free a booked desk 30 min after an unclaimed start', def: true },
  ],
  locker: [
    { key: 'deposit', label: 'Require deposit', desc: 'Collect a refundable deposit on assignment', def: false },
    { key: 'autoExpire', label: 'Expire idle lockers', desc: 'Release lockers unused for 90 days', def: true },
  ],
  parking: [
    { key: 'evOnly', label: 'EV stalls need a permit', desc: 'Restrict charging stalls to permit holders', def: true },
    { key: 'overnight', label: 'Allow overnight parking', desc: 'Permit bookings that span midnight', def: false },
  ],
  room: [
    { key: 'approval', label: 'Require approval', desc: 'Route room requests to a facilities admin', def: false },
    { key: 'checkin', label: 'Require check-in', desc: 'Auto-cancel if nobody checks in within 10 min', def: true },
  ],
};
