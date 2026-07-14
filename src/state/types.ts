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
  assignments: Assignments;
  bookings: Booking[];
  employees: Employee[];
  portfolio: Site[];
  pxPerMeter: number | null;
  loading: boolean;
  dataSourceName: string | null;

  selected: string | null;
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
  webReassign: string | null;
  schedView: 'list' | 'calendar';

  role: Role;
  perms: Perms;

  activeView: 'map' | 'settings';
  settingsTab: 'permissions' | UnitType;
  moduleColors: Record<string, string>;
  slotGranularity: number;

  toast: string | null;

  mobileOpen: boolean;
  mobileTab: 'book' | 'assign';
  mobSel: string | null;
  mobPickSite: string | null;
  mobPickBuilding: string | null;
  mobFloorOpen: boolean;
  mobTimePick: 'start' | 'end' | null;
  mobAssignEdit: boolean;

  uploadOpen: boolean;
  floorImages: Record<string, string>;
}
