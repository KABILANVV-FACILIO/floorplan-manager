import { DEFAULT_PERMS, floorImageKey } from '../lib/types';
import type { Booking, PlanId, Site, Unit } from '../lib/types';
import { clamp, fitView } from '../lib/geometry';
import { seedBookings } from '../lib/mockData';
import type { AppState } from './types';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildInitialState(): AppState {
  const iso = todayIso();
  return {
    mode: 'assign',
    tool: 'select',
    floorId: 'hqA3',
    planId: 'workstation',
    expanded: { sBer: true, bA: true },
    navOpen: false,
    navView: 'spaces',
    panels: {
      context: { open: true, x: null, y: null },
      portfolio: { open: true, x: null, y: null },
      details: { open: true, x: null, y: null },
    },
    stage: { w: 1200, h: 700 },
    view: { tx: 0, ty: 0, z: 0.5 },
    viewAnim: false,
    userZoomed: false,
    spaceFilter: 'all',
    spaceSearch: '',

    units: [],
    savedUnits: [],
    unsavedChanges: 0,
    pendingModeSwitch: null,
    assignments: {},
    bookings: [],
    employees: [],
    portfolio: [],
    pxPerMeter: null,
    loading: true,
    dataSourceName: null,

    selected: null,
    highlightUnitId: null,
    draft: [],
    calib: [],
    calibLen: '',
    empSearch: '',
    dragEmpId: null,
    dragOverId: null,

    date: iso,
    start: 600,
    end: 660,
    bookBy: 'e1',
    bookPurpose: '',
    bookNotes: '',
    bookModalOpen: false,
    bookForm: null,
    bookingModule: 'space',
    bookingsNonce: 0,
    webReassign: null,
    schedView: 'list',

    role: 'admin',
    perms: { ...DEFAULT_PERMS },

    activeView: 'map',
    settingsTab: 'permissions',
    moduleColors: {},
    slotGranularity: 30,

    toast: null,

    mobileTab: 'book',
    mobSel: null,
    mobPickSite: null,
    mobPickBuilding: null,
    mobFloorOpen: false,
    mobTimePick: null,
    mobAssignEdit: false,

    uploadOpen: false,
    autoMapGroups: null,
    cadAnalyses: {},
    myDesk: null,
    floorImages: {},
    floorPlanTypes: {},
    floorImageLoading: false,
  };
}

