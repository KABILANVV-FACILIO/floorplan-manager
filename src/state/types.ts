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
import type { CadGroup } from '../lib/cadAnalyze';

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
  /**
   * Desk/locker/parking records that exist but aren't placed on the plan: deleting a placed
   * marker moves its record here (the desk itself isn't destroyed), and the edit-mode map
   * dialog / sidebar drag place them back. In-memory only for now — a refresh rebuilds it empty.
   */
  unplacedUnits: Unit[];
  /** A click-to-place spot awaiting the "which desk goes here?" map dialog (edit mode). */
  pendingPlacement: { type: 'workstation' | 'locker' | 'parking'; x: number; y: number } | null;
  /** Snapshot of `units` as of the last explicit save (floor load, "Save changes", or a resolved discard) — the revert target for "Discard changes". */
  savedUnits: Unit[];
  /**
   * DISTINCT unsaved changes since the last save, derived by diffing `units` vs `savedUnits`
   * (see countUnsavedChanges): per unit — any module type — a geometry move counts once no
   * matter how many drags, a value edit counts once more, adds/deletes one each. Drives the
   * floating "N unsaved changes" bar and the save/discard prompt on mode switch.
   */
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
  /** Mappable structure of the last-uploaded CAD file — non-null while the auto-map modal is open. */
  autoMapGroups: CadGroup[] | null;
  /** Per floor/plan (floorImageKey) CAD analysis kept for the session, so the Edit panel can re-open auto-map without re-uploading. */
  cadAnalyses: Record<string, CadGroup[]>;
  /** The logged-in user's real assigned/booked desk (from servicePortalHome) — powers "My desk" against the real backend, where `assignments` (mock-derived) can't. */
  myDesk: { recordId: number; name: string; floorId: string | null; booked: boolean } | null;
  floorImages: Record<string, string>;
  /** Which plan types actually have a configured floor plan, fetched lazily per-floor on selection (not eagerly for the whole portfolio). */
  floorPlanTypes: Record<string, { id: PlanId; name: string; recordId: number }[]>;
  /** True while a floor/plan-type's real image (or the plan-type list) is being fetched — drives the loading overlay over the canvas. */
  floorImageLoading: boolean;
}
