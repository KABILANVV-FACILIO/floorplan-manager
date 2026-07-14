import type { AppState } from '../state/types';
import { conflictsFor, isAssignable, isBookable } from '../state/selectors';
import { STATE_DEFS } from './types';
import type { Unit } from './types';
import { fmtTime } from './geometry';

export function moduleColor(state: AppState, type: Unit['type'], key: string): string {
  const override = state.moduleColors[`${type}.${key}`];
  if (override) return override;
  const def = STATE_DEFS[type]?.find((s) => s.key === key);
  return def ? def.def : '#607796';
}

export interface UnitStatus {
  key: string;
  text: string;
  bg: string;
  fg: string;
  dot: string;
}

const TOKEN = {
  success050: 'var(--success-050)',
  success700: 'var(--success-700)',
  danger050: 'var(--danger-050)',
  danger700: 'var(--danger-700)',
  blue050: 'var(--blue-050)',
  blue700: 'var(--blue-700)',
  ink100: 'var(--ink-100)',
  ink600: 'var(--ink-600)',
};

export interface MarkerStyle {
  bg: string;
  bd: string;
  fg: string;
  opacity: number;
  shadow: string;
  size: number;
  radius: string;
  zIndex: number;
  occText: string | null;
  icon: 'workstation' | 'locker' | 'parking' | null;
}

export function markerStyle(state: AppState, unit: Unit, markerScale = 1): MarkerStyle {
  const size = Math.round(24 * markerScale);
  const radius = unit.type === 'parking' ? '999px' : unit.type === 'locker' ? '4px' : '6px';
  const selected = state.selected === unit.id;
  const shadow = selected ? '0 0 0 3px rgba(0,89,214,0.28)' : 'var(--shadow-xs)';
  const zIndex = selected ? 5 : 2;
  const empId = state.assignments[unit.id];

  if (state.mode === 'edit') {
    if (selected) {
      return { bg: 'var(--blue-500)', bd: 'var(--blue-500)', fg: '#fff', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: null };
    }
    if (unit.type === 'locker') {
      return { bg: '#fff', bd: 'var(--brand-indigo-400)', fg: 'var(--brand-indigo)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: 'locker' };
    }
    if (unit.type === 'parking') {
      return { bg: '#fff', bd: 'var(--ink-500)', fg: 'var(--ink-700)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: 'parking' };
    }
    return { bg: '#fff', bd: 'var(--blue-300)', fg: 'var(--blue-600)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: unit.type === 'workstation' ? 'workstation' : null };
  }

  if (state.mode === 'assign') {
    if (!isAssignable(unit)) {
      return { bg: '#fff', bd: 'var(--ink-300)', fg: 'var(--ink-500)', opacity: 0.5, shadow, size, radius, zIndex, occText: null, icon: null };
    }
    if (state.dragOverId === unit.id) {
      return { bg: 'var(--blue-100)', bd: 'var(--blue-500)', fg: 'var(--blue-700)', opacity: 1, shadow: '0 0 0 4px rgba(0,89,214,0.22)', size, radius, zIndex: 6, occText: empId ? initialsOf(employeeNameFallback(state, empId)) : null, icon: empId ? null : markerIcon(unit.type) };
    }
    if (empId) {
      return { bg: 'var(--blue-500)', bd: 'var(--blue-500)', fg: '#fff', opacity: 1, shadow, size, radius, zIndex, occText: initialsOf(employeeNameFallback(state, empId)), icon: null };
    }
    return { bg: '#fff', bd: 'var(--success-500)', fg: 'var(--success-700)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: markerIcon(unit.type) };
  }

  // book mode
  if (!isBookable(unit)) {
    return { bg: '#fff', bd: 'var(--ink-400)', fg: 'var(--ink-500)', opacity: 0.35, shadow, size, radius, zIndex, occText: null, icon: null };
  }
  const conflicts = conflictsFor(state.bookings, unit.id, state.date, state.start, state.end);
  if (conflicts.length) {
    return { bg: 'var(--danger-050)', bd: 'var(--danger-500)', fg: 'var(--danger-700)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: markerIcon(unit.type) };
  }
  return { bg: '#fff', bd: 'var(--success-500)', fg: 'var(--success-700)', opacity: 1, shadow, size, radius, zIndex, occText: null, icon: markerIcon(unit.type) };
}

function markerIcon(type: Unit['type']): MarkerStyle['icon'] {
  if (type === 'workstation') return 'workstation';
  if (type === 'locker') return 'locker';
  if (type === 'parking') return 'parking';
  return null;
}
function initialsOf(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function employeeNameFallback(state: AppState, empId: string): string {
  return state.employees.find((e) => e.id === empId)?.name ?? empId;
}

export function unitStatus(state: AppState, unit: Unit, employeeName: (id: string) => string): UnitStatus {
  if (state.mode === 'edit') {
    const name = { workstation: 'Desk', locker: 'Locker', parking: 'Parking stall', room: 'Room' }[unit.type];
    return { key: 'type', text: name, bg: TOKEN.ink100, fg: TOKEN.ink600, dot: moduleColor(state, unit.type, 'free') };
  }
  if (state.mode === 'assign') {
    if (!isAssignable(unit)) {
      return { key: 'na', text: 'Not assignable', bg: TOKEN.ink100, fg: TOKEN.ink600, dot: moduleColor(state, unit.type, 'free') };
    }
    const empId = state.assignments[unit.id];
    if (empId) {
      return {
        key: 'assigned',
        text: `Assigned · ${employeeName(empId)}`,
        bg: TOKEN.blue050,
        fg: TOKEN.blue700,
        dot: moduleColor(state, unit.type, 'assigned'),
      };
    }
    return { key: 'free', text: 'Free', bg: TOKEN.success050, fg: TOKEN.success700, dot: moduleColor(state, unit.type, 'free') };
  }
  // book mode
  if (!isBookable(unit)) {
    return { key: 'notBookable', text: 'Not bookable', bg: TOKEN.ink100, fg: TOKEN.ink600, dot: moduleColor(state, unit.type, 'free') };
  }
  const conflicts = conflictsFor(state.bookings, unit.id, state.date, state.start, state.end);
  if (conflicts.length) {
    return {
      key: 'booked',
      text: `Booked ${fmtTime(conflicts[0].start)}–${fmtTime(conflicts[0].end)}`,
      bg: TOKEN.danger050,
      fg: TOKEN.danger700,
      dot: moduleColor(state, unit.type, 'booked'),
    };
  }
  return { key: 'available', text: 'Available', bg: TOKEN.success050, fg: TOKEN.success700, dot: moduleColor(state, unit.type, unit.type === 'room' ? 'available' : 'free') };
}
