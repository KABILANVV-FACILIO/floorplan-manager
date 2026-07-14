import { useFloorplan } from '../../state/FloorplanContext';
import { employeeName } from '../../state/selectors';
import { unitSortCompare } from '../../lib/geometry';
import { unitStatus } from '../../lib/unitStatus';
import { Chip } from '../primitives/Chip';
import { SkeletonRows } from '../primitives/Skeleton';
import { StatusPill } from '../primitives/StatusPill';
import type { SpaceFilter } from '../../state/types';
import type { Unit } from '../../lib/types';
import styles from './SpacesList.module.css';

const FILTERS: { id: SpaceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'workstation', label: 'Desks' },
  { id: 'locker', label: 'Lockers' },
  { id: 'room', label: 'Rooms' },
  { id: 'parking', label: 'Parking' },
];

export function SpacesList() {
  const { state, actions } = useFloorplan();
  const units = state.units;

  const counts: Record<string, number> = { all: units.length };
  for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1;

  const q = state.spaceSearch.trim().toLowerCase();
  const filtered = units
    .filter((u) => state.spaceFilter === 'all' || u.type === state.spaceFilter)
    .filter((u) => !q || u.label.toLowerCase().includes(q) || (u.room ?? '').toLowerCase().includes(q) || (u.secondary ?? '').toLowerCase().includes(q))
    .sort(unitSortCompare);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <span className={styles.title}>Spaces on this floor</span>
          <span className={styles.total}>{units.length}</span>
        </div>
        <div className={styles.searchBox}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className={styles.searchInput}
            value={state.spaceSearch}
            onChange={(e) => actions.setSpaceSearch(e.target.value)}
            placeholder="Search this floor"
          />
          {state.spaceSearch && (
            <button className={styles.clearBtn} title="Clear" onClick={() => actions.setSpaceSearch('')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className={styles.chips}>
          {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0).map((f) => (
            <Chip key={f.id} active={state.spaceFilter === f.id} count={counts[f.id] || 0} onClick={() => actions.setSpaceFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className={styles.list}>
        {state.loading ? (
          <SkeletonRows rows={7} />
        ) : (
          <>
            {filtered.map((u) => (
              <SpaceRow key={u.id} unit={u} />
            ))}
            {filtered.length === 0 && <div className={styles.empty}>No spaces match this filter.</div>}
          </>
        )}
        {state.mode === 'edit' && state.unplacedUnits.length > 0 && (
          <>
            <div className={styles.headRow} style={{ marginTop: 10, padding: '0 2px' }}>
              <span className={styles.title}>Unplaced</span>
              <span className={styles.total}>{state.unplacedUnits.length}</span>
            </div>
            {state.unplacedUnits.map((u) => (
              <SpaceRow key={u.id} unit={u} unplaced />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SpaceRow({ unit, unplaced }: { unit: Unit; unplaced?: boolean }) {
  const { state, actions } = useFloorplan();
  const status = unitStatus(state, unit, (id) => employeeName(state, id));
  const dotColorMap: Record<Unit['type'], string> = {
    workstation: 'var(--blue-500)',
    room: 'rgba(60,34,157,0.62)',
    locker: 'var(--brand-indigo-600)',
    parking: 'var(--ink-600)',
    amenity: 'var(--ink-500)',
  };
  // In edit mode, desk/locker/parking rows can be dragged onto the canvas: an unplaced record
  // gets placed at the drop point, a placed one is repositioned (see Canvas onDrop).
  const draggable = state.mode === 'edit' && unit.type !== 'room';
  return (
    <div
      className={styles.row}
      style={unplaced ? { opacity: 0.75, borderStyle: 'dashed' } : undefined}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData('application/x-floorplan-unit', unit.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
      onClick={unplaced ? undefined : () => actions.focusUnit(unit.id, state.stage.w, state.stage.h)}
      title={draggable ? 'Drag onto the floorplan to place' : undefined}
    >
      <span className={styles.dot} style={{ background: dotColorMap[unit.type] }} />
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{unit.label}</div>
        <div className={styles.rowSub}>{unit.secondary || [unit.type === 'workstation' ? 'Desk' : unit.type, unit.room].filter(Boolean).join(' · ')}</div>
      </div>
      {unplaced ? <StatusPill label="Unplaced" bg="var(--ink-050)" fg="var(--ink-600)" /> : <StatusPill label={status.text} bg={status.bg} fg={status.fg} />}
    </div>
  );
}
