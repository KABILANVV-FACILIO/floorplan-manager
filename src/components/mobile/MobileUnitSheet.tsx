import { useFloorplan } from '../../state/FloorplanContext';
import { employeeName, initials, isAssignable, isBookable, unitById } from '../../state/selectors';
import { unitStatus } from '../../lib/unitStatus';
import { fmtTime } from '../../lib/geometry';
import { TYPE_META } from '../../lib/types';
import { Select } from '../primitives/Select';
import styles from './MobileUnitSheet.module.css';

export function MobileUnitSheet() {
  const { state, actions } = useFloorplan();
  const unit = unitById(state, state.mobSel);
  if (!unit) return null;

  const status = unitStatus(state, unit, (id) => employeeName(state, id));
  const empId = state.assignments[unit.id];
  const bookable = isBookable(unit);
  const assignable = isAssignable(unit);
  const showBookTab = state.mobileTab === 'book';

  function close() {
    actions.setMobSel(null);
    actions.setMobAssignEdit(false);
  }

  return (
    <>
      <div className={styles.backdrop} onClick={close} />
      <div className={styles.sheet}>
        <div className={styles.handle} />
        <div className={styles.headRow}>
          <div className={styles.headText}>
            <div className={styles.name}>{unit.label}</div>
            <div className={styles.kind}>
              {TYPE_META[unit.type].name}
              {unit.room ? ` · ${unit.room}` : ''}
            </div>
          </div>
          <span className={styles.statusPill} style={{ background: status.bg, color: status.fg }}>
            {status.text}
          </span>
        </div>

        {showBookTab && bookable && status.key !== 'booked' && (
          <button
            className={styles.primaryBtn}
            onClick={() => {
              actions.quickMobileBook(unit.id);
            }}
          >
            Book · {fmtTime(state.start)}–{fmtTime(state.end)}
          </button>
        )}
        {showBookTab && bookable && status.key === 'booked' && <div className={styles.infoBox}>This space is currently booked for the selected time window.</div>}
        {showBookTab && !bookable && <div className={styles.infoBox}>Lockers are assigned via the Assign tab, not booked.</div>}

        {!showBookTab && !assignable && <div className={styles.infoBox}>This space is booked in Booking mode, not assigned.</div>}
        {!showBookTab && assignable && empId && !state.mobAssignEdit && (
          <>
            <div className={styles.assignedRow}>
              <span className={styles.avatar}>{initials(employeeName(state, empId))}</span>
              <span className={styles.assignedName}>{employeeName(state, empId)}</span>
            </div>
            <div className={styles.actionsRow}>
              <button className={styles.vacateBtn} onClick={() => actions.vacate(unit.id)}>
                Vacate
              </button>
              <button className={styles.reassignBtn} onClick={() => actions.setMobAssignEdit(true)}>
                Reassign
              </button>
            </div>
          </>
        )}
        {!showBookTab && assignable && (!empId || state.mobAssignEdit) && (
          <div style={{ marginTop: 12 }}>
            <div className={styles.assignLabel}>Assign to</div>
            <Select
              value={empId ?? null}
              placeholder="— Choose a person —"
              options={state.employees.map((e) => ({ value: e.id, label: e.name, sublabel: e.dept }))}
              onChange={(v) => {
                actions.assign(v, unit.id);
                actions.setMobAssignEdit(false);
              }}
              fullWidth
              aria-label="Assign to"
            />
          </div>
        )}
      </div>
    </>
  );
}
