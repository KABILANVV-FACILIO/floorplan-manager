import type {
  AppMode,
  Assignments,
  Booking,
  EditTool,
  Employee,
  PanelsState,
  Perms,
  PlanId,
  Role,
  Site,
  Unit,
  UnitType,
} from '../lib/types';
import type { ViewTransform } from '../lib/geometry';

export type SpaceFilter = 'all' | UnitType;

export interface AppState {
  mode: AppMode;
  tool: EditTool;
  floorId: string;
  planId: PlanId;
  expanded: Record<string, boolean>;
  navOpen: boolean;
  navView: 'tree' | 'spaces';
  panels: PanelsState;
  stage: { w: number; h: number };
  view: ViewTransform;
  viewAnim: boolean;
  userZoomed: boolean;
  spaceFilter: SpaceFilter;
  spaceSearch: string;

  units: Unit[];
  /** Snapshot of `units` as of the last explicit save (floor load, "Save changes", or a resolved discard) — the revert target for "Discard changes". */
  savedUnits: Unit[];
  /** Count of unit edits (place/update/delete) since the last save — drives the floating "N unsaved changes" bar and the save/discard prompt on mode switch. */
  unsavedChanges: number;
  /** Mode the user tried to switch to while there were unsaved edit changes — set while the save/discard confirmation is open. */
  pendingModeSwitch: AppMode | null;
  assignments: Assignments;
  bookings: Booking[];
  employees: Employee[];
  portfolio: Site[];
  pxPerMeter: number | null;
  loading: boolean;
  dataSourceName: string | null;

  selected: string | null;
  /** Unit to visually pulse for ~2s (e.g. after "My desk" jumps to it) — separate from `selected`, which also opens the info panel. */
  highlightUnitId: string | null;
  draft: [number, number][];
  calib: [number, number][];
  calibLen: string;
  empSearch: string;
  dragEmpId: string | null;
  dragOverId: string | null;

  date: string;
  start: number;
  end: number;
  bookBy: string;
  bookPurpose: string;
  bookNotes: string;
  bookModalOpen: boolean;
  /** The booking form's current target (resource + window). When set, the shared BookingModal is open. Both the calendar and the sidebar populate this. */
  bookForm: { unitId: string; date: string; start: number; end: number } | null;
  /** Which real Facilio module bookings target. Mutually exclusive — set in Settings. */
  bookingModule: 'space' | 'facility';
  /** Bumped on every booking add/cancel so surfaces holding their own booking cache (the calendar) know to refetch. */
  bookingsNonce: number;
  webReassign: string | null;
  schedView: 'list' | 'calendar';

  role: Role;
  perms: Perms;

  activeView: 'map' | 'settings' | 'bookings' | 'people';
  settingsTab: 'permissions' | 'bookings' | UnitType;
  moduleColors: Record<string, string>;
  slotGranularity: number;

  toast: string | null;

  mobileTab: 'book' | 'assign';
  mobSel: string | null;
  mobPickSite: string | null;
  mobPickBuilding: string | null;
  mobFloorOpen: boolean;
  mobTimePick: 'start' | 'end' | null;
  mobAssignEdit: boolean;

  uploadOpen: boolean;
  /** The logged-in user's real assigned/booked desk (from servicePortalHome) — powers "My desk" against the real backend, where `assignments` (mock-derived) can't. */
  myDesk: { recordId: number; name: string; floorId: string | null; booked: boolean } | null;
  floorImages: Record<string, string>;
  /** Which plan types actually have a configured floor plan, fetched lazily per-floor on selection (not eagerly for the whole portfolio). */
  floorPlanTypes: Record<string, { id: PlanId; name: string; recordId: number }[]>;
  /** True while a floor/plan-type's real image (or the plan-type list) is being fetched — drives the loading overlay over the canvas. */
  floorImageLoading: boolean;
}
