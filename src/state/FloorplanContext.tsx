import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Dispatch, MutableRefObject, ReactNode } from 'react';
import { dataSource } from '../lib/dataSource';
import { PORTFOLIO as MOCK_PORTFOLIO, EMPLOYEES as MOCK_EMPLOYEES, seedBookings, seedUnits, seedAssignments } from '../lib/mockData';
import { floorImageKey, TYPE_META } from '../lib/types';
import type { Booking, PlanId, Role, Site, Unit } from '../lib/types';
import { isFacilioApiConfigured } from '../lib/facilioApi';
import { assignUnitReal, createRealBooking, fetchFloorplanImage, fetchMyDesk, findUnitIdForDeskRecord, getFloorPlanSummary, saveFloorplanMarkers, vacateUnitReal } from '../lib/facilioApiDataSource';
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

/**
 * Explicit-save chokepoint ONLY — local per-action edits (place/update/delete/close-draft) call
 * `dataSource.saveUnits` directly and stop there; this additionally pushes real
 * `floorplanmarker`/`indoorfloorplan` sync, and is deliberately reserved for "Save changes" /
 * mode-switch confirm / discard / reset, not every micro-edit. Syncing markers on every drag or
 * click was real, measured overhead (re-fetching indoorfloorplan geometry + the full marker list
 * per configured plan type, on every single edit) with no benefit — the real backend only needs
 * to reflect the floor once the user is done editing, same mental model as the "unsaved changes"
 * bar itself. Best-effort: never blocks or throws into the local save it runs alongside.
 */
async function persistUnits(floorId: string, units: Unit[]): Promise<void> {
  const local = dataSource.saveUnits(floorId, units);
  if (isFacilioApiConfigured) {
    saveFloorplanMarkers(floorId, units).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[facilio-api] marker sync failed', err);
    });
  }
  await local;
}

/** First floor found anywhere in the tree — sites/buildings can be empty shells, so this can't assume `portfolio[0].buildings[0].floors[0]`. */
function firstFloorId(portfolio: Site[]): string | undefined {
  for (const site of portfolio) {
    for (const building of site.buildings) {
      if (building.floors[0]) return building.floors[0].id;
    }
  }
  return undefined;
}

/**
 * Fetched lazily for ONE floor at a time (on selection/mount), not eagerly for the whole
 * portfolio. Finds which plan types are actually configured, defaults `planId` to one of them
 * if the current selection isn't among them, then loads that plan's real image.
 */
async function loadFloorPlanTypesAndImage(dispatch: Dispatch<Action>, floorId: string, currentPlanId: PlanId) {
  if (!isFacilioApiConfigured) return;
  dispatch({ type: 'SET_FLOOR_IMAGE_LOADING', value: true });
  try {
    const types = await getFloorPlanSummary(floorId).catch(() => []);
    dispatch({ type: 'SET_FLOOR_PLAN_TYPES', floorId, types });
    if (!types.length) return;

    const resolvedPlanId = types.some((t) => t.id === currentPlanId) ? currentPlanId : types[0].id;
    if (resolvedPlanId !== currentPlanId) dispatch({ type: 'SET_PLAN', planId: resolvedPlanId });

    const imageUrl = await fetchFloorplanImage(floorId, resolvedPlanId).catch(() => null);
    if (imageUrl) dispatch({ type: 'SET_FLOOR_IMAGE', floorId, planId: resolvedPlanId, dataUrl: imageUrl });
  } finally {
    dispatch({ type: 'SET_FLOOR_IMAGE_LOADING', value: false });
  }
}

/**
 * Fetches the image for a floor+plan-type that's already known to be configured but not yet
 * cached in `state.floorImages` — the case hit when the user flips the plan-type switcher to a
 * type other than whichever one `loadFloorPlanTypesAndImage` auto-resolved on floor load.
 */
async function ensureFloorplanImage(dispatch: Dispatch<Action>, floorId: string, planId: PlanId) {
  dispatch({ type: 'SET_FLOOR_IMAGE_LOADING', value: true });
  try {
    const imageUrl = await fetchFloorplanImage(floorId, planId).catch(() => null);
    if (imageUrl) dispatch({ type: 'SET_FLOOR_IMAGE', floorId, planId, dataUrl: imageUrl });
  } finally {
    dispatch({ type: 'SET_FLOOR_IMAGE_LOADING', value: false });
  }
}