export type Action =
  | { type: 'SET_MODE'; mode: AppState['mode'] }
  | { type: 'TOGGLE_EDIT' }
  | { type: 'SET_TOOL'; tool: AppState['tool'] }
  | { type: 'TOGGLE_NAV' }
  | { type: 'SET_NAV_VIEW'; view: AppState['navView'] }
  | { type: 'TOGGLE_NODE'; id: string }
  | { type: 'SELECT_FLOOR_START'; floorId: string }
  | { type: 'SELECT_FLOOR_DONE'; floorId: string; units: Unit[]; assignments: AppState['assignments']; bookings: Booking[] }
  | { type: 'SET_PLAN'; planId: AppState['planId'] }
  | { type: 'SET_STAGE_SIZE'; w: number; h: number }
  | { type: 'SET_VIEW'; view: AppState['view']; animate?: boolean }
  | { type: 'MARK_USER_ZOOMED'; value: boolean }
  | { type: 'SET_SPACE_FILTER'; filter: AppState['spaceFilter'] }
  | { type: 'SET_SPACE_SEARCH'; value: string }
  | { type: 'PORTFOLIO_LOADED'; portfolio: Site[]; employees: AppState['employees'] }
  | { type: 'SELECT_UNIT'; id: string | null }
  | { type: 'HIGHLIGHT_UNIT'; id: string | null }
  | { type: 'ADD_UNIT'; unit: Unit }
  | { type: 'ADD_UNITS'; units: Unit[] }
  | { type: 'UPDATE_UNIT'; id: string; patch: Partial<Unit> }
  | { type: 'DELETE_UNIT'; id: string }
  | { type: 'PUSH_DRAFT_POINT'; pt: [number, number] }
  | { type: 'CLEAR_DRAFT' }
  | { type: 'CLOSE_DRAFT'; unit: Unit }
  | { type: 'PUSH_CALIB_POINT'; pt: [number, number] }
  | { type: 'SET_CALIB_LEN'; value: string }
  | { type: 'APPLY_CALIB'; pxPerMeter: number }
  | { type: 'CLEAR_CALIB' }
  | { type: 'SET_EMP_SEARCH'; value: string }
  | { type: 'DRAG_START_EMP'; id: string | null }
  | { type: 'DRAG_OVER_UNIT'; id: string | null }
  | { type: 'ASSIGN'; unitId: string; employeeId: string; assignments: AppState['assignments'] }
  | { type: 'VACATE'; unitId: string; assignments: AppState['assignments'] }
  | { type: 'SET_WEB_REASSIGN'; id: string | null }
  | { type: 'SET_DATE'; value: string; bookings: Booking[] }
  | { type: 'SET_TIME_RANGE'; start: number; end: number }
  | { type: 'SET_BOOK_MODAL'; open: boolean }
  | { type: 'SET_BOOK_FIELD'; field: 'bookBy' | 'bookPurpose' | 'bookNotes'; value: string }
  | { type: 'SET_BOOK_FORM'; form: AppState['bookForm'] }
  | { type: 'UPDATE_BOOK_FORM'; patch: Partial<NonNullable<AppState['bookForm']>> }
  | { type: 'SET_BOOKING_MODULE'; module: AppState['bookingModule'] }
  | { type: 'ADD_BOOKING'; booking: Booking }
  | { type: 'CANCEL_BOOKING'; id: string }
  | { type: 'SET_SCHED_VIEW'; view: AppState['schedView'] }
  | { type: 'SET_ROLE'; role: AppState['role'] }
  | { type: 'TOGGLE_PERM'; action: keyof AppState['perms']; role: AppState['role'] }
  | { type: 'RESET_PERMS' }
  | { type: 'SET_ACTIVE_VIEW'; view: AppState['activeView'] }
  | { type: 'SET_SETTINGS_TAB'; tab: AppState['settingsTab'] }
  | { type: 'SET_MODULE_COLOR'; key: string; hex: string }
  | { type: 'SET_SLOT_GRANULARITY'; minutes: number }
  | { type: 'SHOW_TOAST'; message: string | null }
  | { type: 'TOGGLE_PANEL_OPEN'; id: 'context' | 'portfolio' | 'details' }
  | { type: 'SET_PANEL_OPEN'; id: 'context' | 'portfolio' | 'details'; open: boolean }
  | { type: 'SET_PANEL_POS'; id: 'context' | 'portfolio' | 'details'; x: number; y: number }
  | { type: 'RESET_LAYOUT' }
  | { type: 'SET_MOBILE_TAB'; tab: AppState['mobileTab'] }
  | { type: 'SET_MOB_SEL'; id: string | null }
  | { type: 'SET_MOB_FLOOR_OPEN'; open: boolean }
  | { type: 'SET_MOB_PICK'; site: string | null; building: string | null }
  | { type: 'SET_MOB_TIME_PICK'; which: AppState['mobTimePick'] }
  | { type: 'SET_MOB_ASSIGN_EDIT'; value: boolean }
  | { type: 'SET_UPLOAD_OPEN'; open: boolean }
  | { type: 'SET_AUTOMAP_GROUPS'; groups: AppState['autoMapGroups'] }
  | { type: 'SET_CAD_ANALYSIS'; key: string; groups: AppState['autoMapGroups'] }
  | { type: 'SET_FLOOR_IMAGE'; floorId: string; planId: PlanId; dataUrl: string }
  | { type: 'SET_FLOOR_PLAN_TYPES'; floorId: string; types: AppState['floorPlanTypes'][string] }
  | { type: 'SET_FLOOR_IMAGE_LOADING'; value: boolean }
  | { type: 'SET_MY_DESK'; myDesk: AppState['myDesk'] }
  | { type: 'MARK_SAVED' }
  | { type: 'DISCARD_CHANGES' }
  | { type: 'SET_PENDING_MODE_SWITCH'; mode: AppState['mode'] | null }
  | { type: 'RESET_DEMO'; units: Unit[]; assignments: AppState['assignments']; bookings: Booking[] };

