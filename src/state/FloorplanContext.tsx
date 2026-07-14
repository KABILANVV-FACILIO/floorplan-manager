import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Dispatch, MutableRefObject, ReactNode } from 'react';
import { dataSource } from '../lib/dataSource';
import { PORTFOLIO as MOCK_PORTFOLIO, EMPLOYEES as MOCK_EMPLOYEES, seedBookings, seedUnits, seedAssignments } from '../lib/mockData';
import { TYPE_META } from '../lib/types';
import type { Booking, PlanId, Role, Unit } from '../lib/types';
import { buildInitialState, reducer } from './reducer';
import type { Action } from './reducer';
import type { AppState } from './types';
import { conflictsFor, isAssignable, nextLabel, unitById } from './selectors';
import { calibratedPxPerMeter, clampPanelPos, defaultPanelPos, distNormToPx, fitView as fitViewFn, focusUnitView, pointInPoly, zoomAt as zoomAtFn } from '../lib/geometry';

interface Ctx {
  state: AppState;
  actions: ReturnType<typeof buildActions>;
}

const FloorplanCtx = createContext<Ctx | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function buildActions(state: AppState, dispatch: Dispatch<Action>, canvasRectRef: MutableRefObject<DOMRect | null>) {
  const showToast = (message: string) => {
    dispatch({ type: 'SHOW_TOAST', message });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dispatch({ type: 'SHOW_TOAST', message: null }), 3200);
  };

  async function loadFloor(floorId: string) {
    dispatch({ type: 'SELECT_FLOOR_START', floorId });
    const [units, assignments, bookings] = await Promise.all([
      dataSource.getUnits(floorId),
      dataSource.getAssignments(floorId),
      dataSource.getBookings(floorId, state.date),
    ]);
    dispatch({ type: 'SELECT_FLOOR_DONE', floorId, units, assignments, bookings });
  }

  return {
    setMode: (mode: AppState['mode']) => dispatch({ type: 'SET_MODE', mode }),
    toggleEdit: () => dispatch({ type: 'TOGGLE_EDIT' }),
    setTool: (tool: AppState['tool']) => dispatch({ type: 'SET_TOOL', tool }),
    toggleNav: () => dispatch({ type: 'TOGGLE_NAV' }),
    setNavView: (view: AppState['navView']) => dispatch({ type: 'SET_NAV_VIEW', view }),
    toggleNode: (id: string) => dispatch({ type: 'TOGGLE_NODE', id }),

    selectFloor: (floorId: string) => {
      if (floorId === state.floorId) return;
      loadFloor(floorId);
    },
    setPlan: (planId: PlanId) => dispatch({ type: 'SET_PLAN', planId }),

    setStageSize: (w: number, h: number) => dispatch({ type: 'SET_STAGE_SIZE', w, h }),

    fitView: (rectW: number, rectH: number) => {
      dispatch({ type: 'MARK_USER_ZOOMED', value: false });
      dispatch({ type: 'SET_VIEW', view: fitViewFn(rectW, rectH) });
    },
    zoomIn: (rectW: number, rectH: number) => {
      dispatch({ type: 'MARK_USER_ZOOMED', value: true });
      dispatch({ type: 'SET_VIEW', view: zoomAtFn(state.view, 1.3, rectW / 2, rectH / 2) });
    },
    zoomOut: (rectW: number, rectH: number) => {
      dispatch({ type: 'MARK_USER_ZOOMED', value: true });
      dispatch({ type: 'SET_VIEW', view: zoomAtFn(state.view, 1 / 1.3, rectW / 2, rectH / 2) });
    },
    zoomAtPoint: (factor: number, cx: number, cy: number) => {
      dispatch({ type: 'MARK_USER_ZOOMED', value: true });
      dispatch({ type: 'SET_VIEW', view: zoomAtFn(state.view, factor, cx, cy) });
    },
    setView: (view: AppState['view']) => dispatch({ type: 'SET_VIEW', view }),

    focusUnit: (id: string, rectW: number, rectH: number) => {
      const u = unitById(state, id);
      if (!u) return;
      if (u.plan !== state.planId) dispatch({ type: 'SET_PLAN', planId: u.plan });
      const view = focusUnitView(u, rectW, rectH, state.view.z);
      dispatch({ type: 'SET_VIEW', view, animate: true });
      dispatch({ type: 'MARK_USER_ZOOMED', value: true });
      dispatch({ type: 'SELECT_UNIT', id });
      setTimeout(() => dispatch({ type: 'SET_VIEW', view, animate: false }), 380);
    },

    setSpaceFilter: (filter: AppState['spaceFilter']) => dispatch({ type: 'SET_SPACE_FILTER', filter }),
    setSpaceSearch: (value: string) => dispatch({ type: 'SET_SPACE_SEARCH', value }),

    selectUnit: (id: string | null) => dispatch({ type: 'SELECT_UNIT', id }),

    placePoint: (type: 'workstation' | 'locker' | 'parking', x: number, y: number) => {
      const rooms = state.units.filter((u) => u.type === 'room');
      const room = rooms.find((r) => r.geom.kind === 'poly' && pointInPoly({ x, y }, r.geom.pts));
      const prefix = TYPE_META[type].prefix;
      const label = nextLabel(state, type, prefix);
      const unit: Unit = {
        id: 'u' + Date.now(),
        type,
        label,
        secondary: type === 'workstation' ? 'Standard · single monitor' : undefined,
        room: room ? room.label : null,
        geom: { kind: 'point', x, y },
        floor: state.floorId,
        plan: type,
      };
      dispatch({ type: 'ADD_UNIT', unit });
      dataSource.saveUnits(state.floorId, [...state.units, unit]);
      showToast(`${label} added`);
    },
    pushDraftPoint: (pt: [number, number]) => dispatch({ type: 'PUSH_DRAFT_POINT', pt }),
    closeDraft: () => {
      if (state.draft.length < 3) return;
      const label = nextLabel(state, 'room', 'RM');
      const unit: Unit = {
        id: 'u' + Date.now(),
        type: 'room',
        label,
        room: null,
        geom: { kind: 'poly', pts: state.draft },
        floor: state.floorId,
        plan: 'custom',
      };
      dispatch({ type: 'CLOSE_DRAFT', unit });
      dataSource.saveUnits(state.floorId, [...state.units, unit]);
      showToast(`${label} created — rename it in the Selection panel`);
    },
    clearDraft: () => dispatch({ type: 'CLEAR_DRAFT' }),
    isNearFirstDraftPoint: (pt: [number, number]) => {
      if (state.draft.length < 3) return false;
      return distNormToPx(state.draft[0], pt, state.view.z) < 12;
    },

    pushCalibPoint: (pt: [number, number]) => dispatch({ type: 'PUSH_CALIB_POINT', pt }),
    setCalibLen: (value: string) => dispatch({ type: 'SET_CALIB_LEN', value }),
    applyCalib: () => {
      const meters = parseFloat(state.calibLen);
      if (!(meters > 0) || state.calib.length !== 2) return;
      const ppm = calibratedPxPerMeter(state.calib[0], state.calib[1], meters);
      dispatch({ type: 'APPLY_CALIB', pxPerMeter: ppm });
      dataSource.saveUnits(state.floorId, state.units); // units unaffected, but keep persistence consistent
      showToast(`Scale set — ${ppm.toFixed(1)} px/m`);
    },
    clearCalib: () => dispatch({ type: 'CLEAR_CALIB' }),

    updateUnit: (id: string, patch: Partial<Unit>) => {
      dispatch({ type: 'UPDATE_UNIT', id, patch });
      dataSource.saveUnits(state.floorId, state.units.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    },
    deleteUnit: (id: string) => {
      const u = unitById(state, id);
      dispatch({ type: 'DELETE_UNIT', id });
      dataSource.saveUnits(state.floorId, state.units.filter((x) => x.id !== id));
      if (u) showToast(`${u.label} deleted`);
    },

    setEmpSearch: (value: string) => dispatch({ type: 'SET_EMP_SEARCH', value }),
    dragStartEmp: (id: string | null) => dispatch({ type: 'DRAG_START_EMP', id }),
    dragOverUnit: (id: string | null) => dispatch({ type: 'DRAG_OVER_UNIT', id }),

    assign: async (employeeId: string, unitId: string) => {
      const target = unitById(state, unitId);
      if (!target) return;
      const next = { ...state.assignments };
      // one unit per type per employee
      for (const [uid, empId] of Object.entries(next)) {
        if (empId === employeeId && uid !== unitId) {
          const other = unitById(state, uid);
          if (other && other.type === target.type) delete next[uid];
        }
      }
      const prevEmpId = next[unitId];
      next[unitId] = employeeId;
      dispatch({ type: 'ASSIGN', unitId, employeeId, assignments: next });
      await dataSource.assignUnit(unitId, employeeId);
      const empName = MOCK_EMPLOYEES.find((e) => e.id === employeeId)?.name ?? employeeId;
      const prevName = prevEmpId ? MOCK_EMPLOYEES.find((e) => e.id === prevEmpId)?.name : null;
      showToast(`${empName} assigned to ${target.label}` + (prevName ? ` — replaced ${prevName}` : ''));
    },
    vacate: async (unitId: string) => {
      const target = unitById(state, unitId);
      const prevEmpId = state.assignments[unitId];
      const next = { ...state.assignments };
      delete next[unitId];
      dispatch({ type: 'VACATE', unitId, assignments: next });
      await dataSource.vacateUnit(unitId);
      const prevName = prevEmpId ? MOCK_EMPLOYEES.find((e) => e.id === prevEmpId)?.name : null;
      if (target) showToast(`${target.label} vacated` + (prevName ? ` — ${prevName} unassigned` : ''));
    },
    setWebReassign: (id: string | null) => dispatch({ type: 'SET_WEB_REASSIGN', id }),

    setDate: async (value: string) => {
      const bookings = await dataSource.getBookings(state.floorId, value);
      dispatch({ type: 'SET_DATE', value, bookings });
    },
    setTimeRange: (start: number, end: number) => dispatch({ type: 'SET_TIME_RANGE', start, end }),
    openBookModal: () => dispatch({ type: 'SET_BOOK_MODAL', open: true }),
    closeBookModal: () => dispatch({ type: 'SET_BOOK_MODAL', open: false }),
    setBookField: (field: 'bookBy' | 'bookPurpose' | 'bookNotes', value: string) => dispatch({ type: 'SET_BOOK_FIELD', field, value }),
    confirmBooking: async (unitId: string) => {
      const conflicts = conflictsFor(state.bookings, unitId, state.date, state.start, state.end);
      if (state.end <= state.start || conflicts.length) return false;
      const booking: Booking = {
        id: 'b' + Date.now(),
        unitId,
        date: state.date,
        start: state.start,
        end: state.end,
        by: state.bookBy,
        purpose: state.bookPurpose,
      };
      const saved = await dataSource.createBooking(booking);
      dispatch({ type: 'ADD_BOOKING', booking: saved });
      showToast(`${unitById(state, unitId)?.label ?? 'Space'} booked`);
      return true;
    },
    cancelBooking: (id: string) => {
      dispatch({ type: 'CANCEL_BOOKING', id });
      showToast('Booking cancelled');
    },
    quickMobileBook: async (unitId: string) => {
      const u = unitById(state, unitId);
      if (!u || u.type === 'locker') return;
      if (state.end <= state.start) return;
      if (conflictsFor(state.bookings, unitId, state.date, state.start, state.end).length) return;
      const booking: Booking = {
        id: 'b' + Date.now(),
        unitId,
        date: state.date,
        start: state.start,
        end: state.end,
        by: state.bookBy,
        purpose: 'Booked from mobile',
      };
      const saved = await dataSource.createBooking(booking);
      dispatch({ type: 'ADD_BOOKING', booking: saved });
      dispatch({ type: 'SET_MOB_SEL', id: null });
      showToast(`${u.label} booked · ${Math.floor(state.start / 60)}:${String(state.start % 60).padStart(2, '0')}`);
    },
    setSchedView: (view: AppState['schedView']) => dispatch({ type: 'SET_SCHED_VIEW', view }),

    setRole: (role: Role) => {
      dispatch({ type: 'SET_ROLE', role });
      showToast(`Viewing as ${role[0].toUpperCase()}${role.slice(1)}`);
    },
    togglePerm: (action: keyof AppState['perms'], role: Role) => dispatch({ type: 'TOGGLE_PERM', action, role }),
    resetPerms: () => {
      dispatch({ type: 'RESET_PERMS' });
      showToast('Permissions reset to defaults');
    },

    openMap: () => dispatch({ type: 'SET_ACTIVE_VIEW', view: 'map' }),
    openSettings: () => dispatch({ type: 'SET_ACTIVE_VIEW', view: 'settings' }),
    setSettingsTab: (tab: AppState['settingsTab']) => dispatch({ type: 'SET_SETTINGS_TAB', tab }),
    setModuleColor: (key: string, hex: string) => dispatch({ type: 'SET_MODULE_COLOR', key, hex }),
    setSlotGranularity: (minutes: number) => dispatch({ type: 'SET_SLOT_GRANULARITY', minutes }),

    showToast,

    togglePanelOpen: (id: 'context' | 'portfolio' | 'details') => dispatch({ type: 'TOGGLE_PANEL_OPEN', id }),
    setPanelPos: (id: 'context' | 'portfolio' | 'details', x: number, y: number, width: number) => {
      const clamped = clampPanelPos(x, y, width, state.stage.w, state.stage.h);
      dispatch({ type: 'SET_PANEL_POS', id, x: clamped.x, y: clamped.y });
    },
    resetLayout: () => {
      dispatch({ type: 'RESET_LAYOUT' });
      showToast('Panel layout reset');
    },
    panelPos: (id: 'context' | 'portfolio' | 'details', width: number) => {
      const p = state.panels[id];
      const d = defaultPanelPos(id === 'portfolio' ? 'location' : 'details', state.stage.w);
      const open = p.open;
      const w = open ? width : 46;
      const x = p.x == null ? d.x : p.x;
      const y = p.y == null ? d.y : p.y;
      return clampPanelPos(x, y, w, state.stage.w, state.stage.h);
    },

    toggleMobile: () => dispatch({ type: 'TOGGLE_MOBILE' }),
    setMobileTab: (tab: AppState['mobileTab']) => dispatch({ type: 'SET_MOBILE_TAB', tab }),
    setMobSel: (id: string | null) => dispatch({ type: 'SET_MOB_SEL', id }),
    setMobFloorOpen: (open: boolean) => dispatch({ type: 'SET_MOB_FLOOR_OPEN', open }),
    setMobPick: (site: string | null, building: string | null) => dispatch({ type: 'SET_MOB_PICK', site, building }),
    setMobTimePick: (which: AppState['mobTimePick']) => dispatch({ type: 'SET_MOB_TIME_PICK', which }),
    setMobAssignEdit: (value: boolean) => dispatch({ type: 'SET_MOB_ASSIGN_EDIT', value }),

    setUploadOpen: (open: boolean) => dispatch({ type: 'SET_UPLOAD_OPEN', open }),
    setFloorImage: (floorId: string, dataUrl: string) => dispatch({ type: 'SET_FLOOR_IMAGE', floorId, dataUrl }),

    resetDemo: () => {
      const units = seedUnits();
      const assignments = seedAssignments();
      const bookings = seedBookings(state.date);
      dispatch({ type: 'RESET_DEMO', units, assignments, bookings });
      dataSource.saveUnits(state.floorId, units);
      showToast('Demo data reset');
    },

    /**
     * Edits already persist per-action (placePoint/updateUnit/deleteUnit/closeDraft all call
     * dataSource.saveUnits internally) — this is an explicit, user-triggered re-save with its
     * own confirmation, for a visible "did my changes actually save" signal.
     */
    saveChanges: async () => {
      try {
        await dataSource.saveUnits(state.floorId, state.units);
        showToast('Changes saved');
      } catch (err) {
        showToast('Could not save changes');
      }
    },
  };
}

export function FloorplanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const canvasRectRef = useRef<DOMRect | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const [portfolio, employees] = await Promise.all([
        dataSource.getPortfolio().catch(() => MOCK_PORTFOLIO),
        dataSource.getEmployees().catch(() => MOCK_EMPLOYEES),
      ]);
      dispatch({ type: 'PORTFOLIO_LOADED', portfolio, employees });
      const [units, assignments, bookings] = await Promise.all([
        dataSource.getUnits(state.floorId),
        dataSource.getAssignments(state.floorId),
        dataSource.getBookings(state.floorId, state.date),
      ]);
      dispatch({ type: 'SELECT_FLOOR_DONE', floorId: state.floorId, units, assignments, bookings });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo(() => buildActions(state, dispatch, canvasRectRef), [state]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <FloorplanCtx.Provider value={value}>{children}</FloorplanCtx.Provider>;
}

export function useFloorplan(): Ctx {
  const ctx = useContext(FloorplanCtx);
  if (!ctx) throw new Error('useFloorplan must be used within FloorplanProvider');
  return ctx;
}