function buildActions(state: AppState, dispatch: Dispatch<Action>, canvasRectRef: MutableRefObject<DOMRect | null>) {
  const showToast = (message: string) => {
    dispatch({ type: 'SHOW_TOAST', message });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dispatch({ type: 'SHOW_TOAST', message: null }), 3200);
  };

  async function loadFloor(floorId: string): Promise<Unit[]> {
    dispatch({ type: 'SELECT_FLOOR_START', floorId });
    // Flag the image load NOW, not when loadFloorPlanTypesAndImage eventually starts — the
    // units/assignments/bookings awaits below leave a gap where the stage would otherwise flash
    // a blank canvas before the skeleton appears. Its finally-block still clears the flag.
    if (isFacilioApiConfigured) dispatch({ type: 'SET_FLOOR_IMAGE_LOADING', value: true });
    const [units, assignments, bookings] = await Promise.all([
      dataSource.getUnits(floorId),
      dataSource.getAssignments(floorId),
      dataSource.getBookings(floorId, state.date),
    ]);
    dispatch({ type: 'SELECT_FLOOR_DONE', floorId, units, assignments, bookings });
    loadFloorPlanTypesAndImage(dispatch, floorId, state.planId);
    return units;
  }

  return {
    // Leaving edit mode with unsaved changes prompts to save/discard first rather than
    // switching straight away — auto-save-per-action already persists edits as they happen (see
    // placePoint/updateUnit/deleteUnit/closeDraft below), but the user still needs a chance to
    // discard a half-finished edit rather than have it silently carried into Assign/Book.
    setMode: (mode: AppState['mode']) => {
      if (state.mode === 'edit' && mode !== 'edit' && state.unsavedChanges > 0) {
        dispatch({ type: 'SET_PENDING_MODE_SWITCH', mode });
        return;
      }
      dispatch({ type: 'SET_MODE', mode });
      // Assignment/Booking need the details panel to actually show anything — open it if it's
      // closed, but never close it if it's already open (force-set, not toggle).
      if (mode === 'assign' || mode === 'book') dispatch({ type: 'SET_PANEL_OPEN', id: 'details', open: true });
    },
    toggleEdit: () => {
      if (state.mode === 'edit' && state.unsavedChanges > 0) {
        dispatch({ type: 'SET_PENDING_MODE_SWITCH', mode: 'assign' });
        return;
      }
      dispatch({ type: 'TOGGLE_EDIT' });
    },
    cancelModeSwitch: () => dispatch({ type: 'SET_PENDING_MODE_SWITCH', mode: null }),
    confirmSaveAndSwitch: async () => {
      const target = state.pendingModeSwitch;
      if (!target) return;
      try {
        await persistUnits(state.floorId, state.units);
        dispatch({ type: 'MARK_SAVED' });
      } catch {
        showToast('Could not save changes');
      }
      dispatch({ type: 'SET_MODE', mode: target });
      if (target === 'assign' || target === 'book') dispatch({ type: 'SET_PANEL_OPEN', id: 'details', open: true });
      dispatch({ type: 'SET_PENDING_MODE_SWITCH', mode: null });
    },
    confirmDiscardAndSwitch: async () => {
      const target = state.pendingModeSwitch;
      if (!target) return;
      dispatch({ type: 'DISCARD_CHANGES' });
      // Auto-save already pushed the now-discarded edits to the backing store per action —
      // re-persist the reverted snapshot so it actually matches what's shown after discarding.
      await persistUnits(state.floorId, state.savedUnits).catch(() => {});
      dispatch({ type: 'SET_MODE', mode: target });
      if (target === 'assign' || target === 'book') dispatch({ type: 'SET_PANEL_OPEN', id: 'details', open: true });
      dispatch({ type: 'SET_PENDING_MODE_SWITCH', mode: null });
    },
    setTool: (tool: AppState['tool']) => dispatch({ type: 'SET_TOOL', tool }),
    toggleNav: () => dispatch({ type: 'TOGGLE_NAV' }),
    setNavView: (view: AppState['navView']) => dispatch({ type: 'SET_NAV_VIEW', view }),
    toggleNode: (id: string) => dispatch({ type: 'TOGGLE_NODE', id }),

    selectFloor: (floorId: string) => {
      if (floorId === state.floorId) return;
      loadFloor(floorId);
    },
    setPlan: (planId: PlanId) => {
      dispatch({ type: 'SET_PLAN', planId });
      // Switching to a plan type whose image hasn't been fetched yet on this floor (the common
      // case — loadFloorPlanTypesAndImage only auto-fetches whichever type it resolves to on
      // floor load) needs its own fetch, not just the state flip.
      if (isFacilioApiConfigured && !state.floorImages[floorImageKey(state.floorId, planId)]) {
        ensureFloorplanImage(dispatch, state.floorId, planId);
      }
    },

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

    focusUnit: (id: string, rectW: number, rectH: number, opts?: { select?: boolean }) => {
      const u = unitById(state, id);
      if (!u) return;
      if (u.plan !== state.planId) dispatch({ type: 'SET_PLAN', planId: u.plan });
      const view = focusUnitView(u, rectW, rectH, state.view.z);
      dispatch({ type: 'SET_VIEW', view, animate: true });
      dispatch({ type: 'MARK_USER_ZOOMED', value: true });
      if (opts?.select !== false) dispatch({ type: 'SELECT_UNIT', id });
      // Pulses the marker for ~2s so it's easy to spot after jumping to it — separate from
      // selection, so callers that skip selecting (e.g. "My desk") still get the visual cue.
      dispatch({ type: 'HIGHLIGHT_UNIT', id });
      setTimeout(() => dispatch({ type: 'HIGHLIGHT_UNIT', id: null }), 2000);
      setTimeout(() => dispatch({ type: 'SET_VIEW', view, animate: false }), 380);
    },

    /**
     * "My desk" against the REAL backend: `state.myDesk` (from servicePortalHome) names a desk
     * record + floor. Navigates to that floor, then tries to map the desk record back to a
     * local unit (via its floorplanmarker's geoId) for the zoom+pulse treatment; desks that
     * were never placed through this app have no local unit, so those just land on the floor
     * with a toast.
     */
    locateMyDesk: async (rectW: number, rectH: number) => {
      const md = state.myDesk;
      if (!md?.floorId) return;
      let units: Unit[] = state.units;
      if (md.floorId !== state.floorId) units = await loadFloor(md.floorId);
      const geoId = await findUnitIdForDeskRecord(md.floorId, md.recordId).catch(() => null);
      const u = geoId ? units.find((x) => x.id === geoId) : null;
      if (u) {
        if (u.plan !== state.planId) dispatch({ type: 'SET_PLAN', planId: u.plan });
        const view = focusUnitView(u, rectW, rectH, state.view.z);
        dispatch({ type: 'SET_VIEW', view, animate: true });
        dispatch({ type: 'MARK_USER_ZOOMED', value: true });
        dispatch({ type: 'HIGHLIGHT_UNIT', id: u.id });
        setTimeout(() => dispatch({ type: 'HIGHLIGHT_UNIT', id: null }), 2000);
        setTimeout(() => dispatch({ type: 'SET_VIEW', view, animate: false }), 380);
      } else {
        showToast(`Your desk ${md.name} is on this floor`);
      }
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
      // Best-effort real assignment (Moves for desks, a plain field update for lockers/parking)
      // — never blocks or throws into the local assignment flow above, which is already the
      // source of truth for this app's own read-path.
      if (isFacilioApiConfigured) {
        assignUnitReal(target, employeeId).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[facilio-api] real assignment failed', err);
        });
      }
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
      if (isFacilioApiConfigured && target && prevEmpId) {
        vacateUnitReal(target, prevEmpId).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[facilio-api] real vacate failed', err);
        });
      }
      const prevName = prevEmpId ? MOCK_EMPLOYEES.find((e) => e.id === prevEmpId)?.name : null;
      if (target) showToast(`${target.label} vacated` + (prevName ? ` — ${prevName} unassigned` : ''));
    },
    setWebReassign: (id: string | null) => {
      dispatch({ type: 'SET_WEB_REASSIGN', id });
      // The reassign UI lives in the details panel — starting a reassign (e.g. from a marker
      // tooltip) while that panel is minimized would otherwise leave the action with nowhere
      // to show. Force it open (never close it) so the flow is always visible.
      if (id) dispatch({ type: 'SET_PANEL_OPEN', id: 'details', open: true });
    },

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

    /** Which real module bookings target (Space vs Facility) — mutually exclusive, set in Settings. */
    setBookingModule: (module: AppState['bookingModule']) => dispatch({ type: 'SET_BOOKING_MODULE', module }),
    /** Opens the shared booking form for a resource + window (used by the calendar drag and the book sidebar). */
    openBookingForm: (target: { unitId: string; date: string; start: number; end: number }) => dispatch({ type: 'SET_BOOK_FORM', form: target }),
    updateBookForm: (patch: Partial<{ unitId: string; date: string; start: number; end: number }>) => dispatch({ type: 'UPDATE_BOOK_FORM', patch }),
    closeBookingForm: () => dispatch({ type: 'SET_BOOK_FORM', form: null }),
    /**
     * Submits the booking form. Saves locally (survives reload) AND best-effort creates the real
     * backend booking routed by `state.bookingModule` (space -> spacebooking; facility -> TODO).
     *
     * LOCAL-BOOKING-FALLBACK: the `dataSource.createBooking` + ADD_BOOKING path below is the
     * interim local store. Once real spacebooking/facilitybooking is the source of truth for
     * every floor, delete this local branch (and the mock booking tier) and read/write bookings
     * straight from the real module. It's isolated here so removal is a clean, single-site edit.
     */
    submitBooking: async (form: {
      unitId: string;
      date: string;
      start: number;
      end: number;
      name: string;
      description: string;
      host: string;
      reservedBy: string;
      noOfAttendees: number;
      internalAttendees: string[];
      externalAttendees: string[];
    }): Promise<boolean> => {
      const unit = unitById(state, form.unitId);
      if (!unit || form.end <= form.start) {
        showToast('Pick a valid time window');
        return false;
      }
      // Conflict-check against the resource's real slice for that exact date (the form can target
      // any date, so re-fetch rather than trust the single-date `state.bookings`).
      const dayBookings = await dataSource.getBookings(state.floorId, form.date).catch(() => [] as Booking[]);
      if (conflictsFor(dayBookings, form.unitId, form.date, form.start, form.end).length) {
        showToast('That window overlaps an existing booking');
        return false;
      }

      // --- LOCAL-BOOKING-FALLBACK (remove once real modules are the source of truth) ---
      const local: Booking = {
        id: 'b' + Date.now(),
        unitId: form.unitId,
        date: form.date,
        start: form.start,
        end: form.end,
        by: form.reservedBy || form.host || state.bookBy,
        purpose: form.name,
      };
      const saved = await dataSource.createBooking(local);
      dispatch({ type: 'ADD_BOOKING', booking: saved });
      // --- end LOCAL-BOOKING-FALLBACK ---

      if (isFacilioApiConfigured) {
        createRealBooking(unit, form.date, form.start, form.end, {
          module: state.bookingModule,
          name: form.name,
          description: form.description,
          host: form.host,
          reservedBy: form.reservedBy,
          noOfAttendees: form.noOfAttendees,
          internalAttendees: form.internalAttendees,
          externalAttendees: form.externalAttendees,
        })
          .then((res) => {
            if (!res.ok) {
              // eslint-disable-next-line no-console
              console.warn(`[facilio-api] real ${state.bookingModule} booking skipped/failed: ${res.reason}`);
            }
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[facilio-api] real booking error', err);
          });
      }

      showToast(`${unit.label} booked`);
      return true;
    },
    /**
     * Books a resource for an explicit date/time window — the calendar view drags out arbitrary
     * windows on arbitrary days, which doesn't fit `confirmBooking`'s reliance on the shared
     * `state.start/end/date`. Returns the saved booking (persisted via the data source, so it
     * survives reload) or null on an invalid/conflicting window. Conflict-checking is the
     * caller's job (the calendar holds the multi-day booking data; `state.bookings` is only the
     * single selected date).
     */
    bookResource: async (input: { unitId: string; date: string; start: number; end: number; by: string; purpose?: string }): Promise<Booking | null> => {
      if (input.end <= input.start) return null;
      const booking: Booking = {
        id: 'b' + Date.now(),
        unitId: input.unitId,
        date: input.date,
        start: input.start,
        end: input.end,
        by: input.by,
        purpose: input.purpose ?? '',
      };
      const saved = await dataSource.createBooking(booking);
      dispatch({ type: 'ADD_BOOKING', booking: saved });
      showToast(`${unitById(state, input.unitId)?.label ?? 'Space'} booked`);
      return saved;
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
    openBookings: () => dispatch({ type: 'SET_ACTIVE_VIEW', view: 'bookings' }),
    openPeople: () => dispatch({ type: 'SET_ACTIVE_VIEW', view: 'people' }),
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

    setMobileTab: (tab: AppState['mobileTab']) => dispatch({ type: 'SET_MOBILE_TAB', tab }),
    setMobSel: (id: string | null) => dispatch({ type: 'SET_MOB_SEL', id }),
    setMobFloorOpen: (open: boolean) => dispatch({ type: 'SET_MOB_FLOOR_OPEN', open }),
    setMobPick: (site: string | null, building: string | null) => dispatch({ type: 'SET_MOB_PICK', site, building }),
    setMobTimePick: (which: AppState['mobTimePick']) => dispatch({ type: 'SET_MOB_TIME_PICK', which }),
    setMobAssignEdit: (value: boolean) => dispatch({ type: 'SET_MOB_ASSIGN_EDIT', value }),

    setUploadOpen: (open: boolean) => dispatch({ type: 'SET_UPLOAD_OPEN', open }),
    setFloorImage: (floorId: string, planId: PlanId, dataUrl: string) => dispatch({ type: 'SET_FLOOR_IMAGE', floorId, planId, dataUrl }),

    resetDemo: () => {
      const units = seedUnits();
      const assignments = seedAssignments();
      const bookings = seedBookings(state.date);
      dispatch({ type: 'RESET_DEMO', units, assignments, bookings });
      persistUnits(state.floorId, units);
      showToast('Demo data reset');
    },

    /**
     * Edits already persist per-action (placePoint/updateUnit/deleteUnit/closeDraft all call
     * persistUnits internally) — this is an explicit, user-triggered re-save with its own
     * confirmation, for a visible "did my changes actually save" signal.
     */
    saveChanges: async () => {
      try {
        await persistUnits(state.floorId, state.units);
        dispatch({ type: 'MARK_SAVED' });
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

      // The mock default floorId ('hqA3') isn't a real floor against the live backend —
      // sending it to per-floor endpoints (getFloorplanDetailsByType) just 500s. Start on the
      // real portfolio's actual first floor instead, when one's available.
      const firstRealFloor = isFacilioApiConfigured ? firstFloorId(portfolio) : undefined;
      const floorId = firstRealFloor ?? state.floorId;
      if (floorId !== state.floorId) dispatch({ type: 'SELECT_FLOOR_START', floorId });

      const [units, assignments, bookings] = await Promise.all([
        dataSource.getUnits(floorId),
        dataSource.getAssignments(floorId),
        dataSource.getBookings(floorId, state.date),
      ]);
      dispatch({ type: 'SELECT_FLOOR_DONE', floorId, units, assignments, bookings });
      loadFloorPlanTypesAndImage(dispatch, floorId, state.planId);

      // The logged-in user's real assigned/booked desk, for the "My desk" button. Best-effort:
      // the endpoint resolves the employee from the session and may not be reachable for every
      // token — absence just means the button stays hidden (unless mock assignments provide one).
      if (isFacilioApiConfigured) {
        fetchMyDesk()
          .then((myDesk) => dispatch({ type: 'SET_MY_DESK', myDesk }))
          .catch(() => {});
      }
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