function resetSelectionState(s: AppState): Partial<AppState> {
  return { selected: null, draft: [], calib: [], calibLen: '', dragOverId: null, webReassign: null };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode, tool: 'select', ...resetSelectionState(state) };
    case 'TOGGLE_EDIT':
      return { ...state, mode: state.mode === 'edit' ? 'assign' : 'edit', tool: 'select', ...resetSelectionState(state) };
    case 'SET_TOOL':
      return { ...state, tool: action.tool, draft: [], calib: [], calibLen: '' };
    case 'TOGGLE_NAV':
      return { ...state, navOpen: !state.navOpen };
    case 'SET_NAV_VIEW':
      return { ...state, navView: action.view };
    case 'TOGGLE_NODE':
      return { ...state, expanded: { ...state.expanded, [action.id]: !state.expanded[action.id] } };
    case 'SELECT_FLOOR_START':
      if (action.floorId === state.floorId) return state;
      return {
        ...state,
        floorId: action.floorId,
        userZoomed: false,
        navView: 'spaces',
        spaceSearch: '',
        spaceFilter: 'all',
        loading: true,
        ...resetSelectionState(state),
      };
    case 'SELECT_FLOOR_DONE':
      if (action.floorId !== state.floorId) return state;
      return { ...state, units: action.units, savedUnits: action.units, unsavedChanges: 0, assignments: action.assignments, bookings: action.bookings, loading: false };
    case 'SET_PLAN':
      return { ...state, planId: action.planId, ...resetSelectionState(state) };
    case 'SET_STAGE_SIZE':
      return { ...state, stage: { w: action.w, h: action.h } };
    case 'SET_VIEW':
      return { ...state, view: action.view, viewAnim: !!action.animate };
    case 'MARK_USER_ZOOMED':
      return { ...state, userZoomed: action.value };
    case 'SET_SPACE_FILTER':
      return { ...state, spaceFilter: action.filter };
    case 'SET_SPACE_SEARCH':
      return { ...state, spaceSearch: action.value };
    case 'PORTFOLIO_LOADED':
      return { ...state, portfolio: action.portfolio, employees: action.employees };

    case 'SELECT_UNIT':
      return { ...state, selected: action.id, webReassign: null };
    case 'HIGHLIGHT_UNIT':
      return { ...state, highlightUnitId: action.id };
    case 'ADD_UNIT':
      return { ...state, units: [...state.units, action.unit], selected: action.unit.id, unsavedChanges: state.unsavedChanges + 1 };
    case 'ADD_UNITS':
      return { ...state, units: [...state.units, ...action.units], unsavedChanges: state.unsavedChanges + action.units.length };
    case 'UPDATE_UNIT':
      return { ...state, units: state.units.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)), unsavedChanges: state.unsavedChanges + 1 };
    case 'DELETE_UNIT': {
      const assignments = { ...state.assignments };
      delete assignments[action.id];
      return {
        ...state,
        units: state.units.filter((u) => u.id !== action.id),
        assignments,
        bookings: state.bookings.filter((b) => b.unitId !== action.id),
        selected: state.selected === action.id ? null : state.selected,
        unsavedChanges: state.unsavedChanges + 1,
      };
    }
    case 'PUSH_DRAFT_POINT':
      return { ...state, draft: [...state.draft, action.pt] };
    case 'CLEAR_DRAFT':
      return { ...state, draft: [] };
    case 'CLOSE_DRAFT':
      return { ...state, units: [...state.units, action.unit], draft: [], tool: 'select', selected: action.unit.id, unsavedChanges: state.unsavedChanges + 1 };
    case 'PUSH_CALIB_POINT':
      return { ...state, calib: state.calib.length >= 2 ? state.calib : [...state.calib, action.pt] };
    case 'SET_CALIB_LEN':
      return { ...state, calibLen: action.value };
    case 'APPLY_CALIB':
      return { ...state, pxPerMeter: action.pxPerMeter, calib: [], calibLen: '', tool: 'select' };
    case 'CLEAR_CALIB':
      return { ...state, calib: [], calibLen: '' };

    case 'SET_EMP_SEARCH':
      return { ...state, empSearch: action.value };
    case 'DRAG_START_EMP':
      return { ...state, dragEmpId: action.id };
    case 'DRAG_OVER_UNIT':
      return { ...state, dragOverId: action.id };
    case 'ASSIGN':
      return { ...state, assignments: action.assignments, dragOverId: null, dragEmpId: null, selected: action.unitId, webReassign: null };
    case 'VACATE':
      return { ...state, assignments: action.assignments };
    case 'SET_WEB_REASSIGN':
      return { ...state, webReassign: action.id };

    case 'SET_DATE':
      return { ...state, date: action.value, bookings: action.bookings };
    case 'SET_TIME_RANGE':
      return { ...state, start: action.start, end: action.end };
    case 'SET_BOOK_MODAL':
      return { ...state, bookModalOpen: action.open, bookPurpose: action.open ? state.bookPurpose : '', bookNotes: action.open ? state.bookNotes : '' };
    case 'SET_BOOK_FIELD':
      return { ...state, [action.field]: action.value } as AppState;
    case 'SET_BOOK_FORM':
      return { ...state, bookForm: action.form, bookModalOpen: !!action.form };
    case 'UPDATE_BOOK_FORM':
      return { ...state, bookForm: state.bookForm ? { ...state.bookForm, ...action.patch } : state.bookForm };
    case 'SET_BOOKING_MODULE':
      return { ...state, bookingModule: action.module };
    case 'ADD_BOOKING':
      return {
        ...state,
        bookings: [...state.bookings, action.booking],
        bookModalOpen: false,
        bookForm: null,
        bookPurpose: '',
        bookNotes: '',
        bookingsNonce: state.bookingsNonce + 1,
      };
    case 'CANCEL_BOOKING':
      return { ...state, bookings: state.bookings.filter((b) => b.id !== action.id), bookingsNonce: state.bookingsNonce + 1 };
    case 'SET_SCHED_VIEW':
      return { ...state, schedView: action.view };

    case 'SET_ROLE':
      return { ...state, role: action.role };
    case 'TOGGLE_PERM': {
      const cur = state.perms[action.action];
      const has = cur.includes(action.role);
      const next = has ? cur.filter((r) => r !== action.role) : [...cur, action.role];
      return { ...state, perms: { ...state.perms, [action.action]: next } };
    }
    case 'RESET_PERMS':
      return { ...state, perms: { ...DEFAULT_PERMS } };

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view };
    case 'SET_SETTINGS_TAB':
      return { ...state, settingsTab: action.tab };
    case 'SET_MODULE_COLOR':
      return { ...state, moduleColors: { ...state.moduleColors, [action.key]: action.hex } };
    case 'SET_SLOT_GRANULARITY':
      return { ...state, slotGranularity: action.minutes, end: Math.min(1200, state.start + action.minutes) };

    case 'SHOW_TOAST':
      return { ...state, toast: action.message };

    case 'TOGGLE_PANEL_OPEN':
      return { ...state, panels: { ...state.panels, [action.id]: { ...state.panels[action.id], open: !state.panels[action.id].open } } };
    case 'SET_PANEL_OPEN':
      return { ...state, panels: { ...state.panels, [action.id]: { ...state.panels[action.id], open: action.open } } };
    case 'SET_PANEL_POS':
      return { ...state, panels: { ...state.panels, [action.id]: { ...state.panels[action.id], x: action.x, y: action.y } } };
    case 'RESET_LAYOUT':
      return {
        ...state,
        panels: {
          context: { open: true, x: null, y: null },
          portfolio: { open: true, x: null, y: null },
          details: { open: true, x: null, y: null },
        },
      };

    case 'SET_MOBILE_TAB':
      return { ...state, mobileTab: action.tab, mobSel: null };
    case 'SET_MOB_SEL':
      return { ...state, mobSel: action.id, mobAssignEdit: action.id ? state.mobAssignEdit : false };
    case 'SET_MOB_FLOOR_OPEN':
      return action.open
        ? { ...state, mobFloorOpen: true, mobPickSite: null, mobPickBuilding: null, mobSel: null }
        : { ...state, mobFloorOpen: false };
    case 'SET_MOB_PICK':
      return { ...state, mobPickSite: action.site, mobPickBuilding: action.building };
    case 'SET_MOB_TIME_PICK':
      return { ...state, mobTimePick: action.which };
    case 'SET_MOB_ASSIGN_EDIT':
      return { ...state, mobAssignEdit: action.value };

    case 'SET_UPLOAD_OPEN':
      return { ...state, uploadOpen: action.open };
    case 'SET_AUTOMAP_GROUPS':
      return { ...state, autoMapGroups: action.groups };
    case 'SET_CAD_ANALYSIS': {
      const cadAnalyses = { ...state.cadAnalyses };
      if (action.groups && action.groups.length > 0) cadAnalyses[action.key] = action.groups;
      else delete cadAnalyses[action.key];
      return { ...state, cadAnalyses };
    }
    case 'SET_FLOOR_IMAGE':
      return { ...state, floorImages: { ...state.floorImages, [floorImageKey(action.floorId, action.planId)]: action.dataUrl } };
    case 'SET_FLOOR_PLAN_TYPES':
      return { ...state, floorPlanTypes: { ...state.floorPlanTypes, [action.floorId]: action.types } };
    case 'SET_FLOOR_IMAGE_LOADING':
      return { ...state, floorImageLoading: action.value };
    case 'SET_MY_DESK':
      return { ...state, myDesk: action.myDesk };
    case 'MARK_SAVED':
      return { ...state, savedUnits: state.units, unsavedChanges: 0 };
    case 'DISCARD_CHANGES':
      return { ...state, units: state.savedUnits, unsavedChanges: 0, ...resetSelectionState(state) };
    case 'SET_PENDING_MODE_SWITCH':
      return { ...state, pendingModeSwitch: action.mode };

    case 'RESET_DEMO':
      return { ...state, units: action.units, savedUnits: action.units, unsavedChanges: 0, assignments: action.assignments, bookings: action.bookings, selected: null, draft: [], calib: [] };

    default:
      return state;
  }
}

export function initialViewForStage(w: number, h: number) {
  return fitView(w, h);
}

export function clampMinutes(v: number): number {
  return clamp(v, 0, 1439);
}

export { seedBookings };
